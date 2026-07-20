/**
 * Lightweight walkie-talkie tone synth using the Web Audio API.
 * No external audio files — the "start" and "end" chirps are generated
 * on the fly with a short oscillator + gain envelope.
 */
export function playRadioTone(kind) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    const now = ctx.currentTime;
    const dur = 0.13;

    if (kind === "start") {
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + dur);
    } else {
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + dur);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
    osc.onended = () => ctx.close();
  } catch (err) {
    /* Web Audio not available — fail silently, this is a cosmetic touch */
  }
}

/** Fire a short haptic pulse where supported (no-op elsewhere). */
export function triggerHaptic(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (err) {
    /* haptics not available on this device/browser */
  }
}
