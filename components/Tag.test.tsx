import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tag } from './Tag';
import { DEFAULT_CONFIG, type Product, type TagConfig } from '../types';

/**
 * FIX-0026: la etiqueta impresa es el entregable del producto y no tenía tests.
 * Se cubre el formateo de precios (es-AR), la oferta, el precio especial y el QR.
 */

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'p-1',
  sku: 'SKU-1',
  name: 'Producto de prueba',
  price: 1234,
  description: 'Descripción de prueba',
  ...overrides,
});

const config = (overrides: Partial<TagConfig> = {}): TagConfig => ({ ...DEFAULT_CONFIG, ...overrides });

describe('FIX-0026 — Tag: formateo de precios y campos', () => {
  it('FIX-0026-AC-002: formatea el precio en es-AR con símbolo, separador y decimales', () => {
    render(<Tag product={product({ price: 1234.56 })} config={config()} />);
    expect(screen.getByText('$1.234,56')).toBeDefined();
  });

  it('FIX-0026-AC-002: sin decimales redondea a entero', () => {
    render(<Tag product={product({ price: 1234 })} config={config({ showDecimals: false })} />);
    expect(screen.getByText('$1.234')).toBeDefined();
  });

  it('FIX-0026-AC-002: sin separador de miles usa coma decimal y sin puntos', () => {
    render(
      <Tag
        product={product({ price: 1234.5 })}
        config={config({ showThousandsSeparator: false, showCurrencySymbol: false })}
      />
    );
    expect(screen.getByText('1234,50')).toBeDefined();
  });

  it('FIX-0026-AC-002: puede ocultar el símbolo de moneda', () => {
    render(<Tag product={product({ price: 99 })} config={config({ showCurrencySymbol: false })} />);
    expect(screen.getByText('99,00')).toBeDefined();
  });

  it('FIX-0026-AC-002: con oferta muestra el precio regular tachado y el de oferta', () => {
    render(<Tag product={product({ price: 1000, salePrice: 800 })} config={config()} />);
    const regular = screen.getByText('$1.000,00');
    const sale = screen.getByText('$800,00');
    expect(regular.className).toContain('line-through');
    expect(sale).toBeDefined();
  });

  it('FIX-0026-AC-002: el precio especial aplica el porcentaje sobre el precio regular', () => {
    render(
      <Tag
        product={product({ price: 1000 })}
        config={config({ showCustomPrice: true, customPricePercent: 10, customPriceLabel: 'Precio Especial' })}
      />
    );
    expect(screen.getByText('Precio Especial')).toBeDefined();
    expect(screen.getByText('$1.100,00')).toBeDefined();
  });

  it('FIX-0026-AC-002: el QR se renderiza con el SKU y respeta showQRCode', () => {
    const { container, rerender } = render(<Tag product={product()} config={config({ showQRCode: true })} />);
    expect(container.querySelector('svg')).not.toBeNull();

    rerender(<Tag product={product()} config={config({ showQRCode: false })} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('FIX-0026-AC-002: los campos ocultos no se renderizan', () => {
    render(
      <Tag
        product={product({ sku: 'SKU-OCULTO', description: 'DESCRIPCION-OCULTA' })}
        config={config({ showSku: false, showDescription: false, showTitle: false })}
      />
    );
    expect(screen.queryByText(/SKU-OCULTO/)).toBeNull();
    expect(screen.queryByText(/DESCRIPCION-OCULTA/)).toBeNull();
    expect(screen.queryByText('Producto de prueba')).toBeNull();
  });
});
