import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import {
  compareCatalogWithSnapshot,
  loadSnapshot,
  saveSnapshot,
  updateProductsInSnapshot,
  dismissPendingItem,
  initializeBaseline,
  collectPrintedSourceIds
} from './priceSnapshotService';
import { PriceSnapshotMap, PriceSnapshotEntry, Product, PricePendingItem } from '../types';
import { CatalogProductSummary } from './wooService';

const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockDoc = vi.fn((_db: any, ...segments: string[]) => ({ path: segments.join('/') }));

vi.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => (mockDoc as any)(...args),
  getDoc: (...args: any[]) => mockGetDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
}));

vi.mock('./firebase', () => ({
  db: { name: 'mock-db' },
}));

describe('priceSnapshotService (FEAT-0001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const dummyProduct = (id: number, regularPrice: number, salePrice?: number): Product => ({
    id: String(id),
    sku: `SKU-${id}`,
    name: `Producto ${id}`,
    price: regularPrice,
    salePrice,
    description: 'Desc',
  });

  const dummySummary = (id: number, regularPrice: number, salePrice: number | null = null): CatalogProductSummary => ({
    id,
    sku: `SKU-${id}`,
    name: `Producto ${id}`,
    regularPrice,
    salePrice,
    product: dummyProduct(id, regularPrice, salePrice || undefined)
  });

  it('AC-001: detecta productos con PRICE_CHANGED cuando regularPrice o salePrice difieren del snapshot', () => {
    const snapshot: PriceSnapshotMap = {
      101: {
        productId: 101,
        sku: 'SKU-101',
        name: 'Producto 101',
        regularPrice: 1000,
        salePrice: null,
        updatedAt: 10000
      },
      102: {
        productId: 102,
        sku: 'SKU-102',
        name: 'Producto 102',
        regularPrice: 2000,
        salePrice: 1800,
        updatedAt: 10000
      }
    };

    const catalog: CatalogProductSummary[] = [
      dummySummary(101, 1500, null), // regular cambió: 1000 -> 1500
      dummySummary(102, 2000, 1500), // sale cambió: 1800 -> 1500
    ];

    const result = compareCatalogWithSnapshot(catalog, snapshot);

    expect(result.isInitialBaseline).toBe(false);
    expect(result.pendings).toHaveLength(2);

    expect(result.pendings[0].type).toBe('PRICE_CHANGED');
    expect(result.pendings[0].productId).toBe(101);
    expect(result.pendings[0].oldRegularPrice).toBe(1000);
    expect(result.pendings[0].newRegularPrice).toBe(1500);

    expect(result.pendings[1].type).toBe('PRICE_CHANGED');
    expect(result.pendings[1].productId).toBe(102);
    expect(result.pendings[1].oldSalePrice).toBe(1800);
    expect(result.pendings[1].newSalePrice).toBe(1500);
  });

  it('AC-002: detecta productos nuevos con NEW_PRODUCT si no existen en el snapshot', () => {
    const snapshot: PriceSnapshotMap = {
      101: {
        productId: 101,
        sku: 'SKU-101',
        name: 'Producto 101',
        regularPrice: 1000,
        salePrice: null,
        updatedAt: 10000
      }
    };

    const catalog: CatalogProductSummary[] = [
      dummySummary(101, 1000, null), // idéntico
      dummySummary(202, 3500, null)  // nuevo
    ];

    const result = compareCatalogWithSnapshot(catalog, snapshot);

    expect(result.pendings).toHaveLength(1);
    expect(result.pendings[0].type).toBe('NEW_PRODUCT');
    expect(result.pendings[0].productId).toBe(202);
    expect(result.pendings[0].newRegularPrice).toBe(3500);
  });

  it('AC-003: en el primer arranque (snapshot es null), genera baseline inicial con 0 pendientes', () => {
    const catalog: CatalogProductSummary[] = [
      dummySummary(1, 100),
      dummySummary(2, 200),
      dummySummary(3, 300)
    ];

    const result = compareCatalogWithSnapshot(catalog, null);

    expect(result.isInitialBaseline).toBe(true);
    expect(result.pendings).toHaveLength(0);
    expect(Object.keys(result.newSnapshot)).toHaveLength(3);
    expect(result.newSnapshot[1].regularPrice).toBe(100);
  });

  it('AC-004: descartar un pendiente actualiza el snapshot en Firestore con el precio actual', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        entries: {
          101: { productId: 101, regularPrice: 1000, salePrice: null, sku: 'SKU-101', name: 'Prod' }
        }
      })
    });

    const pendingItem: PricePendingItem = {
      productId: 101,
      sku: 'SKU-101',
      name: 'Prod',
      oldRegularPrice: 1000,
      newRegularPrice: 1300,
      newSalePrice: null,
      type: 'PRICE_CHANGED',
      product: dummyProduct(101, 1300)
    };

    await dismissPendingItem('user-xyz', 'site-abc', pendingItem);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const savedPayload = mockSetDoc.mock.calls[0][1];
    expect(savedPayload.entries[101].regularPrice).toBe(1300);
  });

  // FIX-0011: este caso (antes "AC-005" de FEAT-0001) usaba `id: 50` numérico, un formato que
  // nunca llega desde la app. Ahora usa la forma real de producción: id de instancia con sufijo
  // + sourceId numérico de WooCommerce. Es la verificación de AC-004 con id 50.
  it('FIX-0011-AC-004 (legacy FEAT-0001 AC-005 corregido): updateProductsInSnapshot escribe entries[50] con un Product de producción (id "50-…" + sourceId 50)', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        entries: {
          50: { productId: 50, regularPrice: 500, salePrice: null }
        }
      })
    });

    const result = await updateProductsInSnapshot('user-xyz', 'site-abc', [
      {
        id: '50-1729000000000-abc',
        sourceId: 50,
        regularPrice: 650,
        salePrice: 600,
        sku: 'SKU-50',
        name: 'Item 50'
      }
    ]);

    expect(result).toEqual({ updated: 1, skipped: 0 });
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const saved = mockSetDoc.mock.calls[0][1];
    expect(saved.entries[50].regularPrice).toBe(650);
    expect(saved.entries[50].salePrice).toBe(600);
  });

  it('AC-006: si el usuario no tiene uid o siteId válidos, no lanza excepción y retorna null de forma segura', async () => {
    const res = await loadSnapshot('', '');
    expect(res).toBeNull();
    expect(mockGetDoc).not.toHaveBeenCalled();

    await expect(saveSnapshot('', '', {})).resolves.not.toThrow();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  // ── FIX-0011: snapshot con IDs reales de WooCommerce (sourceId) ─────────────
  // Los IDs de instancia (`"123-1729000000000-abc"`, `"xls-…"`) nunca se convierten
  // a número: sólo `sourceId` identifica al producto en WooCommerce.

  describe('FIX-0011 — sourceId y descarte observable de IDs no numéricos', () => {
    let warnSpy: MockInstance<typeof console.warn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    /** Entrada completa del snapshot, con la forma que escribe el servicio. */
    const snapshotEntry = (
      productId: number,
      regularPrice: number,
      salePrice: number | null = null
    ): PriceSnapshotEntry => ({
      productId,
      sku: `SKU-${productId}`,
      name: `Item ${productId}`,
      regularPrice,
      salePrice,
      updatedAt: 1729000000000
    });

    /** Snapshot existente devuelto por getDoc (camino de producción). */
    const givenSnapshot = (entries: PriceSnapshotMap = {}) => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ entries })
      });
    };

    /** Producto de WooCommerce tal como lo arma la app: id de instancia + sourceId. */
    const printedWooProduct = (
      sourceId: number,
      price: number,
      overrides: Partial<Product> = {}
    ): Product => ({
      id: `${sourceId}-1729000000000-abc`,
      sourceId,
      sku: `SKU-${sourceId}`,
      name: `Item ${sourceId}`,
      price,
      description: '',
      ...overrides
    });

    /** Producto cargado desde XLS: sin sourceId y con el id prefijado. */
    const xlsProduct = (suffix: string, price: number): Product => ({
      id: `xls-${suffix}-1729000000000`,
      sku: `XLS-${suffix}`,
      name: `XLS ${suffix}`,
      price,
      description: ''
    });

    /** Payload que App.handlePrint le pasa al servicio al imprimir. */
    const toSnapshotPayload = (p: Product) => ({
      id: p.id,
      sourceId: p.sourceId,
      regularPrice: p.price,
      salePrice: p.salePrice ?? null,
      sku: p.sku,
      name: p.name
    });

    it('FIX-0011-AC-001: un pendiente con sourceId 123 se limpia de pendientes y su snapshot se actualiza con el precio impreso', async () => {
      givenSnapshot({ 123: snapshotEntry(123, 500) });

      const pending: PricePendingItem = {
        productId: 123,
        sku: 'SKU-123',
        name: 'Item 123',
        oldRegularPrice: 500,
        newRegularPrice: 650,
        newSalePrice: null,
        type: 'PRICE_CHANGED',
        product: printedWooProduct(123, 650)
      };

      // Lo que hace App.handlePrint: calcula el set y filtra pendientes con él.
      const printed = [printedWooProduct(123, 650)];
      const printedSourceIds = collectPrintedSourceIds(printed);
      expect(printedSourceIds.has(123)).toBe(true);

      const stillPending = [pending].filter(item => !printedSourceIds.has(item.productId));
      expect(stillPending).toHaveLength(0);

      const result = await updateProductsInSnapshot(
        'user-xyz',
        'site-abc',
        printed.map(toSnapshotPayload)
      );

      expect(result).toEqual({ updated: 1, skipped: 0 });
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const saved = mockSetDoc.mock.calls[0][1];
      expect(saved.entries[123].regularPrice).toBe(650);
      expect(saved.entries[123].salePrice).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('FIX-0011-AC-002: una hoja cargada desde XLS (sin sourceId, id "xls-…") no lanza excepción, no escribe en Firestore y devuelve { updated: 0, skipped: 1 }', async () => {
      givenSnapshot({});
      const xls = xlsProduct('ABC', 999);

      const result = await updateProductsInSnapshot(
        'user-xyz',
        'site-abc',
        [toSnapshotPayload(xls)]
      );

      expect(result).toEqual({ updated: 0, skipped: 1 });
      expect(mockSetDoc).not.toHaveBeenCalled();

      // El descarte no deja claves NaN en ningún payload escrito.
      expect(mockSetDoc.mock.calls.flatMap(call => Object.keys(call[1]?.entries ?? {})))
        .not.toContain('NaN');
    });

    it('FIX-0011-AC-003: con sólo IDs no numéricos devuelve { updated: 0, skipped: 3 } y emite console.warn exactamente una vez', async () => {
      givenSnapshot({});

      const result = await updateProductsInSnapshot('user-xyz', 'site-abc', [
        { id: 'xls-A-1729000000000', regularPrice: 100 },
        { id: 'xls-B-1729000000000', regularPrice: 200 },
        { id: 'manual-1729000000000', regularPrice: 300 }
      ]);

      expect(result).toEqual({ updated: 0, skipped: 3 });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('3');
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('FIX-0011-AC-004: un Product con sourceId 123 e id "123-…" escribe entries[123] y devuelve { updated: 1, skipped: 0 }', async () => {
      givenSnapshot({ 123: snapshotEntry(123, 100) });

      const result = await updateProductsInSnapshot('user-xyz', 'site-abc', [
        {
          id: '123-1729000000000-abc',
          sourceId: 123,
          regularPrice: 870,
          salePrice: 799,
          sku: 'SKU-123',
          name: 'Item 123'
        }
      ]);

      expect(result).toEqual({ updated: 1, skipped: 0 });
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const saved = mockSetDoc.mock.calls[0][1];
      expect(saved.entries[123].regularPrice).toBe(870);
      expect(saved.entries[123].salePrice).toBe(799);
      expect(saved.entries[123].productId).toBe(123);
    });

    it('FIX-0011-AC-005: en una hoja mixta sólo se actualiza la entrada del producto Woo, el producto XLS se omite y el set de impresos es exactamente {123}', async () => {
      givenSnapshot({ 123: snapshotEntry(123, 500) });

      const printed = [printedWooProduct(123, 650), xlsProduct('ABC', 999)];

      const printedSourceIds = collectPrintedSourceIds(printed);
      expect([...printedSourceIds]).toEqual([123]);

      // Un pendiente ajeno a la hoja no se toca.
      const otherPending: PricePendingItem = {
        productId: 777,
        sku: 'SKU-777',
        name: 'Item 777',
        newRegularPrice: 10,
        type: 'NEW_PRODUCT',
        product: printedWooProduct(777, 10)
      };
      expect([otherPending].filter(item => !printedSourceIds.has(item.productId))).toHaveLength(1);

      const result = await updateProductsInSnapshot(
        'user-xyz',
        'site-abc',
        printed.map(toSnapshotPayload)
      );

      expect(result).toEqual({ updated: 1, skipped: 1 });
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const saved = mockSetDoc.mock.calls[0][1];
      expect(Object.keys(saved.entries)).toEqual(['123']);
      expect(saved.entries[123].regularPrice).toBe(650);
      expect(saved.entries).not.toHaveProperty('NaN');
    });

    it('FIX-0011-AC-006: collectPrintedSourceIds devuelve sólo sourceId numéricos finitos ({123}) y nunca NaN', () => {
      const nanSourceId: Product = { ...printedWooProduct(1, 10), sourceId: NaN };

      const ids = collectPrintedSourceIds([
        xlsProduct('ABC', 10),
        nanSourceId,
        { ...printedWooProduct(2, 20), sourceId: undefined },
        printedWooProduct(123, 650)
      ]);

      expect([...ids]).toEqual([123]);
      expect(ids.size).toBe(1);
      expect(ids.has(NaN)).toBe(false);
      [...ids].forEach(id => expect(Number.isFinite(id)).toBe(true));
    });

    it('FIX-0011-BR-002: al omitir un ID no numérico emite console.warn y no escribe ninguna clave NaN en el snapshot guardado', async () => {
      givenSnapshot({ 123: snapshotEntry(123, 500) });

      const result = await updateProductsInSnapshot('user-xyz', 'site-abc', [
        {
          id: '123-1729000000000-abc',
          sourceId: 123,
          regularPrice: 700,
          salePrice: null,
          sku: 'SKU-123',
          name: 'Item 123'
        },
        { id: 'xls-ABC-1729000000000', regularPrice: 999, sku: 'XLS-ABC', name: 'XLS ABC' }
      ]);

      expect(result).toEqual({ updated: 1, skipped: 1 });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toMatch(/omitido/i);

      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const savedEntries = mockSetDoc.mock.calls[0][1].entries;
      expect(Object.keys(savedEntries)).toEqual(['123']);
      expect(savedEntries).not.toHaveProperty('NaN');
      Object.values(savedEntries).forEach(entry => {
        expect(Number.isFinite((entry as PriceSnapshotEntry).productId)).toBe(true);
      });
      expect(JSON.stringify(savedEntries)).not.toContain('"productId":null');
    });
  });
});
