import { GoogleGenAI } from "@google/genai";
import { getAiKey } from '../utils/aiKeyStorage';

/** Resultado tipado de una optimización (FIX-0018: deja de ser silenciosa). */
export interface OptimizeDescriptionResult {
  ok: boolean;
  description: string; // optimizada si ok; la original en caso contrario
  error?: string;
}

/** Resultado de probar una API key contra Gemini. */
export interface ApiKeyTestResult {
  ok: boolean;
  error?: string;
}

/** Clave efectiva: primero la del usuario (BYOK), luego la del build (que en producción es ''). */
const getApiKey = (): string => {
  const userKey = getAiKey();
  if (userKey) return userKey;
  try {
    return typeof process !== 'undefined' && process.env ? (process.env.API_KEY || '') : '';
  } catch {
    return '';
  }
};

/** Extrae un status HTTP numérico del error si el SDK lo expone. */
const getErrorStatus = (error: unknown): number | null => {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { status?: unknown; code?: unknown };
    for (const value of [candidate.status, candidate.code]) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

/** Clasifica un error de Gemini en un mensaje accionable para la UI (BR-005). */
const describeGeminiError = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const text = rawMessage.toLowerCase();
  const status = getErrorStatus(error);

  // Red / conectividad
  if (
    text.includes('fetch') ||
    text.includes('network') ||
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('etimedout') ||
    text.includes('timeout')
  ) {
    return 'No se pudo conectar con Gemini: revisá tu conexión a internet e intentá de nuevo.';
  }

  // Cuota agotada
  if (
    status === 429 ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('ratelimit') ||
    text.includes('resource_exhausted')
  ) {
    return 'Se agotó la cuota de Gemini para esta clave. Esperá unos minutos o revisá tu plan en Google AI Studio.';
  }

  // Clave inválida o sin permisos
  if (
    status === 400 ||
    status === 403 ||
    text.includes('api key not valid') ||
    text.includes('api_key_invalid') ||
    text.includes('api key') ||
    text.includes('permission') ||
    text.includes('unauthorized') ||
    text.includes('forbidden')
  ) {
    return 'La API key de Gemini no es válida o no tiene permisos para este modelo.';
  }

  return 'No se pudo completar la solicitud a Gemini. Revisá la consola para más detalles.';
};

export const optimizeDescription = async (
  productName: string,
  currentDescription: string
): Promise<OptimizeDescriptionResult> => {
  const apiKey = getApiKey();
  // Sin clave no se llama a la API: falla de forma observable y conserva la original (BR-002/BR-003)
  if (!apiKey) {
    return {
      ok: false,
      description: currentDescription,
      error: 'IA no configurada: cargá tu API key de Gemini en Ajustes → Optimización con IA.',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
      Actúa como un experto en marketing de retail. 
      Tengo un producto llamado "${productName}".
      Descripción original: "${currentDescription}".
      
      Tarea: Genera una descripción MUY BREVE y persuasiva para una etiqueta de precio física pequeña.
      Restricciones:
      1. Máximo 15 palabras.
      2. Usa español neutro.
      3. Enfócate en el beneficio principal o característica clave.
      4. No uses emojis.
      5. Solo devuelve el texto, sin comillas ni explicaciones.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', // Bug 2 fix: use stable model name
      contents: prompt,
    });

    const optimized = (response.text || '').trim();
    if (!optimized) {
      console.error('Gemini devolvió una respuesta vacía al optimizar la descripción');
      return {
        ok: false,
        description: currentDescription,
        error: 'Gemini devolvió una respuesta vacía. Intentá de nuevo.',
      };
    }

    return { ok: true, description: optimized };
  } catch (error) {
    console.error("Error optimizing description:", error);
    return { ok: false, description: currentDescription, error: describeGeminiError(error) };
  }
};

/**
 * Prueba una API key arbitraria (no la guardada) con una consulta genérica:
 * se pide una respuesta trivial y sólo se acepta si es no vacía y contiene "ok" (BR-005).
 */
export const testGeminiApiKey = async (apiKey: string): Promise<ApiKeyTestResult> => {
  const clean = apiKey.trim();
  if (!clean) {
    return { ok: false, error: 'Ingresá una API key.' };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: clean });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: 'Respondé únicamente con la palabra OK, sin comillas ni explicaciones.',
    });

    const text = (response.text || '').trim();
    if (!text) {
      return {
        ok: false,
        error: 'La clave no devolvió ninguna respuesta; puede no tener permisos para este modelo.',
      };
    }
    if (!text.toLowerCase().includes('ok')) {
      return {
        ok: false,
        error: 'La clave respondió algo inesperado; puede no tener permisos para este modelo.',
      };
    }

    return { ok: true };
  } catch (error) {
    console.error('Error testing Gemini API key:', error);
    return { ok: false, error: describeGeminiError(error) };
  }
};
