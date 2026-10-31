// Web Audio helpers for the demo: a countdown beep and an SOS siren.
// No audio files — everything is synthesised, so the build stays static.

let sharedCtx: AudioContext | null = null;

// One lazily-created output context, reused so we don't leak AudioContexts.
export function getAudioContext(): AudioContext {
  const Ctor: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!sharedCtx) sharedCtx = new Ctor();
  if (sharedCtx.state === "suspended") void sharedCtx.resume();
  return sharedCtx;
}

export function closeAudioContext(): void {
  if (sharedCtx) {
    void sharedCtx.close().catch(() => {});
    sharedCtx = null;
  }
}

// Short soft blip, played once per countdown second.
export function beep(freq = 660, duration = 0.14, volume = 0.18): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch {
    // Audio is a nicety; never let it break the demo.
  }
}

type SirenNodes = { osc: OscillatorNode; lfo: OscillatorNode; lfoGain: GainNode; gain: GainNode };

let sirenNodes: SirenNodes | null = null;

// Two-tone wailing siren: a sawtooth carrier whose frequency is swept by an LFO.
export function startSiren(): void {
  if (sirenNodes) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.value = 720;
    lfo.type = "sine";
    lfo.frequency.value = 1.6; // wail rate
    lfoGain.gain.value = 320; // sweep depth in Hz

    lfo.connect(lfoGain).connect(osc.frequency);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.15);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    lfo.start(now);
    sirenNodes = { osc, lfo, lfoGain, gain };
  } catch {
    sirenNodes = null;
  }
}

export function stopSiren(): void {
  if (!sirenNodes) return;
  const { osc, lfo, gain } = sirenNodes;
  sirenNodes = null;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.stop(now + 0.25);
    lfo.stop(now + 0.25);
  } catch {
    // ignore
  }
}
