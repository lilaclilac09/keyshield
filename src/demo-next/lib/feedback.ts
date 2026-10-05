/** Passkey success: short vibrate + click. Fail closed if the browser blocks it. */

export function signalPasskeySuccess(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([12, 24, 12]);
    }
  } catch {
    /* haptic optional */
  }
  try {
    const Ctx = typeof window !== 'undefined' ? window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
    void ctx.close();
  } catch {
    /* audio optional */
  }
}
