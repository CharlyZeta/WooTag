/**
 * geminiService.test.ts — Tests del servicio de optimización con Gemini
 *
 * Cubre FIX-0018 (resultado tipado + validación BYOK) y preserva la intención de
 * FIX-0001 (BYOK desde localStorage, sin excepciones, descripción original intacta):
 *
 * 1. `optimizeDescription` devuelve `{ ok, description, error? }` (BR-003).
 * 2. Sin clave NO se llama al SDK y el fallo es observable (BR-002).
 * 3. La clave de usuario sale de `localStorage` cuando el build no trae ninguna (BR-001).
 * 4. `testGeminiApiKey` clasifica clave inválida / cuota / red (BR-005).
 * 5. AC-006: `App.handleOptimizeDescription` sólo reemplaza con `ok: true` y avisa con `error`.
 * 6. AC-007: la clave no se filtra a otros servicios ni al bundle.
 *
 * Se mockea `@google/genai` para evitar llamadas reales: el mock registra tanto la
 * construcción del cliente (para poder afirmar "el SDK nunca se llamó") como la
 * llamada a `models.generateContent()`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ─── Mock de @google/genai ────────────────────────────────────────────────────
// Debe configurarse ANTES de importar el servicio.
const { mockGenerateContent, mockClientConstruction } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockClientConstruction: vi.fn(),
}));

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGenerateContent,
      };
      constructor(opts: unknown) {
        // Se registra la construcción para poder afirmar que el SDK no se toca sin clave.
        mockClientConstruction(opts);
      }
    },
  };
});

// Importar después del mock
import { optimizeDescription, testGeminiApiKey } from './geminiService';
import { AI_KEY_STORAGE_KEY } from '../utils/aiKeyStorage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lee un archivo del repo resolviéndolo desde este test (sólo aserciones de fuente). */
const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8');

/** Quita comentarios de bloque y de línea para asertar sobre código ejecutable, no sobre prosa. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ─── Setup ────────────────────────────────────────────────────────────────────

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

// process.env.API_KEY se define en vite.config.ts via `define` (como '') y en el
// entorno de test se asigna manualmente.
const originalApiKey = process.env.API_KEY;

beforeEach(() => {
  installLocalStorage();
  window.localStorage.clear();
  process.env.API_KEY = 'test-api-key-123';
  mockGenerateContent.mockReset();
  mockClientConstruction.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  if (originalApiKey === undefined) {
    delete process.env.API_KEY;
  } else {
    process.env.API_KEY = originalApiKey;
  }
});

// ─── 1. Resultado tipado: éxito ───────────────────────────────────────────────

describe('optimizeDescription — resultado tipado (FIX-0018 BR-003)', () => {
  it('FIX-0018-BR-003: una respuesta correcta devuelve { ok: true, description } con el texto optimizado', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Algodón premium, máximo confort',
    });

    const result = await optimizeDescription('Remera', 'Descripción original muy larga');

    expect(result.ok).toBe(true);
    expect(result.description).toBe('Algodón premium, máximo confort');
    expect(result.error).toBeUndefined();
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('FIX-0018-BR-003: recorta los espacios del resultado optimizado (trim)', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: '  Descripción optimizada con espacios  ',
    });

    const result = await optimizeDescription('Producto', 'Desc original');

    expect(result.ok).toBe(true);
    expect(result.description).toBe('Descripción optimizada con espacios');
  });

  it('FIX-0018-BR-003: una respuesta vacía del modelo devuelve ok:false, el motivo y la descripción original', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '   ' });

    const original = 'Descripción original que debe conservarse';
    const result = await optimizeDescription('Producto', original);

    expect(result.ok).toBe(false);
    expect(result.description).toBe(original);
    expect(result.error).toMatch(/vacía/i);
  });
});

// ─── 2. Manejo de errores y fallbacks (FIX-0001 preservado) ───────────────────

describe('optimizeDescription — errores y fallbacks (FIX-0018 BR-002/BR-003)', () => {
  it('FIX-0018-BR-002: sin clave (localStorage vacío y process.env.API_KEY vacío) falla observándose y NO llama al SDK', async () => {
    process.env.API_KEY = '';
    window.localStorage.clear();

    const original = 'Descripción original sin cambios';
    const result = await optimizeDescription('Producto', original);

    expect(result.ok).toBe(false);
    expect(result.description).toBe(original);
    expect(result.error).toMatch(/no configurada/i);

    // Sin clave el SDK no debe instanciarse ni consultarse (antes el error salía del SDK).
    expect(mockClientConstruction).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('FIX-0018-BR-003: si la API lanza por cuota agotada devuelve ok:false con el motivo y conserva la original, sin lanzar', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('API rate limit exceeded'));

    const original = 'Descripción que no cambia';
    const result = await optimizeDescription('Producto', original);

    expect(result.ok).toBe(false);
    expect(result.description).toBe(original);
    expect(result.error).toMatch(/cuota/i);
  });

  it('FIX-0018-BR-003: un error de red devuelve ok:false con el motivo de conexión y conserva la original', async () => {
    mockGenerateContent.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const original = 'Sin conexión a internet';
    const result = await optimizeDescription('Producto', original);

    expect(result.ok).toBe(false);
    expect(result.description).toBe(original);
    expect(result.error).toMatch(/conectar/i);
  });

  it('FIX-0018-BR-001: usa la clave de localStorage (BYOK) cuando process.env.API_KEY está vacío', async () => {
    process.env.API_KEY = '';
    window.localStorage.setItem(AI_KEY_STORAGE_KEY, 'user-custom-key');
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Descripción generada con clave de usuario',
    });

    const result = await optimizeDescription('Producto BYOK', 'Desc');

    expect(result.ok).toBe(true);
    expect(result.description).toBe('Descripción generada con clave de usuario');
    // La clave del usuario es la que llega al SDK.
    expect(mockClientConstruction).toHaveBeenCalledWith({ apiKey: 'user-custom-key' });
  });

  it('FIX-0018-BR-003: GIVEN la IA no disponible WHEN se pide optimizar THEN no lanza ninguna excepción y la descripción original queda intacta (FIX-0001 AC-002)', async () => {
    process.env.API_KEY = '';
    window.localStorage.clear();

    const desc = 'Descripción original intacta';

    // Si lanzara, esta promesa se rechazaría y el test fallaría.
    const result = await optimizeDescription('Zapatos', desc);

    expect(result.ok).toBe(false);
    expect(result.description).toBe(desc);
    expect(typeof result.error).toBe('string');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

// ─── 3. testGeminiApiKey (BR-005) ────────────────────────────────────────────

describe('testGeminiApiKey — validación de la clave con consulta genérica (FIX-0018 BR-005)', () => {
  it('FIX-0018-BR-005: una cadena vacía devuelve ok:false con "Ingresá una API key" y no consulta al SDK', async () => {
    const result = await testGeminiApiKey('');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Ingresá una API key/i);
    expect(mockClientConstruction).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('FIX-0018-BR-005: una cadena de sólo espacios devuelve ok:false sin consultar al SDK', async () => {
    const result = await testGeminiApiKey('   ');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Ingresá una API key/i);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('FIX-0018-BR-005: una respuesta aceptable ("OK") devuelve ok:true', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'OK' });

    const result = await testGeminiApiKey('AIza-clave-valida');

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockClientConstruction).toHaveBeenCalledWith({ apiKey: 'AIza-clave-valida' });
  });

  it('FIX-0018-BR-005: una respuesta que no es la pedida ("no") devuelve ok:false con el motivo de respuesta inesperada', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'no' });

    const result = await testGeminiApiKey('AIza-clave-rara');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/inesperado/i);
  });

  it('FIX-0018-BR-005: una respuesta vacía del modelo devuelve ok:false', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '' });

    const result = await testGeminiApiKey('AIza-clave-vacia');

    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error).toMatch(/respuesta|permisos/i);
  });

  it('FIX-0018-BR-005: un error con status 429 se reporta como cuota agotada', async () => {
    mockGenerateContent.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { status: 429 }));

    const result = await testGeminiApiKey('AIza-sin-cuota');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cuota/i);
  });

  it('FIX-0018-BR-005: un error con status 400 se reporta como clave no válida', async () => {
    mockGenerateContent.mockRejectedValueOnce(Object.assign(new Error('Bad Request'), { status: 400 }));

    const result = await testGeminiApiKey('AIza-invalida');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no es válida/i);
  });

  it('FIX-0018-BR-005: un error de red (TypeError: Failed to fetch) se reporta como problema de conexión', async () => {
    mockGenerateContent.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await testGeminiApiKey('AIza-sin-red');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/conectar/i);
  });
});

// ─── 4. AC-006: cableado de App.handleOptimizeDescription (assertion de fuente) ─

describe('AC-006 — handleOptimizeDescription en App.tsx (FIX-0018 AC-006)', () => {
  /** Cuerpo de la función `handleOptimizeDescription` aislado del resto de App.tsx. */
  const getHandlerBody = (): string => {
    const appSource = readSource('../App.tsx');
    const start = appSource.indexOf('const handleOptimizeDescription');
    expect(start).toBeGreaterThan(-1);

    // `wrappedSetProducts` se movió arriba (FIX-0022, deps de hooks): el corte
    // del cuerpo pasa a ser el siguiente handler estable.
    const end = appSource.indexOf('const handleAddProduct', start);
    expect(end).toBeGreaterThan(start);

    return appSource.slice(start, end);
  };

  it('FIX-0018-AC-006: sólo reemplaza la descripción del producto con result.description cuando result.ok es true', () => {
    const body = getHandlerBody();

    const okBranchStart = body.indexOf('if (result.ok)');
    expect(okBranchStart).toBeGreaterThan(-1);

    // `description: result.description` aparece exactamente una vez...
    const occurrences = body.split('description: result.description').length - 1;
    expect(occurrences).toBe(1);

    // ...y esa única aparición vive DENTRO del branch `result.ok === true`.
    const assignmentIndex = body.indexOf('description: result.description');
    const elseBranchStart = body.indexOf('} else {', assignmentIndex);
    expect(elseBranchStart).toBeGreaterThan(assignmentIndex);

    const okBranch = body.slice(okBranchStart, elseBranchStart);
    expect(okBranch).toContain('description: result.description');
    expect(okBranch).toContain('result.ok');

    // El branch de error no toca la descripción: la original queda intacta.
    const elseBranch = body.slice(elseBranchStart, body.indexOf('} catch'));
    expect(elseBranch.length).toBeGreaterThan(0);
    expect(elseBranch).not.toContain('result.description');
    expect(elseBranch).not.toContain('wrappedSetProducts');
  });

  it('FIX-0018-AC-006: cuando result.ok es false avisa al usuario con addToast(result.error)', () => {
    const body = getHandlerBody();

    const elseBranchStart = body.indexOf('} else {');
    expect(elseBranchStart).toBeGreaterThan(-1);
    const elseBranch = body.slice(elseBranchStart, body.indexOf('} catch'));

    expect(elseBranch).toMatch(/addToast\(\s*result\.error/);
    // Hay un fallback por si el servicio no manda motivo...
    expect(elseBranch).toMatch(/No se pudo optimizar con IA/);
    // ...y el aviso de éxito sólo ocurre en el camino exitoso.
    const okBranch = body.slice(0, elseBranchStart);
    expect(okBranch).toMatch(/addToast\(/);
    expect(elseBranch).not.toMatch(/optimizada con IA/i);
  });
});

// ─── 5. AC-007: la clave no se filtra (assertions de fuente) ──────────────────

describe('AC-007 — la clave no se filtra fuera de localStorage (FIX-0018 AC-007)', () => {
  it('FIX-0018-AC-007: cloudProfiles.ts y priceSnapshotService.ts no referencian la clave de Gemini', () => {
    for (const file of ['../services/cloudProfiles.ts', '../services/priceSnapshotService.ts']) {
      const code = readSource(file);

      expect(code).not.toContain('gemini_api_key');
      expect(code).not.toContain('AI_KEY_STORAGE_KEY');
      expect(code.toLowerCase()).not.toContain('apikey');
      expect(code.toLowerCase()).not.toContain('api_key');
      // Tampoco importan la utilidad que sí conoce la clave.
      expect(code).not.toContain('aiKeyStorage');
    }
  });

  it('FIX-0018-AC-007: vite.config.ts sigue definiendo process.env.API_KEY y GEMINI_API_KEY como cadena vacía', () => {
    const viteConfig = readSource('../vite.config.ts');

    expect(viteConfig).toMatch(/'process\.env\.API_KEY':\s*JSON\.stringify\(''\)/);
    expect(viteConfig).toMatch(/'process\.env\.GEMINI_API_KEY':\s*JSON\.stringify\(''\)/);
  });

  it('FIX-0018-AC-007: utils/aiKeyStorage.ts sólo toca localStorage (sin red, sin Firestore, sin logs)', () => {
    const storageCode = stripComments(readSource('../utils/aiKeyStorage.ts'));

    // Sólo localStorage como mecanismo de persistencia.
    expect(storageCode).toContain('localStorage');
    expect(storageCode).toContain('window.localStorage.getItem');
    expect(storageCode).toContain('window.localStorage.setItem');
    expect(storageCode).toContain('window.localStorage.removeItem');

    // Nada de red, Firestore/Firebase, variables de entorno del build ni logs de la clave.
    expect(storageCode).not.toMatch(/fetch\s*\(/i);
    expect(storageCode).not.toMatch(/XMLHttpRequest|sendBeacon/i);
    expect(storageCode).not.toMatch(/firebase|firestore/i);
    expect(storageCode).not.toContain('process.env');
    expect(storageCode).not.toMatch(/console\s*\./);

    // El nombre de la clave es exactamente el esperado (BR-001).
    expect(readSource('../utils/aiKeyStorage.ts')).toContain(`export const AI_KEY_STORAGE_KEY = 'gemini_api_key'`);
  });

  it('FIX-0018-AC-007: ningún otro servicio/producción escribe la clave en Firestore', () => {
    const cloudProfiles = readSource('../services/cloudProfiles.ts');
    const priceSnapshot = readSource('../services/priceSnapshotService.ts');

    // Los payloads que se envían a Firestore no se construyen con la utilidad BYOK.
    expect(cloudProfiles).not.toMatch(/getAiKey|setAiKey|hasAiKey|maskAiKey/);
    expect(priceSnapshot).not.toMatch(/getAiKey|setAiKey|hasAiKey|maskAiKey/);
  });
});
