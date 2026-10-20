/**
 * components/controls/LayoutTab.test.tsx — FIX-0018
 *
 * Cubre la sección de Ajustes que hace configurable la IA (BYOK):
 * - AC-001: sin clave se ve "Optimización con IA" + "IA deshabilitada" y "Configurar IA"
 *           abre un modal con un campo type="password".
 * - AC-001: con clave guardada el estado es "IA habilitada" y se muestra el indicio enmascarado.
 * - AC-005: "Eliminar clave" devuelve el estado a "IA deshabilitada" (el modal lo propaga).
 *
 * `../../services/geminiService` se mockea para que el modal no cargue el SDK de Gemini.
 * `utils/aiKeyStorage` es el real y trabaja contra el `localStorage` de jsdom.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LayoutTab } from './LayoutTab';
import { DEFAULT_CONFIG } from '../../types';
import { AI_KEY_STORAGE_KEY, maskAiKey } from '../../utils/aiKeyStorage';

const { testGeminiApiKeyMock } = vi.hoisted(() => ({
  testGeminiApiKeyMock: vi.fn(),
}));

vi.mock('../../services/geminiService', () => ({
  optimizeDescription: vi.fn(),
  testGeminiApiKey: testGeminiApiKeyMock,
}));

// ─── Fixtures y helpers ───────────────────────────────────────────────────────

const STORED_KEY = 'AIzaSyD-stored-key-0987654321-abcd';

const renderLayoutTab = () =>
  render(<LayoutTab config={DEFAULT_CONFIG} setConfig={() => {}} />);

const passwordField = () => document.querySelector('input[type="password"]');

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

// ─── AC-001 ──────────────────────────────────────────────────────────────────

describe('LayoutTab — sección "Optimización con IA" (FIX-0018 AC-001)', () => {
  it('FIX-0018-AC-001: sin clave muestra "Optimización con IA", "IA deshabilitada" y "Configurar IA" abre el modal con campo password', async () => {
    renderLayoutTab();

    // Sección visible en Ajustes.
    expect(screen.getByText(/Optimización con IA/i)).toBeTruthy();
    expect(screen.getByText('IA deshabilitada')).toBeTruthy();
    expect(screen.queryByText('IA habilitada')).toBeNull();

    // El modal no está abierto todavía.
    expect(passwordField()).toBeNull();

    const openButton = screen.getByRole('button', { name: /Configurar IA/i });
    fireEvent.click(openButton);

    // El modal se abre con un campo de tipo password (BR-004).
    await waitFor(() => {
      expect(passwordField()).toBeTruthy();
    });
    expect(screen.getByPlaceholderText('AIza…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar clave' })).toBeTruthy();
    expect(screen.getByText(/Todavía no configuraste una clave/i)).toBeTruthy();
  });

  it('FIX-0018-AC-001: con una clave en localStorage muestra "IA habilitada" y el indicio enmascarado (nunca la clave completa)', () => {
    window.localStorage.setItem(AI_KEY_STORAGE_KEY, STORED_KEY);

    renderLayoutTab();

    expect(screen.getByText('IA habilitada')).toBeTruthy();
    expect(screen.queryByText('IA deshabilitada')).toBeNull();

    const hint = screen.getByText(maskAiKey(STORED_KEY));
    // El icono delante del texto deja un espacio: se compara el texto normalizado.
    expect((hint.textContent ?? '').trim()).toBe('AIza…abcd');
    expect(hint.textContent).not.toContain(STORED_KEY);
    expect(document.body.textContent ?? '').not.toContain(STORED_KEY);
  });
});

// ─── AC-004 ──────────────────────────────────────────────────────────────────

describe('LayoutTab — guardar una clave probada habilita la IA (FIX-0018 AC-004)', () => {
  it('FIX-0018-AC-004: GIVEN una prueba exitosa WHEN guardo la clave THEN queda en localStorage y el estado pasa a "IA habilitada"', async () => {
    testGeminiApiKeyMock.mockResolvedValueOnce({ ok: true });

    renderLayoutTab();
    expect(screen.getByText('IA deshabilitada')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Configurar IA/i }));

    await waitFor(() => {
      expect(passwordField()).toBeTruthy();
    });

    fireEvent.change(passwordField() as HTMLInputElement, { target: { value: STORED_KEY } });
    fireEvent.click(screen.getByRole('button', { name: /Probar API Key/i }));

    await waitFor(() => {
      expect(screen.getByText(/La clave funciona/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar clave' }));

    // AC-004: la clave queda guardada en este navegador...
    expect(window.localStorage.getItem(AI_KEY_STORAGE_KEY)).toBe(STORED_KEY);
    // ...y la sección de Ajustes refleja el nuevo estado con el indicio enmascarado.
    await waitFor(() => {
      expect(screen.getByText('IA habilitada')).toBeTruthy();
    });
    expect(screen.queryByText('IA deshabilitada')).toBeNull();
    expect(screen.getByText(maskAiKey(STORED_KEY))).toBeTruthy();
    // El modal se cierra al guardar.
    expect(passwordField()).toBeNull();
  });
});

// ─── AC-005 ──────────────────────────────────────────────────────────────────

describe('LayoutTab — eliminar la clave vuelve a "IA deshabilitada" (FIX-0018 AC-005)', () => {
  it('FIX-0018-AC-005: GIVEN una clave guardada WHEN pulso "Eliminar clave" THEN localStorage queda vacío y el estado pasa a "IA deshabilitada"', async () => {
    window.localStorage.setItem(AI_KEY_STORAGE_KEY, STORED_KEY);
    renderLayoutTab();

    expect(screen.getByText('IA habilitada')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Configurar IA/i }));

    const deleteButton = await screen.findByRole('button', { name: /Eliminar clave/i });
    fireEvent.click(deleteButton);

    expect(window.localStorage.getItem(AI_KEY_STORAGE_KEY)).toBeNull();

    await waitFor(() => {
      expect(screen.getByText('IA deshabilitada')).toBeTruthy();
    });
    expect(screen.queryByText('IA habilitada')).toBeNull();
    expect(screen.queryByText(maskAiKey(STORED_KEY))).toBeNull();
  });
});
