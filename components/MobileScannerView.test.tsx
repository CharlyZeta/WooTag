import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileScannerView } from './MobileScannerView';
import { DEFAULT_CONFIG, Product, WooConfig } from '../types';

vi.mock('html5-qrcode', () => {
  return {
    Html5Qrcode: vi.fn().mockImplementation(() => ({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
      getState: vi.fn().mockReturnValue(1),
    }))
  };
});

vi.mock('../services/soundHapticService', () => ({
  playScanSuccessFeedback: vi.fn(),
  triggerHaptic: vi.fn(),
}));

describe('MobileScannerView Component', () => {
  const dummyConfig = {
    ...DEFAULT_CONFIG,
    layoutCols: 3,
    layoutRows: 8,
  };

  const dummyProducts: Product[] = [
    {
      id: '1',
      name: 'Café Espresso',
      price: 1500,
      description: 'Café en grano',
      sku: 'CAFE-001',
    },
    {
      id: '2',
      name: 'Té Verde',
      price: 1200,
      description: 'Té verde orgánico',
      sku: 'TE-002',
    }
  ];

  const dummyWooConfig: WooConfig = {
    url: 'https://ejemplo.com',
    consumerKey: 'ck_123',
    consumerSecret: 'cs_123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with sheet optimizer stats (AC-004)', () => {
    render(
      <MobileScannerView
        products={dummyProducts}
        config={dummyConfig}
        wooConfig={dummyWooConfig}
        siteName="Tienda Central"
        isCloudConnected={true}
        onAddProduct={vi.fn()}
        onRemoveProduct={vi.fn()}
        onClearProducts={vi.fn()}
        onSwitchToDesktopView={vi.fn()}
      />
    );

    expect(screen.getByText('Tienda Central')).toBeDefined();
    expect(screen.getByText('Modo Góndola / Operador')).toBeDefined();
    expect(screen.getByText('Aprovechamiento Hoja A4')).toBeDefined();
    expect(screen.getByText('24 etiquetas/hoja')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined(); // 2 cargadas
    expect(screen.getByText('22')).toBeDefined(); // Faltan 22 para completar la hoja
  });

  it('calls onSwitchToDesktopView when clicking the switch button (AC-002)', () => {
    const handleSwitch = vi.fn();
    render(
      <MobileScannerView
        products={dummyProducts}
        config={dummyConfig}
        wooConfig={dummyWooConfig}
        siteName="Tienda Central"
        onAddProduct={vi.fn()}
        onRemoveProduct={vi.fn()}
        onClearProducts={vi.fn()}
        onSwitchToDesktopView={handleSwitch}
      />
    );

    const switchBtn = screen.getByText('Vista PC');
    fireEvent.click(switchBtn);
    expect(handleSwitch).toHaveBeenCalledTimes(1);
  });

  it('calls onRemoveProduct when clicking remove button on an item', () => {
    const handleRemove = vi.fn();
    render(
      <MobileScannerView
        products={dummyProducts}
        config={dummyConfig}
        wooConfig={dummyWooConfig}
        onAddProduct={vi.fn()}
        onRemoveProduct={handleRemove}
        onClearProducts={vi.fn()}
        onSwitchToDesktopView={vi.fn()}
      />
    );

    const removeBtns = screen.getAllByTitle('Eliminar de la lista');
    fireEvent.click(removeBtns[0]);
    expect(handleRemove).toHaveBeenCalledWith('1');
  });

  it('calls onAddProduct when duplicating an existing item', () => {
    const handleAdd = vi.fn();
    render(
      <MobileScannerView
        products={dummyProducts}
        config={dummyConfig}
        wooConfig={dummyWooConfig}
        onAddProduct={handleAdd}
        onRemoveProduct={vi.fn()}
        onClearProducts={vi.fn()}
        onSwitchToDesktopView={vi.fn()}
      />
    );

    const dupBtns = screen.getAllByTitle('Duplicar etiqueta');
    fireEvent.click(dupBtns[0]);
    expect(handleAdd).toHaveBeenCalledWith(dummyProducts[0]);
  });
});
