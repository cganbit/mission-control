import crypto from 'crypto';

const KEY_HEX = process.env.DB_ENCRYPTION_KEY ?? '';
const ALG = 'aes-256-gcm';

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('DB_ENCRYPTION_KEY inválida ou ausente (deve ser 32 bytes hex)');
  }
  return Buffer.from(KEY_HEX, 'hex');
}

// Retorna "iv:authTag:encrypted" em hex
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  const iv = crypto.randomBytes(12); // 96-bit IV para GCM
  const cipher = crypto.createCipheriv(ALG, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Recebe "iv:authTag:encrypted", retorna plaintext
export function decrypt(stored: string): string {
  if (!stored || !stored.includes(':')) return stored; // não criptografado (dados antigos)
  const parts = stored.split(':');
  if (parts.length !== 3) return stored;
  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv(ALG, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

// Descriptografa apenas se o valor parecer criptografado (formato iv:tag:data)
export function safeDecrypt(value: string | null | undefined): string {
  if (!value) return '';
  try { return decrypt(value); } catch { return value; }
}
