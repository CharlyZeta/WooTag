import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_KEY_STORAGE_KEY, clearAiKey, getAiKey, hasAiKey, maskAiKey, setAiKey } from './aiKeyStorage';

/**
 * FIX-0026: el almacenamiento de la API key de Gemini (FIX-0018) tenía 77% de
 * cobertura y es la pieza que decide si la IA funciona.
 *
 * En Node 26 el `localStorage` global experimental tapa el de jsdom y resuelve
 * `undefined`, así que se instala un Storage real (Map) en `window` por test.
 */

const installStorage = (impl?: Partial<Storage>): void => {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    ...impl,
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
};

describe('FIX-0026 — utils/aiKeyStorage', () => {
  beforeEach(() => installStorage());
  afterEach(() => vi.restoreAllMocks());

  it('FIX-0026-AC-001: guarda y lee la clave recortando espacios', () => {
    setAiKey('  AIzaSyTEST  ');
    expect(getAiKey()).toBe('AIzaSyTEST');
    expect(hasAiKey()).toBe(true);
  });

  it('FIX-0026-AC-001: ignora claves vacías y reporta que no hay ninguna', () => {
    setAiKey('   ');
    expect(getAiKey()).toBe('');
    expect(hasAiKey()).toBe(false);
  });

  it('FIX-0026-AC-001: clearAiKey borra la clave del almacenamiento', () => {
    setAiKey('AIzaSyTEST');
    clearAiKey();
    expect(getAiKey()).toBe('');
    expect(window.localStorage.getItem(AI_KEY_STORAGE_KEY)).toBeNull();
  });

  it('FIX-0026-AC-001: maskAiKey nunca devuelve la clave completa', () => {
    const key = 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
    const masked = maskAiKey(key);
    expect(masked).not.toBe(key);
    expect(masked).not.toContain('ABCDEFGHIJ');
    expect(masked.startsWith('AIza')).toBe(true);
    expect(masked.endsWith('3456')).toBe(true);
  });

  it('FIX-0026-AC-001: si localStorage falla, no lanza y devuelve vacío', () => {
    installStorage({
      getItem: () => {
        throw new Error('storage bloqueado');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => setAiKey('AIza')).not.toThrow();
    expect(getAiKey()).toBe('');
    expect(hasAiKey()).toBe(false);
  });
});
