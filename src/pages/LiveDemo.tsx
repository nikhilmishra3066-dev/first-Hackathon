import { useScreamDetector, type ErrorCode } from "../hooks/useScreamDetector";
import { Link } from "../router";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const ERROR_MESSAGES: Record<NonNullable<ErrorCode>, string> = {
  unsupported: "This browser can't access the microphone. Try Chrome, Edge or Safari.",
  "mic-denied": "Microphone permission was blocked. Allow it in your browser, then try again.",
  "mic-missing": "No microphone was found on this device.",
  "mic-error": "Couldn't start the microphone. Close other apps using it and try again.",
  "model-failed": "The sound model failed to load. Check your connection and try again.",
  "audio-graph": "Couldn't start audio processing on this device.",
};

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div
      className="h-4 w-full overflow-hidden rounded-full border-[3px] border-brand-ink bg-brand-bone"
      role="presentation"
    >
      <div
        className="h-full transition-[width] duration-100 ease-out"
        style={{ width: `${Math.round(clamp01(value) * 100)}%`, background: color }}
      />
    </div>
  );
}

function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-brand-ink">
      <div className="mx-auto flex h-15 max-w-4xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2.5 text-white">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-yellow text-brand-ink">
            <svg viewBox="0 0 24 24" className="size-4.5" fill="none" aria-hidden="true">
              <path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="poster text-xl tracking-wide">SafeHer</span>
        </Link>
        <span className="micro rounded-full bg-brand-red px-4 py-2 text-white">Live demo</span>
      </div>
    </header>
  );
}

export default function LiveDemo() {
  const {
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
  } = useScreamDetector();

  const overThreshold = screamScore >= threshold;

  return (
    <div className="min-h-svh bg-brand-bone text-brand-ink">
      <Header />

      <main className="mx-auto max-w-4xl px-5 pb-24 pt-24 sm:pt-28">
        {/* Heading */}
        <div className="text-center">
          <span className="micro inline-block rounded-full bg-brand-ink px-4 py-2 text-brand-yellow">
            On-device · No upload
          </span>
          <h1 className="poster mt-5 text-5xl leading-[0.95] sm:text-6xl">
            Scream <span className="text-brand-red">detection</span> demo
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg font-medium text-brand-ink/75">
            Your microphone listens for a scream. If one is detected, a 10-second "Are you OK?"
            countdown starts. Cancel it, or a simulated SOS alert fires.
          </p>
        </div>

        {/* ERROR */}
        {phase === "error" && errorCode && (
          <div className="blk sh-ink mx-auto mt-10 max-w-xl rounded-2xl bg-brand-white p-7 text-center">
            <p role="alert" className="poster text-2xl text-brand-red">
              {ERROR_MESSAGES[errorCode]}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={start}
                className="micro sh-ink-sm rounded-full bg-brand-yellow px-7 py-3.5 font-extrabold text-brand-ink transition hover:-translate-y-0.5">
                Try again
              </button>
              <Link to="/"
                className="micro rounded-full border-[3px] border-brand-ink px-7 py-3.5 font-extrabold text-brand-ink transition hover:bg-brand-ink hover:text-brand-yellow">
                Back home
              </Link>
            </div>
          </div>
        )}

        {/* IDLE */}
        {phase === "idle" && (
          <div className="mx-auto mt-10 max-w-xl">
            <div className="blk sh-ink rounded-2xl bg-brand-white p-8 text-center">
              <button type="button" onClick={start}
                className="micro sh-ink-sm inline-flex items-center gap-2.5 rounded-full bg-brand-red px-9 py-4 font-extrabold text-white transition hover:-translate-y-0.5">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-80" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-white" />
                </span>
                Start listening
              </button>
              <button type="button" onClick={simulate}
                className="micro mt-4 block w-full rounded-full border-[3px] border-brand-ink px-7 py-3.5 font-extrabold text-brand-ink transition hover:bg-brand-yellow">
                Simulate scream (jump to countdown)
              </button>
              <p className="mt-6 rounded-xl bg-brand-ink px-5 py-4 text-sm font-extrabold text-white">
                Audio is processed on your device. Nothing is recorded or uploaded.
              </p>
            </div>
            <p className="micro mt-5 text-center text-brand-ink/60">
              Demo uses a general-purpose sound model. Detection is not guaranteed.
            </p>
          </div>
        )}

        {/* LOADING */}
        {phase === "loading" && (
          <div className="blk sh-ink mx-auto mt-10 max-w-xl rounded-2xl bg-brand-white p-10 text-center">
            <div className="mx-auto size-10 animate-spin rounded-full border-[5px] border-brand-ink border-t-brand-red" />
            <p className="poster mt-6 text-2xl">Starting microphone…</p>
            <p className="mt-2 font-medium text-brand-ink/70">Loading the on-device sound model.</p>
          </div>
        )}

        {/* LISTENING */}
        {phase === "listening" && (
          <div className="mx-auto mt-10 max-w-2xl space-y-5">
            <div className="blk sh-ink rounded-2xl bg-brand-white p-7">
              <div className="flex items-center justify-between">
                <h2 className="poster text-2xl text-brand-red">Listening</h2>
                <span className="micro flex items-center gap-2 rounded-full bg-brand-ink px-3 py-1.5 text-brand-yellow">
                  <span className="size-2 animate-pulse rounded-full bg-brand-yellow" /> Live
                </span>
              </div>

              <div className="mt-6 space-y-1.5">
                <div className="micro flex justify-between text-brand-ink/70">
                  <span>Mic level</span>
                </div>
                <Meter value={level} color="#101010" />
              </div>

              <div className="mt-6 space-y-1.5">
                <div className="micro flex justify-between text-brand-ink/70">
                  <span>Scream score</span>
                  <span>{Math.round(screamScore * 100)}%</span>
                </div>
                <Meter value={screamScore / 0.8} color={overThreshold ? "#e7221a" : "#ffd400"} />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="blk sh-ink-sm rounded-xl bg-brand-bone p-4">
                  <div className="micro text-brand-ink/60">Top sound</div>
                  <div className="poster mt-1 truncate text-xl text-brand-ink">{topLabel || "—"}</div>
                </div>
                <div className="blk sh-ink-sm rounded-xl bg-brand-bone p-4">
                  <div className="micro text-brand-ink/60">Confidence</div>
                  <div className="poster mt-1 text-xl text-brand-ink">{Math.round(topScore * 100)}%</div>
                </div>
              </div>

              {cooldownRemaining > 0 && (
                <p className="micro mt-5 rounded-xl bg-brand-yellow px-4 py-3 text-center text-brand-ink">
                  Cooldown — detections paused for {cooldownRemaining}s
                </p>
              )}
            </div>

            {/* Sensitivity */}
            <div className="blk sh-ink rounded-2xl bg-brand-white p-7">
              <label htmlFor="sensitivity" className="micro flex justify-between text-brand-ink">
                <span>Sensitivity threshold</span>
                <span className="text-brand-red">{threshold.toFixed(2)}</span>
              </label>
              <input
                id="sensitivity"
                type="range"
                min={0.3}
                max={0.8}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                aria-label="Scream detection sensitivity threshold"
                className="mt-4 w-full"
                style={{ accentColor: "#e7221a" }}
              />
              <div className="micro mt-2 flex justify-between text-brand-ink/50">
                <span>More sensitive</span>
                <span>Fewer false alarms</span>
              </div>
              <p className="mt-3 text-sm font-medium text-brand-ink/70">
                Triggers when the scream score is at or above this in 3 of the last ~4 readings.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={simulate}
                className="micro rounded-full border-[3px] border-brand-ink px-7 py-3.5 font-extrabold text-brand-ink transition hover:bg-brand-yellow">
                Simulate scream
              </button>
              <button type="button" onClick={stop}
                className="micro sh-ink-sm rounded-full bg-brand-ink px-8 py-3.5 font-extrabold text-brand-yellow transition hover:-translate-y-0.5">
                Stop
              </button>
            </div>
            <p className="micro text-center text-brand-ink/60">
              Demo uses a general-purpose sound model. Detection is not guaranteed.
            </p>
          </div>
        )}

        {/* COUNTDOWN */}
        {phase === "countdown" && (
          <div className="blk sh-ink mt-10 rounded-2xl bg-brand-red p-8 text-center text-white sm:p-12">
            <p className="poster text-3xl sm:text-4xl">Are you OK?</p>
            <div className="poster my-6 text-[28vw] leading-none sm:text-[160px]" aria-live="assertive">
              {countdown}
            </div>
            <p className="mx-auto max-w-md font-medium text-white/85">
              Cancel now, or an SOS alert will be triggered automatically.
            </p>
            <button type="button" onClick={cancel}
              className="micro sh-ink-sm mt-8 inline-block rounded-full bg-brand-yellow px-12 py-5 text-lg font-extrabold text-brand-ink transition hover:-translate-y-0.5">
              I'm OK — cancel
            </button>
          </div>
        )}

        {/* ALERT */}
        {phase === "alert" && (
          <div className="blk sh-ink mt-10 rounded-2xl bg-brand-ink p-8 text-center text-white sm:p-12">
            <span className="micro inline-block rounded-full bg-brand-red px-4 py-2 text-white">Emergency</span>
            <h2 className="poster mt-5 text-5xl text-brand-yellow sm:text-6xl">SOS triggered</h2>
            <p className="mt-3 font-medium text-white/80">Siren active. This is a simulated alert.</p>

            <div className="mx-auto mt-8 grid max-w-lg gap-4 text-left sm:grid-cols-2">
              <div className="rounded-xl border-[3px] border-white/25 bg-white/5 p-4">
                <div className="micro text-white/60">Time</div>
                <div className="poster mt-1 text-xl text-white">{alertInfo?.time ?? "—"}</div>
              </div>
              <div className="rounded-xl border-[3px] border-white/25 bg-white/5 p-4">
                <div className="micro text-white/60">Location</div>
                <div className="poster mt-1 break-words text-lg text-white">
                  {alertInfo?.location ?? "Not shared"}
                </div>
              </div>
            </div>

            <p className="mx-auto mt-6 max-w-md rounded-xl bg-brand-yellow px-5 py-4 font-extrabold text-brand-ink">
              Nearby verified volunteers notified (demo).
            </p>

            <button type="button" onClick={reset}
              className="micro sh-ink-sm mt-8 inline-block rounded-full bg-brand-white px-10 py-4 font-extrabold text-brand-ink transition hover:-translate-y-0.5">
              Reset (stop siren)
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
