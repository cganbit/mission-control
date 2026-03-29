import { describe, test, expect } from 'vitest';
import { encrypt, decrypt, safeDecrypt } from './crypto';

// DB_ENCRYPTION_KEY configurada no vitest.config.ts

describe('encrypt / decrypt', () => {
  test('descriptografa o que foi criptografado', () => {
    const original = '123.456.789-00';
    expect(decrypt(encrypt(original))).toBe(original);
  });

  test('cada chamada gera um valor diferente (IV aleatório)', () => {
    const a = encrypt('teste');
    const b = encrypt('teste');
    expect(a).not.toBe(b);
  });

  test('formato é iv:authTag:encrypted (3 partes separadas por :)', () => {
    const parts = encrypt('qualquer').split(':');
    expect(parts).toHaveLength(3);
  });

  test('encrypt retorna vazio se plaintext for vazio', () => {
    expect(encrypt('')).toBe('');
  });
});

describe('safeDecrypt', () => {
  test('descriptografa valor criptografado corretamente', () => {
    const cpf = '987.654.321-00';
    expect(safeDecrypt(encrypt(cpf))).toBe(cpf);
  });

  test('retorna o valor original se não estiver no formato criptografado', () => {
    expect(safeDecrypt('texto-simples')).toBe('texto-simples');
  });

  test('retorna string vazia para null', () => {
    expect(safeDecrypt(null)).toBe('');
  });

  test('retorna string vazia para undefined', () => {
    expect(safeDecrypt(undefined)).toBe('');
  });

  test('retorna string vazia para string vazia', () => {
    expect(safeDecrypt('')).toBe('');
  });

  test('não lança exceção com valor corrompido', () => {
    expect(() => safeDecrypt('invalido:corrompido:dado')).not.toThrow();
  });
});
