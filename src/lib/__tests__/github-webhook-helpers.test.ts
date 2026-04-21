import { describe, it, expect } from 'vitest';
import { extractJsonPayload } from '../github-webhook-helpers';

describe('extractJsonPayload', () => {
  it('parses raw JSON body when content-type is application/json', () => {
    const body = JSON.stringify({ hello: 'world', n: 42 });
    const result = extractJsonPayload(body, 'application/json');
    expect(result).toEqual({ hello: 'world', n: 42 });
  });

  it('extracts payload field from form-encoded body', () => {
    const inner = { action: 'opened', issue: { number: 1 } };
    const body = `payload=${encodeURIComponent(JSON.stringify(inner))}`;
    const result = extractJsonPayload(body, 'application/x-www-form-urlencoded');
    expect(result).toEqual(inner);
  });

  it('throws when form-encoded body is missing payload field', () => {
    expect(() =>
      extractJsonPayload('foo=bar', 'application/x-www-form-urlencoded')
    ).toThrow(/payload/i);
  });

  it('handles form content-type with charset suffix', () => {
    const inner = { ok: true };
    const body = `payload=${encodeURIComponent(JSON.stringify(inner))}`;
    const result = extractJsonPayload(body, 'application/x-www-form-urlencoded; charset=utf-8');
    expect(result).toEqual(inner);
  });

  it('falls back to JSON.parse when content-type is null', () => {
    const result = extractJsonPayload('{"x":1}', null);
    expect(result).toEqual({ x: 1 });
  });
});
