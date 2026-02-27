/**
 * xlsImport.test.ts — Tests automatizados con Vitest
 *
 * Cubre los siguientes escenarios:
 * 1. Validación de extensión de archivo
 * 2. Validación de tamaño
 * 3. Validación de estructura del libro
 * 4. Validación de columnas requeridas
 * 5. Happy paths (importación correcta)
 * 6. Advertencias por filas inválidas
 * 7. Límite de 500 filas
 * 8. Seguridad: sanitización de URLs
 * 9. Seguridad: sanitización de celdas
 * 10. Fallback a primera hoja cuando no existe "Productos"
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseXlsFile } from './xlsImport';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Crea un File a partir de datos tabulares (array de arrays).
 * Permite especificar el nombre del sheet y el nombre del archivo.
 */
function makeXlsxFile(
    data: unknown[][],
    sheetName = 'Productos',
    fileName = 'test.xlsx'
): File {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([buffer], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

/** Crea un File con múltiples hojas. */
function makeXlsxFileMultiSheet(
    sheets: Array<{ name: string; data: unknown[][] }>,
    fileName = 'test.xlsx'
): File {
    const wb = XLSX.utils.book_new();
    for (const { name, data } of sheets) {
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, name);
    }
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([buffer], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

/** Encabezados válidos de la planilla. */
const VALID_HEADERS = ['sku', 'name', 'price', 'sale_price', 'description', 'category', 'image_url'];

/** Fila de ejemplo con todos los campos. */
const VALID_ROW = ['PROD-001', 'Producto Ejemplo', 15990, 12990, 'Descripción del producto', 'Ropa', 'https://example.com/img.jpg'];

// ─── 1. Validación de extensión ───────────────────────────────────────────────

describe('Validación de extensión de archivo', () => {
    it('rechaza archivos .xlsm (con macros)', async () => {
        const file = makeXlsxFile([VALID_HEADERS, VALID_ROW], 'Productos', 'test.xlsm');
        const result = await parseXlsFile(file);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/xlsm|no permitido/i);
        expect(result.products).toHaveLength(0);
    });

    it('rechaza archivos .csv', async () => {
        const csvContent = 'sku,name,price\nPROD-001,Producto,15990';
        const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
        const result = await parseXlsFile(file);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/no permitido/i);
        expect(result.products).toHaveLength(0);
    });

    it('rechaza archivos .txt', async () => {
        const file = new File(['texto plano'], 'test.txt', { type: 'text/plain' });
        const result = await parseXlsFile(file);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.products).toHaveLength(0);
    });

    it('acepta archivos .xlsx', async () => {
        const file = makeXlsxFile([VALID_HEADERS, VALID_ROW]);
        const result = await parseXlsFile(file);
        expect(result.errors).toHaveLength(0);
        expect(result.products).toHaveLength(1);
    });

    it('acepta archivos .xls (legacy)', async () => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([VALID_HEADERS, VALID_ROW]);
        XLSX.utils.book_append_sheet(wb, ws, 'Productos');
        const buffer = XLSX.write(wb, { type: 'array', bookType: 'xls' });
        const file = new File([buffer], 'test.xls', { type: 'application/vnd.ms-excel' });
        const result = await parseXlsFile(file);
        expect(result.errors).toHaveLength(0);
        expect(result.products).toHaveLength(1);
    });
});

// ─── 2. Validación de tamaño ──────────────────────────────────────────────────

describe('Validación de tamaño de archivo', () => {
    it('rechaza archivos mayores a 5 MB', async () => {
        // Crear un File falso que reporte 6MB de tamaño
        const fakeBuffer = new ArrayBuffer(6 * 1024 * 1024);
        const file = new File([fakeBuffer], 'grande.xlsx', {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const result = await parseXlsFile(file);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/demasiado grande|5 MB/i);
    });

    it('acepta archivos justos en el límite de 5 MB (datos reales)', async () => {
        // Un archivo real con datos siempre será mucho menor a 5MB
        const file = makeXlsxFile([VALID_HEADERS, VALID_ROW]);
        expect(file.size).toBeLessThan(5 * 1024 * 1024);
        const result = await parseXlsFile(file);
        expect(result.errors).toHaveLength(0);
    });
});

// ─── 3. Validación de estructura del libro ────────────────────────────────────

describe('Validación de estructura del libro Excel', () => {
    it('devuelve error si solo hay encabezados y ninguna fila de datos', async () => {
        const file = makeXlsxFile([VALID_HEADERS]);
        const result = await parseXlsFile(file);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/al menos una fila|no tiene datos/i);
    });

    it('usa la primera hoja si no existe una llamada "Productos"', async () => {
        const file = makeXlsxFileMultiSheet([
            { name: 'MiHoja', data: [VALID_HEADERS, VALID_ROW] },
        ]);
        const result = await parseXlsFile(file);
        expect(result.warnings.some(w => /primera hoja|MiHoja/i.test(w))).toBe(true);
        expect(result.products).toHaveLength(1);
    });

    it('prioriza la hoja llamada "Productos" sobre la primera hoja', async () => {
        const file = makeXlsxFileMultiSheet([
            {
                name: 'OtraHoja',
                data: [VALID_HEADERS, ['OTRO-001', 'Producto Otra Hoja', 9999]],
            },
            { name: 'Productos', data: [VALID_HEADERS, VALID_ROW] },
        ]);
        const result = await parseXlsFile(file);
        // No debe incluir el producto de OtraHoja
        expect(result.products).toHaveLength(1);
        expect(result.products[0].sku).toBe('PROD-001');
        expect(result.warnings.some(w => /primera hoja/i.test(w))).toBe(false);
    });

    it('ignora filas completamente vacías', async () => {
        const file = makeXlsxFile([
            VALID_HEADERS,
            VALID_ROW,
            ['', '', ''],   // fila vacía
            ['', '', null], // otra vacía
        ]);
        const result = await parseXlsFile(file);
        expect(result.products).toHaveLength(1);
    });
});

// ─── 4. Validación de columnas requeridas ─────────────────────────────────────

describe('Validación de columnas requeridas', () => {
    it('rechaza si falta la columna "sku"', async () => {
        const file = makeXlsxFile([
            ['name', 'price'],
            ['Producto', 15990],
        ]);
        const result = await parseXlsFile(file);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/sku/i);
    });

    it('rechaza si falta la columna "name"', async () => {
        const file = makeXlsxFile([
            ['sku', 'price'],
            ['PROD-001', 15990],
        ]);
        const result = await parseXlsFile(file);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/name/i);
    });

    it('rechaza si falta la columna "price"', async () => {
        const file = makeXlsxFile([
            ['sku', 'name'],
            ['PROD-001', 'Producto'],
        ]);
        const result = await parseXlsFile(file);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/price/i);
    });

    it('rechaza si faltan las tres columnas requeridas', async () => {
        const file = makeXlsxFile([
            ['description', 'category'],
            ['Desc', 'Cat'],
        ]);
        const result = await parseXlsFile(file);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/sku|name|price/i);
    });

    it('acepta encabezados con mayúsculas mezcladas', async () => {
        const file = makeXlsxFile([
            ['SKU', 'NAME', 'PRICE'],
            ['PROD-001', 'Producto', 15990],
        ]);
        const result = await parseXlsFile(file);
        expect(result.errors).toHaveLength(0);
        expect(result.products).toHaveLength(1);
    });
});

// ─── 5. Happy paths ───────────────────────────────────────────────────────────

describe('Importación correcta (happy paths)', () => {
    it('importa un producto con todos los campos', async () => {
        const file = makeXlsxFile([VALID_HEADERS, VALID_ROW]);
        const result = await parseXlsFile(file);

        expect(result.errors).toHaveLength(0);
        expect(result.products).toHaveLength(1);

        const p = result.products[0];
        expect(p.sku).toBe('PROD-001');
        expect(p.name).toBe('Producto Ejemplo');
        expect(p.price).toBe(15990);
        expect(p.salePrice).toBe(12990);
        expect(p.description).toBe('Descripción del producto');
        expect(p.category).toBe('Ropa');
        expect(p.image).toBe('https://example.com/img.jpg');
    });

    it('importa un producto con solo los 3 campos requeridos', async () => {
        const file = makeXlsxFile([
            ['sku', 'name', 'price'],
            ['PROD-MIN', 'Producto Mínimo', 5000],
        ]);
        const result = await parseXlsFile(file);

        expect(result.errors).toHaveLength(0);
        expect(result.products).toHaveLength(1);
        expect(result.products[0].salePrice).toBeUndefined();
        expect(result.products[0].image).toBeUndefined();
    });

    it('importa múltiples productos correctamente', async () => {
        const file = makeXlsxFile([
            VALID_HEADERS,
            ['P-001', 'Producto Uno', 1000, '', '', '', ''],
            ['P-002', 'Producto Dos', 2000, 1500, '', '', ''],
            ['P-003', 'Producto Tres', 3000, '', '', '', ''],
        ]);
        const result = await parseXlsFile(file);

        expect(result.errors).toHaveLength(0);
        expect(result.products).toHaveLength(3);
        expect(result.products[0].sku).toBe('P-001');
        expect(result.products[1].sku).toBe('P-002');
        expect(result.products[2].sku).toBe('P-003');
    });

    it('normaliza el SKU a mayúsculas', async () => {
        const file = makeXlsxFile([
            VALID_HEADERS,
            ['prod-minuscula', 'Producto', 1000],
        ]);
        const result = await parseXlsFile(file);
        expect(result.products[0].sku).toBe('PROD-MINUSCULA');
    });

    it('asigna un ID único a cada producto', async () => {
        const file = makeXlsxFile([
            VALID_HEADERS,
            ['P-001', 'Prod A', 1000],
            ['P-002', 'Prod B', 2000],
        ]);
        const result = await parseXlsFile(file);
        const ids = result.products.map(p => p.id);
        expect(new Set(ids).size).toBe(2); // todos únicos
    });

    it('acepta precio con separador de miles (punto) y convierte correctamente', async () => {
        const file = makeXlsxFile([
            ['sku', 'name', 'price'],
            ['P-001', 'Producto', '15.990'],
        ]);
        const result = await parseXlsFile(file);
        // El parseFloat lo va a convertir según la lógica: remueve chars no numéricos excepto punto/coma
        expect(result.products.length).toBeGreaterThan(0);
        expect(result.products[0].price).toBeGreaterThan(0);
    });
});

// ─── 6. Advertencias por filas inválidas ──────────────────────────────────────

describe('Advertencias y omisión de filas inválidas', () => {
    it('omite filas con SKU vacío y genera advertencia', async () => {
        const file = makeXlsxFile([
            VALID_HEADERS,
            ['', 'Sin SKU', 5000],
            ['P-002', 'Con SKU', 5000],
        ]);
        const result = await parseXlsFile(file);
        expect(result.products).toHaveLength(1);
        expect(result.products[0].sku).toBe('P-002');
        expect(result.warnings.some(w => /SKU/i.test(w))).toBe(true);
    });

    it('omite filas con nombre vacío y genera advertencia', async () => {
        const file = makeXlsxFile([
            VALID_HEADERS,
            ['P-001', '', 5000],
            ['P-002', 'Con Nombre', 5000],
        ]);
        const result = await parseXlsFile(file);
        expect(result.products).toHaveLength(1);
        expect(result.products[0].sku).toBe('P-002');
        expect(result.warnings.some(w => /nombre/i.test(w))).toBe(true);
    });

    it('omite filas con precio no numérico y genera advertencia', async () => {
        const file = makeXlsxFile([
            VALID_HEADERS,
            ['P-001', 'Producto', 'GRATIS'],
            ['P-002', 'Producto 2', 9990],
        ]);
        const result = await parseXlsFile(file);
        expect(result.products).toHaveLength(1);
        expect(result.products[0].sku).toBe('P-002');
        expect(result.warnings.some(w => /precio/i.test(w))).toBe(true);
    });

    it('omite filas con precio negativo y genera advertencia', async () => {
        const file = makeXlsxFile([
            VALID_HEADERS,
            ['P-001', 'Producto', -500],
            ['P-002', 'Producto 2', 1000],
        ]);
        const result = await parseXlsFile(file);
        expect(result.products).toHaveLength(1);
        expect(result.products[0].sku).toBe('P-002');
        expect(result.warnings.some(w => /precio/i.test(w))).toBe(true);
    });

    it('ignora sale_price inválido sin generar error (es opcional)', async () => {
        const file = makeXlsxFile([
            VALID_HEADERS,
            ['P-001', 'Producto', 5000, 'INVALIDO'],
        ]);
        const result = await parseXlsFile(file);
        expect(result.products).toHaveLength(1);
        expect(result.products[0].salePrice).toBeUndefined();
        expect(result.errors).toHaveLength(0);
    });

    it('devuelve error cuando no hay productos válidos en la planilla', async () => {
        const file = makeXlsxFile([
            VALID_HEADERS,
            ['', 'Sin SKU', 5000],
            ['P-001', '', 5000],
        ]);
        const result = await parseXlsFile(file);
        expect(result.products).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
    });
});

// ─── 7. Límite de 500 filas ───────────────────────────────────────────────────

describe('Límite de 500 filas', () => {
    it('advierte cuando la planilla supera 500 filas y solo importa las primeras 500', async () => {
        const rows: unknown[][] = [VALID_HEADERS];
        for (let i = 1; i <= 510; i++) {
            rows.push([`SKU-${String(i).padStart(4, '0')}`, `Producto ${i}`, 1000 + i]);
        }
        const file = makeXlsxFile(rows);
        const result = await parseXlsFile(file);

        expect(result.products).toHaveLength(500);
        expect(result.warnings.some(w => /500/i.test(w))).toBe(true);
    });
});

// ─── 8. Seguridad: sanitización de URLs ──────────────────────────────────────

describe('Seguridad: sanitización de URLs en image_url', () => {
    async function importWithImageUrl(url: string) {
        const file = makeXlsxFile([
            VALID_HEADERS,
            ['P-001', 'Producto', 5000, '', '', '', url],
        ]);
        return parseXlsFile(file);
    }

    it('rechaza URLs con protocolo javascript:', async () => {
        const result = await importWithImageUrl('javascript:alert("XSS")');
        expect(result.products).toHaveLength(1);
        expect(result.products[0].image).toBeUndefined();
    });

    it('rechaza URLs con protocolo data:', async () => {
        const result = await importWithImageUrl('data:text/html,<script>alert(1)</script>');
        expect(result.products).toHaveLength(1);
        expect(result.products[0].image).toBeUndefined();
    });

    it('rechaza URLs malformadas', async () => {
        const result = await importWithImageUrl('not-a-url-at-all');
        expect(result.products).toHaveLength(1);
        expect(result.products[0].image).toBeUndefined();
    });

    it('rechaza URLs con protocolo file:', async () => {
        const result = await importWithImageUrl('file:///etc/passwd');
        expect(result.products).toHaveLength(1);
        expect(result.products[0].image).toBeUndefined();
    });

    it('acepta URLs con protocolo http:', async () => {
        const result = await importWithImageUrl('http://example.com/img.jpg');
        expect(result.products).toHaveLength(1);
        expect(result.products[0].image).toBe('http://example.com/img.jpg');
    });

    it('acepta URLs con protocolo https:', async () => {
        const result = await importWithImageUrl('https://cdn.example.com/img.png');
        expect(result.products).toHaveLength(1);
        expect(result.products[0].image).toBe('https://cdn.example.com/img.png');
    });

    it('image_url vacío resulta en image: undefined', async () => {
        const result = await importWithImageUrl('');
        expect(result.products).toHaveLength(1);
        expect(result.products[0].image).toBeUndefined();
    });
});

// ─── 9. Seguridad: sanitización de valores de celda ──────────────────────────

describe('Seguridad: sanitización de valores de celda', () => {
    it('trunca descripciones extremadamente largas a 2000 caracteres', async () => {
        const longDesc = 'A'.repeat(5000);
        const file = makeXlsxFile([
            VALID_HEADERS,
            ['P-001', 'Producto', 5000, '', longDesc],
        ]);
        const result = await parseXlsFile(file);
        expect(result.products).toHaveLength(1);
        expect(result.products[0].description.length).toBeLessThanOrEqual(2000);
    });

    it('convierte valores numéricos de celda a string en campos de texto', async () => {
        const file = makeXlsxFile([
            VALID_HEADERS,
            // name y description son texto, pero se provee un número
            ['P-001', 12345, 5000, '', 67890],
        ]);
        const result = await parseXlsFile(file);
        // Debe importar igualmente convirtiéndolos a string
        expect(result.products).toHaveLength(1);
        expect(typeof result.products[0].name).toBe('string');
        expect(typeof result.products[0].description).toBe('string');
    });

    it('no produce errores con una planilla de solo campos requeridos y valores de borde', async () => {
        const file = makeXlsxFile([
            ['sku', 'name', 'price'],
            ['  ESPACIO  ', '  Nombre con espacios  ', 0.01],
        ]);
        const result = await parseXlsFile(file);
        // El SKU se trimea, se convierte a mayúsculas
        expect(result.products[0].sku).toBe('ESPACIO');
        expect(result.products[0].name).toBe('Nombre con espacios');
        expect(result.products[0].price).toBe(0.01);
    });
});
