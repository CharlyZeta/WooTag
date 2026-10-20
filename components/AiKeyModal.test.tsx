/**
 * components/AiKeyModal.test.tsx — FIX-0018
 *
 * Cubre la configuración BYOK de Gemini desde el modal:
 * - AC-002: probar una clave válida habilita "Guardar clave" y al guardar persiste + notifica.
 * - AC-003: una clave inválida muestra el motivo y deja "Guardar clave" deshabilitado.
 * - AC-005: "Eliminar clave" borra localStorage y notifica.
 * - BR-004: el campo es type="password" y la UI nunca muestra la clave completa.
 * - BR-006: toda edición invalida la prueba anterior (hay que volver a probar para guardar).
 *
 * `utils/aiKeyStorage` se usa REAL contra el `localStorage` de jsdom (así se verifica
 * de verdad la persistencia) y `../services/geminiService` se mockea para no tocar el SDK.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AiKeyModal } from './AiKeyModal';
import { AI_KEY_STORAGE_KEY, maskAiKey } from '../utils/aiKeyStorage';

const { testGeminiApiKeyMock } = vi.hoisted(() => ({
  testGeminiApiKeyMock: vi.fn(),
}));

vi.mock('../services/geminiService', () => ({
  testGeminiApiKey: testGeminiApiKeyMock,
  optimizeDescription: vi.fn(),
}));

// ─── Fixtures y helpers ───────────────────────────────────────────────────────

const VALID_KEY = 'AIzaSyD-valid-key-1234567890-7f3c';
const INVALID_KEY_MESSAGE = 'La API key de Gemini no es válida o no tiene permisos para este modelo.';

function renderModal() {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onKeyChanged: vi.fn(),
  };
  const utils = render(<AiKeyModal {...props} />);
  return { ...utils, props };
}

const keyInput = () => {
  const input = document.querySelector('input[type="password"]');
  if (!input) throw new Error('No se renderizó el campo type="password"');
  return input as HTMLInputElement;
};

const saveButton = () => screen.getByRole('button', { name: 'Guardar clave' }) as HTMLButtonElement;
const testButton = () => screen.getByRole('button', { name: /Probar API Key/i }) as HTMLButtonElement;

// Node 26 define un global experimental `localStorage` que devuelve `undefined` y
// deja inaccesible el de jsdom. Para ejercitar la utilidad REAL `utils/aiKeyStorage`
// (sin mockearla) se expone el Storage real de jsdom (misma API Web Storage,
// respaldado por sessionStorage) en `window.localStorage`.
const installLocalStorage = () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => window.sessionStorage,
  });
};

beforeEach(() => {
  installLocalStorage();
  window.localStorage.clear();
  testGeminiApiKeyMock.mockReset();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

// ─── AC-002 ───────────────────────────────────────────────────────────────────

describe('AiKeyModal — probar y guardar la clave (FIX-0018 AC-002)', () => {
  it('FIX-0018-AC-002: una prueba exitosa muestra el éxito, habilita "Guardar clave" y al guardar persiste la clave y notifica', async () => {
    testGeminiApiKeyMock.mockResolvedValueOnce({ ok: true });
    const { props } = renderModal();

    // Antes de probar no se puede guardar (BR-006).
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(keyInput(), { target: { value: VALID_KEY } });
    fireEvent.click(testButton());

    // El éxito de la prueba se hace visible al usuario.
    await waitFor(() => {
      expect(screen.getByText(/La clave funciona/i)).toBeTruthy();
    });
    expect(testGeminiApiKeyMock).toHaveBeenCalledTimes(1);
    expect(testGeminiApiKeyMock).toHaveBeenCalledWith(VALID_KEY);
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());

    expect(window.localStorage.getItem(AI_KEY_STORAGE_KEY)).toBe(VALID_KEY);
    expect(props.onKeyChanged).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

// ─── AC-003 ───────────────────────────────────────────────────────────────────

describe('AiKeyModal — clave inválida (FIX-0018 AC-003)', () => {
  it('FIX-0018-AC-003: una prueba fallida muestra el motivo, mantiene "Guardar clave" deshabilitado y no persiste nada', async () => {
    testGeminiApiKeyMock.mockResolvedValueOnce({ ok: false, error: INVALID_KEY_MESSAGE });
    const { props } = renderModal();

    fireEvent.change(keyInput(), { target: { value: 'AIza-clave-invalida' } });
    fireEvent.click(testButton());

    await waitFor(() => {
      expect(screen.getByText(INVALID_KEY_MESSAGE)).toBeTruthy();
    });

    expect(screen.queryByText(/La clave funciona/i)).toBeNull();
    expect(saveButton().disabled).toBe(true);

    // Un click sobre el botón deshabilitado no debe guardar nada.
    fireEvent.click(saveButton());
    expect(window.localStorage.getItem(AI_KEY_STORAGE_KEY)).toBeNull();
    expect(props.onKeyChanged).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

// ─── AC-005 ───────────────────────────────────────────────────────────────────

describe('AiKeyModal — eliminar la clave guardada (FIX-0018 AC-005)', () => {
  it('FIX-0018-AC-005: con una clave guardada muestra el indicio enmascarado y "Eliminar clave" la borra de localStorage', async () => {
    window.localStorage.setItem(AI_KEY_STORAGE_KEY, VALID_KEY);
    const { props } = renderModal();

    // Indicio enmascarado visible, nunca la clave completa.
    const hint = screen.getByText(maskAiKey(VALID_KEY));
    expect(hint.textContent).toBe('AIza…7f3c');

    const deleteButton = screen.getByRole('button', { name: /Eliminar clave/i });
    expect(deleteButton).toBeTruthy();

    fireEvent.click(deleteButton);

    expect(window.localStorage.getItem(AI_KEY_STORAGE_KEY)).toBeNull();
    expect(props.onKeyChanged).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();

    // La UI vuelve al estado "sin clave".
    await waitFor(() => {
      expect(screen.queryByText(maskAiKey(VALID_KEY))).toBeNull();
    });
    expect(screen.getByText(/Todavía no configuraste una clave/i)).toBeTruthy();
  });
});

// ─── BR-004 ──────────────────────────────────────────────────────────────────

describe('AiKeyModal — la clave nunca se muestra completa (FIX-0018 BR-004)', () => {
  it('FIX-0018-BR-004: el campo es type="password" y el indicio enmascarado no contiene la clave completa', () => {
    window.localStorage.setItem(AI_KEY_STORAGE_KEY, VALID_KEY);
    renderModal();

    const input = keyInput();
    expect(input.type).toBe('password');

    const masked = maskAiKey(VALID_KEY);
    const hint = screen.getByText(masked);
    const hintText = hint.textContent ?? '';

    expect(hintText).toBe(masked);
    expect(hintText).not.toBe(VALID_KEY);
    expect(hintText.includes(VALID_KEY)).toBe(false);
    expect((document.body.textContent ?? '')).not.toContain(VALID_KEY);
  });
});

// ─── BR-006 ──────────────────────────────────────────────────────────────────

describe('AiKeyModal — sólo se guarda una clave probada en esta sesión (FIX-0018 BR-006)', () => {
  it('FIX-0018-BR-006: editar la clave después de una prueba exitosa vuelve a deshabilitar "Guardar clave" (hay que re-probar)', async () => {
    testGeminiApiKeyMock.mockResolvedValueOnce({ ok: true });
    renderModal();

    fireEvent.change(keyInput(), { target: { value: VALID_KEY } });
    fireEvent.click(testButton());

    await waitFor(() => {
      expect(saveButton().disabled).toBe(false);
    });

    // Cualquier edición invalida la prueba anterior.
    fireEvent.change(keyInput(), { target: { value: `${VALID_KEY}-editada` } });

    await waitFor(() => {
      expect(saveButton().disabled).toBe(true);
    });
    expect(screen.queryByText(/La clave funciona/i)).toBeNull();

    // No se re-probó automáticamente: una única llamada al servicio.
    expect(testGeminiApiKeyMock).toHaveBeenCalledTimes(1);

    // Y tampoco se guarda nada con una clave sin probar.
    fireEvent.click(saveButton());
    expect(window.localStorage.getItem(AI_KEY_STORAGE_KEY)).toBeNull();
  });
});
