/**
 * xlsImport.ts — WooTag AI Generator
 *
 * Módulo de importación y exportación XLS segura usando SheetJS (xlsx).
 *
 * SEGURIDAD:
 * - Solo se aceptan .xlsx y .xls (no .xlsm ni .xlam que pueden tener macros).
 * - SheetJS lee datos de celdas ÚNICAMENTE. No ejecuta fórmulas VBA ni macros.
 * - Se usa `{ type: 'array', cellFormula: false }` para forzar que solo se lean
 *   valores calculados, no expresiones de fórmulas. Esto mitiga ataques CSV/XLS injection.
 * - Cada valor de celda es inspeccionado para asegurar que sea string o número.
 *   Cualquier otro tipo es rechazado/ignorado.
 * - El tamaño máximo del archivo está limitado a 5 MB.
 */

import * as XLSX from 'xlsx';
import type { Product } from '../types';

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Extensiones de archivo permitidas. .xlsm se excluye por riesgo de macros. */
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

/** Tamaño máximo del archivo (5 MB) */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Máximo de filas a importar por plantilla */
const MAX_ROWS = 500;

/**
 * Columnas que DEBEN existir en la hoja (case-insensitive, se normalizan a minúsculas).
 * El nombre en la planilla puede tener mayúsculas o espacios extra, se trimea y lower-casea.
 */
const REQUIRED_COLUMNS = ['sku', 'name', 'price'];

/**
 * Todas las columnas que reconoce la importación.
 * Columnas extra son IGNORADAS (el archivo no puede inyectar datos desconocidos).
 */
const KNOWN_COLUMNS = ['sku', 'name', 'price', 'sale_price', 'description', 'category', 'image_url'];

// ─── Tipos de error ───────────────────────────────────────────────────────────

export interface XlsImportResult {
    products: Product[];
    errors: string[];
    warnings: string[];
}

// ─── Generador de Plantilla ───────────────────────────────────────────────────

/**
 * Genera y descarga un archivo .xlsx de plantilla vacía con las columnas correctas.
 * Incluye una fila de ejemplo, encabezados descriptivos y colores para guiar al usuario.
 */
export function downloadTemplate(): void {
    const wb = XLSX.utils.book_new();

    // Datos de la hoja: encabezados + fila de ejemplo
    const sheetData = [
        // Fila 1: encabezados (nombres exactos que la app espera)
        ['sku', 'name', 'price', 'sale_price', 'description', 'category', 'image_url'],
        // Fila 2: ejemplo
        ['CAMISA-001', 'Camisa Oxford Hombre', 15990, 12990, 'Camisa de tela Oxford, manga larga, talle S-XXL.', 'Ropa Hombre', 'https://ejemplo.com/imagen.jpg'],
        // Filas vacías de ejemplo para completar
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Estilos de ancho de columnas (referencial, no todos los viewers lo respetan)
    ws['!cols'] = [
        { wch: 18 },  // sku
        { wch: 35 },  // name
        { wch: 12 },  // price
        { wch: 12 },  // sale_price
        { wch: 45 },  // description
        { wch: 20 },  // category
        { wch: 50 },  // image_url
    ];

    // Hoja de instrucciones
    const instructionsData = [
        ['WooTag — Guía de uso de la Plantilla'],
        [''],
        ['COLUMNAS REQUERIDAS (obligatorias):'],
        ['sku', 'Código único del producto. Ej: REMERA-ROJA-M'],
        ['name', 'Nombre del producto. Ej: Remera Roja Talle M'],
        ['price', 'Precio normal (solo números). Ej: 15990'],
        [''],
        ['COLUMNAS OPCIONALES:'],
        ['sale_price', 'Precio de oferta (solo números). Ej: 12990. Dejar vacío si no aplica.'],
        ['description', 'Descripción breve del producto. Se muestra en la etiqueta.'],
        ['category', 'Categoría del producto. Solo informativo.'],
        ['image_url', 'URL de la imagen del producto. Debe ser una dirección web válida.'],
        [''],
        ['REGLAS IMPORTANTES:'],
        ['1.', 'No renombres los encabezados de la hoja "Productos".'],
        ['2.', 'El precio debe ser un número sin símbolos (sin $, sin puntos, sin comas).'],
        ['3.', 'No insertes macros, fórmulas complejas ni código VBA.'],
        ['4.', 'Máximo 500 productos por importación.'],
        ['5.', 'Guarda el archivo como .xlsx (Excel 2007 o superior).'],
    ];
    const wsInstr = XLSX.utils.aoa_to_sheet(instructionsData);
    wsInstr['!cols'] = [{ wch: 18 }, { wch: 60 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

    XLSX.writeFile(wb, 'wootag_plantilla.xlsx');
}

// ─── Parser y Validador ───────────────────────────────────────────────────────

/**
 * Sanitiza un valor de celda: solo permite strings y números.
 * Rechaza objetos, funciones, booleanos tipo fórmula, etc.
 */
function sanitizeCellValue(raw: unknown): string {
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'string') {
        // Limitar longitud para prevenir ataques de payload gigante
        return raw.trim().slice(0, 2000);
    }
    // Booleanos, objetos, undefined, etc. → cadena vacía
    return '';
}

/**
 * Valida que una URL sea http/https y no un esquema peligroso (javascript:, data:, etc.)
 */
function sanitizeUrl(url: string): string | undefined {
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return url;
        }
    } catch {
        // URL inválida → ignorar
    }
    return undefined;
}

/**
 * Parsea un archivo XLS/XLSX y retorna un array de Product.
 *
 * @param file El archivo seleccionado por el usuario
 * @returns XlsImportResult con productos válidos, errores críticos y advertencias
 */
export async function parseXlsFile(file: File): Promise<XlsImportResult> {
    const result: XlsImportResult = { products: [], errors: [], warnings: [] };

    // ── 1. Validar extensión ──────────────────────────────────────────────────
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        result.errors.push(
            `Tipo de archivo no permitido: "${file.name}". Solo se aceptan archivos .xlsx o .xls.\n` +
            `Archivos .xlsm (con macros) son rechazados por seguridad.`
        );
        return result;
    }

    // ── 2. Validar tamaño ─────────────────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE_BYTES) {
        result.errors.push(
            `El archivo es demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). ` +
            `El máximo permitido es 5 MB.`
        );
        return result;
    }

    // ── 3. Leer el archivo ────────────────────────────────────────────────────
    let workbook: XLSX.WorkBook;
    try {
        const arrayBuffer = await file.arrayBuffer();
        workbook = XLSX.read(arrayBuffer, {
            type: 'array',
            cellFormula: false,   // NO parsear fórmulas, solo valores calculados
            cellHTML: false,      // NO parsear HTML embebido
            cellDates: true,      // Convertir fechas automáticamente (evita números de serie)
            bookVBA: false,       // NO cargar módulos VBA
            password: '',         // No intentar desencriptar archivos protegidos
        });
    } catch (e) {
        result.errors.push('No se pudo leer el archivo. Asegurate de que sea un archivo Excel válido (.xlsx o .xls) y no esté dañado.');
        return result;
    }

    // ── 4. Verificar que exista la hoja "Productos" ──────────────────────────
    const sheetName = workbook.SheetNames.find(
        n => n.toLowerCase().trim() === 'productos'
    );
    if (!sheetName) {
        // Si no hay hoja "Productos", intentar con la primera hoja
        if (workbook.SheetNames.length === 0) {
            result.errors.push('El archivo no contiene ninguna hoja de cálculo.');
            return result;
        }
        result.warnings.push(
            `No se encontró una hoja llamada "Productos". Se usará la primera hoja: "${workbook.SheetNames[0]}".`
        );
    }

    const ws = workbook.Sheets[sheetName ?? workbook.SheetNames[0]];

    // ── 5. Convertir a JSON plano ─────────────────────────────────────────────
    // header: 1 → retorna array de arrays (primera fila = encabezados)
    const rawRows = XLSX.utils.sheet_to_json<string[]>(ws, {
        header: 1,
        raw: false,         // Convertir todo a string via formatter
        defval: '',         // Valor por defecto para celdas vacías
    });

    if (rawRows.length < 2) {
        result.errors.push('La planilla no tiene datos. Debe tener al menos una fila de encabezados y una fila de producto.');
        return result;
    }

    // ── 6. Parsear encabezados ────────────────────────────────────────────────
    const headerRow = rawRows[0].map((h: unknown) => sanitizeCellValue(h).toLowerCase().replace(/\s+/g, '_'));

    // Verificar columnas requeridas
    const missingCols = REQUIRED_COLUMNS.filter(col => !headerRow.includes(col));
    if (missingCols.length > 0) {
        result.errors.push(
            `Faltan columnas requeridas: ${missingCols.map(c => `"${c}"`).join(', ')}. ` +
            `Descargá la plantilla oficial para asegurarte de usar los nombres correctos.`
        );
        return result;
    }

    // Índice de cada columna conocida
    const colIndex: Record<string, number> = {};
    for (const col of KNOWN_COLUMNS) {
        const idx = headerRow.indexOf(col);
        if (idx !== -1) colIndex[col] = idx;
    }

    // ── 7. Parsear filas de datos ─────────────────────────────────────────────
    const dataRows = rawRows.slice(1);
    if (dataRows.length > MAX_ROWS) {
        result.warnings.push(
            `El archivo tiene ${dataRows.length} filas. Solo se procesarán las primeras ${MAX_ROWS}.`
        );
    }

    let rowNum = 2; // Empezamos en fila 2 (1 es encabezado)
    for (const row of dataRows.slice(0, MAX_ROWS)) {
        // Función helper para leer una celda por nombre de columna
        const cell = (colName: string): string => {
            const idx = colIndex[colName];
            if (idx === undefined) return '';
            return sanitizeCellValue((row as unknown[])[idx]);
        };

        const sku = cell('sku');
        const name = cell('name');
        const priceRaw = cell('price');

        // Ignorar filas completamente vacías
        if (!sku && !name && !priceRaw) {
            rowNum++;
            continue;
        }

        // Validar campos requeridos
        if (!sku) {
            result.warnings.push(`Fila ${rowNum}: se omitió porque el SKU está vacío.`);
            rowNum++;
            continue;
        }
        if (!name) {
            result.warnings.push(`Fila ${rowNum} (SKU: ${sku}): se omitió porque el nombre está vacío.`);
            rowNum++;
            continue;
        }

        // Validar precio
        const price = parseFloat(priceRaw.replace(/[^0-9.,-]/g, '').replace(',', '.'));
        if (isNaN(price) || price < 0) {
            result.warnings.push(`Fila ${rowNum} (SKU: ${sku}): precio inválido "${priceRaw}". Se omitió la fila.`);
            rowNum++;
            continue;
        }

        // Precio de oferta (opcional)
        const salePriceRaw = cell('sale_price');
        let salePrice: number | undefined;
        if (salePriceRaw) {
            const sp = parseFloat(salePriceRaw.replace(/[^0-9.,-]/g, '').replace(',', '.'));
            if (!isNaN(sp) && sp >= 0) salePrice = sp;
        }

        // Image URL (validada)
        const imageUrl = sanitizeUrl(cell('image_url'));

        // Construir objeto Product
        const product: Product = {
            id: `xls-${sku}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            sku: sku.toUpperCase(),
            name,
            price,
            salePrice,
            description: cell('description'),
            category: cell('category'),
            image: imageUrl,
            manageStock: false,
        };

        result.products.push(product);
        rowNum++;
    }

    if (result.products.length === 0 && result.errors.length === 0) {
        result.errors.push('No se encontraron productos válidos en la planilla. Revisá que las filas tengan SKU, nombre y precio.');
    }

    return result;
}
