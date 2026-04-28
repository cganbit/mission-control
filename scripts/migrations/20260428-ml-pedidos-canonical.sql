-- ============================================================================
-- Migration: 20260428-ml-pedidos-canonical (forward) — FIX-UP 2026-04-28
-- PRD-047 D47.8 — Schema canonical para ml_pedidos (27 colunas validadas em prod)
--
-- FIX-UP history:
--   P0.5 inicial (commit 5f615cf) inferiu 20 colunas via reverse-engineering.
--   Validação via information_schema.columns em prod confirmou 27 colunas.
--   Este arquivo substitui a versão anterior com schema 100% canônico.
--
-- Problema original:
--   Nenhum CREATE TABLE ml_pedidos existia no codebase. Schema foi construído
--   incrementalmente via migrations avulsas (20260423-ml-pedidos-date-created)
--   e ingerido diretamente via api/auth/login bootstrap (setup implícito).
--   Rows pré-existentes têm wa_notified_paid / wa_notified_pr = NULL porque
--   colunas foram adicionadas sem DEFAULT nem NOT NULL (schema drift).
--
-- Escopo desta migration:
--   1. CREATE TABLE IF NOT EXISTS — documenta schema canônico completo (no-op se já existe)
--   2. ADD COLUMN IF NOT EXISTS — garante todas as 26 colunas (exceto PK id) existem
--   3. SET DEFAULT false em wa_notified_* — garante rows futuras nunca ficam NULL
--   4. Backfill NULL → false em wa_notified_* (seguro re-rodar, idempotente)
--   5. SET NOT NULL em wa_notified_* — após backfill garante integridade
--   6. Indexes — ml_order_id UNIQUE + date_created + status + seller_id + parcial unnotified
--
-- Idempotência:
--   CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS +
--   UPDATE com WHERE IS NULL + CREATE INDEX IF NOT EXISTS.
--   Re-rodar 2× sem erro.
--
-- Fonte canônica:
--   information_schema.columns validado em prod 2026-04-28 (27 colunas confirmadas).
-- ============================================================================

BEGIN;

-- ─── Etapa 1: Garantir tabela existe (no-op se já criada) ───────────────────
--
-- Por que CREATE TABLE IF NOT EXISTS e não apenas ALTER TABLE:
--   Serve como documentação canônica do schema completo. Em ambiente limpo
--   (staging, CI, novo dev) esta migration cria a tabela do zero sem depender
--   de nenhuma outra migration anterior.
--
-- Tipos escolhidos (validados contra prod via information_schema):
--   - id            SERIAL: PK surrogate. ml_order_id é UNIQUE, não PK (prod confirmado)
--   - ml_order_id   BIGINT: IDs ML são inteiros grandes (ex: 2000007040762)
--   - ml_buyer_id   BIGINT: mesmo padrão ML
--   - seller_id     BIGINT: seller_id do ML account (JOIN com ml_tokens_json)
--   - pack_id       BIGINT: ID do pack ML (multi-item orders)
--   - shipment_id   BIGINT: ID do envio ML (não confundir com me_order_id Melhor Envio)
--   - total         NUMERIC: valor monetário — sem precisão fixa (prod usa NUMERIC sem scale)
--   - me_cost       NUMERIC: custo frete Melhor Envio — sem precisão fixa (idem)
--   - items_json    JSONB: array de {title, quantity, unit_price}
--   - me_delivery_address JSONB: objeto {cep, rua, numero, ...} confirmado pelo comprador
--   - me_order_id   TEXT: ID do pedido no Melhor Envio (formato alfanumérico)
--   - me_label_url  TEXT: URL da etiqueta gerada pelo Melhor Envio
--   - me_tracking_code VARCHAR: código de rastreio (VARCHAR em prod)
--   - me_status     VARCHAR DEFAULT 'pending': estado do fluxo Melhor Envio
--   - me_carrier    VARCHAR: transportadora (VARCHAR em prod)
--   - logistic_type       VARCHAR: tipo de logística ML
--   - melhor_envio_order_id VARCHAR: legacy duplicate de me_order_id — mantido por compatibilidade
--   - listing_type        VARCHAR: tipo de listagem ML
--   - shipping_status     VARCHAR: status do envio ML
--   - seller_nickname TEXT: apelido do vendedor no ML
--   - status        TEXT: 'paid' | 'payment_required' (sem CHECK — ML pode adicionar novos)
--   - wa_notified_paid BOOLEAN NOT NULL DEFAULT false: dedup D47.1
--   - wa_notified_pr   BOOLEAN NOT NULL DEFAULT false: dedup D47.1

CREATE TABLE IF NOT EXISTS ml_pedidos (
  -- ── PK surrogate (prod: id SERIAL, não ml_order_id) ──────────────────────
  id                    SERIAL        PRIMARY KEY,

  -- ── Identificador único ML ────────────────────────────────────────────────
  -- ON CONFLICT (ml_order_id) nos INSERTs do webhook
  ml_order_id           BIGINT        NOT NULL UNIQUE,

  -- ── Partes do pedido ─────────────────────────────────────────────────────
  ml_buyer_id           BIGINT,
  seller_id             BIGINT,
  seller_nickname       TEXT,
  items_json            JSONB,
  total                 NUMERIC,
  status                TEXT,

  -- ── Envio ML ─────────────────────────────────────────────────────────────
  shipment_id           BIGINT,
  logistic_type         VARCHAR,
  listing_type          VARCHAR,
  shipping_status       VARCHAR,
  pack_id               BIGINT,

  -- ── Datas do pedido (fonte: ML API, não timestamp do INSERT no DB) ───────
  -- Adicionadas em migration 20260423-ml-pedidos-date-created
  -- COALESCE(date_created, created_at) usado em queries para compatibilidade
  date_created          TIMESTAMPTZ,
  date_closed           TIMESTAMPTZ,

  -- ── Notificações WhatsApp (dedup D47.1) ──────────────────────────────────
  -- BOOLEAN DEFAULT false NOT NULL garante que claim UPDATE nunca é ambíguo
  -- D47.1: UPDATE SET wa_notified_paid=true WHERE ml_order_id=$1
  --        AND (wa_notified_paid=false OR wa_notified_paid IS NULL) RETURNING *
  wa_notified_paid      BOOLEAN       NOT NULL DEFAULT false,
  wa_notified_pr        BOOLEAN       NOT NULL DEFAULT false,

  -- ── Melhor Envio (colunas adicionadas pós-inception) ────────────────────
  melhor_envio_order_id VARCHAR,       -- legacy duplicate de me_order_id; mantido por compatibilidade
  me_order_id           TEXT,          -- ID do pedido no Melhor Envio (alfanumérico)
  me_tracking_code      VARCHAR,
  me_label_url          TEXT,
  me_carrier            VARCHAR,
  me_cost               NUMERIC,
  me_delivery_address   JSONB,         -- endereço confirmado pelo comprador
  me_status             VARCHAR        DEFAULT 'pending',

  -- ── Timestamps do DB ─────────────────────────────────────────────────────
  -- created_at = momento do INSERT no DB (≠ date_created que é a data da venda no ML)
  created_at            TIMESTAMPTZ    DEFAULT NOW(),
  updated_at            TIMESTAMPTZ    DEFAULT NOW()
);

-- ─── Etapa 2: ADD COLUMN IF NOT EXISTS ──────────────────────────────────────
--
-- Defense-in-depth: garante que cada coluna existe mesmo se a tabela foi criada
-- por migration anterior incompleta. Idempotente — IF NOT EXISTS pula existentes.
-- Cobre TODAS as 26 colunas não-PK validadas em prod (information_schema 2026-04-28).

ALTER TABLE ml_pedidos
  ADD COLUMN IF NOT EXISTS ml_order_id           BIGINT,
  ADD COLUMN IF NOT EXISTS ml_buyer_id           BIGINT,
  ADD COLUMN IF NOT EXISTS seller_id             BIGINT,
  ADD COLUMN IF NOT EXISTS seller_nickname       TEXT,
  ADD COLUMN IF NOT EXISTS items_json            JSONB,
  ADD COLUMN IF NOT EXISTS total                 NUMERIC,
  ADD COLUMN IF NOT EXISTS status                TEXT,
  ADD COLUMN IF NOT EXISTS shipment_id           BIGINT,
  ADD COLUMN IF NOT EXISTS logistic_type         VARCHAR,
  ADD COLUMN IF NOT EXISTS listing_type          VARCHAR,
  ADD COLUMN IF NOT EXISTS shipping_status       VARCHAR,
  ADD COLUMN IF NOT EXISTS pack_id               BIGINT,
  ADD COLUMN IF NOT EXISTS date_created          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS date_closed           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wa_notified_paid      BOOLEAN,
  ADD COLUMN IF NOT EXISTS wa_notified_pr        BOOLEAN,
  ADD COLUMN IF NOT EXISTS melhor_envio_order_id VARCHAR,
  ADD COLUMN IF NOT EXISTS me_order_id           TEXT,
  ADD COLUMN IF NOT EXISTS me_tracking_code      VARCHAR,
  ADD COLUMN IF NOT EXISTS me_label_url          TEXT,
  ADD COLUMN IF NOT EXISTS me_carrier            VARCHAR,
  ADD COLUMN IF NOT EXISTS me_cost               NUMERIC,
  ADD COLUMN IF NOT EXISTS me_delivery_address   JSONB,
  ADD COLUMN IF NOT EXISTS me_status             VARCHAR,
  ADD COLUMN IF NOT EXISTS created_at            TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ DEFAULT NOW();

-- ─── Etapa 3: SET DEFAULT nas colunas críticas de dedup ─────────────────────
--
-- Por que SET DEFAULT aqui (não só no CREATE TABLE):
--   Se a tabela já existia sem DEFAULT nas colunas wa_notified_*, rows futuras
--   continuariam NULL. SET DEFAULT corrige para todas as inserções daqui em diante.
--   Impacto: zero downtime, não toca rows existentes.
--   Nota: em prod estas colunas JÁ têm DEFAULT false (confirmado via information_schema).
--   Este ALTER é no-op em prod mas canônico para DBs fresh.

ALTER TABLE ml_pedidos
  ALTER COLUMN wa_notified_paid SET DEFAULT false,
  ALTER COLUMN wa_notified_pr   SET DEFAULT false;

-- ─── Etapa 4: Backfill NULL → false (idempotente, safe re-run) ──────────────
--
-- Por que backfill antes de SET NOT NULL:
--   SET NOT NULL falha se qualquer row tiver NULL. Backfill primeiro garante
--   que a constraint pode ser aplicada sem erro.
--
-- Por que false (não true):
--   Rows com NULL foram inseridas antes de qualquer dispatch WA. Marcar como
--   false (não notificado) é conservador — impede "silenciar" alerts legítimos.
--   D47.4 instrui backfill manual em prod pré-deploy P1 para orders antigas
--   (via scripts/backfill-wa-notified.ts) para evitar tsunami de re-alerts.
--   Esta migration cobre apenas o default seguro para rows sem flag definida.

UPDATE ml_pedidos
  SET wa_notified_paid = false
  WHERE wa_notified_paid IS NULL;

UPDATE ml_pedidos
  SET wa_notified_pr = false
  WHERE wa_notified_pr IS NULL;

-- ─── Etapa 5: SET NOT NULL (após backfill, zero NULLs garantido) ─────────────
--
-- Protege D47.1 claim UPDATE contra ambiguidade NULL em prod.
-- Sem NOT NULL, INSERT sem especificar wa_notified_* poderia gerar NULL
-- mesmo após SET DEFAULT (se feito via raw SQL sem campo).
-- Nota: em prod estas colunas JÁ são NOT NULL (confirmado via information_schema).
-- Este ALTER é no-op em prod mas canônico para DBs fresh.

ALTER TABLE ml_pedidos
  ALTER COLUMN wa_notified_paid SET NOT NULL,
  ALTER COLUMN wa_notified_pr   SET NOT NULL;

-- ─── Etapa 6: Indexes ────────────────────────────────────────────────────────
--
-- idx_ml_pedidos_date_created: JÁ pode existir via migration 20260423-ml-pedidos-date-created.
--   CREATE INDEX IF NOT EXISTS é idempotente — no-op se já existe.
--
-- idx_ml_pedidos_status: queries frequentes filtram por status='paid' ou
--   status='payment_required' (webhook dedup, stats route, listagem).
--
-- idx_ml_pedidos_seller_id: JOIN com ml_tokens_json ON seller_id em send-tracking route.
--
-- idx_ml_pedidos_unnotified_paid: partial index pra D47.1 claim polling.
--   Tabela com 1k+ rows, este índice torna o claim UPDATE sub-ms.
--   Covers: UPDATE ... WHERE ml_order_id=$1 AND (wa_notified_paid=false OR wa_notified_paid IS NULL)
--
-- idx_ml_pedidos_unnotified_pr: idem para wa_notified_pr.

CREATE INDEX IF NOT EXISTS idx_ml_pedidos_date_created
  ON ml_pedidos (date_created DESC);

CREATE INDEX IF NOT EXISTS idx_ml_pedidos_status
  ON ml_pedidos (status);

CREATE INDEX IF NOT EXISTS idx_ml_pedidos_seller_id
  ON ml_pedidos (seller_id);

CREATE INDEX IF NOT EXISTS idx_ml_pedidos_unnotified_paid
  ON ml_pedidos (ml_order_id)
  WHERE wa_notified_paid = false;

CREATE INDEX IF NOT EXISTS idx_ml_pedidos_unnotified_pr
  ON ml_pedidos (ml_order_id)
  WHERE wa_notified_pr = false;

COMMIT;

-- ─── Rollback instructions ───────────────────────────────────────────────────
-- Esta migration NÃO tem rollback automático porque:
--   - SET NOT NULL pode ser revertido com: ALTER COLUMN wa_notified_paid DROP NOT NULL
--   - SET DEFAULT pode ser revertido com: ALTER COLUMN wa_notified_paid DROP DEFAULT
--   - Backfill UPDATE é irreversível (não sabemos quais rows eram NULL antes)
--   - Indexes podem ser dropados: DROP INDEX IF EXISTS idx_ml_pedidos_*
--
-- Rollback manual (apenas se necessário):
--   ALTER TABLE ml_pedidos ALTER COLUMN wa_notified_paid DROP NOT NULL;
--   ALTER TABLE ml_pedidos ALTER COLUMN wa_notified_pr   DROP NOT NULL;
--   ALTER TABLE ml_pedidos ALTER COLUMN wa_notified_paid DROP DEFAULT;
--   ALTER TABLE ml_pedidos ALTER COLUMN wa_notified_pr   DROP DEFAULT;
--   DROP INDEX IF EXISTS idx_ml_pedidos_unnotified_paid;
--   DROP INDEX IF EXISTS idx_ml_pedidos_unnotified_pr;
--   DROP INDEX IF EXISTS idx_ml_pedidos_status;
--   DROP INDEX IF EXISTS idx_ml_pedidos_seller_id;
--   -- idx_ml_pedidos_date_created pertence à migration 20260423 — não dropar aqui.
--
-- ─── Verify (rodar após aplicar em prod) ────────────────────────────────────
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'ml_pedidos'
--   ORDER BY ordinal_position;
-- -- Esperado: 27 colunas
--
-- SELECT column_name, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name='ml_pedidos'
--   AND column_name IN ('wa_notified_paid','wa_notified_pr')
--   ORDER BY column_name;
-- -- Esperado: column_default='false', is_nullable='NO'
--
-- SELECT COUNT(*) FROM ml_pedidos WHERE wa_notified_paid IS NULL OR wa_notified_pr IS NULL;
-- -- Esperado: 0
--
-- SELECT indexname FROM pg_indexes WHERE tablename='ml_pedidos' ORDER BY indexname;
-- -- Esperado: idx_ml_pedidos_date_created, idx_ml_pedidos_seller_id,
-- --           idx_ml_pedidos_status, idx_ml_pedidos_unnotified_paid,
-- --           idx_ml_pedidos_unnotified_pr, ml_pedidos_ml_order_id_key (UNIQUE),
-- --           ml_pedidos_pkey (PK)
