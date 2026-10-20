/**
 * components/ImportTab.noCompanion.test.tsx — Guarda de UI de FIX-0012 (AC-002)
 *
 * Verifica que en **Importar → Escáner & Móvil** no quede ningún botón de
 * emparejamiento por QR entre dispositivos ni texto que lo ofrezca, con la
 * tienda desconectada y conectada.
 *
 * El header (Controls.tsx) no se renderiza aquí: monta `useAuth` (Firebase) y
 * `CloudLoginModal`, que exigen mocks de `firebase/auth` + `services/firebase`
 * ajenos al alcance de este contrato. Su parte de AC-002 se cubre con una
 * aserción a nivel de fuente sobre `components/Controls.tsx`.
 *
 * Justificación del mock de `wooService`: ImportTab sólo llama a
 * `fetchCategories` cuando `wooConfig?.url` es truthy; se mockea el servicio
 * completo para poder renderizar también el estado "tienda conectada" (el del
 * flujo de reproducción del bug) sin tocar la red.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ImportTab } from './controls/ImportTab';
import { Product, WooConfig } from '../types';

// ─── Mocks (sin red) ─────────────────────────────────────────────────────────

vi.mock('../services/wooService', () => ({
  fetchCategories: vi.fn().mockResolvedValue([]),
  fetchProductBySku: vi.fn().mockResolvedValue(null),
  fetchProductsByCategory: vi.fn().mockResolvedValue([]),
  fetchProductsByName: vi.fn().mockResolvedValue([]),
  fetchAllCatalogProducts: vi.fn().mockResolvedValue([]),
}));

// ─── Fixtures ───────────────────────────────────────────────────────────────

/** Textos que ofrecían emparejamiento por QR entre dispositivos (AC-002). */
const FORBIDDEN_UI_TEXT =
  /Generar QR de PC|Escanear QR de PC|Vincular celular|Emparejar/i;

/** Raíz del repo: `import.meta.url` no es fiable bajo el transform de Vite. */
function findRepoRoot(start: string): string {
  let current = resolve(start);
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(current, 'package.json')) && existsSync(join(current, 'App.tsx'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`No se pudo localizar la raíz del repositorio desde ${start}`);
}

const ROOT = findRepoRoot(process.cwd());

const CONNECTED_CONFIG: WooConfig = {
  url: 'https://tienda-ejemplo.com',
  consumerKey: 'ck_test',
  consumerSecret: 'cs_test',
};

const baseProps = {
  currentUser: null,
  products: [] as Product[],
  setProducts: vi.fn() as unknown as React.Dispatch<React.SetStateAction<Product[]>>,
  onAddUniqueProduct: vi.fn(),
  onOpenConnection: vi.fn(),
  onOpenQrScanner: vi.fn(),
  deviceId: 'test-device',
};

/** Recolecta el texto visible + las etiquetas accesibles de los controles. */
function collectUiText(container: HTMLElement): string {
  const controls = Array.from(
    container.querySelectorAll('button, [role="button"], a, input')
  ).map((el) =>
    [
      el.getAttribute('title') ?? '',
      el.getAttribute('aria-label') ?? '',
      el.getAttribute('placeholder') ?? '',
      el.textContent ?? '',
    ].join(' ')
  );
  return `${container.textContent ?? ''}\n${controls.join('\n')}`;
}

/** Click en una sub-pestaña de ImportTab por su etiqueta exacta. */
function clickSubTab(label: string): void {
  const matches = screen
    .queryAllByText(label)
    .filter((el) => el.tagName === 'BUTTON');
  expect(matches.length).toBeGreaterThan(0);
  fireEvent.click(matches[0]);
}

// ─── AC-002 (render) ────────────────────────────────────────────────────────

describe('FIX-0012 AC-002 — Importar → Escáner & Móvil no ofrece emparejamiento', () => {
  it('FIX-0012-AC-002: sin tienda conectada, ninguna sub-pestaña muestra botón ni texto de emparejamiento por QR', () => {
    const { container } = render(<ImportTab {...baseProps} wooConfig={null} />);

    // Anti-vacuidad: el panel efectivamente se renderizó con sus 3 sub-pestañas.
    const initialText = container.textContent ?? '';
    expect(initialText).toContain('WooCommerce');
    expect(initialText).toContain('Planilla Excel');
    expect(initialText).toContain('Escáner & Móvil');
    expect(initialText).not.toMatch(FORBIDDEN_UI_TEXT);

    // Recorrido completo: Importar → Escáner & Móvil (y vuelta a las otras).
    for (const subTab of ['Planilla Excel', 'Escáner & Móvil', 'WooCommerce']) {
      clickSubTab(subTab);
      expect(collectUiText(container)).not.toMatch(FORBIDDEN_UI_TEXT);
    }
  });

  it('FIX-0012-AC-002: con tienda conectada, el escáner de productos sigue y no aparece emparejamiento por QR', async () => {
    const { container } = render(
      <ImportTab {...baseProps} wooConfig={CONNECTED_CONFIG} />
    );

    // Dejar que se resuelva el fetch de categorías mockeado antes de aseverar.
    await waitFor(() => expect(screen.queryByText(/Cargando catálogo/i)).toBeNull());

    clickSubTab('Escáner & Móvil');
    const text = collectUiText(container);

    // El escáner de productos (QrScannerModal) se conserva y sigue accesible.
    expect(text).toMatch(/ESCANEAR QR CON C[ÁA]MARA/i);
    expect(text).toMatch(/Abrir C[áa]mara y Escanear/i);

    // Pero no hay botón/modal de emparejamiento entre dispositivos.
    expect(text).not.toMatch(FORBIDDEN_UI_TEXT);
  });
});

// ─── AC-002 (fuente: header en Controls.tsx) ────────────────────────────────

describe('FIX-0012 AC-002 — el header de Controls.tsx tampoco ofrece emparejamiento', () => {
  it('FIX-0012-AC-002: components/Controls.tsx no contiene el botón de emparejamiento ni sus textos', () => {
    const controlsSource = readFileSync(join(ROOT, 'components', 'Controls.tsx'), 'utf-8');

    // Anti-vacuidad: es el archivo correcto y contiene el header/tabs reales.
    expect(controlsSource).toContain('IMPRIMIR ETIQUETAS');
    expect(controlsSource).toContain('Modo Operador Móvil');

    expect(controlsSource).not.toMatch(FORBIDDEN_UI_TEXT);
    expect(controlsSource).not.toMatch(/HostRoomModal|MobileJoinScanner|realtimeSession|activeRoomId|roomRole/);
  });
});
