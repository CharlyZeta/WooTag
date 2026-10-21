import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { buildDuplicateNotice, countDuplicates, findDuplicateSkus } from './productDuplicates';
import type { Product } from '../types';

/**
 * FIX-0020: misma política de duplicados para todos los métodos de importación.
 * El árbol de categorías y el XLS escribían directo en la lista sin avisar.
 */

const product = (sku: string, name = `Producto ${sku}`): Product => ({
  id: `${sku}-instancia`,
  sku,
  name,
  price: 100,
  description: '',
});

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

describe('utils/productDuplicates (FIX-0020)', () => {
  it('FIX-0020-AC-001: detecta los SKU que ya están en la lista', () => {
    const existing = [product('A'), product('B')];
    const incoming = [product('A'), product('C'), product('B')];
    expect(countDuplicates(incoming, existing)).toBe(2);
    expect(findDuplicateSkus(incoming, existing)).toEqual(['A', 'B']);
  });

  it('FIX-0020-AC-001: sin coincidencias no hay duplicados ni aviso', () => {
    const existing = [product('A')];
    const incoming = [product('B'), product('C')];
    expect(countDuplicates(incoming, existing)).toBe(0);
    expect(buildDuplicateNotice(incoming, existing)).toBeNull();
  });

  it('FIX-0020-AC-002: el aviso es único por lote e informa cuántos de cuántos', () => {
    const existing = [product('A'), product('B')];
    const incoming = [product('A'), product('B'), product('C')];
    expect(buildDuplicateNotice(incoming, existing)).toBe(
      '2 de 3 producto(s) ya están en la lista. ¿Agregar igual?'
    );
  });

  it('FIX-0020: no repite el mismo SKU duplicado dentro del lote', () => {
    const existing = [product('A')];
    const incoming = [product('A'), product('A')];
    // Ambos entrantes coinciden con lo existente: 2 duplicados, 1 SKU distinto.
    expect(countDuplicates(incoming, existing)).toBe(2);
    expect(findDuplicateSkus(incoming, existing)).toEqual(['A']);
  });

  it('FIX-0020-AC-003: árbol y XLS pasan por el punto único de alta (Controls)', () => {
    const root = repoRoot();
    const importTab = readFileSync(join(root, 'components', 'controls', 'ImportTab.tsx'), 'utf-8');
    const controls = readFileSync(join(root, 'components', 'Controls.tsx'), 'utf-8');

    // ImportTab ya no escribe directo en la lista para el lote: delega en el callback.
    expect(importTab).toContain('onAddUniqueProducts');
    expect(importTab).toMatch(/onAddUniqueProducts\(withUniqueIds\)/);
    expect(importTab).toMatch(/onAddUniqueProducts\(withIds\)/);

    // Controls tiene el punto único con confirmación por lote.
    expect(controls).toContain('buildDuplicateNotice');
    expect(controls).toMatch(/const addUniqueProducts = \(list: Product\[\]\)/);
    expect(controls).toContain('onAddUniqueProducts={addUniqueProducts}');
  });
});
