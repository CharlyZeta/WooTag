/**
 * cloudWriteBatcher.test.ts — FIX-0013
 *
 * Cubre el escritor único con debounce que agrupa `tagConfig` y `designProfiles`
 * en un solo `setDoc` por ventana (BR-001, BR-003, BR-004, BR-005).
 *
 * El módulo es puro y no depende de montar `App` (BR-005), así que las AC-001 a
 * AC-004 se verifican con `vi.useFakeTimers()`.
 *
 * AC-005 (BR-002/BR-004) es una verificación de *cableado*: se lee `App.tsx`
 * desde el disco (`node:fs`) y se afirma sobre el código fuente que el
 * `localStorage` se escribe de forma inmediata (fuera de todo `if`/debounce) y
 * que las escrituras remotas están guardadas por `currentUser && isCloudProfileLoaded`.
 * Mecanismo: aserción de código fuente (source assertion), sin renderizar la app.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { attachVisibilityFlush, createCloudWriteBatcher } from './cloudWriteBatcher';

// ─── Tipos de apoyo ─────────────────────────────────────────────────────────

/** Mismo payload que agrupa `App.tsx`: ambos campos viajan en un único `setDoc`. */
type SyncPayload = {
  tagConfig?: Record<string, unknown>;
  designProfiles?: Record<string, unknown>[];
};

// ─── Raíz del repositorio ───────────────────────────────────────────────────
// `import.meta.url` no es fiable bajo el transform de Vite (igual que en el
// resto de la suite), así que se sube desde el cwd buscando los marcadores.

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

// ─── Utilidades de inspección de fuente (JS plano, sin parser) ───────────────

/** Índice de la llave `}` que cierra la llave `{` ubicada en `openIndex`. */
function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('No se encontró la llave de cierre en App.tsx');
}

/** Profundidad de bloques `{}` en `index` (0 = sentencia de nivel superior). */
function braceDepthAt(source: string, index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
  }
  return depth;
}

/**
 * Devuelve el cuerpo del `useEffect(() => { … }, [<firstDep>, …])` cuyo primer
 * elemento del array de dependencias es `firstDep`.
 */
function findEffectBody(source: string, firstDep: string): string {
  for (const head of source.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{/g)) {
    const openIndex = (head.index ?? 0) + head[0].length - 1;
    const closeIndex = findMatchingBrace(source, openIndex);
    const tail = source.slice(closeIndex, closeIndex + 160);
    const deps = tail.match(/^\s*\}\s*,\s*\[([\s\S]*?)\]/);
    if (!deps) continue;
    const names = deps[1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    if (names[0] === firstDep) return source.slice(openIndex + 1, closeIndex);
  }
  throw new Error(`No se encontró el useEffect con dependencia inicial "${firstDep}"`);
}

// ─── Doble de `document` para AC-004 ────────────────────────────────────────
// Stub mínimo escrito a mano (EventTarget-like): `visibilityState` mutable y
// registro/despacho síncrono de listeners, sin depender de jsdom.

interface FakeVisibilityDocument {
  visibilityState: DocumentVisibilityState;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  dispatch: (type: string) => void;
}

function createFakeDocument(): FakeVisibilityDocument {
  const listeners = new Set<() => void>();
  const fakeDoc: FakeVisibilityDocument = {
    visibilityState: 'visible',
    addEventListener: (type, listener) => {
      if (type === 'visibilitychange') listeners.add(listener);
    },
    removeEventListener: (type, listener) => {
      if (type === 'visibilitychange') listeners.delete(listener);
    },
    dispatch: (type) => {
      if (type !== 'visibilitychange') return;
      for (const listener of [...listeners]) listener();
    },
  };
  return fakeDoc;
}

/** `attachVisibilityFlush` recibe un `Document`; el stub cubre el subconjunto usado. */
const asDocument = (fakeDoc: FakeVisibilityDocument): Document => fakeDoc as unknown as Document;

// ─── AC-001 / BR-001: una sola escritura por ráfaga ─────────────────────────

describe('FIX-0013 AC-001 — 20 cambios en 2 s producen como máximo una escritura', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('FIX-0013-AC-001: 20 schedule espaciados 100 ms disparan onFlush una sola vez con el último valor', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const batcher = createCloudWriteBatcher<SyncPayload>({ delayMs: 1000, onFlush });

    let lastPatch: SyncPayload = {};
    for (let i = 0; i < 20; i += 1) {
      lastPatch = { tagConfig: { fontSize: 12 + i, step: i } };
      batcher.schedule(lastPatch);
      // 100 ms entre eventos: 19 intervalos = 1,9 s de ráfaga.
      if (i < 19) vi.advanceTimersByTime(100);
    }

    // La ráfaga terminó (t = 1900 ms) y aún no se escribió nada.
    expect(onFlush).not.toHaveBeenCalled();

    // Se estabiliza la ventana de 1 s posterior al último cambio.
    vi.advanceTimersByTime(1000);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(lastPatch);
    expect(batcher.hasPending()).toBe(false);
  });
});

// ─── BR-001 (reset del debounce) ────────────────────────────────────────────

describe('FIX-0013 BR-001 — el debounce se reinicia con cada cambio', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('FIX-0013-BR-001: un cambio en t=900 ms reinicia la ventana y el flush ocurre en t≈1900 ms', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const batcher = createCloudWriteBatcher<SyncPayload>({ delayMs: 1000, onFlush });

    batcher.schedule({ tagConfig: { columnas: 2 } }); // t = 0
    vi.advanceTimersByTime(900); // t = 900
    batcher.schedule({ tagConfig: { columnas: 3 } }); // reinicia la ventana

    // En t = 1000 NO debe dispararse: el timer original quedó cancelado.
    vi.advanceTimersByTime(100); // t = 1000
    expect(onFlush).not.toHaveBeenCalled();

    // Tampoco en t = 1899 (ventana nueva aún abierta).
    vi.advanceTimersByTime(899); // t = 1899
    expect(onFlush).not.toHaveBeenCalled();

    // Se cumple la ventana nueva: t = 1900.
    vi.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith({ tagConfig: { columnas: 3 } });
  });
});

// ─── AC-002: el último cambio nunca se pierde ───────────────────────────────

describe('FIX-0013 AC-002 — un único cambio se persiste tras 1,5 s', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('FIX-0013-AC-002: un solo schedule no escribe antes de 1 s y escribe una vez a los 1,5 s', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const batcher = createCloudWriteBatcher<SyncPayload>({ delayMs: 1000, onFlush });
    const patch: SyncPayload = { tagConfig: { filas: 4, columnas: 3 } };

    batcher.schedule(patch);

    // Antes del debounce no hay escritura.
    vi.advanceTimersByTime(999);
    expect(onFlush).not.toHaveBeenCalled();

    // A los 1,5 s (1000 ms de debounce + 500 ms) ya se escribió exactamente una vez.
    vi.advanceTimersByTime(501);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(patch);

    // No hay re-escrituras posteriores.
    vi.advanceTimersByTime(5000);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});

// ─── AC-003: tagConfig + designProfiles en un único setDoc ──────────────────

describe('FIX-0013 AC-003 — cambios de ambos campos en la misma ventana', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('FIX-0013-AC-003: tagConfig y designProfiles dentro de la misma ventana viajan en un solo onFlush', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const batcher = createCloudWriteBatcher<SyncPayload>({ delayMs: 1000, onFlush });

    const tagConfig = { filas: 5, columnas: 2 };
    const designProfiles = [{ id: 'p1' }, { id: 'p2' }];

    batcher.schedule({ tagConfig });
    vi.advanceTimersByTime(300);
    batcher.schedule({ designProfiles });

    vi.advanceTimersByTime(1000);

    expect(onFlush).toHaveBeenCalledTimes(1);
    const patch = onFlush.mock.calls[0][0] as SyncPayload;
    expect(Object.keys(patch).sort()).toEqual(['designProfiles', 'tagConfig']);
    expect(patch.tagConfig).toEqual(tagConfig);
    expect(patch.designProfiles).toEqual(designProfiles);
  });
});

// ─── AC-004: flush inmediato al pasar a hidden ──────────────────────────────

describe('FIX-0013 AC-004 — flush inmediato en visibilitychange (hidden)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('FIX-0013-AC-004: visible no hace flush; hidden escribe sincrónicamente; tras desuscribir ya no', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const batcher = createCloudWriteBatcher<SyncPayload>({ delayMs: 1000, onFlush });
    const fakeDoc = createFakeDocument();
    const detach = attachVisibilityFlush(batcher, asDocument(fakeDoc));

    const patch: SyncPayload = { tagConfig: { fontSize: 42 } };
    batcher.schedule(patch);

    // Con la pestaña visible, el evento no escribe nada.
    fakeDoc.dispatch('visibilitychange');
    expect(onFlush).not.toHaveBeenCalled();
    expect(batcher.hasPending()).toBe(true);

    // Al pasar a hidden se escribe en el acto, sin avanzar el debounce.
    fakeDoc.visibilityState = 'hidden';
    fakeDoc.dispatch('visibilitychange');
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(patch);
    expect(batcher.hasPending()).toBe(false);

    // Tras desuscribir, un nuevo hidden ya no dispara el flush.
    detach();
    const pendingPatch: SyncPayload = { designProfiles: [{ id: 'p3' }] };
    batcher.schedule(pendingPatch);
    fakeDoc.dispatch('visibilitychange');
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(batcher.hasPending()).toBe(true);

    // El timer pendiente sigue siendo el debounce normal (no se canceló).
    vi.advanceTimersByTime(1000);
    expect(onFlush).toHaveBeenCalledTimes(2);
    expect(onFlush).toHaveBeenLastCalledWith(pendingPatch);
  });
});

// ─── BR-003: flush directo, dispose y hasPending ────────────────────────────

describe('FIX-0013 BR-003 — flush directo, dispose y hasPending', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('FIX-0013-BR-003: flush() escribe de inmediato sin esperar el debounce', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const batcher = createCloudWriteBatcher<SyncPayload>({ delayMs: 1000, onFlush });
    const patch: SyncPayload = { tagConfig: { filas: 1 } };

    batcher.schedule(patch);
    expect(batcher.hasPending()).toBe(true);

    batcher.flush();
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(patch);
    expect(batcher.hasPending()).toBe(false);

    // El timer quedó cancelado: no hay segunda escritura al vencer la ventana.
    vi.advanceTimersByTime(1000);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('FIX-0013-BR-003: dispose() descarta lo pendiente sin llamar a onFlush', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const batcher = createCloudWriteBatcher<SyncPayload>({ delayMs: 1000, onFlush });

    batcher.schedule({ tagConfig: { filas: 9 } });
    expect(batcher.hasPending()).toBe(true);

    batcher.dispose();
    expect(batcher.hasPending()).toBe(false);

    // Ni el timer ni un flush explícito posterior escriben algo descartado.
    vi.advanceTimersByTime(5000);
    batcher.flush();
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('FIX-0013-BR-003: hasPending() refleja el estado pendiente y se limpia tras el flush', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const batcher = createCloudWriteBatcher<SyncPayload>({ delayMs: 1000, onFlush });

    expect(batcher.hasPending()).toBe(false);
    batcher.schedule({ tagConfig: { filas: 2 } });
    expect(batcher.hasPending()).toBe(true);
    batcher.schedule({ designProfiles: [] });
    expect(batcher.hasPending()).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(batcher.hasPending()).toBe(false);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});

// ─── Robustez: errores del callback nunca se propagan ──────────────────────

describe('FIX-0013 BR-003 — robustez del flush ante errores', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('FIX-0013-BR-003: si onFlush lanza, flush() no propaga, registra el error y limpia lo pendiente', () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('fallo remoto');
    const onFlush = vi.fn(() => {
      throw boom;
    });
    const batcher = createCloudWriteBatcher<SyncPayload>({ delayMs: 1000, onFlush });

    batcher.schedule({ tagConfig: { filas: 7 } });

    expect(() => batcher.flush()).not.toThrow();
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(boom);
    expect(batcher.hasPending()).toBe(false);

    // Un flush posterior no reescribe el patch ya fallido.
    batcher.flush();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('FIX-0013-BR-003: si onFlush devuelve una promesa rechazada, no hay rechazo no controlado y pending queda limpio', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('rechazo remoto');
    const onFlush = vi.fn(() => Promise.reject(boom));
    const batcher = createCloudWriteBatcher<SyncPayload>({ delayMs: 1000, onFlush });

    batcher.schedule({ designProfiles: [{ id: 'p9' }] });

    expect(() => batcher.flush()).not.toThrow();
    expect(batcher.hasPending()).toBe(false);

    // El rechazo se captura en un microtask: no se propaga ni queda sin manejar.
    await Promise.resolve();
    await Promise.resolve();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(boom);

    batcher.flush();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});

// ─── AC-005 (BR-002 / BR-004): cableado verificado sobre App.tsx ────────────
// Mecanismo: source assertion con `node:fs` (misma convención que
// `tests/noCompanionFlow.test.ts`). No se monta `App` ni se mockea Firebase.

describe('FIX-0013 AC-005 — cableado en App.tsx (source assertion)', () => {
  const appSource = readFileSync(APP_PATH, 'utf-8');
  const configEffect = findEffectBody(appSource, 'config');
  const profilesEffect = findEffectBody(appSource, 'profiles');

  it('FIX-0013-AC-005 (BR-002): localStorage de CONFIG_KEY se escribe antes y fuera de todo if/debounce', () => {
    expect(configEffect).toMatch(
      /localStorage\.setItem\(\s*CONFIG_KEY\s*,\s*JSON\.stringify\(\s*config\s*\)\s*\)/
    );

    const setItemIndex = configEffect.search(/localStorage\.setItem\(\s*CONFIG_KEY/);
    const scheduleIndex = configEffect.search(/cloudSyncBatcher\.schedule\(\s*\{\s*tagConfig/);

    // Persistencia local primero y en el nivel superior del efecto (depth 0):
    // no está envuelta en ningún `if` ni en un `setTimeout` de debounce.
    expect(setItemIndex).toBeGreaterThanOrEqual(0);
    expect(braceDepthAt(configEffect, setItemIndex)).toBe(0);
    expect(configEffect.slice(0, setItemIndex)).not.toMatch(/\bif\s*\(/);
    expect(configEffect.slice(0, setItemIndex)).not.toMatch(/setTimeout|setInterval/);

    // La escritura remota sí llega después (nunca reemplaza al localStorage).
    expect(scheduleIndex).toBeGreaterThan(setItemIndex);
  });

  it('FIX-0013-AC-005 (BR-002): localStorage de PROFILES_KEY se escribe antes y fuera de todo if/debounce', () => {
    expect(profilesEffect).toMatch(
      /localStorage\.setItem\(\s*PROFILES_KEY\s*,\s*JSON\.stringify\(\s*profiles\s*\)\s*\)/
    );

    const setItemIndex = profilesEffect.search(/localStorage\.setItem\(\s*PROFILES_KEY/);
    const scheduleIndex = profilesEffect.search(
      /cloudSyncBatcher\.schedule\(\s*\{\s*designProfiles/
    );

    expect(setItemIndex).toBeGreaterThanOrEqual(0);
    expect(braceDepthAt(profilesEffect, setItemIndex)).toBe(0);
    expect(profilesEffect.slice(0, setItemIndex)).not.toMatch(/\bif\s*\(/);
    expect(profilesEffect.slice(0, setItemIndex)).not.toMatch(/setTimeout|setInterval/);

    expect(scheduleIndex).toBeGreaterThan(setItemIndex);
  });

  it('FIX-0013-AC-005 (BR-004): las dos llamadas a cloudSyncBatcher.schedule están dentro de if (currentUser && isCloudProfileLoaded)', () => {
    const cases: Array<[string, RegExp]> = [
      [configEffect, /cloudSyncBatcher\.schedule\(\s*\{\s*tagConfig/],
      [profilesEffect, /cloudSyncBatcher\.schedule\(\s*\{\s*designProfiles/],
    ];

    for (const [effectBody, schedulePattern] of cases) {
      // La guarda aparece literal y antes de la programación.
      const guardMatch = effectBody.match(
        /if\s*\(\s*currentUser\s*&&\s*isCloudProfileLoaded\s*\)\s*\{/
      );
      expect(guardMatch).not.toBeNull();
      const guardIndex = effectBody.indexOf(guardMatch![0]);
      const scheduleIndex = effectBody.search(schedulePattern);

      expect(scheduleIndex).toBeGreaterThan(guardIndex);
      // Profundidad 1: está dentro del bloque de la guarda, no fuera de ella.
      expect(braceDepthAt(effectBody, scheduleIndex)).toBe(1);
    }
  });

  it('FIX-0013-AC-005 (BR-004): el onFlush del batcher guarda contra currentUserRef y cloudLoadedRef', () => {
    const memoStart = appSource.indexOf('createCloudWriteBatcher<');
    expect(memoStart).toBeGreaterThanOrEqual(0);
    const memoEnd = appSource.indexOf('}), []);', memoStart);
    expect(memoEnd).toBeGreaterThan(memoStart);
    const memoBlock = appSource.slice(memoStart, memoEnd);

    // Ventana de agrupación de 1 s (BR-001) declarada en la fábrica.
    expect(memoBlock).toMatch(/delayMs\s*:\s*1000/);

    // Guarda explícita: sin usuario o sin perfil cloud cargado no se escribe.
    expect(memoBlock).toMatch(
      /if\s*\(\s*!currentUserRef\.current\s*\|\|\s*!cloudLoadedRef\.current\s*\)\s*return\s*;/
    );

    // La escritura usa el uid del ref (valor actual), no un closure congelado.
    expect(memoBlock).toMatch(/updateCloudProfile\(\s*currentUserRef\.current\.uid/);
    expect(memoBlock).not.toMatch(/\bcurrentUser\.uid/);
  });

  it('FIX-0013-AC-005 (BR-003): App.tsx adjunta attachVisibilityFlush y hace flush al desmontar', () => {
    expect(appSource).toMatch(
      /import\s*\{[^}]*\bcreateCloudWriteBatcher\b[^}]*\battachVisibilityFlush\b[^}]*\}\s*from\s*['"]\.\/utils\/cloudWriteBatcher['"]/
    );
    expect(appSource).toMatch(/attachVisibilityFlush\(\s*cloudSyncBatcher\s*\)/);
    expect(appSource).toMatch(/detach\(\)\s*;[\s\S]{0,80}cloudSyncBatcher\.flush\(\)/);
  });
});
