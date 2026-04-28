-- ============================================================================
-- Migration: 20260428-ml-pedidos-canonical (forward)
-- PRD-047 D47.8 — Schema canonical para ml_pedidos (resolver schema drift)
--
-- Problema:
--   Nenhum CREATE TABLE ml_pedidos existe no codebase. Schema foi construído
--   incrementalmente via migrations avulsas (20260423-ml-pedidos-date-created)
--   e ingerido diretamente via api/auth/login bootstrap (setup implícito).
--   Rows pré-existentes têm wa_notified_paid / wa_notified_pr = NULL porque
--   colunas foram adicionadas sem DEFAULT nem NOT NULL (schema drift).
--
-- Escopo desta migration:
--   1. CREATE TABLE IF NOT EXISTS — documenta schema canônico completo (no-op se já existe)
--   2. ADD COLUMN IF NOT EXISTS — garante colunas ME (melhor-envio) e flags WA existem
--   3. SET DEFAULT false em wa_notified_* — garante rows futuras nunca ficam NULL
--   4. Backfill NULL → false em wa_notified_* (seguro re-rodar, idempotente)
--   5. SET NOT NULL em wa_notified_* — após backfill garante integridade
--   6. Indexes — ml_order_id UNIQUE + date_created (já existe via 20260423) + parcial unnotified
--
-- Idempotência:
--   CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS +
--   UPDATE com WHERE IS NULL + CREATE INDEX IF NOT EXISTS.
--   Re-rodar 2× sem erro.
--
-- Colunas reverse-engineered de:
--   - src/app/api/mercado-livre/webhook/route.ts (INSERT/UPDATE)
--   - src/app/api/melhor-envio/orders/[order_id]/route.ts (SELECT)
--   - src/app/api/melhor-envio/confirm-address/[order_id]/route.ts (UPDATE + SELECT)
--   - src/app/api/melhor-envio/cancel/[order_id]/route.ts (UPDATE)
--   - src/app/api/melhor-envio/send-tracking/[order_id]/route.ts (SELECT)
--   - scripts/migrations/20260423-ml-pedidos-date-created.sql (ADD COLUMN)
-- ============================================================================

BEGIN;

-- ─── Etapa 1: Garantir tabela existe (no-op se já criada) ───────────────────
--
-- Por que CREATE TABLE IF NOT EXISTS e não apenas ALTER TABLE:
--   Serve como documentação canônica do schema completo. Em ambiente limpo
--   (staging, CI, novo dev) esta migration cria a tabela do zero sem depender
--   de nenhuma outra migration anterior.
--
-- Tipos escolhidos:
--   - ml_order_id BIGINT: IDs ML são inteiros grandes (ex: 2000007040762)
--   - ml_buyer_id BIGINT: mesmo padrão
--   - seller_id   BIGINT: seller_id do ML account (JOIN com ml_tokens_json)
--   - total       NUMERIC(12,2): valor monetário, sem float precision loss
--   - me_cost     NUMERIC(10,2): custo frete Melhor Envio
--   - items_json  JSONB: array de {title, quantity, unit_price}
--   - me_delivery_address JSONB: objeto {cep, rua, numero, ...} confirmado pelo comprador
--   - shipment_id BIGINT: ID do envio ML (não confundir com me_order_id Melhor Envio)
--   - me_order_id TEXT: ID do pedido no Melhor Envio (formato alfanumérico)
--   - status      TEXT: 'paid' | 'payment_required' (sem CHECK — ML pode adicionar novos)
--   - me_status   TEXT: 'pending' | 'pending_address' | 'address_confirmed' | 'posted' |
--                       'in_transit' | 'delivered' | null (sem CHECK — pode evoluir)

CREATE TABLE IF NOT EXISTS ml_pedidos (
  -- ── Identificadores ──────────────────────────────────────────────────────
  ml_order_id       BIGINT        PRIMARY KEY,
  -- UNIQUE implícito pela PK; ON CONFLICT (ml_order_id) nos INSERTs do webhook

  -- ── Partes do pedido ─────────────────────────────────────────────────────
  ml_buyer_id       BIGINT,
  seller_id         BIGINT,
  seller_nickname   TEXT,
  buyer_nickname    TEXT,
  items_json        JSONB,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  status            TEXT,

  -- ── Envio ML ─────────────────────────────────────────────────────────────
  shipment_id       BIGINT,
  logistic_type     TEXT,
  listing_type      TEXT,
  shipping_status   TEXT,
  pack_id           BIGINT,

  -- ── Datas do pedido (fonte: ML API, não timestamp do INSERT no DB) ───────
  -- Adicionadas em migration 20260423-ml-pedidos-date-created
  -- COALESCE(date_created, created_at) usado em queries para compatibilidade
  date_created      TIMESTAMPTZ,
  date_closed       TIMESTAMPTZ,

  -- ── Notificações WhatsApp (dedup D47.1) ──────────────────────────────────
  -- BOOLEAN DEFAULT false NOT NULL garante que claim UPDATE nunca é ambíguo
  -- D47.1: UPDATE SET wa_notified_paid=true WHERE ml_order_id=$1
  --        AND (wa_notified_paid=false OR wa_notified_paid IS NULL) RETURNING *
  wa_notified_paid  BOOLEAN       NOT NULL DEFAULT false,
  wa_notified_pr    BOOLEAN       NOT NULL DEFAULT false,

  -- ── Melhor Envio (colunas adicionadas pós-inception) ────────────────────
  me_order_id       TEXT,           -- ID do pedido no Melhor Envio (alfanumérico)
  me_tracking_code  TEXT,
  me_label_url      TEXT,
  me_carrier        TEXT,
  me_cost           NUMERIC(10,2),
  me_delivery_address JSONB,        -- endereço confirmado pelo comprador
  me_status         TEXT,           -- estado do fluxo Melhor Envio

  -- ── Timestamps do DB ─────────────────────────────────────────────────────
  -- created_at = momento do INSERT no DB (≠ date_created que é a data da venda no ML)
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ─── Etapa 2: ADD COLUMN IF NOT EXISTS ──────────────────────────────────────
--
-- Garante que cada coluna existe mesmo se a tabela foi criada por migration
-- anterior sem algumas dessas colunas. Ordem importa: colunas novas devem
-- existir antes de SET DEFAULT / SET NOT NULL (Etapas 3-5).

ALTER TABLE ml_pedidos
  ADD COLUMN IF NOT EXISTS wa_notified_paid  BOOLEAN,
  ADD COLUMN IF NOT EXISTS wa_notified_pr    BOOLEAN,
  ADD COLUMN IF NOT EXISTS seller_id         BIGINT,
  ADD COLUMN IF NOT EXISTS buyer_nickname    TEXT,
  ADD COLUMN IF NOT EXISTS pack_id           BIGINT,
  ADD COLUMN IF NOT EXISTS me_order_id       TEXT,
  ADD COLUMN IF NOT EXISTS me_tracking_code  TEXT,
  ADD COLUMN IF NOT EXISTS me_label_url      TEXT,
  ADD COLUMN IF NOT EXISTS me_carrier        TEXT,
  ADD COLUMN IF NOT EXISTS me_cost           NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS me_delivery_address JSONB,
  ADD COLUMN IF NOT EXISTS me_status         TEXT,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- ─── Etapa 3: SET DEFAULT nas colunas críticas de dedup ─────────────────────
--
-- Por que SET DEFAULT aqui (não só no CREATE TABLE):
--   Se a tabela já existia sem DEFAULT nas colunas wa_notified_*, rows futuras
--   continuariam NULL. SET DEFAULT corrige para todas as inserções daqui em diante.
--   Impacto: zero downtime, não toca rows existentes.

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

ALTER TABLE ml_pedidos
  ALTER COLUMN wa_notified_paid SET NOT NULL,
  ALTER COLUMN wa_notified_pr   SET NOT NULL;

-- ─── Etapa 6: Indexes ────────────────────────────────────────────────────────
--
-- idx_ml_pedidos_date_created: JÁ existe via migration 20260423-ml-pedidos-date-created.
--   CREATE INDEX IF NOT EXISTS é idempotente — no-op se já existe.
--
-- idx_ml_pedidos_status: queries frequentes filtram por status='paid' ou
--   status='payment_required' (webhook dedup, stats route, listagem).
--
-- idx_ml_pedidos_unnotified_paid: partial index pra D47.1 claim polling.
--   Tabela com 1k+ rows, este índice torna o claim UPDATE sub-ms.
--   Covers: UPDATE ... WHERE ml_order_id=$1 AND (wa_notified_paid=false OR wa_notified_paid IS NULL)
--
-- idx_ml_pedidos_unnotified_pr: idem para wa_notified_pr.
--
-- idx_ml_pedidos_seller_id: JOIN com ml_tokens_json ON seller_id em send-tracking route.

CREATE INDEX IF NOT EXISTS idx_ml_pedidos_date_created
  ON ml_pedidos (date_created DESC);

CREATE INDEX IF NOT EXISTS idx_ml_pedidos_status
  ON ml_pedidos (status);

CREATE INDEX IF NOT EXISTS idx_ml_pedidos_unnotified_paid
  ON ml_pedidos (ml_order_id)
  WHERE wa_notified_paid = false;

CREATE INDEX IF NOT EXISTS idx_ml_pedidos_unnotified_pr
  ON ml_pedidos (ml_order_id)
  WHERE wa_notified_pr = false;

CREATE INDEX IF NOT EXISTS idx_ml_pedidos_seller_id
  ON ml_pedidos (seller_id);

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
-- \d+ ml_pedidos
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
