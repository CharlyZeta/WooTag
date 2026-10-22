import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * FIX-0031: en un celular, el panel de PC (w-full + h-screen) empujaba la vista
 * de góndola fuera de la pantalla: el operador veía la barra lateral y no el
 * escáner. En modo móvil sólo debe renderizarse el operador (con su botón
 * "Vista PC" para volver).
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
const app = readFileSync(join(ROOT, 'App.tsx'), 'utf-8');

describe('FIX-0031 — el modo móvil oculta el panel de PC', () => {
  it('FIX-0031-AC-001: Controls se renderiza sólo fuera del modo móvil', () => {
    // El wrapper de Controls debe estar condicionado por `!isMobileMode`.
    expect(app).toMatch(/\{!isMobileMode && \(\s*<div className="no-print[^"]*">\s*<Controls/);
  });

  it('FIX-0031-AC-002: el operador móvil conserva la salida a la vista PC', () => {
    expect(app).toContain('onSwitchToDesktopView');
    expect(app).toMatch(/toggleMobileMode\(false\)/);
  });

  it('FIX-0031-AC-001: no queda un segundo panel de PC sin condicionar', () => {
    // Sólo debe existir un `<Controls` en todo el archivo.
    const controlsUsages = app.match(/<Controls\b/g) ?? [];
    expect(controlsUsages).toHaveLength(1);
  });
});
