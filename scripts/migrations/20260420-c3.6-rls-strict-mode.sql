-- PRD-035 C3.6 — Strict mode: remove fallback permissivo das RLS policies.
--
-- Contexto: C2.1 criou policy tenant_isolation com fallback D37 permitindo
-- `app.current_project_id() IS NULL` (fallback NULL) pra migração gradual
-- endpoint-a-endpoint em C3. Depois de C3.5 + C3.5b cobrirem 20 endpoints
-- com scope (session) ou worker-bypass, o fallback NULL vira **anti-pattern**:
-- qualquer endpoint que esqueça de setar project_id vê todos tenants.
--
-- Strict mode: policy passa a exigir match explícito ou worker bypass. Em
-- qualquer endpoint não-migrado, query retorna 0 rows (SELECT) ou falha
-- com "row violates RLS policy" (INSERT/UPDATE).
--
-- Impacto: 11 tabelas escopáveis — squads, agents, tasks, activity_log,
-- token_usage, agent_memories, agent_documents, pipeline_steps,
-- pipeline_log_events, pipeline_runs, harness_health_scores.
--
-- Rollback: 20260420-c3.6-rls-strict-mode-rollback.sql (readd fallback NULL).

ALTER POLICY tenant_isolation ON squads
  USING (project_id = app.current_project_id() OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON agents
  USING (project_id = app.current_project_id() OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON tasks
  USING (project_id = app.current_project_id() OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON activity_log
  USING (project_id = app.current_project_id() OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON token_usage
  USING (project_id = app.current_project_id() OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON agent_memories
  USING (project_id = app.current_project_id() OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON agent_documents
  USING (project_id = app.current_project_id() OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON pipeline_steps
  USING (project_id = app.current_project_id() OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON pipeline_log_events
  USING (project_id = app.current_project_id() OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON pipeline_runs
  USING (project_id = app.current_project_id() OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON harness_health_scores
  USING (project_id = app.current_project_id() OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.is_worker_bypass());
