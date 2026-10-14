/**
 * Servicio modular de feedback háptico y sonoro para escaneo en góndola / móvil.
 * Utiliza Web Audio API con síntesis nativa y la Vibration API sin dependencias externas.
 */

let sharedAudioContext: any = null;

export function _resetAudioContextForTesting(): void {
  sharedAudioContext = null;
}

function getAudioContext(): any {
  try {
    const globalObj = typeof window !== 'undefined' ? window : globalThis;
    const AudioCtx = (globalObj as any).AudioContext || (globalObj as any).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!sharedAudioContext) {
      sharedAudioContext = new AudioCtx();
    }
    return sharedAudioContext;
  } catch (err) {
    return null;
  }
}

/**
 * Dispara una vibración corta y tenue si el dispositivo la soporta.
 * @param durationMs Duración en ms (por defecto 40ms)
 * @returns boolean indicando si se ejecutó con éxito
 */
export function triggerHaptic(durationMs: number = 40): boolean {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return navigator.vibrate(durationMs);
    }
  } catch {
    // Ignorar restricciones de permisos o contextos seguros
  }
  return false;
}

/**
 * Emite un tono sonoro tenue, agradable y breve sintetizado en memoria con Web Audio API.
 * Frecuencia: 587.33 Hz (Re5 / D5).
 * Duración: ~60ms con decaimiento exponencial para evitar chasquidos (clicks).
 */
export function playSoftBeep(frequencyHz: number = 587.33, durationSeconds: number = 0.06): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequencyHz, ctx.currentTime);

    // Volumen bajo (0.08) para que sea un anuncio sutil
    const initialVolume = 0.08;
    gainNode.gain.setValueAtTime(initialVolume, ctx.currentTime);
    // Decaimiento exponencial suave hasta el corte
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSeconds);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationSeconds + 0.01);

    // Desconectar al terminar para liberar memoria
    setTimeout(() => {
      try {
        osc.disconnect();
        gainNode.disconnect();
      } catch {}
    }, (durationSeconds + 0.05) * 1000);
  } catch {
    // Operación segura: no bloquear el flujo si el navegador bloquea audio
  }
}

/**
 * Feedback sensorial completo para escaneo exitoso:
 * Vibración de 40ms + Beep tenue a 587Hz.
 */
export function playScanSuccessFeedback(): void {
  triggerHaptic(40);
  playSoftBeep(587.33, 0.06);
}
