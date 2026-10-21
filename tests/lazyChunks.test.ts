import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * FIX-0025: `xlsx` (≈415 KB) y `html5-qrcode` (≈327 KB) no deben viajar en la
 * carga inicial. El build lo demuestra: `dist/index.html` sólo preloadea
 * `vendor-react` y `vendor-icons`. Este guard verifica la causa en el código:
 * nadie los importa de forma estática y los componentes pesados son `lazy`.
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

describe('FIX-0025 — arranque sin xlsx ni escáner', () => {
  it('FIX-0025-AC-001: ImportTab no importa xlsImport de forma estática (usa import() dinámico)', () => {
    const importTab = read('components/controls/ImportTab.tsx');
    expect(importTab).not.toMatch(/from\s+['"]\.\.\/\.\.\/utils\/xlsImport['"]/);
    expect(importTab).toContain("await import('../../utils/xlsImport')");
  });

  it('FIX-0025-AC-001: el escáner de productos se carga con React.lazy y sólo al abrirse', () => {
    const controls = read('components/Controls.tsx');
    expect(controls).toContain("lazy(() =>");
    expect(controls).toMatch(/import\('\.\/QrScannerModal'\)/);
    expect(controls).not.toMatch(/^import \{ QrScannerModal \}/m);
    // Sólo se renderiza (y por ende se descarga) cuando el modal está abierto.
    expect(controls).toMatch(/wooConfig && isQrScannerOpen &&/);
    expect(controls).toContain('Suspense');
  });

  it('FIX-0025-AC-001: el modo móvil (html5-qrcode) se carga sólo en #/mobile', () => {
    const app = read('App.tsx');
    expect(app).toContain('React.lazy(');
    expect(app).toMatch(/import\('\.\/components\/MobileScannerView'\)/);
    expect(app).not.toMatch(/^import \{ MobileScannerView \}/m);
    expect(app).toContain('React.Suspense');
  });
});
