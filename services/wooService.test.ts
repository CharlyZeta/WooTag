/**
 * wooService.test.ts — Tests para la capa de conexión WooCommerce
 *
 * Cubre:
 * 1. validateConnection: validación de parámetros, respuestas exitosas/fallidas, fallback auth
 * 2. fetchProductBySku: búsqueda por SKU, mapeo de datos, manejo de errores
 * 3. fetchProductsByName: búsqueda por nombre, query mínimo, codificación de caracteres
 * 4. fetchProductsByCategory: importación por categoría, manejo de errores
 * 5. fetchCategories: paginación multi-página con X-WP-TotalPages
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateConnection,
  fetchProductBySku,
  fetchProductsByName,
  fetchProductsByCategory,
  fetchCategories,
  fetchAllCatalogProducts,
} from './wooService';
import type { WooConfig } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_CONFIG: WooConfig = {
  url: 'https://mitienda.com',
  consumerKey: 'ck_test123',
  consumerSecret: 'cs_test456',
};

/** Producto WooCommerce mock (estructura de la API REST) */
const MOCK_WOO_PRODUCT = {
  id: 42,
  sku: 'CAM-001',
  name: 'Remera Oversize',
  regular_price: '15500',
  sale_price: '12900',
  price: '12900',
  short_description: '<p>Algodón <b>100%</b> peinado</p>',
  description: '<p>Descripción larga del producto</p>',
  images: [{ src: 'https://cdn.example.com/img.jpg' }],
  categories: [{ id: 1, name: 'Remeras', slug: 'remeras' }],
  stock_quantity: 10,
  manage_stock: true,
};

/** Producto sin campos opcionales */
const MOCK_MINIMAL_PRODUCT = {
  id: 99,
  sku: '',
  name: 'Producto Mínimo',
  regular_price: '5000',
  sale_price: '',
  price: '5000',
  short_description: '',
  description: '',
  images: [],
  categories: [],
  stock_quantity: null,
  manage_stock: false,
};

/** Categoría WooCommerce mock */
const MOCK_CATEGORY = { id: 1, name: 'Remeras', slug: 'remeras', count: 15 };

/** Crea una Response mock */
function mockResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(headers),
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  globalThis.fetch = fetchSpy as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── HTTPS Enforcement (FIX-0004) ─────────────────────────────────────────────

describe('HTTPS Enforcement (FIX-0004)', () => {
  const HTTP_CONFIG: WooConfig = {
    url: 'http://tienda.example.com',
    consumerKey: 'ck_test123',
    consumerSecret: 'cs_test456',
  };

  const LOCALHOST_CONFIG: WooConfig = {
    url: 'http://localhost:8080',
    consumerKey: 'ck_test123',
    consumerSecret: 'cs_test456',
  };

  it('AC-001: validateConnection rechaza con error HTTPS si el esquema es http:// y no invoca fetch', async () => {
    await expect(validateConnection(HTTP_CONFIG)).rejects.toThrow(/HTTPS/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('AC-002: fetchProductBySku, fetchProductsByName, fetchProductsByCategory y fetchCategories rechazan con error HTTPS y no invocan fetch', async () => {
    await expect(fetchProductBySku('SKU1', HTTP_CONFIG)).rejects.toThrow(/HTTPS/i);
    await expect(fetchProductsByName('Test', HTTP_CONFIG)).rejects.toThrow(/HTTPS/i);
    await expect(fetchProductsByCategory(1, HTTP_CONFIG)).rejects.toThrow(/HTTPS/i);
    await expect(fetchCategories(HTTP_CONFIG)).rejects.toThrow(/HTTPS/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('AC-003: validateConnection invoca fetch normalmente si el host es localhost sin importar http://', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse([MOCK_WOO_PRODUCT]));
    const user = await validateConnection(LOCALHOST_CONFIG);
    expect(user).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── Determinable Price Enforcement (FIX-0007) ───────────────────────────────

describe('Determinable Price Enforcement (FIX-0007)', () => {
  it('AC-001: fetchProductBySku rechaza si el producto es type variable sin regular_price aunque tenga price', async () => {
    const variableProd = {
      id: 50,
      sku: 'VAR-1',
      name: 'Remera Variable',
      type: 'variable',
      regular_price: '',
      sale_price: '',
      price: '1500',
    };
    fetchSpy.mockResolvedValueOnce(mockResponse([variableProd]));

    await expect(fetchProductBySku('VAR-1', VALID_CONFIG)).rejects.toThrow(
      /precio no determinable|variable/i
    );
  });

  it('AC-002: fetchProductBySku rechaza si el producto es type simple pero no tiene precio', async () => {
    const noPriceProd = {
      id: 51,
      sku: 'NO-PRICE',
      name: 'Sin Precio',
      type: 'simple',
      regular_price: '',
      sale_price: '',
      price: '',
    };
    fetchSpy.mockResolvedValueOnce(mockResponse([noPriceProd]));

    await expect(fetchProductBySku('NO-PRICE', VALID_CONFIG)).rejects.toThrow(
      /precio no determinable|variable/i
    );
  });

  it('AC-003: importa producto simple con regular_price numérico válido con su precio exacto', async () => {
    const validProd = {
      id: 52,
      sku: 'VAL-1',
      name: 'Producto Valido',
      type: 'simple',
      regular_price: '2500',
      sale_price: '',
      price: '2500',
    };
    fetchSpy.mockResolvedValueOnce(mockResponse([validProd]));

    const result = await fetchProductBySku('VAL-1', VALID_CONFIG);
    expect(result).not.toBeNull();
    expect(result?.price).toBe(2500);
  });

  it('AC-004: fetchProductsByCategory omite productos sin precio determinable y devuelve solo los válidos', async () => {
    const prod1 = { ...MOCK_WOO_PRODUCT, id: 101, sku: 'OK-1', regular_price: '1000' };
    const prod2 = { ...MOCK_WOO_PRODUCT, id: 102, sku: 'VAR-2', type: 'variable', regular_price: '' };
    const prod3 = { ...MOCK_WOO_PRODUCT, id: 103, sku: 'OK-2', regular_price: '2000' };

    fetchSpy.mockResolvedValueOnce(
      mockResponse([prod1, prod2, prod3], 200, { 'X-WP-TotalPages': '1' })
    );

    const result = await fetchProductsByCategory(5, VALID_CONFIG);
    expect(result).toHaveLength(2);
    expect(result.map(p => p.sku)).toEqual(['OK-1', 'OK-2']);
  });
});

// ─── 1. validateConnection ────────────────────────────────────────────────────

describe('validateConnection', () => {
  it('lanza error con mensaje en español si la URL está vacía', async () => {
    await expect(
      validateConnection({ ...VALID_CONFIG, url: '' })
    ).rejects.toThrow(/completa todos los campos/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lanza error con mensaje en español si el Consumer Key está vacío', async () => {
    await expect(
      validateConnection({ ...VALID_CONFIG, consumerKey: '' })
    ).rejects.toThrow(/completa todos los campos/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lanza error con mensaje en español si el Consumer Secret está vacío', async () => {
    await expect(
      validateConnection({ ...VALID_CONFIG, consumerSecret: '' })
    ).rejects.toThrow(/completa todos los campos/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retorna WpUser válido cuando la API responde 200', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse([MOCK_WOO_PRODUCT]));

    const user = await validateConnection(VALID_CONFIG);
    expect(user).toBeDefined();
    expect(user.name).toBe('Gestor Tienda');
    expect(user.roles).toContain('shop_manager');
  });

  it('ejecuta fallback a query params cuando el primer intento retorna 401', async () => {
    // Primer fetch: 401 (auth header rechazado)
    fetchSpy.mockResolvedValueOnce(mockResponse({}, 401));
    // Segundo fetch (fallback con query params): también falla
    fetchSpy.mockResolvedValueOnce(mockResponse({}, 401));

    await expect(validateConnection(VALID_CONFIG)).rejects.toThrow(
      /credenciales inválidas|acceso denegado/i
    );
    // Debe haber hecho 2 llamadas: auth header + query params
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const fallbackUrl = fetchSpy.mock.calls[1][0] as string;
    expect(fallbackUrl).toContain('consumer_key=');
    expect(fallbackUrl).toContain('consumer_secret=');
  });

  it('conexión exitosa vía fallback query params cuando auth header da 401', async () => {
    // Primer fetch: 401
    fetchSpy.mockResolvedValueOnce(mockResponse({}, 401));
    // Segundo fetch (fallback): 200
    fetchSpy.mockResolvedValueOnce(mockResponse([MOCK_WOO_PRODUCT]));

    const user = await validateConnection(VALID_CONFIG);
    expect(user.name).toBe('Gestor Tienda');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('lanza error de red cuando fetch falla completamente', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(validateConnection(VALID_CONFIG)).rejects.toThrow('Failed to fetch');
  });

  it('normaliza la URL removiendo trailing slash y /wp-json', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse([MOCK_WOO_PRODUCT]));

    await validateConnection({ ...VALID_CONFIG, url: 'https://mitienda.com/wp-json/' });
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('https://mitienda.com/wp-json/wc/v3/products');
    expect(calledUrl).not.toContain('/wp-json/wp-json/');
  });
});

// ─── 2. fetchProductBySku ─────────────────────────────────────────────────────

describe('fetchProductBySku', () => {
  it('retorna Product mapeado correctamente para un SKU existente', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse([MOCK_WOO_PRODUCT]));

    const product = await fetchProductBySku('CAM-001', VALID_CONFIG);
    expect(product).not.toBeNull();
    expect(product!.sku).toBe('CAM-001');
    expect(product!.name).toBe('Remera Oversize');
    expect(product!.price).toBe(15500);
    expect(product!.salePrice).toBe(12900);
    expect(product!.image).toBe('https://cdn.example.com/img.jpg');
  });

  it('retorna null cuando el SKU no existe (array vacío)', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse([]));

    const product = await fetchProductBySku('NO-EXISTE', VALID_CONFIG);
    expect(product).toBeNull();
  });

  it('retorna null cuando la API responde con error 500', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse({}, 500));

    const product = await fetchProductBySku('CAM-001', VALID_CONFIG);
    expect(product).toBeNull();
  });

  it('el endpoint incluye status=publish para filtrar borradores', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse([]));

    await fetchProductBySku('CAM-001', VALID_CONFIG);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('status=publish');
  });

  it('mapea correctamente un producto sin campos opcionales', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse([MOCK_MINIMAL_PRODUCT]));

    const product = await fetchProductBySku('99', VALID_CONFIG);
    expect(product).not.toBeNull();
    expect(product!.sku).toBe('99'); // Fallback al ID cuando SKU está vacío
    expect(product!.salePrice).toBeUndefined();
    expect(product!.image).toBeUndefined();
    expect(product!.description).toBe('');
  });

  it('codifica caracteres especiales en el SKU para evitar inyección de parámetros (AC-001, AC-002)', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse([]));
    await fetchProductBySku('AB&status=draft', VALID_CONFIG);
    const calledUrl1 = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl1).toContain('sku=AB%26status%3Ddraft');
    const statusMatches = calledUrl1.match(/status=/g);
    expect(statusMatches).toHaveLength(1);

    fetchSpy.mockResolvedValueOnce(mockResponse([]));
    await fetchProductBySku('A B#1+2', VALID_CONFIG);
    const calledUrl2 = fetchSpy.mock.calls[1][0] as string;
    expect(calledUrl2).toContain('sku=A%20B%231%2B2');
  });
});

// ─── 3. fetchProductsByName ───────────────────────────────────────────────────

describe('fetchProductsByName', () => {
  it('retorna array vacío si el query tiene menos de 2 caracteres', async () => {
    const result = await fetchProductsByName('a', VALID_CONFIG);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retorna array vacío si el query está vacío', async () => {
    const result = await fetchProductsByName('', VALID_CONFIG);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retorna productos mapeados correctamente', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse([MOCK_WOO_PRODUCT]));

    const result = await fetchProductsByName('Remera', VALID_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Remera Oversize');
  });

  it('retorna array vacío si la API falla', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse({}, 500));

    const result = await fetchProductsByName('Remera', VALID_CONFIG);
    expect(result).toEqual([]);
  });

  it('codifica correctamente caracteres especiales en el query', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse([]));

    await fetchProductsByName('Camisa & Pantalón', VALID_CONFIG);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('search=Camisa%20%26%20Pantal%C3%B3n');
  });
});

// ─── 4. fetchProductsByCategory ───────────────────────────────────────────────

describe('fetchProductsByCategory (FIX-0006)', () => {
  it('AC-001: devuelve los 120 productos si hay 2 páginas (pág 1 con 100, pág 2 con 20)', async () => {
    const page1Products = Array.from({ length: 100 }, (_, i) => ({
      ...MOCK_WOO_PRODUCT,
      id: i + 1,
      sku: `PROD-${i + 1}`,
    }));
    const page2Products = Array.from({ length: 20 }, (_, i) => ({
      ...MOCK_WOO_PRODUCT,
      id: 100 + i + 1,
      sku: `PROD-${100 + i + 1}`,
    }));

    fetchSpy.mockResolvedValueOnce(
      mockResponse(page1Products, 200, { 'X-WP-TotalPages': '2' })
    );
    fetchSpy.mockResolvedValueOnce(
      mockResponse(page2Products, 200, { 'X-WP-TotalPages': '2' })
    );

    const result = await fetchProductsByCategory(5, VALID_CONFIG);
    expect(result).toHaveLength(120);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('AC-002: devuelve 100 productos y fetch se invoca una sola vez si X-WP-TotalPages es 1', async () => {
    const page1Products = Array.from({ length: 100 }, (_, i) => ({
      ...MOCK_WOO_PRODUCT,
      id: i + 1,
    }));

    fetchSpy.mockResolvedValueOnce(
      mockResponse(page1Products, 200, { 'X-WP-TotalPages': '1' })
    );

    const result = await fetchProductsByCategory(5, VALID_CONFIG);
    expect(result).toHaveLength(100);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('AC-003: asume 1 página si falta el header X-WP-TotalPages', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse([MOCK_WOO_PRODUCT]));

    const result = await fetchProductsByCategory(5, VALID_CONFIG);
    expect(result).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('AC-004: solicita URLs con page=1, page=2 y page=3, todas con category, status=publish y per_page=100', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse([MOCK_WOO_PRODUCT], 200, { 'X-WP-TotalPages': '3' })
    );
    fetchSpy.mockResolvedValueOnce(
      mockResponse([MOCK_WOO_PRODUCT], 200, { 'X-WP-TotalPages': '3' })
    );
    fetchSpy.mockResolvedValueOnce(
      mockResponse([MOCK_WOO_PRODUCT], 200, { 'X-WP-TotalPages': '3' })
    );

    await fetchProductsByCategory(42, VALID_CONFIG);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const urls = fetchSpy.mock.calls.map(call => call[0] as string);
    urls.forEach((url, idx) => {
      expect(url).toContain('category=42');
      expect(url).toContain('status=publish');
      expect(url).toContain('per_page=100');
      expect(url).toContain(`page=${idx + 1}`);
    });
  });

  it('AC-005: rechaza la promesa si la página 2 responde con error 500 y no devuelve resultado parcial', async () => {
    const page1Products = Array.from({ length: 100 }, (_, i) => ({
      ...MOCK_WOO_PRODUCT,
      id: i + 1,
    }));

    fetchSpy.mockResolvedValueOnce(
      mockResponse(page1Products, 200, { 'X-WP-TotalPages': '2' })
    );
    fetchSpy.mockResolvedValueOnce(mockResponse({ message: 'Server Error' }, 500));

    await expect(fetchProductsByCategory(5, VALID_CONFIG)).rejects.toThrow();
  });

  it('rechaza la promesa si la página 1 responde con error 500', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse({ message: 'Internal Server Error' }, 500));

    await expect(fetchProductsByCategory(1, VALID_CONFIG)).rejects.toThrow();
  });
});

// ─── 5. fetchCategories ───────────────────────────────────────────────────────

describe('fetchCategories', () => {
  it('retorna todas las categorías de una sola página', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse([MOCK_CATEGORY], 200, { 'X-WP-TotalPages': '1' })
    );

    const result = await fetchCategories(VALID_CONFIG);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Remeras');
  });

  it('pagina correctamente usando X-WP-TotalPages', async () => {
    const cat1 = { id: 1, name: 'Remeras', slug: 'remeras', count: 10 };
    const cat2 = { id: 2, name: 'Pantalones', slug: 'pantalones', count: 5 };

    // Página 1: una categoría, indica 2 páginas totales
    fetchSpy.mockResolvedValueOnce(
      mockResponse([cat1], 200, { 'X-WP-TotalPages': '2' })
    );
    // Página 2: otra categoría
    fetchSpy.mockResolvedValueOnce(
      mockResponse([cat2], 200, { 'X-WP-TotalPages': '2' })
    );

    const result = await fetchCategories(VALID_CONFIG);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Remeras');
    expect(result[1].name).toBe('Pantalones');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('detiene la paginación si una página intermedia falla', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse([MOCK_CATEGORY], 200, { 'X-WP-TotalPages': '3' })
    );
    // Página 2 falla
    fetchSpy.mockResolvedValueOnce(mockResponse({}, 500));

    const result = await fetchCategories(VALID_CONFIG);
    // Solo retorna las categorías de la primera página exitosa
    expect(result).toHaveLength(1);
  });

  it('retorna array vacío si la primera petición falla', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse({}, 500));

    const result = await fetchCategories(VALID_CONFIG);
    expect(result).toEqual([]);
  });
});

describe('fetchAllCatalogProducts (FEAT-0001)', () => {
  it('lee y pagina productos publicados ignorando variables y productos sin precio', async () => {
    const prod1 = { id: 10, sku: 'SKU-10', name: 'Prod 10', regular_price: '1500', sale_price: '', type: 'simple' };
    const prodVar = { id: 11, sku: 'SKU-VAR', name: 'Prod Var', regular_price: '0', type: 'variable' };
    const prod2 = { id: 12, sku: 'SKU-12', name: 'Prod 12', regular_price: '2500', sale_price: '2000', type: 'simple' };

    fetchSpy.mockResolvedValueOnce(
      mockResponse([prod1, prodVar], 200, { 'X-WP-TotalPages': '2' })
    );
    fetchSpy.mockResolvedValueOnce(
      mockResponse([prod2], 200, { 'X-WP-TotalPages': '2' })
    );

    const onProgress = vi.fn();
    const result = await fetchAllCatalogProducts(VALID_CONFIG, onProgress);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(10);
    expect(result[0].regularPrice).toBe(1500);
    expect(result[0].salePrice).toBeNull();

    expect(result[1].id).toBe(12);
    expect(result[1].regularPrice).toBe(2500);
    expect(result[1].salePrice).toBe(2000);

    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('lanza error si la petición HTTP falla en alguna página', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse({}, 500));

    await expect(fetchAllCatalogProducts(VALID_CONFIG)).rejects.toThrow(
      'Error al leer el catálogo de productos (página 1): 500'
    );
  });
});

// ─── sourceId de WooCommerce (FIX-0011) ───────────────────────────────────────

describe('sourceId de WooCommerce (FIX-0011)', () => {
  it('FIX-0011-BR-001: fetchProductBySku conserva el ID numérico de WooCommerce en sourceId (601) y mantiene el id de instancia como string', async () => {
    const wooProduct = {
      ...MOCK_WOO_PRODUCT,
      id: 601,
      sku: 'SRC-601',
      regular_price: '9990',
      sale_price: '',
    };
    fetchSpy.mockResolvedValueOnce(mockResponse([wooProduct]));

    const product = await fetchProductBySku('SRC-601', VALID_CONFIG);

    expect(product).not.toBeNull();
    expect(product!.sourceId).toBe(601);
    expect(typeof product!.sourceId).toBe('number');
    expect(product!.id).toBe('601');
    expect(typeof product!.id).toBe('string');
  });
});
