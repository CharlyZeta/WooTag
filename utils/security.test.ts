/**
 * security.test.ts — Tests para el módulo de ofuscación de credenciales
 *
 * Cubre:
 * 1. encrypt: generación de string base64, manejo de errores
 * 2. decrypt: round-trip, datos corruptos, salt inválido
 */

import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './security';

// ─── 1. encrypt ───────────────────────────────────────────────────────────────

describe('encrypt', () => {
  it('retorna un string base64 no vacío para datos válidos', () => {
    const result = encrypt({ test: 'data' });
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('el resultado no contiene el JSON original en texto plano', () => {
    const secret = 'mi-password-secreto';
    const result = encrypt({ password: secret });
    // El string base64 no debería contener la contraseña directamente
    expect(result).not.toContain(secret);
  });

  it('produce resultados distintos para datos distintos', () => {
    const result1 = encrypt({ key: 'valor1' });
    const result2 = encrypt({ key: 'valor2' });
    expect(result1).not.toBe(result2);
  });

  it('retorna string vacío si la serialización falla (referencia circular)', () => {
    const circular: any = {};
    circular.self = circular;
    const result = encrypt(circular);
    expect(result).toBe('');
  });
});

// ─── 2. decrypt ───────────────────────────────────────────────────────────────

describe('decrypt', () => {
  it('descifra correctamente datos cifrados con encrypt (round-trip)', () => {
    const original = { user: 'admin', token: 'abc123' };
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toEqual(original);
  });

  it('round-trip preserva tipos numéricos (ej: timestamps)', () => {
    const session = {
      user: { id: 1, name: 'Test User' },
      config: { url: 'https://test.com', consumerKey: 'ck_test', consumerSecret: 'cs_test' },
      expiresAt: 1700000000000,
    };
    const encrypted = encrypt(session);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toEqual(session);
    expect(typeof decrypted.expiresAt).toBe('number');
  });

  it('retorna null si el string no es base64 válido', () => {
    const result = decrypt('esto-no-es-base64-!!!');
    expect(result).toBeNull();
  });

  it('retorna null si el salt no coincide (datos manipulados)', () => {
    // Crear un base64 válido pero con salt incorrecto
    const tampered = btoa(JSON.stringify({ hack: true }) + '::SALT-INCORRECTO');
    const result = decrypt(tampered);
    expect(result).toBeNull();
  });

  it('retorna null si el JSON interno está corrupto', () => {
    // base64 que decodifica a un string que no es JSON válido
    const corrupted = btoa('no-es-json::WooTag-Secure-Salt-v1');
    const result = decrypt(corrupted);
    expect(result).toBeNull();
  });

  it('retorna null para un string vacío', () => {
    const result = decrypt('');
    expect(result).toBeNull();
  });
});
