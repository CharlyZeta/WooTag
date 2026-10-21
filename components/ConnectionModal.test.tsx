/**
 * components/ConnectionModal.test.tsx — FIX-0016 (AC-005)
 *
 * Verifica que el modal de conexión muestre TAL CUAL el mensaje único de
 * autenticación cuando `validateConnection` rechaza con 401/403: el componente
 * no reinterpreta ni reemplaza `err.message` (BR-005 / AC-005).
 *
 * Estrategia: render real del componente con `../services/wooService` mockeado
 * (se conserva la constante real `WOO_AUTH_ERROR_MESSAGE` vía `importOriginal`,
 * para que la aserción sea contra el texto exportado y no contra una copia).
 *
 * Ruta cubierta: la del formulario (sin tiendas guardadas → view 'form'),
 * completar los campos requeridos y enviar.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectionModal } from './ConnectionModal';
import { WOO_AUTH_ERROR_MESSAGE } from '../services/wooService';
import type { WooConfig, WooSite } from '../types';

const { validateConnectionMock } = vi.hoisted(() => ({
  validateConnectionMock: vi.fn(),
}));

// Se mockea sólo `validateConnection`; la constante del mensaje sigue siendo la
// real del servicio (así AC-005 se valida contra el texto exportado único).
vi.mock('../services/wooService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/wooService')>();
  return {
    ...actual,
    validateConnection: validateConnectionMock,
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Renderiza el modal abierto, sin tiendas guardadas (cae en el formulario). */
function renderModal(wooSites: WooSite[] = []) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onConnect: vi.fn(),
    wooSites,
    activeSiteId: null as string | null,
    onSelectSite: vi.fn(),
    onDeleteSite: vi.fn(),
  };

  const utils = render(<ConnectionModal {...props} />);
  return { ...utils, props };
}

/** Completa los tres campos requeridos del formulario y lo envía. */
async function fillAndSubmit() {
  fireEvent.change(await screen.findByPlaceholderText('https://mitienda.com'), {
    target: { value: 'https://mitienda.com' },
  });
  fireEvent.change(screen.getByPlaceholderText('ck_xxxxxxxx...'), {
    target: { value: 'ck_test123' },
  });
  fireEvent.change(screen.getByPlaceholderText('cs_xxxxxxxx...'), {
    target: { value: 'cs_test456' },
  });

  // El submit handler es async: se envuelve en `act` para que las actualizaciones
  // de estado (loading → error) se apliquen dentro de act, sin warnings.
  const submitButton = screen.getByRole('button', { name: /CONECTAR TIENDA/i });
  await act(async () => {
    fireEvent.click(submitButton);
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConnectionModal — mensaje de autenticación (FIX-0016 AC-005)', () => {
  beforeEach(() => {
    validateConnectionMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('FIX-0016-AC-005: cuando validateConnection rechaza por 401/403 el modal muestra literalmente WOO_AUTH_ERROR_MESSAGE', async () => {
    validateConnectionMock.mockRejectedValueOnce(new Error(WOO_AUTH_ERROR_MESSAGE));

    const { props } = renderModal();
    await fillAndSubmit();

    await waitFor(() => {
      expect(validateConnectionMock).toHaveBeenCalledTimes(1);
    });

    // El texto renderizado es exactamente el mensaje único exportado.
    const errorNode = await screen.findByText(WOO_AUTH_ERROR_MESSAGE);
    expect(errorNode.textContent).toBe(WOO_AUTH_ERROR_MESSAGE);

    // No se muestra el mensaje genérico anterior ni una versión recortada.
    expect(screen.queryByText(/Credenciales inválidas o acceso denegado a Productos/i)).toBeNull();

    // El fallo no dispara la conexión ni cierra el modal.
    expect(props.onConnect).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('FIX-0016-AC-005: el modal entrega al servicio exactamente lo escrito (una única llamada) y no altera el mensaje recibido', async () => {
    validateConnectionMock.mockRejectedValueOnce(new Error(WOO_AUTH_ERROR_MESSAGE));

    const { props } = renderModal();
    await fillAndSubmit();

    await waitFor(() => {
      expect(validateConnectionMock).toHaveBeenCalledTimes(1);
    });

    const expectedConfig: WooConfig = {
      url: 'https://mitienda.com',
      consumerKey: 'ck_test123',
      consumerSecret: 'cs_test456',
    };
    expect(validateConnectionMock).toHaveBeenCalledWith(expectedConfig);
    expect(props.onConnect).not.toHaveBeenCalled();
  });
});
