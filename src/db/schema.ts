// Mission Control — Database Schema (PostgreSQL via pg)
// Fase 1: Squads, Agents, Tasks, Activity Log
// Fase 2 (SRE): sre_checks + colunas SRE em tasks

export const CREATE_TABLES_SQL = `
-- Squads (projetos/clientes isolados)
CREATE TABLE IF NOT EXISTS squads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  mission     TEXT,
  color       VARCHAR(20) DEFAULT '#6366f1',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Agents por squad
CREATE TABLE IF NOT EXISTS agents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id       UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  role           VARCHAR(100),
  status         VARCHAR(20) DEFAULT 'idle' CHECK (status IN ('active','idle','stopped')),
  last_heartbeat TIMESTAMPTZ,
  system_prompt  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- SRE Checks — configuração e último estado de cada serviço monitorado
CREATE TABLE IF NOT EXISTS sre_checks (
  id                  SERIAL PRIMARY KEY,
  service             VARCHAR(50)  NOT NULL,
  check_name          VARCHAR(100) NOT NULL,
  enabled             BOOLEAN      DEFAULT true,
  interval_minutes    INT          DEFAULT 5,
  escalation_minutes  INT          DEFAULT 300,
  last_checked_at     TIMESTAMPTZ,
  last_status         VARCHAR(20),
  last_error          TEXT,
  UNIQUE(service, check_name)
);

-- Tasks (Kanban)
CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id      UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  agent_id      UUID REFERENCES agents(id),
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  status        VARCHAR(20) DEFAULT 'backlog'
                  CHECK (status IN ('backlog','assigned','in_progress','review','done')),
  priority      VARCHAR(10) DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high','urgent')),
  due_date      TIMESTAMPTZ,
  created_by    VARCHAR(100),
  sre_check_id  INT REFERENCES sre_checks(id),
  auto_created  BOOLEAN DEFAULT false,
  notified_at   TIMESTAMPTZ,
  tokens_used   INT DEFAULT 0,
  type          VARCHAR(20) DEFAULT 'task' CHECK (type IN ('task','sprint','subtask')),
  parent_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
  progress_note TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log (feed em tempo real)
CREATE TABLE IF NOT EXISTS activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id   UUID REFERENCES squads(id) ON DELETE CASCADE,
  agent_id   UUID REFERENCES agents(id) ON DELETE SET NULL,
  action     VARCHAR(100) NOT NULL,
  detail     TEXT,
  timestamp  TIMESTAMPTZ DEFAULT NOW()
);

-- Auth tokens (JWT secret armazenado em env, tabela para revogação)
CREATE TABLE IF NOT EXISTS auth_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN DEFAULT FALSE
);
`;

export const SEED_SRE_SQL = `
-- Squad SRE (infra auto-healing)
INSERT INTO squads (id, name, description, mission, color)
VALUES (
  'sre00000-0000-0000-0000-000000000001',
  'SRE',
  'Monitoramento e auto-healing da infraestrutura',
  'Detectar, diagnosticar e resolver falhas de infra sem intervenção humana',
  '#ef4444'
) ON CONFLICT (id) DO NOTHING;

-- Migration: rename legacy token_expiry_24h → token_expiry_4h (2026-04-23)
-- Code (src/app/api/sre/run-checks/route.ts) passou a emitir 'token_expiry_4h'
-- mas o row antigo '24h' ficou congelado. Rename idempotente antes do INSERT.
UPDATE sre_checks SET check_name = 'token_expiry_4h'
  WHERE service = 'ml_tokens' AND check_name = 'token_expiry_24h';

-- Checks iniciais
INSERT INTO sre_checks (service, check_name, enabled, interval_minutes, escalation_minutes) VALUES
  ('evolution',    'whatsapp_connected', true, 5,  0),
  ('ml_tokens',    'token_expiry_4h',    true, 60, 60),
  ('print_queue',  'jobs_in_error',      true, 5,  0),
  ('n8n',          'workflow_active',    true, 5,  60),
  ('db',           'connectivity',       true, 5,  0)
ON CONFLICT (service, check_name) DO NOTHING;
`;

export const SEED_PARAGUAY_SQUAD_SQL = `
-- Squad: Paraguai Arbitrage Engine
INSERT INTO squads (id, name, description, mission, color)
VALUES (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'Paraguai Arbitrage Engine',
  'Monitor de preços e arbitragem de eletrônicos do Paraguai',
  'Identificar oportunidades de arbitragem lucrativas comparando preços de fornecedores paraguaios com o mercado brasileiro',
  '#10b981'
) ON CONFLICT (id) DO NOTHING;

-- 8 Agents pré-configurados
INSERT INTO agents (squad_id, name, role, status) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Project Manager',  'Coordena o squad e prioriza tarefas',                          'idle'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Supplier Agent',   'Recebe e valida listas de preços dos fornecedores',            'idle'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Product Agent',    'Normaliza e deduplica produtos via IA',                        'idle'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Finance Agent',    'Calcula margens, impostos e lucro líquido',                   'idle'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Market Agent',     'Busca preços de venda no Mercado Livre e concorrentes',       'idle'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Logistics Agent',  'Analisa frete, despacho e riscos aduaneiros',                 'idle'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Alert Agent',      'Envia alertas via WhatsApp quando oportunidade é detectada',  'idle'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'Report Agent',     'Gera relatórios diários e dashboards de performance',         'idle')
ON CONFLICT DO NOTHING;
`;
