import { useCallback, useEffect, useRef, useState } from "react";
import { beep, closeAudioContext, startSiren, stopSiren } from "../lib/siren";

/* ------------------------------- types ---------------------------------- */
export type Phase = "idle" | "loading" | "listening" | "countdown" | "alert" | "error";
export type ErrorCode =
  | "unsupported"
  | "mic-denied"
  | "mic-missing"
  | "mic-error"
  | "model-failed"
  | "audio-graph"
  | null;

interface Category {
  categoryName?: string;
  score?: number;
}
interface AudioClassifierResult {
  classifications?: { categories?: Category[] }[];
}
interface AudioClassifier {
  classify(audio: Float32Array, sampleRate: number): AudioClassifierResult | Promise<AudioClassifierResult>;
}
interface MediaPipeModule {
  AudioClassifier: {
    createFromOptions(fileset: unknown, options: { baseOptions: { modelAssetPath: string } }): Promise<AudioClassifier>;
  };
  FilesetResolver: { forAudioTasks(wasmDir: string): Promise<unknown> };
}

export interface AlertInfo {
  time: string;
  location: string | null;
}

/* ------------------------------ constants -------------------------------- */
// MediaPipe tasks-audio is loaded from a CDN at runtime (npm registry is unavailable here).
// The URL is held in a variable so Vite leaves the dynamic import alone and TS treats it as any.
const MP_VERSION = "1.2.0";
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MP_VERSION}/audio_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@${MP_VERSION}/wasm`;
// Local model first (bundled in /public), remote as fallback.
const MODEL_LOCAL = "/models/yamnet.tflite";
const MODEL_REMOTE =
  "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite";
const WORKLET_URL = "/worklets/mic-processor.js";

const SAMPLE_RATE = 16000;
// Only these YAMNet classes count as a scream; score = highest among them.
const SCREAM_LABELS = new Set(["screaming", "yell", "shout", "children shouting"]);
const TRIGGER_WINDOW = 4; // look at the last 4 results (~2s)
const TRIGGER_MIN = 3; // ...need 3 of them over threshold
const COOLDOWN_MS = 30_000;
const COUNTDOWN_SEC = 10;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function micErrorCode(err: unknown): ErrorCode {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "mic-denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "mic-missing";
  return "mic-error";
}

async function loadClassifier(): Promise<AudioClassifier> {
  const bundleUrl: string = MP_BUNDLE;
  const mod = (await import(/* @vite-ignore */ bundleUrl)) as MediaPipeModule;
  const { AudioClassifier, FilesetResolver } = mod ?? ({} as MediaPipeModule);
  if (!AudioClassifier?.createFromOptions || !FilesetResolver?.forAudioTasks) {
    throw new Error("bad-lib");
  }
  const fileset = await FilesetResolver.forAudioTasks(MP_WASM);
  let lastError: unknown = null;
  for (const modelAssetPath of [MODEL_LOCAL, MODEL_REMOTE]) {
    try {
      return await AudioClassifier.createFromOptions(fileset, { baseOptions: { modelAssetPath } });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("model-failed");
}

/* -------------------------------- hook ----------------------------------- */
export function useScreamDetector() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorCode, setErrorCode] = useState<ErrorCode>(null);
  const [level, setLevel] = useState(0);
  const [topLabel, setTopLabel] = useState("");
  const [topScore, setTopScore] = useState(0);
  const [screamScore, setScreamScore] = useState(0);
  const [threshold, setThresholdState] = useState(0.5);
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [alertInfo, setAlertInfo] = useState<AlertInfo | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const thresholdRef = useRef(0.5);
  const historyRef = useRef<number[]>([]);
  const cooldownUntilRef = useRef(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nodeRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const mutedRef = useRef<GainNode | null>(null);
  const classifierRef = useRef<AudioClassifier | null>(null);

  const countdownTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  // ScriptProcessor fallback accumulator.
  const spAccumRef = useRef<{ chunks: Float32Array[]; count: number }>({ chunks: [], count: 0 });

  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const setThreshold = useCallback((value: number) => {
    const v = Math.max(0.3, Math.min(0.8, value));
    thresholdRef.current = v;
    setThresholdState(v);
  }, []);

  const clearTimers = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (cooldownTimerRef.current !== null) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  const startCooldown = useCallback(() => {
    cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntilRef.current - Date.now()) / 1000));
      setCooldownRemaining(remaining);
      if (remaining <= 0 && cooldownTimerRef.current !== null) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
    tick();
    if (cooldownTimerRef.current !== null) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = window.setInterval(tick, 500);
  }, []);

  const triggerAlert = useCallback(() => {
    go("alert");
    startSiren();
    const time = new Date().toLocaleTimeString();
    setAlertInfo({ time, location: null });
    // Only read location if permission was already granted — never prompt mid-alert.
    const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (navigator.geolocation && permissions?.query) {
      permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          if (status.state !== "granted") return;
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              setAlertInfo({
                time,
                location: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
              }),
            () => {},
            { timeout: 8000, maximumAge: 60_000 },
          );
        })
        .catch(() => {});
    }
  }, [go]);

  const beginCountdown = useCallback(() => {
    go("countdown");
    setCountdown(COUNTDOWN_SEC);
    beep();
    if (countdownTimerRef.current !== null) clearInterval(countdownTimerRef.current);
    let remaining = COUNTDOWN_SEC;
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        if (countdownTimerRef.current !== null) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        triggerAlert();
      } else {
        beep();
      }
    }, 1000);
  }, [go, triggerAlert]);

  const classifyChunk = useCallback(
    async (audio: Float32Array) => {
      const classifier = classifierRef.current;
      if (!classifier || phaseRef.current !== "listening") return;
      let result: AudioClassifierResult;
      try {
        const maybe = classifier.classify(audio, SAMPLE_RATE);
        result = maybe instanceof Promise ? await maybe : maybe;
      } catch {
        return;
      }
      const categories = result?.classifications?.[0]?.categories ?? [];
      if (categories.length === 0) return;

      let top: Category = categories[0];
      let scream = 0;
      for (const c of categories) {
        const score = c.score ?? 0;
        if (score > (top.score ?? 0)) top = c;
        const label = (c.categoryName ?? "").toLowerCase();
        if (SCREAM_LABELS.has(label) && score > scream) scream = score;
      }
      setTopLabel(top.categoryName ?? "");
      setTopScore(top.score ?? 0);
      setScreamScore(scream);

      const history = historyRef.current;
      history.push(scream);
      if (history.length > TRIGGER_WINDOW) history.shift();
      const hits = history.filter((s) => s >= thresholdRef.current).length;
      if (
        history.length >= TRIGGER_MIN &&
        hits >= TRIGGER_MIN &&
        Date.now() >= cooldownUntilRef.current
      ) {
        historyRef.current = [];
        beginCountdown();
      }
    },
    [beginCountdown],
  );

  const cleanupAudio = useCallback(() => {
    const node = nodeRef.current;
    if (node) {
      try {
        if (node instanceof AudioWorkletNode) node.port.onmessage = null;
        else (node as ScriptProcessorNode).onaudioprocess = null;
        node.disconnect();
      } catch {
        /* ignore */
      }
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      mutedRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    ctxRef.current = null;
    sourceRef.current = null;
    nodeRef.current = null;
    mutedRef.current = null;
    classifierRef.current = null;
    spAccumRef.current = { chunks: [], count: 0 };
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    stopSiren();
    cleanupAudio();
    historyRef.current = [];
    cooldownUntilRef.current = 0;
    setCooldownRemaining(0);
    setLevel(0);
    setScreamScore(0);
    setTopLabel("");
    setTopScore(0);
    setAlertInfo(null);
    setErrorCode(null);
    go("idle");
  }, [clearTimers, cleanupAudio, go]);

  const start = useCallback(async () => {
    if (phaseRef.current === "loading" || phaseRef.current === "listening") return;
    setErrorCode(null);
    go("loading");

    const AudioCtx: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !AudioCtx) {
      setErrorCode("unsupported");
      go("error");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      setErrorCode(micErrorCode(err));
      go("error");
      return;
    }
    streamRef.current = stream;

    try {
      classifierRef.current = await loadClassifier();
    } catch {
      setErrorCode("model-failed");
      cleanupAudio();
      go("error");
      return;
    }

    try {
      const ctx = new AudioCtx({ sampleRate: SAMPLE_RATE });
      ctxRef.current = ctx;
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
        await ctx.audioWorklet.addModule(WORKLET_URL);
        const node = new AudioWorkletNode(ctx, "mic-processor");
        node.port.onmessage = (event: MessageEvent) => {
          const msg = event.data as { type: "level" | "audio"; level?: number; audio?: Float32Array };
          if (msg.type === "level") setLevel(clamp01((msg.level ?? 0) * 4));
          else if (msg.type === "audio" && msg.audio) void classifyChunk(msg.audio);
        };
        source.connect(node);
        nodeRef.current = node;
      } else {
        // ScriptProcessor fallback (older browsers).
        const node = ctx.createScriptProcessor(4096, 1, 1);
        const muted = ctx.createGain();
        muted.gain.value = 0;
        mutedRef.current = muted;
        const needRaw = Math.ceil(0.5 * ctx.sampleRate);
        node.onaudioprocess = (event: AudioProcessingEvent) => {
          const input = event.inputBuffer.getChannelData(0);
          const accum = spAccumRef.current;
          accum.chunks.push(new Float32Array(input));
          accum.count += input.length;
          if (accum.count >= needRaw) {
            const raw = new Float32Array(accum.count);
            let offset = 0;
            for (const c of accum.chunks) {
              raw.set(c, offset);
              offset += c.length;
            }
            accum.chunks = [];
            accum.count = 0;
            // Downsample to 16 kHz by linear interpolation.
            const ratio = ctx.sampleRate / SAMPLE_RATE;
            const outLen = Math.floor(raw.length / ratio);
            const out = new Float32Array(outLen);
            for (let i = 0; i < outLen; i++) {
              const pos = i * ratio;
              const i0 = Math.floor(pos);
              const i1 = Math.min(i0 + 1, raw.length - 1);
              out[i] = raw[i0] + (raw[i1] - raw[i0]) * (pos - i0);
            }
            let sum = 0;
            for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
            setLevel(clamp01(Math.sqrt(sum / input.length) * 4));
            void classifyChunk(out);
          }
        };
        source.connect(node);
        node.connect(muted).connect(ctx.destination);
        nodeRef.current = node;
      }

      historyRef.current = [];
      cooldownUntilRef.current = 0;
      setCooldownRemaining(0);
      go("listening");
    } catch {
      setErrorCode("audio-graph");
      cleanupAudio();
      go("error");
    }
  }, [classifyChunk, cleanupAudio, go]);

  const cancel = useCallback(() => {
    if (phaseRef.current !== "countdown") return;
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    historyRef.current = [];
    startCooldown();
    go(streamRef.current && classifierRef.current ? "listening" : "idle");
  }, [go, startCooldown]);

  const reset = useCallback(() => {
    stopSiren();
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setAlertInfo(null);
    historyRef.current = [];
    startCooldown();
    go(streamRef.current && classifierRef.current ? "listening" : "idle");
  }, [go, startCooldown]);

  const simulate = useCallback(() => {
    if (phaseRef.current === "countdown" || phaseRef.current === "alert") return;
    stopSiren();
    historyRef.current = [];
    beginCountdown();
  }, [beginCountdown]);

  // Teardown on unmount / page leave: stop mic, close contexts, stop siren.
  useEffect(() => {
    const teardown = () => {
      clearTimers();
      stopSiren();
      cleanupAudio();
      closeAudioContext();
    };
    window.addEventListener("pagehide", teardown);
    return () => {
      window.removeEventListener("pagehide", teardown);
      teardown();
    };
  }, [clearTimers, cleanupAudio]);

  return {
    phase,
    errorCode,
    level,
    topLabel,
    topScore,
    screamScore,
    threshold,
    setThreshold,
    countdown,
    cooldownRemaining,
    alertInfo,
    start,
    stop,
    cancel,
    reset,
    simulate,
  };
}
