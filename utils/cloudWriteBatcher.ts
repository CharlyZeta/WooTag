/**
 * FIX-0013: escritor único con debounce para agrupar las escrituras de `tagConfig`
 * y `designProfiles` en un solo `setDoc` por ventana (BR-001).
 * Módulo puro, sin React, para poder verificar las AC con fake timers (BR-005).
 */

export interface CloudWriteBatcher<T extends Record<string, unknown>> {
  schedule(patch: Partial<T>): void;
  flush(): void;
  dispose(): void;
  hasPending(): boolean;
}

export const createCloudWriteBatcher = <T extends Record<string, unknown>>(options: {
  delayMs: number;
  onFlush: (patch: Partial<T>) => void | Promise<void>;
}): CloudWriteBatcher<T> => {
  const { delayMs, onFlush } = options;

  let pending: Partial<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = () => {
    if (!pending) return;

    // Se limpia el pendiente ANTES de invocar onFlush: si el callback vuelve a
    // programar algo, ese cambio queda como un pendiente nuevo y no se pierde.
    const patch = pending;
    pending = null;
    clearTimer();

    try {
      const result = onFlush(patch);
      // onFlush puede ser asíncrono (updateCloudProfile): el rechazo se registra
      // pero nunca se propaga.
      if (result) {
        Promise.resolve(result).catch(console.error);
      }
    } catch (error) {
      console.error(error);
    }
  };

  /** Fusiona el patch en lo pendiente y reinicia el debounce. */
  const schedule = (patch: Partial<T>) => {
    pending = { ...(pending ?? {}), ...patch };
    clearTimer();
    timer = setTimeout(flush, delayMs);
  };

  /** Descarta el timer y lo pendiente sin escribir en la nube. */
  const dispose = () => {
    clearTimer();
    pending = null;
  };

  const hasPending = () => pending !== null;

  return { schedule, flush, dispose, hasPending };
};

/** Flush inmediato cuando la pestaña pasa a segundo plano (evento confiable en móvil). */
export const attachVisibilityFlush = (
  batcher: { flush(): void },
  doc: Document = document
): (() => void) => {
  const handleVisibilityChange = () => {
    if (doc.visibilityState === 'hidden') {
      batcher.flush();
    }
  };

  doc.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    doc.removeEventListener('visibilitychange', handleVisibilityChange);
  };
};
