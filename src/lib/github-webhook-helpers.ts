// GitHub webhook UI defaults new hooks to content_type=form
// (application/x-www-form-urlencoded, body = `payload=<url-encoded-json>`),
// not application/json. Tolerate both so config drift doesn't silently break
// PRD-040 Camada 1 observability. HMAC validation already works on raw bytes
// regardless of encoding; only JSON extraction needs to branch.
export function extractJsonPayload(rawBody: string, contentType: string | null): unknown {
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(rawBody);
    const payloadField = params.get('payload');
    if (!payloadField) throw new Error('Missing payload field in form body');
    return JSON.parse(payloadField);
  }
  return JSON.parse(rawBody);
}
