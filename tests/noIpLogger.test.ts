import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

/**
 * FIX-0019: la app no debe resolver ni persistir la IP del usuario.
 *
 * Verificación estática (no hay forma de observar `fetch` en una build real desde
 * un test unitario): se asegura que el módulo desapareció, que nadie lo importa y
 * que no quedan rastros del servicio externo ni de la clave de almacenamiento.
 */

const findRepoRoot = (start: string): string => {
  let current = start;
  for (let i = 0; i < 10; i++) {
    try {
      statSync(join(current, 'package.json'));
      statSync(join(current, 'App.tsx'));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  throw new Error('No se encontró la raíz del repositorio');
};

const ROOT = findRepoRoot(process.cwd());
const APP_DIRS = ['components', 'services', 'utils', 'contexts'];

const collectAppFiles = (): string[] => {
  const files: string[] = ['App.tsx', 'types.ts', 'index.tsx']
    .map(f => join(ROOT, f))
    .filter(p => existsSync(p));

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) {
        files.push(full);
      }
    }
  };

  for (const dir of APP_DIRS) {
    const full = join(ROOT, dir);
    if (existsSync(full)) walk(full);
  }
  return files;
};

const appFiles = collectAppFiles();
const rel = (file: string) => relative(ROOT, file).replace(/\\/g, '/');

describe('FIX-0019 — sin IP de usuario ni telemetría a terceros', () => {
  it('FIX-0019-AC-003: el módulo ipLogger ya no existe', () => {
    expect(existsSync(join(ROOT, 'utils', 'ipLogger.ts'))).toBe(false);
  });

  it('FIX-0019-AC-003: ningún archivo de la app importa o usa ipLogger/logEvent', () => {
    const offenders = appFiles
      .filter(file => /ipLogger|\blogEvent\b|getSecurityLog/.test(readFileSync(file, 'utf-8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('FIX-0019-AC-001: no queda ninguna referencia a api.ipify.org', () => {
    const offenders = appFiles
      .filter(file => /ipify/i.test(readFileSync(file, 'utf-8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('FIX-0019-AC-002: no queda la clave local de auditoría (wootag_sl)', () => {
    const offenders = appFiles
      .filter(file => /wootag_sl/.test(readFileSync(file, 'utf-8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('FIX-0019-AC-001: ningún servicio de la app hace fetch a un tercero por IP', () => {
    // Sólo se permiten los hosts propios del producto y las APIs declaradas.
    const allowed = /(wp-json|firebase|googleapis|generativelanguage|aistudio)/g;
    const externalFetches: string[] = [];
    for (const file of appFiles) {
      const content = readFileSync(file, 'utf-8');
      for (const match of content.matchAll(/fetch\(\s*[`'"](https?:\/\/[^`'"]+)/g)) {
        const url = match[1];
        allowed.lastIndex = 0;
        if (!allowed.test(url)) externalFetches.push(`${rel(file)} → ${url}`);
      }
    }
    expect(externalFetches).toEqual([]);
  });
});
