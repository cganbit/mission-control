# Mission Control — Project Overview

**Status:** ✅ Produção
**URL:** https://mc.wingx.app.br
**Última atualização:** 28/03/2026

---

## O que é

Dashboard central de operações do ecossistema Wingx/Paraguai. Centraliza monitoramento, gestão e execução de todos os processos de negócio: pipeline de oportunidades de importação, gestão de contas Mercado Livre, fila de impressão de etiquetas, e ferramentas de IA (IA Office, ChatDev).

---

## Propósito de negócio

Cleiton importa produtos do Paraguai e revende no Mercado Livre. O Mission Control automatiza:
1. Receber listas de preços de fornecedores via WhatsApp
2. Buscar preços equivalentes no Mercado Livre
3. Calcular margens e alertar sobre oportunidades (≥ 20%)
4. Gerenciar pedidos, impressão de etiquetas e logística
5. Monitorar saúde de todos os sistemas

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16 App Router + TypeScript strict |
| UI | Tailwind CSS v4 — dark theme (`bg-[#0d1117]`, accent `amber-*`) |
| Banco | PostgreSQL (container Docker, acesso via `@/lib/db`) |
| Auth | JWT + PBKDF2-SHA512, roles `admin`/`viewer` |
| Deploy | Docker Compose no VPS 187.77.43.141 (Hostinger) |
| Nginx | Reverse proxy: porta 443 → 3001, `/chatdev/` → 6401, `/chatdev-api/` → 6400 |

---

## Módulos principais

| Módulo | Rota | Descrição |
|--------|------|-----------|
| Oportunidades Paraguai | `/paraguai` | Pipeline completo: listas → ML search → score → alert |
| Contas Mercado Livre | `/mercado-livre/contas` | OAuth tokens, multi-conta |
| Fila de Impressão | `/fila` | Etiquetas Mercado Envios → WingX Agent |
| IA Office | `/ia-office` | Escritório virtual 2D dos agentes (Canvas) |
| ChatDev | `/chatdev/launch` | Pipeline multi-agente de desenvolvimento |
| Usuários | `/admin/usuarios` | Gestão de acesso |

---

## Infraestrutura relacionada

- **n8n** (porta 5678) — orquestra workflows do pipeline Paraguai
- **Evolution API** (porta 62662) — gateway WhatsApp
- **ChatDev** (portas 6400/6401) — backend FastAPI + frontend Vite
- **PostgreSQL** — banco compartilhado (DB: `mission_control`)
- **Redis** — cache (usado pelo n8n)

---

## Como retomar desenvolvimento

```bash
# Local (com tunnel SSH para o banco):
ssh -L 5433:172.21.0.6:5432 root@187.77.43.141

cd mission-control
npm run dev
# Acessa: http://localhost:3000
```

**Credenciais locais:** ver `mission-control/.env.local`

---

## Docs relacionados

- [ARCHITECTURE.md](../ARCHITECTURE.md) — arquitetura completa
- [RUNBOOK.md](../RUNBOOK.md) — operação e incidentes
- [BACKLOG.md](../BACKLOG.md) — próximas features
- [BUSINESS_RULES.md](../BUSINESS_RULES.md) — regras de negócio
- [docs/adr/](../docs/adr/) — decisões arquiteturais
