/**
 * services/priceAuditScheduling.test.ts — FIX-0014
 *
 * Cubre la programación de la auditoría de precios: TTL único (BR-001), decisión
 * pura (BR-002), refresco forzado (BR-003), persistencia de la marca sin tocar
 * `entries` (BR-004), regresión de `loadSnapshot` (BR-007) y el cableado real en
 * `App.tsx` (AC-002, BR-006).
 *
 * Mecanismos:
 * - Unit tests puros sobre `shouldRunPriceAudit` / `formatAuditAge` con un reloj
 *   fijo explícito (nunca `Date.now()` real), igual que en
 *   `priceSnapshotService.test.ts`.
 * - `firebase/firestore` y `./firebase` mockeados con `mockGetDoc`/`mockSetDoc`
 *   (misma convención que `services/priceSnapshotService.test.ts`): no hay red.
 * - AC-002 (cableado) y BR-006 se verifican leyendo `App.tsx` del disco con
 *   `node:fs` y afirmando sobre el código fuente (misma convención que
 *   `utils/cloudWriteBatcher.test.ts` y `tests/noCompanionFlow.test.ts`). No se
 *   monta `App` ni se mockea su árbol de dependencias.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  PRICE_AUDIT_TTL_MS,
  formatAuditAge,
  loadSnapshot,
  loadSnapshotState,
  markAuditRun,
  shouldRunPriceAudit
} from './priceSnapshotService';

// ─── Mocks (sin red) ─────────────────────────────────────────────────────────

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

// ─── Reloj fijo de referencia ────────────────────────────────────────────────
// Ningún test depende del reloj real: `shouldRunPriceAudit` y `formatAuditAge`
// reciben `now` de forma explícita.
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('FIX-0014 — decisión "¿corresponde auditar?" (BR-001, BR-002, BR-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('FIX-0014-AC-001: con lastAuditAt hace 5 min y force=false no corresponde auditar (false)', () => {
    const lastAuditAt = NOW - 5 * MINUTE;

    const decision = shouldRunPriceAudit({ force: false, lastAuditAt, now: NOW });

    expect(decision).toBe(false);
  });

  it('FIX-0014-AC-001: la salida temprana por frescura ocurre antes de fetchAllCatalogProducts en App.tsx (no se descarga el catálogo)', () => {
    // AC-001 exige que, además de devolver `false`, no se ejecute la descarga
    // completa. Se afirma sobre el cableado real de `App.tsx`.
    const guardIndex = appSource.search(
      /if\s*\(\s*!\s*shouldRunPriceAudit\(\s*\{[^}]*force[^}]*lastAuditAt[^}]*\}\s*\)\s*\)\s*return;/
    );
    const fetchIndex = appSource.indexOf('fetchAllCatalogProducts(');

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(fetchIndex).toBeGreaterThanOrEqual(0);
    // Hay una sola descarga completa en toda la app y siempre está después de la
    // guarda de frescura (que hace `return` antes de llegar al request).
    expect(appSource.split('fetchAllCatalogProducts(').length - 1).toBe(1);
    expect(guardIndex).toBeLessThan(fetchIndex);
  });

  it('FIX-0014-AC-002: con force=true la decisión es auditar aunque la marca sea de hace 1 segundo (true)', () => {
    const lastAuditAt = NOW - 1000;

    const decision = shouldRunPriceAudit({ force: true, lastAuditAt, now: NOW });

    expect(decision).toBe(true);
  });

  it('FIX-0014-AC-002: force=true gana incluso sin marca y con el TTL agotado (BR-003)', () => {
    expect(shouldRunPriceAudit({ force: true, lastAuditAt: null, now: NOW })).toBe(true);
    expect(shouldRunPriceAudit({ force: true, lastAuditAt: NOW - 10 * HOUR, now: NOW })).toBe(true);
  });

  it('FIX-0014-AC-003: un lastAuditAt más viejo que PRICE_AUDIT_TTL_MS corresponde auditar (true)', () => {
    const lastAuditAt = NOW - PRICE_AUDIT_TTL_MS - 1;

    const decision = shouldRunPriceAudit({ force: false, lastAuditAt, now: NOW });

    expect(decision).toBe(true);
  });

  it('FIX-0014-AC-003: sin marca válida (null, undefined, NaN) siempre corresponde auditar (true)', () => {
    const invalidMarks: Array<number | null | undefined> = [null, undefined, NaN];

    for (const lastAuditAt of invalidMarks) {
      expect(shouldRunPriceAudit({ force: false, lastAuditAt, now: NOW })).toBe(true);
    }
  });

  it('FIX-0014-AC-003: en el límite exacto (now - lastAuditAt === PRICE_AUDIT_TTL_MS) corresponde auditar (true)', () => {
    const lastAuditAt = NOW - PRICE_AUDIT_TTL_MS;

    expect(shouldRunPriceAudit({ force: false, lastAuditAt, now: NOW })).toBe(true);
    // Un milisegundo antes del TTL todavía está fresco: el borde es cerrado.
    expect(shouldRunPriceAudit({ force: false, lastAuditAt: lastAuditAt + 1, now: NOW })).toBe(false);
  });

  it('FIX-0014-BR-001: PRICE_AUDIT_TTL_MS es un valor único exportado de 15 minutos', () => {
    expect(typeof PRICE_AUDIT_TTL_MS).toBe('number');
    expect(PRICE_AUDIT_TTL_MS).toBe(15 * MINUTE);
  });

  it('FIX-0014-AC-006: cinco cargas de la app dentro del TTL ejecutan una sola descarga completa', () => {
    // Simulación de 5 "app loads" con reloj fijo: cada carga decide, y sólo una
    // auditoría ejecutada persiste la marca (lo que hace `markAuditRun`).
    const LOADS = 5;
    const MS_BETWEEN_LOADS = PRICE_AUDIT_TTL_MS / 5; // 3 min: 4 cargas = 12 min < 15 min
    let clock = NOW;
    let lastAuditAt: number | null = null;
    let fullCatalogDownloads = 0;
    const decisions: boolean[] = [];

    for (let load = 0; load < LOADS; load += 1) {
      const shouldAudit = shouldRunPriceAudit({ force: false, lastAuditAt, now: clock });
      decisions.push(shouldAudit);

      if (shouldAudit) {
        fullCatalogDownloads += 1;
        // BR-004: la auditoría exitosa persiste la marca (equivalente a markAuditRun).
        lastAuditAt = clock;
      }

      clock += MS_BETWEEN_LOADS;
    }

    expect(decisions).toEqual([true, false, false, false, false]);
    expect(fullCatalogDownloads).toBe(1);

    // Pasado el TTL, la siguiente carga vuelve a auditar (la marca no es eterna).
    expect(shouldRunPriceAudit({ force: false, lastAuditAt, now: NOW + PRICE_AUDIT_TTL_MS })).toBe(true);
  });

  it('FIX-0014-AC-006: las cargas forzadas por el usuario se suman a la única automática', () => {
    let fullCatalogDownloads = 2; // 1 automática (primera) + 2 forzadas
    const lastAuditAt = NOW - MINUTE; // snapshot fresco

    // El arranque automático no descarga porque el snapshot está fresco...
    expect(shouldRunPriceAudit({ force: false, lastAuditAt, now: NOW })).toBe(false);
    // ...pero el botón del modal fuerza la descarga completa.
    expect(shouldRunPriceAudit({ force: true, lastAuditAt, now: NOW })).toBe(true);

    fullCatalogDownloads += 1;
    expect(fullCatalogDownloads).toBe(3);
  });
});

describe('FIX-0014 — estado del snapshot y marca de auditoría (AC-004, BR-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('FIX-0014-AC-004: loadSnapshotState devuelve entries, updatedAt y lastAuditAt del documento', async () => {
    const entries = {
      101: {
        productId: 101,
        sku: 'SKU-101',
        name: 'Producto 101',
        regularPrice: 1000,
        salePrice: null,
        updatedAt: NOW - HOUR
      }
    };
    const updatedAt = NOW - 2 * HOUR;
    const lastAuditAt = NOW - 5 * MINUTE;

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ entries, updatedAt, lastAuditAt })
    });

    const state = await loadSnapshotState('user-xyz', 'site-abc');

    expect(state).toEqual({ entries, updatedAt, lastAuditAt });
    // El documento consultado es users/{uid}/snapshots/{siteId}.
    expect(mockDoc.mock.calls[0].slice(1)).toEqual(['users', 'user-xyz', 'snapshots', 'site-abc']);
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });

  it('FIX-0014-AC-004: un documento sin lastAuditAt devuelve lastAuditAt: null', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ entries: {}, updatedAt: NOW - HOUR })
    });

    const state = await loadSnapshotState('user-xyz', 'site-abc');

    expect(state.lastAuditAt).toBeNull();
    expect(state.updatedAt).toBe(NOW - HOUR);
    expect(state.entries).toEqual({});
  });

  it('FIX-0014-AC-004: un documento inexistente devuelve el estado vacío sin romper el flujo', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined });

    const state = await loadSnapshotState('user-xyz', 'site-abc');

    expect(state).toEqual({ entries: null, updatedAt: null, lastAuditAt: null });
  });

  it('FIX-0014-AC-004: markAuditRun escribe sólo { lastAuditAt } con merge:true y nunca entries (BR-004)', async () => {
    mockSetDoc.mockResolvedValueOnce(undefined);

    await markAuditRun('user-xyz', 'site-abc');

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [docRef, payload, options] = mockSetDoc.mock.calls[0];

    // Ruta del snapshot: users/{uid}/snapshots/{siteId}.
    expect((docRef as { path: string }).path).toBe('users/user-xyz/snapshots/site-abc');
    // BR-004: sólo la marca; los pendientes (entries) no se reescriben.
    expect(Object.keys(payload)).toEqual(['lastAuditAt']);
    expect(payload).not.toHaveProperty('entries');
    expect(payload).not.toHaveProperty('updatedAt');
    expect(typeof payload.lastAuditAt).toBe('number');
    expect(Number.isFinite(payload.lastAuditAt)).toBe(true);
    // Sin merge:true un documento nuevo perdería el resto del estado.
    expect(options).toEqual({ merge: true });
  });

  it('FIX-0014-AC-004: markAuditRun con ids inválidos no escribe nada', async () => {
    await markAuditRun('', 'site-abc');
    await markAuditRun('user-xyz', '');

    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

describe('FIX-0014 — regresión del contrato de loadSnapshot (BR-007)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('FIX-0014-BR-007: loadSnapshot sigue devolviendo sólo las entries (delegación sobre loadSnapshotState)', async () => {
    const entries = {
      7: {
        productId: 7,
        sku: 'SKU-7',
        name: 'Producto 7',
        regularPrice: 500,
        salePrice: 450,
        updatedAt: NOW - HOUR
      }
    };

    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ entries, updatedAt: NOW - HOUR, lastAuditAt: NOW - MINUTE })
    });

    const snapshot = await loadSnapshot('user-xyz', 'site-abc');

    // El contrato viejo (FEAT-0001) no cambia: un mapa de entradas, no el estado.
    expect(snapshot).toEqual(entries);
    expect(snapshot).not.toHaveProperty('lastAuditAt');
    expect(snapshot).not.toHaveProperty('updatedAt');
  });

  it('FIX-0014-BR-007: loadSnapshot con ids vacíos devuelve null sin llamar a getDoc', async () => {
    await expect(loadSnapshot('', '')).resolves.toBeNull();
    await expect(loadSnapshot('user-xyz', '')).resolves.toBeNull();
    await expect(loadSnapshot('', 'site-abc')).resolves.toBeNull();

    expect(mockGetDoc).not.toHaveBeenCalled();
  });
});

describe('FIX-0014 — antigüedad legible en el modal (AC-005: formatAuditAge)', () => {
  it("FIX-0014-AC-005: formatAuditAge devuelve 'recién' por debajo de 60 segundos", () => {
    expect(formatAuditAge(NOW, NOW)).toBe('recién');
    expect(formatAuditAge(NOW - 59 * 1000, NOW)).toBe('recién');
    expect(formatAuditAge(NOW - 1000, NOW)).toBe('recién');
  });

  it("FIX-0014-AC-005: formatAuditAge devuelve 'hace 5 min' para una auditoría de 5 minutos", () => {
    expect(formatAuditAge(NOW - 5 * MINUTE, NOW)).toBe('hace 5 min');
    expect(formatAuditAge(NOW - 60 * 1000, NOW)).toBe('hace 1 min');
    expect(formatAuditAge(NOW - 59 * MINUTE, NOW)).toBe('hace 59 min');
  });

  it("FIX-0014-AC-005: formatAuditAge devuelve 'hace 2 h' para una auditoría de 2 horas", () => {
    expect(formatAuditAge(NOW - 2 * HOUR, NOW)).toBe('hace 2 h');
    expect(formatAuditAge(NOW - 60 * MINUTE, NOW)).toBe('hace 1 h');
  });

  it("FIX-0014-AC-005: formatAuditAge devuelve 'hace 3 d' para una auditoría de 3 días", () => {
    expect(formatAuditAge(NOW - 3 * DAY, NOW)).toBe('hace 3 d');
    expect(formatAuditAge(NOW - 24 * HOUR, NOW)).toBe('hace 1 d');
  });
});

// ─── AC-002 / BR-006: cableado verificado sobre App.tsx ──────────────────────
// Mecanismo: source assertion con `node:fs` (misma convención que
// `utils/cloudWriteBatcher.test.ts` y `tests/noCompanionFlow.test.ts`).
// `import.meta.url` no es fiable bajo el transform de Vite, así que se sube
// desde el cwd buscando los marcadores del repositorio.

function findRepoRoot(start: string): string {
  let current = resolve(start);
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(current, 'package.json')) && existsSync(join(current, 'App.tsx'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`No se pudo localizar la raíz del repositorio desde ${start}`);
}

const ROOT = findRepoRoot(process.cwd());
const APP_PATH = join(ROOT, 'App.tsx');
const appSource = readFileSync(APP_PATH, 'utf-8');

/** Índice del cierre balanceado de `openIndex` contando `open`/`close`. */
function findClosingIndex(source: string, openIndex: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`No se encontró el cierre balanceado de '${open}' en el índice ${openIndex}`);
}

/** Bloque JSX `<PriceAuditModal … />` completo, tal como está cableado en App. */
function extractModalBlock(source: string): string {
  const start = source.indexOf('<PriceAuditModal');
  if (start < 0) throw new Error('No se encontró <PriceAuditModal en App.tsx');
  const end = source.indexOf('/>', start);
  if (end < 0) throw new Error('No se encontró el cierre /> de <PriceAuditModal');
  return source.slice(start, end + 2);
}

/** Llamada `useEffect(…)` completa que contiene `marker`, con su body y deps. */
function extractEffectAround(source: string, marker: string): { call: string; body: string; deps: string[] } {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`No se encontró '${marker}' en App.tsx`);

  const effectStart = source.lastIndexOf('useEffect(', markerIndex);
  if (effectStart < 0) throw new Error(`No se encontró el useEffect que contiene '${marker}'`);

  const openParen = effectStart + 'useEffect'.length;
  const closeParen = findClosingIndex(source, openParen, '(', ')');
  const call = source.slice(effectStart, closeParen + 1);

  const depsOpen = call.lastIndexOf('[');
  const depsClose = call.lastIndexOf(']');
  if (depsOpen < 0 || depsClose < depsOpen) throw new Error('El useEffect no tiene arreglo de dependencias');
  const deps = call
    .slice(depsOpen + 1, depsClose)
    .split(',')
    .map(dep => dep.trim())
    .filter(Boolean);

  return { call, body: call.slice(0, depsOpen), deps };
}

describe('FIX-0014 AC-002 / BR-006 — cableado en App.tsx (source assertion)', () => {
  it('FIX-0014-AC-002: <PriceAuditModal> recibe onRefreshAudit={() => runPriceAudit(true)} y lastAuditAt={priceAuditAt}', () => {
    const modalBlock = extractModalBlock(appSource);

    // El botón "Actualizar" del modal fuerza la descarga completa (BR-003).
    expect(modalBlock).toMatch(/onRefreshAudit=\{\(\)\s*=>\s*runPriceAudit\(true\)\}/);
    // La frescura visible en el modal sale de la marca de la última auditoría.
    expect(modalBlock).toMatch(/lastAuditAt=\{priceAuditAt\}/);
  });

  it('FIX-0014-AC-002: runPriceAudit(true) persiste la marca al terminar (setPriceAuditAt + markAuditRun)', () => {
    // La auditoría forzada termina persistiendo lastAuditAt (AC-002: "y se actualiza lastAuditAt").
    const markIndex = appSource.indexOf('await markAuditRun(currentUser.uid, currentSiteId)');
    const setIndex = appSource.indexOf('setPriceAuditAt(Date.now())');

    expect(markIndex).toBeGreaterThanOrEqual(0);
    expect(setIndex).toBeGreaterThan(markIndex);
    expect(appSource.slice(markIndex, setIndex + 'setPriceAuditAt(Date.now())'.length)).toMatch(
      /markAuditRun[\s\S]*setPriceAuditAt\(Date\.now\(\)\)/
    );
  });

  it('FIX-0014-AC-002: el efecto automático llama runPriceAudit(false) y runPriceAudit figura en sus dependencias (BR-006)', () => {
    const { body, deps } = extractEffectAround(appSource, 'runPriceAudit(false)');

    // Arranque automático: nunca fuerza la descarga (eso es sólo del botón).
    expect(body).toMatch(/runPriceAudit\(false\)/);
    expect(body).not.toMatch(/runPriceAudit\(true\)/);

    // BR-006: la dependencia evita el closure con valores viejos.
    expect(deps).toContain('runPriceAudit');
    // El efecto no depende de identidades reconstruidas de `session` completo
    // (sólo `session?.config?.url`, que es un string estable).
    expect(deps).not.toContain('session');
  });
});
