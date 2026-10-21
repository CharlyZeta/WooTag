import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

/**
 * FIX-0023: los logs de producción no deben exponer payloads de producto.
 *
 * Verificación estática (la build de producción es la misma transpilación de este
 * código): ningún `console.log` de depuración y ningún `console.warn` que imprima
 * datos del catálogo (SKU, nombre o el payload de la API).
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
const APP_FILES = ['App.tsx', 'types.ts', 'index.tsx'];

const collectAppFiles = (): string[] => {
  const files: string[] = APP_FILES.map(f => join(ROOT, f)).filter(p => {
    try { return statSync(p).isFile(); } catch { return false; }
  });

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
    try { walk(full); } catch { /* directorio ausente */ }
  }
  return files;
};

const appFiles = collectAppFiles();
const read = (file: string) => readFileSync(file, 'utf-8');
const rel = (file: string) => relative(ROOT, file).replace(/\\/g, '/');

describe('FIX-0023 — logs de producción sin datos del catálogo', () => {
  it('FIX-0023-AC-002: el código de la app no tiene console.log de depuración', () => {
    expect(appFiles.length).toBeGreaterThan(15);
    const offenders = appFiles
      .filter(file => /console\.log\s*\(/.test(read(file)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('FIX-0023-AC-002: no hay console.warn/info/debug con payloads ni datos de producto', () => {
    // Busca argumentos con payload (`, data)`, `, entry)`) o datos del producto
    // (item.sku/item.name). No marca mensajes que sólo mencionan la palabra "data".
    const suspicious = /\bconsole\.(warn|info|debug)\s*\([^)]*(item\.sku|item\.name|,\s*data\b|,\s*entry\b)/;
    const offenders = appFiles
      .filter(file => suspicious.test(read(file)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('FIX-0023-AC-001: la búsqueda por SKU no imprime el resultado de la API', () => {
    const woo = read(join(ROOT, 'services', 'wooService.ts'));
    expect(woo).not.toMatch(/SKU Search Result/);
    expect(woo).not.toMatch(/console\.log/);
    // Los errores accionables siguen existiendo (status HTTP, sin payload).
    expect(woo).toMatch(/console\.error\(`\[WooTag\] SKU fetch failed: \$\{response\.status\}`\)/);
  });

  it('FIX-0023-AC-001: las omisiones se reportan como conteo agregado, sin SKU ni nombre', () => {
    const woo = read(join(ROOT, 'services', 'wooService.ts'));
    expect(woo).toMatch(/Se omitieron \$\{skipped\} producto/);
    expect(woo).not.toMatch(/Omitiendo producto/);
  });
});
