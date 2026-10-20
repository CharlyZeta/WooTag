/**
 * aiKeyStorage.ts — Persistencia local de la API key de Gemini (BYOK).
 *
 * FIX-0018: la clave vive SÓLO en este navegador (localStorage). Nunca se
 * sincroniza a Firestore ni se embebe en el bundle (ver FIX-0001 / BR-008).
 *
 * Todo acceso a localStorage está protegido con try/catch: en SSR, modo
 * privado o con almacenamiento bloqueado las funciones degradan sin lanzar.
 */

export const AI_KEY_STORAGE_KEY = 'gemini_api_key';

/** Devuelve la clave guardada (sin espacios) o '' si no existe / falla el acceso. */
export const getAiKey = (): string => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return '';
    const stored = window.localStorage.getItem(AI_KEY_STORAGE_KEY);
    return (stored || '').trim();
  } catch {
    // localStorage bloqueado (privacidad/SSR): se comporta como "sin clave"
    return '';
  }
};

/** Guarda la clave recortada. Ignora valores vacíos o sólo espacios. */
export const setAiKey = (key: string): void => {
  const clean = key.trim();
  if (!clean) return;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(AI_KEY_STORAGE_KEY, clean);
  } catch {
    // Sin acceso a localStorage: no hay nada que hacer, no se lanza
  }
};

/** Elimina la clave del navegador (BR-007). */
export const clearAiKey = (): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(AI_KEY_STORAGE_KEY);
  } catch {
    // Sin acceso a localStorage: no hay nada que hacer, no se lanza
  }
};

/** true si hay una clave guardada utilizable. */
export const hasAiKey = (): boolean => getAiKey().length > 0;

/** Indicio enmascarado de la clave: 'AIza…7f3c'. Nunca muestra la clave completa (BR-004). */
export const maskAiKey = (key: string): string => {
  const clean = key.trim();
  if (!clean) return '';
  if (clean.length <= 8) {
    // Clave demasiado corta para mostrar cuatro caracteres de cada lado
    return `${clean.slice(0, 2)}…`;
  }
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
};
