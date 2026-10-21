/**
 * FIX-0015: única fuente de verdad de la geometría de la hoja A4.
 *
 * Antes el preview/badge usaba 297 mm (A4 nominal) mientras la hoja medía 282 mm
 * (FIX-0010), así que el indicador de página quedaba desfasado ~57 px por hoja.
 * `index.html` necesita el valor literal para `@media print` (no puede importar
 * módulos): si cambiás `SHEET_HEIGHT_MM`, actualizá también `.sheet-page` allí.
 */

/** Alto real de la hoja impresa (margen de seguridad del rodillo incluido). */
export const SHEET_HEIGHT_MM = 282;
/** Ancho de la hoja A4. */
export const SHEET_WIDTH_MM = 210;
/** Separación entre hojas en pantalla (`gap-8` = 2rem = 32 px). */
export const SHEET_GAP_PX = 32;
/** Píxeles CSS por milímetro a 96 dpi. */
export const MM_TO_PX = 3.7795275591;

/** Alto de la ranura de una hoja en el contenedor de scroll (hoja + separación). */
export const PAGE_SLOT_HEIGHT = SHEET_HEIGHT_MM * MM_TO_PX + SHEET_GAP_PX;

/**
 * Página (1-based) que corresponde a un `scrollTop` dado, acotada al rango válido.
 * Se usa en el indicador flotante de páginas.
 */
export const getPageFromScrollTop = (
  scrollTop: number,
  totalPages: number,
  slotHeight: number = PAGE_SLOT_HEIGHT
): number => {
  if (totalPages <= 1) return 1;
  const raw = Math.floor(Math.max(0, scrollTop) / slotHeight) + 1;
  return Math.min(totalPages, Math.max(1, raw));
};
