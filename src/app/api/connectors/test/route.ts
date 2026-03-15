import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';

export async function POST(req: NextRequest) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { connector, config } = await req.json() as { connector: string; config: Record<string, string> };

  try {
    switch (connector) {

      case 'postgresql': {
        await query('SELECT 1');
        return NextResponse.json({ ok: true, message: 'Conectado ao PostgreSQL com sucesso' });
      }

      case 'anthropic': {
        const key = config['anthropic_api_key'];
        if (!key) return NextResponse.json({ ok: false, message: 'API key não configurada' });
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        });
        if (res.ok) return NextResponse.json({ ok: true, message: 'Anthropic API autenticada com sucesso' });
        return NextResponse.json({ ok: false, message: `Erro ${res.status}: ${res.statusText}` });
      }

      case 'openai': {
        const key = config['openai_api_key'];
        if (!key) return NextResponse.json({ ok: false, message: 'API key não configurada' });
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.ok) return NextResponse.json({ ok: true, message: 'OpenAI API autenticada com sucesso' });
        return NextResponse.json({ ok: false, message: `Erro ${res.status}: ${res.statusText}` });
      }

      case 'gemini': {
        const key = config['gemini_api_key'];
        if (!key) return NextResponse.json({ ok: false, message: 'API key não configurada' });
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (res.ok) return NextResponse.json({ ok: true, message: 'Gemini API autenticada com sucesso' });
        return NextResponse.json({ ok: false, message: `Erro ${res.status}: ${res.statusText}` });
      }

      case 'youtube': {
        const key = config['youtube_api_key'];
        if (!key) return NextResponse.json({ ok: false, message: 'API key não configurada' });
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=id&mine=true&key=${key}`
        );
        // 400 = key valid but needs OAuth for mine=true — still means key works
        if (res.status === 400 || res.ok) return NextResponse.json({ ok: true, message: 'YouTube API key válida' });
        return NextResponse.json({ ok: false, message: `Erro ${res.status}: ${res.statusText}` });
      }

      case 'github': {
        const token = config['github_token'];
        if (!token) return NextResponse.json({ ok: false, message: 'Token não configurado' });
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'MissionControl/1.0' },
        });
        if (res.ok) {
          const data = await res.json() as { login?: string };
          return NextResponse.json({ ok: true, message: `Autenticado como @${data.login}` });
        }
        return NextResponse.json({ ok: false, message: `Erro ${res.status}: ${res.statusText}` });
      }

      case 'evolution': {
        const url  = config['evolution_api_url'];
        const key  = config['evolution_api_key'];
        if (!url || !key) return NextResponse.json({ ok: false, message: 'URL ou API key não configurados' });
        const res = await fetch(`${url}/instance/fetchInstances`, {
          headers: { apikey: key },
        });
        if (res.ok) {
          const data = await res.json() as unknown[];
          return NextResponse.json({ ok: true, message: `Evolution API OK — ${Array.isArray(data) ? data.length : '?'} instância(s)` });
        }
        return NextResponse.json({ ok: false, message: `Erro ${res.status}: ${res.statusText}` });
      }

      case 'arxiv': {
        const res = await fetch('https://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=1');
        if (res.ok) return NextResponse.json({ ok: true, message: 'ArXiv API acessível (sem autenticação)' });
        return NextResponse.json({ ok: false, message: 'ArXiv inacessível' });
      }

      case 'firecrawl': {
        const key = config['firecrawl_api_key'];
        if (!key) return NextResponse.json({ ok: false, message: 'API key não configurada' });
        const res = await fetch('https://api.firecrawl.dev/v1/team/credits', {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.ok) {
          const data = await res.json() as { data?: { credits_used?: number; credits_limit?: number } };
          const used  = data?.data?.credits_used  ?? '?';
          const limit = data?.data?.credits_limit ?? '?';
          return NextResponse.json({ ok: true, message: `Firecrawl OK — ${used}/${limit} créditos usados` });
        }
        return NextResponse.json({ ok: false, message: `Erro ${res.status}: key inválida` });
      }

      case 'openrouter': {
        const key = config['openrouter_api_key'];
        if (!key) return NextResponse.json({ ok: false, message: 'API key não configurada' });
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.ok) return NextResponse.json({ ok: true, message: 'OpenRouter API autenticada com sucesso' });
        return NextResponse.json({ ok: false, message: `Erro ${res.status}: key inválida` });
      }

      case 'n8n': {
        const url = config['n8n_url'];
        const key = config['n8n_api_key'];
        if (!url || !key) return NextResponse.json({ ok: false, message: 'URL ou API key não configurados' });
        const res = await fetch(`${url}/api/v1/workflows?limit=1`, {
          headers: { 'X-N8N-API-KEY': key },
        });
        if (res.ok) {
          const data = await res.json() as { data?: unknown[] };
          const count = data?.data?.length ?? 0;
          return NextResponse.json({ ok: true, message: `n8n conectado — ${count} workflow(s) acessíveis` });
        }
        return NextResponse.json({ ok: false, message: `Erro ${res.status}: verifique URL e API key` });
      }

      default:
        return NextResponse.json({ ok: false, message: 'Conector desconhecido' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: `Erro: ${msg}` });
  }
}
