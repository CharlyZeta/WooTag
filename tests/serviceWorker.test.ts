import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * FIX-0028: la app es instalable pero no cachea nada; el service worker debe
 * poder actualizarse siempre. Si `sw.js` se sirviera `immutable` (como el resto
 * de los .js), un cliente podría quedarse hasta un año con un SW viejo.
 */

const findRepoRoot = (start: string): string => {
  let current = start;
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

const ROOT = findRepoRoot(process.cwd());
const read = (file: string) => readFileSync(join(ROOT, file), 'utf-8');

describe('FIX-0028 — service worker actualizable y sin promesas de offline', () => {
  it('FIX-0028-AC-002: .htaccess sirve sw.js con no-cache, después de la regla immutable', () => {
    const htaccess = read('public/.htaccess');
    const immutableIndex = htaccess.indexOf('immutable');
    const swBlockIndex = htaccess.indexOf('<Files "sw.js">');

    expect(immutableIndex).toBeGreaterThan(-1);
    expect(swBlockIndex).toBeGreaterThan(-1);
    // La última directiva gana en Apache: el bloque de sw.js debe ir después.
    expect(swBlockIndex).toBeGreaterThan(immutableIndex);

    const swBlock = htaccess.slice(swBlockIndex);
    expect(swBlock).toMatch(/no-cache/);
    expect(swBlock).toMatch(/must-revalidate/);
  });

  it('FIX-0028-AC-002: el service worker no implementa caché (no hay precache ni Cache API)', () => {
    const sw = read('public/sw.js');
    expect(sw).not.toMatch(/caches\.(open|match|addAll)/);
    // Sólo importa el uso real (`event.respondWith(`), no la mención en comentarios.
    expect(sw).not.toMatch(/\.respondWith\s*\(/);
    expect(sw).toContain('clients.claim()');
    expect(sw).toMatch(/no cachea|NO funciona sin conexi[óo]n/i);
  });

  it('FIX-0028-AC-001: el registro fuerza la revalidación del SW en cada carga', () => {
    const html = read('index.html');
    expect(html).toContain("updateViaCache: 'none'");
    expect(html).toMatch(/registration\.update\(\)/);
    expect(html).toContain("'/sw.js'");
  });

  it('FIX-0028-AC-003: la documentación no promete funcionamiento offline', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/sin offline|no funciona offline/i);
    expect(readme).toMatch(/instalable/i);
  });
});
