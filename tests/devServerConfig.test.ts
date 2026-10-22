import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * FIX-0030: el dev server no debe caerse por archivos bloqueados.
 *
 * En Windows, `fs.watch` sobre un PNG que otro proceso tiene abierto (la
 * herramienta de capturas, por ejemplo) devuelve EBUSY y Vite 6 aborta el
 * proceso. El watcher tiene que ignorar los directorios que no son código.
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
const viteConfig = readFileSync(join(ROOT, 'vite.config.ts'), 'utf-8');

describe('FIX-0030 — el watcher de Vite ignora artefactos', () => {
  it('FIX-0030-AC-001: ignora screenshots y el resto de artefactos no-código', () => {
    expect(viteConfig).toContain('watch:');
    for (const dir of ['screenshots', 'dist', 'coverage', 'graphify-out', '.sdd', 'node_modules']) {
      expect(viteConfig, `watch.ignored debe incluir ${dir}`).toContain(`**/${dir}/**`);
    }
  });

  it('FIX-0030-AC-001: la configuración del servidor conserva puerto y host de desarrollo', () => {
    expect(viteConfig).toMatch(/port:\s*3000/);
    expect(viteConfig).toMatch(/host:\s*'0\.0\.0\.0'/);
  });
});
