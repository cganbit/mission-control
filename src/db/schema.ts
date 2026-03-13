// Mission Control — Database Schema (PostgreSQL via pg)
// Fase 1: Squads, Agents, Tasks, Activity Log

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

-- Tasks (Kanban)
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id    UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  agent_id    UUID REFERENCES agents(id),
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  status      VARCHAR(20) DEFAULT 'backlog'
                CHECK (status IN ('backlog','assigned','in_progress','review','done')),
  priority    VARCHAR(10) DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high','urgent')),
  due_date    TIMESTAMPTZ,
  created_by  VARCHAR(100),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
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
