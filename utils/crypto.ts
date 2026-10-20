/**
 * utils/crypto.ts
 *
 * Ofuscación en reposo con WebCrypto (AES-GCM 256 bits, derivación HKDF-SHA256).
 *
 * LÍMITE IMPORTANTE (FIX-0017): la clave se deriva de un secreto que viaja en el
 * path del documento (`uid`), así que cualquiera que pueda leer el documento puede
 * descifrarlo. Esto NO aporta confidencialidad: es ofuscación para que los secretos
 * no queden legibles de un vistazo en la consola de Firebase. El control real de
 * acceso son las reglas de Firestore (`firestore.rules`).
 */

const HKDF_INFO = new TextEncoder().encode('wootag-firestore-credentials-v1');

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt,
      info: HKDF_INFO,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

const toHex = (buf: Uint8Array): string =>
  Array.from(buf)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

const fromHex = (hex: string): Uint8Array => {
  const matches = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(matches.map(b => parseInt(b, 16)));
};

/**
 * Ofusca un texto plano con AES-GCM usando una clave derivada del secreto proporcionado
 * (típicamente el `uid`). No aporta confidencialidad frente a quien puede leer el
 * documento: sirve para que el secreto no quede legible a simple vista (FIX-0017).
 * Formato del resultado: `enc:v1:<salt-hex>:<iv-hex>:<ciphertext-hex>`
 */
export async function encryptSecret(plainText: string, secretKey: string): Promise<string> {
  if (!plainText || typeof plainText !== 'string') return plainText;
  try {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(secretKey, salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plainText)
    );
    return `enc:v1:${toHex(salt)}:${toHex(iv)}:${toHex(new Uint8Array(encrypted))}`;
  } catch (err) {
    console.error('Crypto encryption failed:', err);
    return plainText;
  }
}

/**
 * Revierte la ofuscación de un texto en formato `enc:v1:...` utilizando la clave derivada.
 * Si el texto no está ofuscado (legacy), lo retorna tal cual.
 * El resultado no demuestra autorización: la protección real la imponen las reglas de
 * Firestore, no esta función (FIX-0017).
 */
export async function decryptSecret(cipherText: string, secretKey: string): Promise<string> {
  if (!cipherText || typeof cipherText !== 'string' || !cipherText.startsWith('enc:v1:')) {
    return cipherText;
  }
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return cipherText;
    const salt = fromHex(parts[2]);
    const iv = fromHex(parts[3]);
    const encryptedData = fromHex(parts[4]);

    const key = await deriveKey(secretKey, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('Crypto decryption failed:', err);
    return cipherText;
  }
}
