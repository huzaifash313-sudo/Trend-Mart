/** Soft notify beep — works even if /sounds/notify.mp3 is missing. */

export function playPosNotify() {
  if (typeof window === "undefined") return;
  try {
    const a = new Audio("/sounds/notify.mp3");
    void a.play().catch(() => playBeepFallback());
  } catch {
    playBeepFallback();
  }
}

function playBeepFallback() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.stop(ctx.currentTime + 0.26);
    void ctx.close();
  } catch {
    /* ignore */
  }
}
