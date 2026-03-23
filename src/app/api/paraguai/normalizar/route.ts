import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getArbitragemPool } from '@/lib/db';

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? '';

const PROMPT = (descricao: string) => `Você é um especialista em eletrônicos da América Latina. Analise a descrição bruta de um produto e extraia informações estruturadas.

Descrição bruta: "${descricao}"

Retorne SOMENTE um JSON válido com esta estrutura exata:
{
  "titulo_amigavel": "Nome limpo e legível em português (ex: iPhone 14 Pro Max 256GB Preto)",
  "marca": "Marca com primeira letra maiúscula (ex: Apple, Samsung, Motorola)",
  "modelo": "Nome comercial completo (ex: iPhone 14 Pro Max, Galaxy S23 Ultra)",
  "capacidade": "Capacidade de armazenamento se aplicável (ex: 256GB) ou string vazia",
  "categoria": "Uma de: smartphone, tablet, notebook, audio, wearable, drone, console, acessorio, informatica",
  "origem": "País de origem se mencionado (ex: USA, China) ou string vazia"
}

Regras:
- titulo_amigavel deve ser conciso (máx 60 chars) e legível
- Se não tiver certeza, deixe string vazia ""
- Retorne SOMENTE o JSON, sem mais nada`;

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const fingerprints: string[] = Array.isArray(body.fingerprints)
    ? body.fingerprints
    : body.fingerprint ? [body.fingerprint] : [];

  if (fingerprints.length === 0) {
    return NextResponse.json({ error: 'Forneça fingerprint ou fingerprints' }, { status: 400 });
  }

  if (!OPENROUTER_KEY) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY não configurada no servidor' }, { status: 503 });
  }

  const results: { fingerprint: string; success: boolean; updated?: object; error?: string }[] = [];

  for (const fingerprint of fingerprints) {
    try {
      // Get raw description from DB
      const row = await getArbitragemPool().query(
        `SELECT hp.descricao_original FROM historico_precos hp
         WHERE hp.fingerprint = $1
         ORDER BY hp.received_at DESC LIMIT 1`,
        [fingerprint]
      );

      const descricao_raw = row.rows[0]?.descricao_original || body.descricao_raw || '';
      if (!descricao_raw) {
        results.push({ fingerprint, success: false, error: 'Sem descrição para normalizar' });
        continue;
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://mission-control.local',
          'X-Title': 'Mission Control - Normalizacao',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-haiku-4-5',
          messages: [{ role: 'user', content: PROMPT(descricao_raw) }],
          max_tokens: 300,
          temperature: 0.1,
        }),
      });

      const data = await response.json();
      const text: string = data.choices?.[0]?.message?.content ?? '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        results.push({ fingerprint, success: false, error: 'IA não retornou JSON: ' + text.slice(0, 100) });
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const { titulo_amigavel, marca, modelo, capacidade, categoria, origem } = parsed;

      await getArbitragemPool().query(
        `INSERT INTO produtos_mestre (fingerprint, titulo_amigavel, marca, modelo, capacidade, categoria, origem)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (fingerprint) DO UPDATE SET
           titulo_amigavel = EXCLUDED.titulo_amigavel,
           marca = EXCLUDED.marca,
           modelo = EXCLUDED.modelo,
           capacidade = EXCLUDED.capacidade,
           categoria = EXCLUDED.categoria,
           origem = EXCLUDED.origem`,
        [fingerprint, titulo_amigavel, marca, modelo, capacidade, categoria, origem]
      );

      results.push({ fingerprint, success: true, updated: parsed });
    } catch (e: any) {
      results.push({ fingerprint, success: false, error: e.message });
    }
  }

  const allOk = results.every(r => r.success);
  return NextResponse.json({ ok: allOk, results });
}
