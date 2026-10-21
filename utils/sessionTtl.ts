/**
 * FIX-0029: la sesión de WooCommerce declara 24 h pero sólo se validaba al
 * arrancar. Estos helpers calculan el vencimiento para programar el cierre en vivo.
 */

/** setTimeout no admite delays mayores a 2^31-1 ms (~24,8 días). */
export const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Milisegundos que faltan para que venza la sesión, acotados a [0, MAX_TIMEOUT_MS].
 * Devuelve 0 si ya venció (o si `expiresAt` es inválido).
 */
export const msUntilExpiry = (expiresAt: number, now: number = Date.now()): number => {
  if (!Number.isFinite(expiresAt)) return 0;
  const remaining = expiresAt - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  return Math.min(remaining, MAX_TIMEOUT_MS);
};

/** ¿La sesión ya venció? */
export const isSessionExpired = (expiresAt: number, now: number = Date.now()): boolean => {
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt <= now;
};
