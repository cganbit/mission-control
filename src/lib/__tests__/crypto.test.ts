import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, safeDecrypt } from '../crypto';

describe('safeDecrypt', () => {
  it('retorna string vazia para null', () => {
    expect(safeDecrypt(null)).toBe('');
  });

  it('retorna string vazia para undefined', () => {
    expect(safeDecrypt(undefined)).toBe('');
  });

  it('retorna string vazia para string vazia', () => {
    expect(safeDecrypt('')).toBe('');
  });

  it('retorna plain text sem alteração (fallback para dados legados)', () => {
    expect(safeDecrypt('texto simples')).toBe('texto simples');
  });

  it('retorna o valor original se tiver formato inválido (2 partes)', () => {
    expect(safeDecrypt('apenas:dois')).toBe('apenas:dois');
  });

  it('retorna o valor original se tiver formato inválido (4+ partes)', () => {
    expect(safeDecrypt('a:b:c:d')).toBe('a:b:c:d');
  });

  it('descriptografa corretamente um valor criptografado (round-trip)', () => {
    const original = 'CPF: 123.456.789-00';
    const ciphertext = encrypt(original);
    expect(safeDecrypt(ciphertext)).toBe(original);
  });

  it('round-trip com caracteres especiais', () => {
    const original = 'João & Maria <test@email.com>';
    expect(safeDecrypt(encrypt(original))).toBe(original);
  });
});

describe('encrypt / decrypt', () => {
  it('encrypt retorna o valor sem alteração se string vazia', () => {
    expect(encrypt('')).toBe('');
  });

  it('encrypt produz formato iv:authTag:encrypted (3 partes hex separadas por :)', () => {
    const result = encrypt('hello');
    const parts = result.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]+$/);
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  it('dois encrypts do mesmo plaintext produzem ciphertexts diferentes (IV aleatório)', () => {
    const a = encrypt('secreto');
    const b = encrypt('secreto');
    expect(a).not.toBe(b);
  });

  it('decrypt round-trip', () => {
    const plain = 'telefone: (11) 99999-1234';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('decrypt retorna o stored se não contiver ":"', () => {
    expect(decrypt('semformatoalgum')).toBe('semformatoalgum');
  });
});
