import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'mission-control-dev-secret-change-in-prod'
);

export async function proxy(req: NextRequest) {
  const token = req.cookies.get('mc_token')?.value;
  const { pathname } = req.nextUrl;

  // 1. Permite acesso a recursos públicos e página de login
  if (
    pathname.includes('.') || // arquivos estáticos
    pathname.startsWith('/_next') || // internals do Next.js
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname.startsWith('/api/paraguai/catalogo/vps-test') ||
    pathname.startsWith('/api/paraguai/ml-token-refresh') || // worker cron — auth via x-worker-key
    pathname === '/api/health' || // Health check — público (usado pelo CI smoke test e monitoring)
    pathname === '/api/mercado-livre/webhook' || // ML webhook — autenticado por topic/user_id, não por sessão
    pathname === '/api/print-queue/trigger' || // Link de impressão — autenticado por token único no query param
    pathname.startsWith('/api/print-queue/manage') || // Fila pública — autenticada por QUEUE_KEY no query param
    pathname.startsWith('/api/print-queue') || // WingX Agent — autenticado por x-agent-key
    pathname === '/fila' || // Dashboard público da fila de impressão — autenticado por QUEUE_KEY
    pathname.startsWith('/api/sre/run-checks') || // SRE cron — autenticado por x-worker-key
    pathname.startsWith('/api/sre/escalate') || // SRE escalation cron — autenticado por x-worker-key
    pathname.startsWith('/api/sre/health') || // state_gate + monitoring — autenticado por x-worker-key
    pathname.startsWith('/api/sre/cron-heartbeat') || // cron monitor — autenticado por x-worker-key
    pathname === '/api/tasks/batch' || // Jarvis — cria tasks em batch via x-worker-key
    /^\/api\/tasks\/[^/]+\/heartbeat$/.test(pathname) || // Jarvis — heartbeat de tasks via x-worker-key (regex exato — M2 fix)
    pathname === '/api/jarvis/task' || // Jarvis — PATCH de conclusão via x-worker-key (POST requer sessão)
    pathname === '/api/agents' || // Jarvis — step 0: descobre agent_ids via x-worker-key
    pathname === '/api/squads' || // Jarvis — descobre squad_ids via x-worker-key
    pathname === '/api/analytics/setup' || // Analytics — criação de schema via x-worker-key
    pathname === '/api/analytics/sessions' || // Analytics — POST métricas via x-worker-key (GET aceita session)
    pathname.startsWith('/api/analytics/') || // Analytics — todos endpoints aceitam dual auth (worker-key ou session)
    pathname.startsWith('/api/pipeline-runs') || // Pipeline Runs — dual auth (worker-key para harness, session para UI)
    pathname.startsWith('/api/melhor-envio/') || // Melhor Envio — dual auth (worker-key ou session)
    pathname === '/api/mercado-livre/pedidos/backfill' || // Backfill one-shot — auth via x-worker-key
    (pathname.startsWith('/api/') && pathname.endsWith('/setup')) || // /setup endpoints — todos self-auth via x-worker-key (D41)
    pathname === '/api/github/webhooks' // GitHub webhook receiver — auth via HMAC-SHA256 (MC_GITHUB_WEBHOOK_SECRET)
  ) {
    return NextResponse.next();
  }

  // 2. Verifica se o token existe
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    // Adiciona callback para voltar após login (opcional)
    if (pathname !== '/') {
      url.searchParams.set('callbackUrl', pathname);
    }
    return NextResponse.redirect(url);
  }

  // 3. Valida o token
  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch (error) {
    console.error('Middleware: Token inválido', error);
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    
    // Limpa o cookie inválido
    const response = NextResponse.redirect(url);
    response.cookies.delete('mc_token');
    return response;
  }
}

// Configura em quais rotas o middleware deve rodar
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (api routes) -> Algumas APIs podem precisar de auth diferente, mas protegemos API/Paraguai
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
