import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;
let arbitragemPool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 10,
    });
  }
  return pool;
}

export function getArbitragemPool(): Pool {
  if (!arbitragemPool) {
    const url = (process.env.DATABASE_URL ?? '').replace('/mission_control', '/arbitragem');
    arbitragemPool = new Pool({
      connectionString: url,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 5,
    });
  }
  return arbitragemPool;
}

// PRD-035 C2.2 — scoped queries pra RLS multi-tenant (C2.1 live em prod).
// Callsites legados (sem opts) mantêm comportamento original: zero break.
// Quando opts.projectId é passado, query roda em transaction com SET LOCAL
// app.current_project_id → policies `tenant_isolation` filtram rows + bloqueiam
// writes fora do project. opts.worker = SET LOCAL app.bypass_rls='true' pra
// worker-key routes (harness/agent emitindo telemetria sem sessão).
//
// opts.client permite reuso de PoolClient pra multi-statement transactions
// orquestradas externamente; caller é responsável por BEGIN/COMMIT/ROLLBACK
// + SET LOCAL do scope.
export interface QueryOptions {
  projectId?: string;
  worker?: boolean;
  client?: PoolClient;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
  opts?: QueryOptions
): Promise<T[]> {
  if (opts?.client) {
    const result = await opts.client.query(text, params);
    return result.rows as T[];
  }

  const scoped = opts?.projectId !== undefined || opts?.worker === true;

  if (!scoped) {
    const client = await getPool().connect();
    try {
      const result = await client.query(text, params);
      return result.rows as T[];
    } finally {
      client.release();
    }
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (opts?.worker) {
      await client.query("SET LOCAL app.bypass_rls = 'true'");
    } else if (opts?.projectId) {
      await client.query("SELECT set_config('app.current_project_id', $1, true)", [opts.projectId]);
    }
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result.rows as T[];
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* swallow — original err rethrown */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
  opts?: QueryOptions
): Promise<T | null> {
  const rows = await query<T>(text, params, opts);
  return rows[0] ?? null;
}

// Escopo transacional multi-statement. Use quando precisa rodar N queries
// sob o mesmo project_id OU precisa de atomicidade (rollback em erro).
// Exemplo:
//   await withProjectScope(projectId, async (q) => {
//     await q("INSERT INTO agents (...) VALUES (...)", [...]);
//     await q("INSERT INTO activity_log (...) VALUES (...)", [...]);
//   });
export async function withProjectScope<T>(
  projectId: string,
  fn: (q: (text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_project_id', $1, true)", [projectId]);
    const scoped = async (text: string, params?: unknown[]) => {
      const r = await client.query(text, params);
      return r.rows as Array<Record<string, unknown>>;
    };
    const result = await fn(scoped);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* swallow */ }
    throw err;
  } finally {
    client.release();
  }
}

// Mesmo de withProjectScope mas usando bypass_rls pra worker routes.
export async function withWorkerBypass<T>(
  fn: (q: (text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.bypass_rls = 'true'");
    const scoped = async (text: string, params?: unknown[]) => {
      const r = await client.query(text, params);
      return r.rows as Array<Record<string, unknown>>;
    };
    const result = await fn(scoped);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* swallow */ }
    throw err;
  } finally {
    client.release();
  }
}
