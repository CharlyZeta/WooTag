import type { Product } from '../types';

/**
 * FIX-0020: la deduplicación de productos debe ser la misma para todos los
 * métodos de importación (búsqueda, árbol de categorías y planilla XLS).
 *
 * Antes el árbol y el XLS escribían directo en la lista sin avisar, mientras la
 * búsqueda por SKU/nombre preguntaba. Estas funciones son puras y testeables; el
 * punto único de alta y la confirmación viven en `Controls`.
 */

/** Cuenta cuántos productos entrantes ya existen en la lista (match exacto por SKU). */
export const countDuplicates = (incoming: Product[], existing: Product[]): number => {
  if (incoming.length === 0 || existing.length === 0) return 0;
  const existingSkus = new Set(existing.map(p => p.sku));
  return incoming.reduce((count, p) => (existingSkus.has(p.sku) ? count + 1 : count), 0);
};

/** SKUs duplicados, sin repetir, en el orden en que aparecen. */
export const findDuplicateSkus = (incoming: Product[], existing: Product[]): string[] => {
  const existingSkus = new Set(existing.map(p => p.sku));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const p of incoming) {
    if (existingSkus.has(p.sku) && !seen.has(p.sku)) {
      seen.add(p.sku);
      duplicates.push(p.sku);
    }
  }
  return duplicates;
};

/** Mensaje único de confirmación para altas por lote (BR-002). */
export const buildDuplicateNotice = (incoming: Product[], existing: Product[]): string | null => {
  const duplicates = countDuplicates(incoming, existing);
  if (duplicates === 0) return null;
  return `${duplicates} de ${incoming.length} producto(s) ya están en la lista. ¿Agregar igual?`;
};
