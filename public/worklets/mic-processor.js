// Mic capture worklet: downsamples to 16 kHz and posts ~0.5s windows + live level.
// Runs in the AudioWorklet thread so the main thread stays smooth.

const TARGET_RATE = 16000;
const WINDOW_SEC = 0.5;

// Linear-interpolation resample from the context rate down to 16 kHz.
function resampleTo16k(input, inRate) {
  if (inRate === TARGET_RATE) return input;
  const ratio = inRate / TARGET_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] + (input[i1] - input[i0]) * frac;
  }
  return out;
}

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // `sampleRate` is the AudioContext rate, provided by the worklet global scope.
    this.needRaw = Math.ceil(WINDOW_SEC * sampleRate);
    this.chunks = [];
    this.count = 0;
    this.lastLevelTime = -1;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    // Live RMS level for the meter, throttled to ~20 msgs/sec.
    let sum = 0;
    for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
    const rms = Math.sqrt(sum / channel.length);
    if (currentTime - this.lastLevelTime >= 0.05) {
      this.lastLevelTime = currentTime;
      this.port.postMessage({ type: "level", level: rms });
    }

    // Buffer raw frames; the worklet reuses `channel` each quantum, so copy it.
    this.chunks.push(new Float32Array(channel));
    this.count += channel.length;

    if (this.count >= this.needRaw) {
      const raw = new Float32Array(this.count);
      let offset = 0;
      for (const c of this.chunks) {
        raw.set(c, offset);
        offset += c.length;
      }
      this.chunks = [];
      this.count = 0;
      this.port.postMessage({ type: "audio", audio: resampleTo16k(raw, sampleRate) });
    }
    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);
