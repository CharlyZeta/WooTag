/**
 * Módulo de optimización y cálculo de aprovechamiento de hojas A4 para WooTag.
 * Calcula el llenado de hojas, etiquetas faltantes para cerrar la hoja actual
 * y el progreso porcentual.
 */

export interface SheetOptimizationResult {
  totalLabels: number;          // Total de etiquetas cargadas (N)
  labelsPerPage: number;        // Capacidad por hoja (cols * rows)
  completedPages: number;       // Hojas 100% llenas (floor(N / C))
  currentSheetFilled: number;   // Etiquetas en la última hoja activa
  remainingToComplete: number;  // Faltantes para completar la última hoja activa
  totalPages: number;           // Total de hojas necesarias
  progressPercent: number;      // Progreso del llenado de la última hoja (0 - 100)
  isComplete: boolean;          // true si la última hoja activa está completa
}

export function calculateSheetOptimization(
  totalLabels: number,
  cols: number = 3,
  rows: number = 8
): SheetOptimizationResult {
  const safeCols = Math.max(1, cols || 3);
  const safeRows = Math.max(1, rows || 8);
  const labelsPerPage = (cols > 0 && rows > 0) ? (safeCols * safeRows) : 24;

  const safeTotal = Math.max(0, totalLabels || 0);

  if (safeTotal === 0) {
    return {
      totalLabels: 0,
      labelsPerPage,
      completedPages: 0,
      currentSheetFilled: 0,
      remainingToComplete: labelsPerPage,
      totalPages: 0,
      progressPercent: 0,
      isComplete: false,
    };
  }

  const remainder = safeTotal % labelsPerPage;
  const isComplete = remainder === 0;

  const completedPages = Math.floor(safeTotal / labelsPerPage);
  const currentSheetFilled = isComplete ? labelsPerPage : remainder;
  const remainingToComplete = isComplete ? 0 : labelsPerPage - remainder;
  const totalPages = Math.ceil(safeTotal / labelsPerPage);
  const progressPercent = Math.min(100, Math.max(0, (currentSheetFilled / labelsPerPage) * 100));

  return {
    totalLabels: safeTotal,
    labelsPerPage,
    completedPages,
    currentSheetFilled,
    remainingToComplete,
    totalPages,
    progressPercent,
    isComplete,
  };
}
