import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { PriceSnapshotMap, PricePendingItem, Product } from '../types';
import { CatalogProductSummary } from './wooService';

/**
 * Devuelve la referencia al documento del snapshot para el usuario y tienda específica.
 * Ruta: users/{uid}/snapshots/{siteId}
 */
export const getSnapshotDocRef = (uid: string, siteId: string) => {
  return doc(db, 'users', uid, 'snapshots', siteId);
};

/** Ventana de frescura de la auditoría de precios (FIX-0014). */
export const PRICE_AUDIT_TTL_MS = 15 * 60 * 1000;

/** Estado completo del documento de snapshot, incluida la marca de última auditoría. */
export interface PriceSnapshotState {
  entries: PriceSnapshotMap | null;
  updatedAt: number | null;
  lastAuditAt: number | null;
}

/** Estado vacío reutilizable cuando faltan ids o el documento no existe. */
const EMPTY_SNAPSHOT_STATE: PriceSnapshotState = {
  entries: null,
  updatedAt: null,
  lastAuditAt: null
};

/**
 * Carga el estado del snapshot de precios almacenado en Firestore.
 * Retorna un estado vacío si faltan ids o no existe documento previo.
 * BR-001 / BR-002 (FIX-0014): expone `updatedAt` y `lastAuditAt` para decidir frescura.
 */
export const loadSnapshotState = async (uid: string, siteId: string): Promise<PriceSnapshotState> => {
  if (!uid || !siteId) return { ...EMPTY_SNAPSHOT_STATE };
  const snapRef = getSnapshotDocRef(uid, siteId);
  const snap = await getDoc(snapRef);
  if (!snap.exists()) return { ...EMPTY_SNAPSHOT_STATE };
  const data = snap.data();
  // BR-001: sólo marcas numéricas finitas cuentan como frescura válida.
  const rawUpdatedAt: unknown = data?.updatedAt;
  const rawLastAuditAt: unknown = data?.lastAuditAt;
  return {
    entries: (data?.entries as PriceSnapshotMap) || null,
    updatedAt: typeof rawUpdatedAt === 'number' && Number.isFinite(rawUpdatedAt) ? rawUpdatedAt : null,
    lastAuditAt: typeof rawLastAuditAt === 'number' && Number.isFinite(rawLastAuditAt) ? rawLastAuditAt : null
  };
};

/**
 * Carga el snapshot de precios almacenado en Firestore.
 * Retorna null si no existe ningún documento previo.
 */
export const loadSnapshot = async (uid: string, siteId: string): Promise<PriceSnapshotMap | null> => {
  return (await loadSnapshotState(uid, siteId)).entries;
};

/**
 * Marca la última auditoría sin reescribir las entradas del snapshot (BR-004).
 * Usa `setDoc` con merge: no falla si el documento todavía no existe.
 */
export const markAuditRun = async (uid: string, siteId: string): Promise<void> => {
  if (!uid || !siteId) return;
  await setDoc(getSnapshotDocRef(uid, siteId), { lastAuditAt: Date.now() }, { merge: true });
};

/** BR-002: decisión pura de "¿corresponde auditar?" (testeable sin montar App). */
export const shouldRunPriceAudit = (params: {
  force?: boolean;
  lastAuditAt: number | null | undefined;
  now?: number;
  ttlMs?: number;
}): boolean => {
  const { force = false, lastAuditAt, now = Date.now(), ttlMs = PRICE_AUDIT_TTL_MS } = params;
  // BR-003 / AC-002: el botón del modal siempre fuerza la descarga completa.
  if (force) return true;
  // AC-003: sin marca válida siempre corresponde auditar.
  if (typeof lastAuditAt !== 'number' || !Number.isFinite(lastAuditAt)) return true;
  return now - lastAuditAt >= ttlMs;
};

/** Texto de antigüedad para el modal (AC-005). */
export const formatAuditAge = (lastAuditAt: number, now: number = Date.now()): string => {
  const elapsedMs = Math.max(0, now - lastAuditAt);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  if (totalSeconds < 60) return 'recién';
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `hace ${Math.max(1, totalMinutes)} min`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `hace ${totalHours} h`;
  return `hace ${Math.floor(totalHours / 24)} d`;
};

/**
 * Guarda o sobrescribe el mapa completo de snapshot en Firestore.
 */
export const saveSnapshot = async (uid: string, siteId: string, snapshot: PriceSnapshotMap): Promise<void> => {
  if (!uid || !siteId) return;
  const snapRef = getSnapshotDocRef(uid, siteId);
  await setDoc(snapRef, {
    siteId,
    entries: snapshot,
    updatedAt: Date.now()
  }, { merge: true });
};

/**
 * Compara los productos publicados del catálogo contra el snapshot guardado.
 * Implementa las reglas BR-002, BR-004 y los criterios AC-001, AC-002, AC-003.
 */
export const compareCatalogWithSnapshot = (
  catalog: CatalogProductSummary[],
  snapshot: PriceSnapshotMap | null
): {
  pendings: PricePendingItem[];
  newSnapshot: PriceSnapshotMap;
  isInitialBaseline: boolean;
} => {
  // BR-002 / AC-003: Primer arranque (sin snapshot previo).
  // Se genera el baseline con todos los productos actuales sin falsos positivos de pendientes.
  if (snapshot === null) {
    const initialMap: PriceSnapshotMap = {};
    const now = Date.now();
    for (const item of catalog) {
      initialMap[item.id] = {
        productId: item.id,
        sku: item.sku,
        name: item.name,
        regularPrice: item.regularPrice,
        salePrice: item.salePrice,
        updatedAt: now
      };
    }
    return {
      pendings: [],
      newSnapshot: initialMap,
      isInitialBaseline: true
    };
  }

  const pendings: PricePendingItem[] = [];
  const updatedMap: PriceSnapshotMap = { ...snapshot };

  for (const item of catalog) {
    const existing = snapshot[item.id];

    if (!existing) {
      // AC-002: Producto nuevo en el catálogo que no existía en el snapshot
      pendings.push({
        productId: item.id,
        sku: item.sku,
        name: item.name,
        image: item.product.image,
        newRegularPrice: item.regularPrice,
        newSalePrice: item.salePrice,
        type: 'NEW_PRODUCT',
        product: item.product
      });
    } else {
      // AC-001: Producto existente con cambio en regular_price o sale_price
      const regularChanged = existing.regularPrice !== item.regularPrice;
      const saleChanged = (existing.salePrice ?? null) !== (item.salePrice ?? null);

      if (regularChanged || saleChanged) {
        pendings.push({
          productId: item.id,
          sku: item.sku,
          name: item.name,
          image: item.product.image,
          oldRegularPrice: existing.regularPrice,
          newRegularPrice: item.regularPrice,
          oldSalePrice: existing.salePrice,
          newSalePrice: item.salePrice,
          type: 'PRICE_CHANGED',
          product: item.product
        });
      }
    }
  }

  return {
    pendings,
    newSnapshot: updatedMap,
    isInitialBaseline: false
  };
};

/**
 * Inicializa el baseline inicial de una tienda guardándolo en Firestore.
 */
export const initializeBaseline = async (
  uid: string,
  siteId: string,
  catalog: CatalogProductSummary[]
): Promise<PriceSnapshotMap> => {
  const { newSnapshot } = compareCatalogWithSnapshot(catalog, null);
  await saveSnapshot(uid, siteId, newSnapshot);
  return newSnapshot;
};

/**
 * Actualiza en el snapshot de Firestore los precios de los productos seleccionados
 * (utilizado al imprimir etiquetas o al descartar ítems).
 * Implementa AC-004 y AC-005.
 */
export const updateProductsInSnapshot = async (
  uid: string,
  siteId: string,
  products: Array<{
    id: number | string;
    /** ID numérico real de WooCommerce; si falta se intenta con `id`. */
    sourceId?: number;
    regularPrice: number;
    salePrice?: number | null;
    sku?: string;
    name?: string;
  }>
): Promise<{ updated: number; skipped: number }> => {
  if (!uid || !siteId || products.length === 0) return { updated: 0, skipped: 0 };

  const currentSnapshot = (await loadSnapshot(uid, siteId)) || {};
  const now = Date.now();
  let updated = 0;
  let skipped = 0;

  for (const p of products) {
    // BR-001 / BR-005: el ID de instancia (string con sufijo) no es un ID de WooCommerce.
    const numId = Number(p.sourceId ?? p.id);
    // BR-002: se descarta sin escribir claves NaN.
    if (!Number.isFinite(numId)) {
      skipped++;
      continue;
    }
    currentSnapshot[numId] = {
      productId: numId,
      sku: p.sku || currentSnapshot[numId]?.sku || String(p.id),
      name: p.name || currentSnapshot[numId]?.name || '',
      regularPrice: p.regularPrice,
      salePrice: p.salePrice ?? null,
      updatedAt: now
    };
    updated++;
  }

  // BR-002: rastro observable del descarte, sin lanzar excepción.
  if (skipped > 0) {
    console.warn(`[WooTag] Snapshot de precios: ${skipped} producto(s) omitido(s) por no tener ID numérico de WooCommerce.`);
  }

  // Sin entradas actualizadas no hace falta escribir en Firestore.
  if (updated === 0) return { updated, skipped };

  await saveSnapshot(uid, siteId, currentSnapshot);
  return { updated, skipped };
};

/**
 * Conjunto de IDs numéricos de WooCommerce presentes en la lista a imprimir.
 * BR-005: la limpieza de pendientes usa solo IDs reales, nunca Number(instanceId).
 */
export const collectPrintedSourceIds = (products: Product[]): Set<number> => {
  const ids = new Set<number>();
  for (const p of products) {
    if (typeof p.sourceId === 'number' && Number.isFinite(p.sourceId)) ids.add(p.sourceId);
  }
  return ids;
};

/**
 * Descarta un pendiente individual, actualizando el snapshot con su precio actual.
 * Implementa AC-004.
 */
export const dismissPendingItem = async (
  uid: string,
  siteId: string,
  item: PricePendingItem
): Promise<void> => {
  await updateProductsInSnapshot(uid, siteId, [{
    id: item.productId,
    sku: item.sku,
    name: item.name,
    regularPrice: item.newRegularPrice,
    salePrice: item.newSalePrice
  }]);
};
