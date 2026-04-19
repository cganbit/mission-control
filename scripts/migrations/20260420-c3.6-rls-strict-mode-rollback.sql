-- PRD-035 C3.6 rollback — Re-add fallback NULL em tenant_isolation policies.
-- Aplicar se endpoint não-migrado aparecer com 0 rows / RLS violation em prod.

ALTER POLICY tenant_isolation ON squads
  USING (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON agents
  USING (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON tasks
  USING (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON activity_log
  USING (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON token_usage
  USING (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON agent_memories
  USING (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON agent_documents
  USING (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON pipeline_steps
  USING (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON pipeline_log_events
  USING (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON pipeline_runs
  USING (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());

ALTER POLICY tenant_isolation ON harness_health_scores
  USING (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass())
  WITH CHECK (project_id = app.current_project_id() OR app.current_project_id() IS NULL OR app.is_worker_bypass());
