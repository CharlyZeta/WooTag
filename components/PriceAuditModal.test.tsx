/**
 * components/PriceAuditModal.test.tsx — FIX-0014 (AC-005)
 *
 * Verifica la fila de frescura de la auditoría en el modal y el control que
 * fuerza la descarga completa:
 * - "Auditoría al día · hace X min" cuando hay `lastAuditAt` válido.
 * - "Auditoría pendiente" cuando no lo hay.
 * - El botón de refresco forzado existe y llama a `onRefreshAudit`.
 *
 * Mocks mínimos: el componente es presentacional, pero importa `formatAuditAge`
 * de `services/priceSnapshotService`, que a su vez importa `services/firebase`
 * (ese módulo sí ejecuta `initializeApp`/`getAuth`/`getFirestore` al cargarse).
 * Se mockea **sólo** `services/firebase`; `formatAuditAge` se ejercita real.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PriceAuditModal } from './PriceAuditModal';

// `services/firebase` inicializa la app de Firebase en el import; el modal no lo
// necesita para formatear la antigüedad.
vi.mock('../services/firebase', () => ({
  db: { name: 'mock-db' },
  auth: { name: 'mock-auth' },
  default: { name: 'mock-app' }
}));

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Props base del modal: sin pendientes, sin carga, callbacks espiados. */
function renderModal(overrides: Partial<React.ComponentProps<typeof PriceAuditModal>> = {}) {
  const props: React.ComponentProps<typeof PriceAuditModal> = {
    isOpen: true,
    onClose: vi.fn(),
    pendingItems: [],
    isLoading: false,
    onRefreshAudit: vi.fn(),
    onAddProductToSheet: vi.fn(),
    onAddAllToSheet: vi.fn(),
    onDismissItem: vi.fn(),
    onDismissAll: vi.fn(),
    ...overrides
  };

  return { ...render(<PriceAuditModal {...props} />), props };
}

describe('PriceAuditModal — frescura de la auditoría (FIX-0014 AC-005)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('FIX-0014-AC-005: con lastAuditAt de hace 5 min muestra "Auditoría al día" y "hace 5 min"', () => {
    renderModal({ lastAuditAt: Date.now() - FIVE_MINUTES_MS });

    expect(screen.getByText(/Auditoría al día/)).toBeTruthy();
    expect(screen.getByText(/hace 5 min/)).toBeTruthy();

    // La frescura se muestra en lugar de una lista vacía silenciosa (BR-005):
    // el estado vacío de pendientes sigue visible junto a la marca.
    expect(screen.getByText(/¡Precios 100% al día!/)).toBeTruthy();
  });

  it('FIX-0014-AC-005: sin lastAuditAt muestra "Auditoría pendiente"', () => {
    const { rerender, props } = renderModal();

    expect(screen.getByText(/Auditoría pendiente/)).toBeTruthy();
    expect(screen.queryByText(/Auditoría al día/)).toBeNull();

    // `undefined` y `null` son equivalentes para el componente.
    rerender(<PriceAuditModal {...props} lastAuditAt={null} />);
    expect(screen.getByText(/Auditoría pendiente/)).toBeTruthy();
  });

  it('FIX-0014-AC-005: el control de refresco forzado está presente y llama a onRefreshAudit al hacer click', () => {
    const { props } = renderModal({ lastAuditAt: Date.now() - FIVE_MINUTES_MS });

    // Hallazgo: el botón de refresco NO tiene `aria-label` ni texto (sólo el
    // ícono `RefreshCw`); su único identificador estable es el atributo
    // `title="Volver a escanear catálogo"`. Por eso se consulta por título y no
    // por nombre accesible.
    const refresh = screen.getByTitle('Volver a escanear catálogo');

    expect(refresh.tagName).toBe('BUTTON');
    expect(refresh.hasAttribute('aria-label')).toBe(false);
    expect(refresh.textContent?.trim()).toBe('');
    expect(screen.getAllByTitle('Volver a escanear catálogo')).toHaveLength(1);

    fireEvent.click(refresh);

    expect(props.onRefreshAudit).toHaveBeenCalledTimes(1);
    // El refresco forzado no cierra el modal ni toca otros callbacks.
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
