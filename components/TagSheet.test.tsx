import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { TagSheet } from './TagSheet';
import { DEFAULT_CONFIG, Product } from '../types';

describe('TagSheet Component (FIX-0010: Print safety & page breaks)', () => {
  const dummyConfig = {
    ...DEFAULT_CONFIG,
    layoutCols: 2,
    layoutRows: 2, // 4 items por hoja
    gap: 2,
  };

  const createProducts = (count: number): Product[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `p-${i + 1}`,
      name: `Producto ${i + 1}`,
      price: 100 * (i + 1),
      sku: `SKU-${i + 1}`,
      description: `Desc ${i + 1}`,
    }));
  };

  it('renders safe page height <= 296mm to prevent subpixel overflow (AC-001)', () => {
    const products = createProducts(4);
    const { container } = render(<TagSheet products={products} config={dummyConfig} />);

    const sheetDivs = container.querySelectorAll('.sheet-page');
    expect(sheetDivs.length).toBe(1);

    const firstSheet = sheetDivs[0] as HTMLElement;
    expect(firstSheet.style.width).toBe('210mm');
    // La altura segura no debe superar los 296mm para absorber márgenes de impresora
    const heightNum = parseFloat(firstSheet.style.height);
    expect(heightNum).toBeLessThanOrEqual(296);
    expect(firstSheet.style.boxSizing).toBe('border-box');
    expect(firstSheet.style.overflow).toBe('hidden');
  });

  it('applies break-after only to intermediate pages, not the last page (AC-002)', () => {
    // 7 productos con 4 por página = 2 hojas (hoja 1 completa, hoja 2 con 3 productos)
    const products = createProducts(7);
    const { container } = render(<TagSheet products={products} config={dummyConfig} />);

    const sheetDivs = container.querySelectorAll('.sheet-page');
    expect(sheetDivs.length).toBe(2);

    const firstSheet = sheetDivs[0] as HTMLElement;
    const lastSheet = sheetDivs[1] as HTMLElement;

    // Hoja 1 (intermedia): debe forzar salto de página
    expect(firstSheet.style.pageBreakAfter).toBe('always');
    expect(firstSheet.className).toContain('print:break-after-page');

    // Hoja 2 (última): NO debe forzar salto de página para no crear una hoja en blanco al final
    expect(lastSheet.style.pageBreakAfter).toBe('avoid');
    expect(lastSheet.className).not.toContain('print:break-after-page');
  });

  it('applies break-inside avoid on all sheets to prevent page splitting', () => {
    const products = createProducts(5);
    const { container } = render(<TagSheet products={products} config={dummyConfig} />);

    const sheetDivs = container.querySelectorAll('.sheet-page');
    sheetDivs.forEach((sheet) => {
      const el = sheet as HTMLElement;
      expect(el.style.pageBreakInside).toBe('avoid');
      expect(el.style.breakInside).toBe('avoid');
    });
  });
});
