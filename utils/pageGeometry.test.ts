import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  MM_TO_PX,
  PAGE_SLOT_HEIGHT,
  SHEET_GAP_PX,
  SHEET_HEIGHT_MM,
  SHEET_WIDTH_MM,
  getPageFromScrollTop,
} from './pageGeometry';

/**
 * FIX-0015: el indicador de página debe usar la misma geometría que la hoja.
 * Antes usaba 297 mm mientras la hoja medía 282 mm (FIX-0010), con un desfase
 * de ~57 px por hoja.
 */
describe('utils/pageGeometry (FIX-0015)', () => {
  it('FIX-0015-AC-002: la geometría deriva de la hoja real de 282 mm, no de A4 nominal', () => {
    expect(SHEET_HEIGHT_MM).toBe(282);
    expect(SHEET_WIDTH_MM).toBe(210);
    expect(PAGE_SLOT_HEIGHT).toBeCloseTo(282 * MM_TO_PX + SHEET_GAP_PX, 6);
    // 282mm ≈ 1065.8px + 32 de separación
    expect(PAGE_SLOT_HEIGHT).toBeGreaterThan(1080);
    expect(PAGE_SLOT_HEIGHT).toBeLessThan(1110);
  });

  it('FIX-0015-AC-001: con 2 páginas, el scroll que cruza la segunda hoja devuelve 2', () => {
    expect(getPageFromScrollTop(0, 2)).toBe(1);
    expect(getPageFromScrollTop(PAGE_SLOT_HEIGHT - 1, 2)).toBe(1);
    expect(getPageFromScrollTop(PAGE_SLOT_HEIGHT, 2)).toBe(2);
    expect(getPageFromScrollTop(PAGE_SLOT_HEIGHT * 1.5, 2)).toBe(2);
  });

  it('FIX-0015-AC-002: con 4 páginas el indicador coincide en las 4 transiciones', () => {
    const total = 4;
    expect(getPageFromScrollTop(0, total)).toBe(1);
    expect(getPageFromScrollTop(PAGE_SLOT_HEIGHT * 1, total)).toBe(2);
    expect(getPageFromScrollTop(PAGE_SLOT_HEIGHT * 2, total)).toBe(3);
    expect(getPageFromScrollTop(PAGE_SLOT_HEIGHT * 3, total)).toBe(4);
    expect(getPageFromScrollTop(PAGE_SLOT_HEIGHT * 10, total)).toBe(4);
  });

  it('FIX-0015: una sola hoja siempre reporta página 1 y los valores negativos no rompen', () => {
    expect(getPageFromScrollTop(0, 1)).toBe(1);
    expect(getPageFromScrollTop(5000, 1)).toBe(1);
    expect(getPageFromScrollTop(-100, 3)).toBe(1);
  });

  it('FIX-0015-AC-003: App y TagSheet consumen el módulo compartido (sin literales divergentes)', () => {
    const root = (() => {
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
    })();

    const app = readFileSync(join(root, 'App.tsx'), 'utf-8');
    const sheet = readFileSync(join(root, 'components', 'TagSheet.tsx'), 'utf-8');

    expect(app).toContain("from './utils/pageGeometry'");
    expect(app).toContain('getPageFromScrollTop');
    expect(app).not.toMatch(/297\s*\*|PAGE_SLOT_HEIGHT\s*=/);

    expect(sheet).toContain("from '../utils/pageGeometry'");
    expect(sheet).toContain('SHEET_HEIGHT_MM');
    expect(sheet).not.toMatch(/height:\s*'282mm'/);
    expect(sheet).not.toMatch(/width:\s*'210mm'/);
  });
});
