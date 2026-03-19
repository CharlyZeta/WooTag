/**
 * geminiService.test.ts — Tests para el servicio de optimización AI
 *
 * Cubre:
 * 1. Comportamiento exitoso: respuesta correcta de la API
 * 2. Manejo de errores: API Key ausente, errores de red, excepciones
 *
 * Se mockea el módulo @google/genai para evitar llamadas reales.
 * La función `getClient()` interna lee `process.env.API_KEY` y crea una instancia
 * de GoogleGenAI. Al mockear el módulo, controlamos qué hace `models.generateContent()`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock de @google/genai ────────────────────────────────────────────────────
// El mock debe configurarse ANTES de importar el servicio.
// GoogleGenAI se instancia dentro de getClient() cada vez que se llama optimizeDescription.
const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGenerateContent,
      };
      constructor(opts: any) {
        // Si no hay API Key, el SDK real lanzaría un error.
        // Simulamos ese comportamiento.
        if (!opts?.apiKey) {
          throw new Error('API Key not found');
        }
      }
    },
  };
});

// Importar después del mock
import { optimizeDescription } from './geminiService';

// ─── Setup ────────────────────────────────────────────────────────────────────

// process.env.API_KEY se define en vite.config.ts via `define`.
// En el entorno de test necesitamos asignarlo manualmente.
const originalApiKey = process.env.API_KEY;

beforeEach(() => {
  process.env.API_KEY = 'test-api-key-123';
  mockGenerateContent.mockReset();
});

afterEach(() => {
  process.env.API_KEY = originalApiKey;
});

// ─── 1. Comportamiento exitoso ────────────────────────────────────────────────

describe('optimizeDescription — éxito', () => {
  it('retorna la descripción optimizada cuando la API responde correctamente', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Algodón premium, máximo confort',
    });

    const result = await optimizeDescription('Remera', 'Descripción original muy larga');
    expect(result).toBe('Algodón premium, máximo confort');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('recorta espacios del resultado (trim)', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: '  Descripción optimizada con espacios  ',
    });

    const result = await optimizeDescription('Producto', 'Desc original');
    expect(result).toBe('Descripción optimizada con espacios');
  });
});

// ─── 2. Manejo de errores y fallbacks ─────────────────────────────────────────

describe('optimizeDescription — errores y fallbacks', () => {
  it('retorna la descripción original si la API Key no está configurada', async () => {
    // Sin API Key, getClient() lanza un error que es capturado por el catch
    process.env.API_KEY = '';

    const original = 'Descripción original sin cambios';
    const result = await optimizeDescription('Producto', original);
    expect(result).toBe(original);
  });

  it('retorna la descripción original si la API lanza una excepción', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('API rate limit exceeded'));

    const original = 'Descripción que no cambia';
    const result = await optimizeDescription('Producto', original);
    expect(result).toBe(original);
  });

  it('retorna la descripción original si hay error de red', async () => {
    mockGenerateContent.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const original = 'Sin conexión a internet';
    const result = await optimizeDescription('Producto', original);
    expect(result).toBe(original);
  });

  it('nunca lanza excepciones al consumidor (siempre retorna string)', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Error catastrófico'));

    // No debería lanzar, debería retornar la descripción original
    await expect(
      optimizeDescription('Producto', 'Fallback seguro')
    ).resolves.toBe('Fallback seguro');
  });
});
