import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from './crypto';

describe('utils/crypto (AES-GCM WebCrypto)', () => {
  const SECRET_KEY = 'user_uid_123';
  const PLAIN_TEXT = 'cs_test_SECRET_98765';

  it('cifra el texto plano produciendo un string con prefijo enc:v1: y formato salt:iv:ciphertext', async () => {
    const cipher = await encryptSecret(PLAIN_TEXT, SECRET_KEY);
    expect(cipher).toMatch(/^enc:v1:[0-9a-f]{32}:[0-9a-f]{24}:[0-9a-f]+$/);
    expect(cipher).not.toContain(PLAIN_TEXT);
  });

  it('produce ciphertexts distintos para el mismo texto plano (sales e IVs aleatorios)', async () => {
    const cipher1 = await encryptSecret(PLAIN_TEXT, SECRET_KEY);
    const cipher2 = await encryptSecret(PLAIN_TEXT, SECRET_KEY);
    expect(cipher1).not.toBe(cipher2);
  });

  it('descifra correctamente el texto cifrado con la clave correcta', async () => {
    const cipher = await encryptSecret(PLAIN_TEXT, SECRET_KEY);
    const decrypted = await decryptSecret(cipher, SECRET_KEY);
    expect(decrypted).toBe(PLAIN_TEXT);
  });

  it('no puede descifrar con una clave incorrecta y retorna el texto original o falla con seguridad', async () => {
    const cipher = await encryptSecret(PLAIN_TEXT, SECRET_KEY);
    const decrypted = await decryptSecret(cipher, 'wrong_key');
    expect(decrypted).not.toBe(PLAIN_TEXT);
  });

  it('retorna el texto sin modificar si no tiene prefijo enc:v1: (compatibilidad backward)', async () => {
    const legacy = 'cs_legacy_plain_secret';
    const result = await decryptSecret(legacy, SECRET_KEY);
    expect(result).toBe(legacy);
  });
});
