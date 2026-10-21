import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { MAX_TIMEOUT_MS, isSessionExpired, msUntilExpiry } from './sessionTtl';

/**
 * FIX-0029: la sesión de WooCommerce debe vencer en vivo (no sólo al recargar).
 */

const repoRoot = (): string => {
  let current = process.cwd();
  for (let i = 0; i < 10; i++) {
    try {
      readFileSync(join(current, 'package.json'));
      readFileSync(join(current, 'App.tsx'));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  throw new Error('No se encontró la raíz del repositorio');
};

describe('utils/sessionTtl (FIX-0029)', () => {
  const now = 1_700_000_000_000;

  it('FIX-0029-AC-001: una sesión vigente informa el tiempo restante', () => {
    expect(msUntilExpiry(now + 60_000, now)).toBe(60_000);
    expect(isSessionExpired(now + 60_000, now)).toBe(false);
  });

  it('FIX-0029-AC-001: una sesión vencida informa 0 ms y se considera expirada', () => {
    expect(msUntilExpiry(now - 1, now)).toBe(0);
    expect(msUntilExpiry(now, now)).toBe(0);
    expect(isSessionExpired(now - 1, now)).toBe(true);
    expect(isSessionExpired(now, now)).toBe(true);
  });

  it('FIX-0029: un `expiresAt` inválido se trata como expirado (no deja la sesión abierta)', () => {
    expect(msUntilExpiry(Number.NaN, now)).toBe(0);
    expect(isSessionExpired(Number.NaN, now)).toBe(true);
  });

  it('FIX-0029: el delay se acota al máximo de setTimeout', () => {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(msUntilExpiry(now + thirtyDays, now)).toBe(MAX_TIMEOUT_MS);
  });

  it('FIX-0029-AC-002: App programa el vencimiento y cierra la sesión sin recargar', () => {
    const root = repoRoot();
    const app = readFileSync(join(root, 'App.tsx'), 'utf-8');

    expect(app).toContain("from './utils/sessionTtl'");
    expect(app).toContain('msUntilExpiry');
    // Programa el cierre y limpia la sesión (no sólo la valida al montar).
    expect(app).toMatch(/setTimeout\(/);
    expect(app).toMatch(/expireSession|handleSessionExpired/);
    expect(app).toMatch(/setSession\(null\)/);
    expect(app).toMatch(/localStorage\.removeItem\(SESSION_KEY\)/);
  });
});
