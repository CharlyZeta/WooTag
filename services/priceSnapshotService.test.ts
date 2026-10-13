import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  compareCatalogWithSnapshot,
  loadSnapshot,
  saveSnapshot,
  updateProductsInSnapshot,
  dismissPendingItem,
  initializeBaseline
} from './priceSnapshotService';
import { PriceSnapshotMap, Product, PricePendingItem } from '../types';
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

  it('AC-005: updateProductsInSnapshot actualiza en Firestore los productos impresos', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        entries: {
          50: { productId: 50, regularPrice: 500, salePrice: null }
        }
      })
    });

    await updateProductsInSnapshot('user-xyz', 'site-abc', [
      { id: 50, regularPrice: 650, salePrice: 600, sku: 'SKU-50', name: 'Item 50' }
    ]);

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
});
