---
name: api-patterns
description: Padrões de design de API. REST vs GraphQL vs tRPC, formatos de resposta, versionamento, paginação, autenticação. Genérico — projeto consumer define base URL e esquema de auth.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# API Patterns

> Princípios de design de API. **Aprenda a PENSAR, não copiar padrões fixos.**
> O projeto consumer define contexto próprio (base URL, auth, formato de resposta) em `knowledge/concepts/api-contract.md` (ou equivalente).

---

## Decisão de estilo

| Situação | Escolha |
|---|---|
| CRUD recursos + consumidores múltiplos | **REST** |
| Agregação cliente-a-cliente + evitar over/under-fetch | **GraphQL** |
| Type-safety end-to-end TS monorepo | **tRPC** |

Default: REST. Só escolha outro com justificativa documentada em ADR.

---

## Padrões REST (exemplo Next.js App Router)

```typescript
// src/app/api/[recurso]/route.ts
export async function GET(req: NextRequest) {
  const authResult = await authenticate(req); // cookie JWT / x-api-key / bearer — consumer decide
  if (!authResult.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const data = await fetchData();
  return NextResponse.json(data);
}
```

### Paginação

- **Offset-based:** simples, mas inconsistente com mutações concorrentes. OK pra datasets pequenos/quase-imutáveis.
  ```typescript
  const params = new URLSearchParams({ offset: String(page * limit), limit: String(limit) });
  ```
- **Cursor-based:** estável sob mutação. Preferir pra feeds/timelines/listagens grandes.
  ```typescript
  { items: [...], nextCursor: 'opaque-string' | null }
  ```

### Error Response

Formato único por projeto (não misturar estilos):
```typescript
return NextResponse.json({ error: 'mensagem curta', code: 'OPCIONAL_ENUM' }, { status: 4xx });
```

---

## Checklist antes de criar endpoint

- [ ] Autenticação: qual método? (documentado em knowledge do consumer)
- [ ] Método HTTP correto: GET (leitura idempotente) / POST (criação/ação) / PATCH (update parcial) / PUT (replace) / DELETE
- [ ] Validação de input no servidor (zod / ajv / similar)
- [ ] Error handling com status codes corretos
- [ ] **Nunca expor stack trace / erros internos ao cliente**
- [ ] Rate limiting em endpoints públicos ou custo-sensitivos
- [ ] Observabilidade: logs + métricas + trace (telemetria via `@wingx-app/platform` mc-telemetry quando aplicável)

---

## Status Codes

| Código | Quando usar |
|--------|-------------|
| 200 | Sucesso com body |
| 201 | Criado |
| 204 | Sucesso sem body |
| 400 | Input inválido |
| 401 | Não autenticado |
| 403 | Autenticado mas não autorizado |
| 404 | Não encontrado |
| 409 | Conflict (concorrência, duplicata) |
| 422 | Input validado sintaticamente mas semanticamente inválido |
| 429 | Rate limit |
| 500 | Erro interno (não exponha detalhes) |
| 503 | Indisponível (dependência down, manutenção) |

---

## Anti-Patterns

❌ Verbos em endpoints REST (`/getUsers` → `GET /users`)
❌ Retornar 200 para erros ("soft failures" mascarando bugs)
❌ Expor stack traces, SQL, paths internos ao cliente
❌ Sem rate limiting em endpoints públicos
❌ Misturar esquemas de autenticação sem motivo (cookie pra uns, ?key= pra outros arbitrariamente)
❌ Nomes de campo inconsistentes entre API e frontend (ex: `nome` no backend, `name` no frontend) — mapear explicitamente no `.map()` ou padronizar o DTO
❌ Paginação offset-based em dataset que sofre mutação concorrente (dá item duplicado/pulado)

---

## Gotchas recorrentes (cross-project)

- **Field-name drift:** API e consumer divergem em naming (camelCase vs snake_case vs português/inglês). Padronize no barrel de DTOs ou no mapper explícito — não confie em "o frontend pega o que vem".
- **Auth bypass pra worker/agent routes:** rotas chamadas por workers não-humanos precisam de path pattern explícito no middleware/proxy, senão redirecionam pra login e falham silenciosamente.
- **CORS em rotas pública vs. interna:** definir policy diferente por grupo de rota; nunca `Access-Control-Allow-Origin: *` com cookie de sessão.

---

## Notas do consumer

Cada projeto deve documentar em `knowledge/concepts/` (ou equivalente):
- Base URL de produção + staging
- Esquema(s) de autenticação adotado(s) + quando usar cada
- Formato canônico de error response
- Convenção de naming (camelCase TS ↔ snake_case wire, por exemplo)
- Política de versionamento (path `/v1/`, header `Accept-Version`, etc.)
