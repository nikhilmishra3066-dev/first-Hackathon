import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ApiError, requestJson } from "@/lib/api";

/* ---------------------------------- icons --------------------------------- */
const Icon = {
  Arrow: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Check: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M4 12.5 9 17.5 20 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Shield: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

type CSSVars = React.CSSProperties & Record<string, string | number>;

/* -------------------------------- utilities ------------------------------- */
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".r3d"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* Publishes smoothed cursor position as --cx/--cy so every 3D layer revolves. */
function useCursorScene() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || window.matchMedia("(pointer: coarse)").matches) return;

    const root = document.documentElement;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;

    function tick() {
      x += (targetX - x) * 0.1;
      y += (targetY - y) * 0.1;
      root.style.setProperty("--cx", x.toFixed(4));
      root.style.setProperty("--cy", y.toFixed(4));
      frame = Math.abs(targetX - x) > 0.0008 || Math.abs(targetY - y) > 0.0008
        ? requestAnimationFrame(tick)
        : 0;
    }

    function onMove(e: MouseEvent) {
      targetX = e.clientX / window.innerWidth - 0.5;
      targetY = e.clientY / window.innerHeight - 0.5;
      if (!frame) frame = requestAnimationFrame(tick);
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame) cancelAnimationFrame(frame);
      root.style.setProperty("--cx", "0");
      root.style.setProperty("--cy", "0");
    };
  }, []);
}

/* -------------------------------- 3D pieces ------------------------------- */
type Tone = "violet" | "red" | "yellow" | "teal";

function Cube({ size = 72, dur = "14s", label, tone = "violet", className }: { size?: number; dur?: string; label?: React.ReactNode; tone?: Tone; className?: string }) {
  const half = size / 2;
  const faces = [
    `rotateY(0deg) translateZ(${half}px)`,
    `rotateY(90deg) translateZ(${half}px)`,
    `rotateY(180deg) translateZ(${half}px)`,
    `rotateY(-90deg) translateZ(${half}px)`,
    `rotateX(90deg) translateZ(${half}px)`,
    `rotateX(-90deg) translateZ(${half}px)`,
  ];
  return (
    <div className={cn("cube-holder", tone !== "violet" && `tone-${tone}`, className)} aria-hidden="true">
      <div className="cube" style={{ "--s": `${size}px`, "--dur": dur } as CSSVars}>
        {faces.map((t, i) => (
          <div key={i} className="cube-face" style={{ transform: t, fontSize: size / 3 }}>{label}</div>
        ))}
      </div>
    </div>
  );
}

const RING_ITEMS: { label: string; tone: string }[] = [
  { label: "one-tap sos", tone: "text-brand-red" },
  { label: "live gps", tone: "text-brand-yellow" },
  { label: "120db siren", tone: "text-brand-pink" },
  { label: "code word", tone: "text-brand-teal" },
  { label: "crew nearby", tone: "text-brand-orange" },
  { label: "night mode", tone: "text-brand-yellow" },
  { label: "verified help", tone: "text-brand-red" },
  { label: "no spam", tone: "text-brand-teal" },
];

function RevolveRing({ radius = 230, dur = "34s" }: { radius?: number; dur?: string }) {
  const step = 360 / RING_ITEMS.length;
  return (
    <div className="ring-wrap hidden lg:block" aria-hidden="true">
      <div className="ring-spin p3d" style={{ "--ring": `${radius * 2}px`, "--ring-dur": dur } as CSSVars}>
        <div className="ring-cursor p3d">
          {RING_ITEMS.map((item, i) => (
            <div key={item.label} className="ring-chip" style={{ transform: `rotateY(${i * step}deg) translateZ(${radius}px)` }}>
              <span className={item.tone}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TiltCard({ className, children, max = 9 }: { className?: string; children: React.ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, on: false });
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setS({ rx: -py * max * 2, ry: px * max * 2, gx: (px + 0.5) * 100, gy: (py + 0.5) * 100, on: true });
  };
  const onLeave = () => setS({ rx: 0, ry: 0, gx: 50, gy: 50, on: false });
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn("p3d relative transition-transform duration-200 will-change-transform", s.on && "tilt-on", className)}
      style={{ transform: `perspective(950px) rotateX(${s.rx}deg) rotateY(${s.ry}deg)`, "--gx": `${s.gx}%`, "--gy": `${s.gy}%` } as CSSVars}
    >
      {children}
      <span className="tilt-glare" aria-hidden="true" />
    </div>
  );
}

function PrismTicker({ rows }: { rows: string[][] }) {
  const tz = 34;
  const transforms = [
    `rotateX(0deg) translateZ(${tz}px)`,
    `rotateX(90deg) translateZ(${tz}px)`,
    `rotateX(180deg) translateZ(${tz}px)`,
    `rotateX(270deg) translateZ(${tz}px)`,
  ];
  const marks = ["text-brand-yellow", "text-brand-red", "text-brand-teal", "text-brand-pink"];
  return (
    <div className="persp-near relative z-10">
      <div className="rev-soft p3d">
        <div className="prism">
          {rows.map((items, i) => (
            <div key={i} className="prism-face" style={{ transform: transforms[i] }}>
              <div className="flex shrink-0 animate-marquee items-center gap-8 pr-8">
                {[...items, ...items].map((t, j) => (
                  <span key={j} className="flex items-center gap-8 font-display text-sm font-bold tracking-[0.22em] text-muted-foreground">
                    {t} <span className={cn("text-base", marks[(i + j) % marks.length])}>✦</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- SOS button ------------------------------- */
type SosState = "idle" | "charging" | "sent";
function SosDemo() {
  const [state, setState] = useState<SosState>("idle");
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);
  const reset = useRef<number | null>(null);

  const clear = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };

  const complete = useCallback(() => {
    clear();
    setState("sent");
    setProgress(1);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.([40, 40, 40]); } catch { /* ignore */ }
    }
    reset.current = window.setTimeout(() => {
      setState("idle");
      setProgress(0);
    }, 3200);
  }, []);

  const start = useCallback(() => {
    if (state === "sent") return;
    clear();
    setState("charging");
    const started = Date.now();
    timer.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / 3000);
      setProgress(p);
      if (p >= 1) complete();
    }, 30);
  }, [state, complete]);

  const cancel = useCallback(() => {
    if (state === "sent") return;
    clear();
    setState("idle");
    setProgress(0);
  }, [state]);

  useEffect(() => () => { clear(); if (reset.current) window.clearTimeout(reset.current); }, []);

  const circumference = 2 * Math.PI * 68;

  return (
    <div className="p3d flex flex-col items-center gap-4">
      <div className="p3d relative grid size-[190px] place-items-center">
        {state !== "sent" && (
          <>
            <span className="sos-ring absolute inset-3 rounded-full border-2 border-brand-red/70" />
            <span className="sos-ring sos-ring-2 absolute inset-3 rounded-full border-2 border-brand-yellow/50" />
          </>
        )}
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r="68" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
          <circle
            cx="80" cy="80" r="68" fill="none"
            stroke={state === "sent" ? "var(--brand-teal)" : "var(--brand-red)"}
            strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - (state === "sent" ? 1 : progress))}
            style={{ transition: "stroke-dashoffset 0.08s linear, stroke 0.3s" }}
          />
        </svg>
        <button
          type="button"
          aria-label={state === "sent" ? "Alert sent to your trusted contacts" : "Hold to trigger SOS alert"}
          onPointerDown={start}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && state === "idle") { e.preventDefault(); complete(); }
          }}
          className={cn(
            "relative grid size-[132px] select-none place-items-center rounded-full font-display text-2xl font-extrabold tracking-tight",
            "transition-transform duration-150 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand-yellow",
            state === "sent"
              ? "bg-brand-teal text-[#06201c] shadow-[0_0_60px_-6px] shadow-brand-teal/70"
              : "bg-brand-red text-white shadow-[0_22px_60px_-12px] shadow-brand-red/80",
          )}
          style={{ transform: state === "charging" ? "translateZ(14px) scale(0.9)" : "translateZ(40px)" }}
        >
          {state === "sent" ? (
            <span className="flex flex-col items-center gap-1 text-base font-bold">
              <Icon.Check className="size-7" /> Alert sent
            </span>
          ) : (
            "SOS"
          )}
        </button>
      </div>
      <p className="z1 max-w-[240px] text-center text-sm text-muted-foreground" role="status" aria-live="polite">
        {state === "sent"
          ? "Live location shared with your trusted contacts. Siren on. Volunteers notified."
          : state === "charging"
            ? "Keep holding… triggering alert"
            : "Hold for 3 seconds to alert your circle. Tap-and-hold, or press Enter."}
      </p>
    </div>
  );
}

/* ------------------------------ waitlist form ----------------------------- */
const FIELD_MESSAGES: Record<string, string> = {
  invalid_name: "Please enter your name.",
  invalid_email: "That email doesn't look right.",
  invalid_city: "City name is too long.",
  invalid_body: "Please fill the form correctly.",
  too_fast: "That was too quick — please fill the form and try again.",
  rate_limited: "Too many attempts from this network. Please wait a minute.",
  write_rejected: "We couldn't save that just now. Please try again.",
  write_result_unknown: "Connection dropped. Check your state before retrying.",
  network_error: "You seem offline. Reconnect and try again.",
};

function WaitlistForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [hp, setHp] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [joined, setJoined] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const renderedAt = useRef(Date.now());
  const source = useRef("direct");

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim();
    source.current = ref ? ref.slice(0, 60) : "direct";
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setError(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanName) { setError("Please enter your name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) { setError("That email doesn't look right."); return; }

    setStatus("submitting");
    try {
      const result = await requestJson(
        "/functions/v1/app?action=join",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: cleanName,
            email: cleanEmail,
            city: city.trim() || "",
            source: source.current,
            ts: renderedAt.current,
            website: hp,
          }),
        },
        FIELD_MESSAGES,
      );
      if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== true) {
        throw new ApiError("Unexpected response.", "invalid_response");
      }
      setJoined((result as { joined?: boolean }).joined !== false);
      setStatus("done");
      window.dispatchEvent(new CustomEvent("safeher:joined"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="glass z2 mx-auto flex max-w-xl flex-col items-center gap-3 rounded-3xl px-8 py-10 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-brand-teal text-[#06201c]">
          <Icon.Check className="size-7" />
        </span>
        <h3 className="font-display text-2xl font-bold text-foreground">
          {joined ? "You're on the list!" : "You're already with us 💜"}
        </h3>
        <p className="text-muted-foreground">
          {joined
            ? `Thanks ${name.trim().split(" ")[0]} — we'll email you when SafeHer opens in your city.`
            : "That email is already registered. We'll be in touch soon."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="z2 relative mx-auto w-full max-w-3xl text-left">
      <input
        type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)}
        tabIndex={-1} autoComplete="off" aria-hidden="true"
        className="absolute -left-[9999px] size-px opacity-0"
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="wl-name" className="text-foreground">Name</Label>
          <Input id="wl-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Asha R." className="h-12 rounded-xl border-white/20 bg-brand-ink/60 text-foreground placeholder:text-muted-foreground/70" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wl-email" className="text-foreground">Email</Label>
          <Input id="wl-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com" className="h-12 rounded-xl border-white/20 bg-brand-ink/60 text-foreground placeholder:text-muted-foreground/70" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wl-city" className="text-foreground">City / College <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="wl-city" value={city} onChange={(e) => setCity(e.target.value)}
            placeholder="Pune" className="h-12 rounded-xl border-white/20 bg-brand-ink/60 text-foreground placeholder:text-muted-foreground/70" />
        </div>
      </div>
      <div className="mt-6 flex flex-col items-center gap-3">
        <Button type="submit" disabled={status === "submitting"}
          className="btn-fire h-13 w-full rounded-full px-8 text-base font-bold text-white shadow-[0_14px_40px_-12px] shadow-brand-red/70 disabled:opacity-60 sm:w-auto">
          {status === "submitting" ? "Joining…" : "Join the waitlist"}
          {status !== "submitting" && <Icon.Arrow className="size-4" />}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          No spam, ever. We only email about launch. 🔒
        </p>
        {error && <p role="alert" className="text-center text-sm font-semibold text-brand-red">{error}</p>}
      </div>
    </form>
  );
}

/* ------------------------------- live counter ----------------------------- */
type CityTally = { city: string; n: number };

function LiveCounter() {
  const [stats, setStats] = useState<{ count: number; cities: CityTally[] } | null>(null);
  const load = useCallback(() => {
    requestJson("/functions/v1/app?action=stats", {}, {})
      .then((d) => {
        const s = d as { count?: unknown; cities?: unknown };
        if (typeof s.count === "number") {
          setStats({ count: s.count, cities: Array.isArray(s.cities) ? (s.cities as CityTally[]) : [] });
        }
      })
      .catch(() => setStats(null));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("safeher:joined", load);
    return () => window.removeEventListener("safeher:joined", load);
  }, [load]);

  if (!stats || stats.count <= 0) return null;
  return (
    <div className="z1 mx-auto mb-10 flex flex-wrap items-center justify-center gap-3" aria-live="polite">
      <span className="glass rounded-full px-5 py-2 font-display text-sm font-bold text-brand-yellow">
        🔥 {stats.count.toLocaleString("en-IN")} {stats.count === 1 ? "person" : "people"} already in line
      </span>
      {stats.cities.slice(0, 3).map((c) => (
        <span key={c.city} className="rounded-full border border-brand-red/40 bg-brand-red/10 px-3 py-1 text-xs font-bold text-brand-red">
          {c.city} · {c.n}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------ help near you ----------------------------- */
type Place = { name: string; distance_m: number; phone: string | null; maps_url: string };

const HELPLINES = [
  { n: "112", l: "All-in-one emergency", c: "text-brand-red" },
  { n: "100", l: "Police", c: "text-brand-yellow" },
  { n: "108", l: "Ambulance", c: "text-brand-teal" },
  { n: "1091", l: "Women helpline", c: "text-brand-pink" },
];

const fmtDistance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

function PlaceList({ title, places, tone }: { title: string; places: Place[]; tone: string }) {
  return (
    <div className="glass p3d h-full rounded-3xl p-7">
      <h3 className={cn("z1 font-display text-lg font-extrabold uppercase tracking-wider", tone)}>{title}</h3>
      {places.length === 0 ? (
        <p className="z1 mt-3 text-sm text-muted-foreground">Nothing mapped within 4 km — call 112 and share your live location.</p>
      ) : (
        <ul className="z1 mt-4 space-y-3">
          {places.map((p) => (
            <li key={`${p.name}-${p.distance_m}`} className="rounded-2xl bg-white/[0.06] px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold text-foreground">{p.name}</span>
                <span className="shrink-0 font-display text-xs font-bold text-brand-yellow">{fmtDistance(p.distance_m)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-4 text-sm">
                {p.phone ? (
                  <a href={`tel:${p.phone.replace(/\s+/g, "")}`} className="font-semibold text-brand-teal hover:underline">{p.phone}</a>
                ) : (
                  <span className="text-muted-foreground">No public phone listed</span>
                )}
                <a href={p.maps_url} target="_blank" rel="noreferrer" className="font-semibold text-brand-pink hover:underline">Open in Maps</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HelpNearYou() {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ police: Place[]; hospitals: Place[] } | null>(null);

  const locate = () => {
    setState("loading");
    setError(null);
    setData(null);
    if (!("geolocation" in navigator)) {
      setError("This device can't share location. The helplines above always work.");
      setState("idle");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const d = await requestJson(
            `/functions/v1/app?action=nearby&lat=${pos.coords.latitude.toFixed(4)}&lon=${pos.coords.longitude.toFixed(4)}`,
            {},
            {
              nearby_unavailable: "The live directory is unreachable right now. In an emergency, call 112.",
              invalid_location: "Could not read your position. Try again, or call 112.",
            },
          );
          const v = d as { police?: Place[]; hospitals?: Place[] };
          setData({ police: v.police ?? [], hospitals: v.hospitals ?? [] });
          setState("done");
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Something went wrong. In an emergency, call 112.");
          setState("idle");
        }
      },
      (err) => {
        setError(err.code === 1
          ? "Location permission denied — the helplines above always work."
          : "Could not get your position right now. The helplines above always work.");
        setState("idle");
      },
      { timeout: 8000, maximumAge: 300000 },
    );
  };

  return (
    <section id="help" className="relative z-10 mx-auto max-w-6xl px-5 py-28">
      <SectionHead kicker="Safety net" title={<><span className="t3d-red">Help near you,</span> <span className="t3d">mapped live.</span></>}
        sub="One tap pulls the nearest police stations and hospitals from open map data. Your location is used only for this lookup and never stored." />
      <div className="persp mb-8 grid gap-4 sm:grid-cols-4">
        {HELPLINES.map((h) => (
          <a key={h.n} href={`tel:${h.n}`} className="r3d">
            <TiltCard max={6}>
              <div className="glass p3d rounded-2xl px-5 py-4 text-center">
                <div className={cn("z1 font-display text-3xl font-extrabold", h.c)}>{h.n}</div>
                <div className="z1 mt-1 text-xs uppercase tracking-wider text-muted-foreground">{h.l}</div>
              </div>
            </TiltCard>
          </a>
        ))}
      </div>
      <div className="persp">
        <div className="rev-soft p3d flex flex-col items-center gap-6">
          <Button onClick={locate} disabled={state === "loading"}
            className="btn-fire z1 h-13 rounded-full px-7 text-base font-bold text-white shadow-[0_16px_44px_-12px] shadow-brand-red/70 disabled:opacity-60">
            {state === "loading" ? "Finding help near you…" : "📍 Find help near me"}
          </Button>
          {error && <p role="alert" className="z1 max-w-xl text-center text-sm font-semibold text-brand-yellow">{error}</p>}
          {state === "done" && data && (
            <div className="grid w-full gap-6 md:grid-cols-2">
              <PlaceList title="Police stations" places={data.police} tone="text-brand-red" />
              <PlaceList title="Hospitals" places={data.hospitals} tone="text-brand-teal" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- partner form ----------------------------- */
const PARTNER_MESSAGES: Record<string, string> = {
  invalid_org: "Please tell us your organisation's name.",
  invalid_email: "That email doesn't look right.",
  invalid_kind: "Pick the closest partner type.",
  invalid_message: "Add a line about what you're looking for.",
  invalid_body: "Please fill the form correctly.",
  write_rejected: "We couldn't save that just now. Please try again.",
  write_result_unknown: "Connection dropped. Check your state before retrying.",
  network_error: "You seem offline. Reconnect and try again.",
};

const PARTNER_KINDS = [
  { v: "college", l: "College / hostel" },
  { v: "ngo", l: "NGO / government" },
  { v: "corporate", l: "Corporate safety" },
  { v: "fleet", l: "Cab / fleet network" },
  { v: "other", l: "Something else" },
];

function PartnerForm() {
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState("college");
  const [message, setMessage] = useState("");
  const [hp, setHp] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setError(null);
    setStatus("submitting");
    try {
      const result = await requestJson(
        "/functions/v1/app?action=partner",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ org: org.trim(), email: email.trim(), kind, message: message.trim(), website: hp }),
        },
        PARTNER_MESSAGES,
      );
      if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== true) {
        throw new ApiError("Unexpected response.", "invalid_response");
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="glass z2 mx-auto flex max-w-xl flex-col items-center gap-3 rounded-3xl px-8 py-10 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-brand-yellow text-[#2a1a00]">
          <Icon.Check className="size-7" />
        </span>
        <h3 className="font-display text-2xl font-bold text-foreground">Message received 🤝</h3>
        <p className="text-muted-foreground">We'll get back to {email.trim() || "you"} within two working days.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="z2 relative mx-auto w-full max-w-3xl text-left">
      <input
        type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)}
        tabIndex={-1} autoComplete="off" aria-hidden="true"
        className="absolute -left-[9999px] size-px opacity-0"
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pt-org" className="text-foreground">Organisation</Label>
          <Input id="pt-org" autoComplete="organization" value={org} onChange={(e) => setOrg(e.target.value)}
            placeholder="Fergusson College" className="h-12 rounded-xl border-white/20 bg-brand-ink/60 text-foreground placeholder:text-muted-foreground/70" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pt-email" className="text-foreground">Work email</Label>
          <Input id="pt-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@org.in" className="h-12 rounded-xl border-white/20 bg-brand-ink/60 text-foreground placeholder:text-muted-foreground/70" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pt-kind" className="text-foreground">You are a…</Label>
          <select id="pt-kind" value={kind} onChange={(e) => setKind(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/20 bg-brand-ink/60 px-3 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow">
            {PARTNER_KINDS.map((k) => <option key={k.v} value={k.v} className="bg-brand-ink">{k.l}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 space-y-1.5">
        <Label htmlFor="pt-msg" className="text-foreground">What do you need?</Label>
        <textarea id="pt-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
          placeholder="Campus pilot for 3 hostels, starting next semester…"
          className="w-full rounded-xl border border-white/20 bg-brand-ink/60 px-3 py-3 text-foreground placeholder:text-muted-foreground/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow" />
      </div>
      <div className="mt-6 flex flex-col items-center gap-3">
        <Button type="submit" disabled={status === "submitting"}
          className="h-13 w-full rounded-full border border-brand-yellow/50 bg-brand-yellow/15 px-8 text-base font-bold text-brand-yellow hover:bg-brand-yellow/25 disabled:opacity-60 sm:w-auto">
          {status === "submitting" ? "Sending…" : "Start a partnership"}
        </Button>
        {error && <p role="alert" className="text-center text-sm font-semibold text-brand-red">{error}</p>}
      </div>
    </form>
  );
}

/* --------------------------------- pieces --------------------------------- */
function Logo() {
  return (
    <a href="#top" className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight">
      <span className="grid size-8 place-items-center rounded-full bg-[conic-gradient(from_0deg,var(--brand-red),var(--brand-yellow),var(--brand-pink),var(--brand-violet),var(--brand-teal),var(--brand-red))] text-brand-ink">
        <Icon.Shield className="size-4 text-white" />
      </span>
      SafeHer
    </a>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#how", label: "How it works" },
    { href: "#ecosystem", label: "Ecosystem" },
    { href: "#plans", label: "Plans" },
    { href: "#help", label: "Help near you" },
    { href: "#partners", label: "Partners" },
    { href: "#roadmap", label: "Roadmap" },
  ];
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <div className="glass flex w-full max-w-5xl items-center justify-between rounded-full py-2.5 pl-5 pr-2.5">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition hover:text-brand-yellow">{l.label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href="#join" className="hidden sm:block">
            <Button className="btn-fire h-10 rounded-full px-5 font-bold text-white">Join waitlist</Button>
          </a>
          <button type="button" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
            className="grid size-10 place-items-center rounded-full text-foreground md:hidden">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
              {open
                ? <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                : <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="glass absolute top-[68px] w-[calc(100%-2rem)] max-w-5xl rounded-3xl p-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 font-medium text-muted-foreground transition hover:bg-white/5 hover:text-brand-yellow">{l.label}</a>
            ))}
            <a href="#join" onClick={() => setOpen(false)} className="mt-1">
              <Button className="btn-fire w-full rounded-full font-bold text-white">Join waitlist</Button>
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

function Backdrop() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="bg-shift absolute inset-0">
          <div className="absolute -left-32 -top-24 size-[520px] rounded-full bg-brand-red/22 blur-[120px] animate-blob" />
          <div className="absolute right-[-140px] top-40 size-[460px] rounded-full bg-brand-yellow/14 blur-[120px] animate-blob" style={{ animationDelay: "-6s" }} />
          <div className="absolute bottom-[-160px] left-1/3 size-[500px] rounded-full bg-brand-violet/30 blur-[130px] animate-blob" style={{ animationDelay: "-12s" }} />
          <div className="absolute left-1/2 top-1/3 size-[420px] rounded-full bg-brand-pink/18 blur-[130px] animate-blob" style={{ animationDelay: "-3s" }} />
        </div>
      </div>
      <div className="grid-floor" aria-hidden="true" />
    </>
  );
}

function SectionHead({ kicker, title, sub }: { kicker: string; title: React.ReactNode; sub?: string }) {
  return (
    <div className="r3d persp mx-auto mb-14 max-w-3xl text-center">
      <div className="rev-soft p3d">
        <span className="z1 inline-flex items-center gap-2 rounded-full border border-brand-yellow/40 bg-brand-yellow/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-brand-yellow">
          {kicker}
        </span>
      </div>
      <h2 className="mt-6 font-display text-4xl font-extrabold leading-[1.02] tracking-tight text-balance sm:text-6xl">{title}</h2>
      {sub && <p className="mt-5 text-lg text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ---------------------------------- hero ---------------------------------- */
function Hero() {
  return (
    <section className="persp relative mx-auto max-w-6xl px-5 pb-20 pt-32 sm:pt-40">
      <div className="rev-scene p3d">
        <div className="flex flex-col items-center gap-16 lg:flex-row lg:gap-8">
          {/* copy */}
          <div className="p3d flex-1 text-center lg:text-left">
            <span className="cz1 inline-flex items-center gap-2 rounded-full border border-brand-red/40 bg-brand-red/12 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-brand-red">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-red opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-brand-red" />
              </span>
              In stealth · Campus pilot soon
            </span>
            <h1 className="cz1 mt-8 font-display text-[13vw] font-extrabold uppercase leading-[0.9] tracking-tight sm:text-7xl lg:text-[76px]">
              <span className="t3d block">Safety</span>
              <span className="t3d-yellow block">has a new</span>
              <span className="t3d-red block">dimension.</span>
            </h1>
            <p className="cz2 mx-auto mt-8 max-w-xl text-lg text-muted-foreground sm:text-xl lg:mx-0">
              A smart wearable, an AI app and a crew of verified volunteers — working in every layer of your world so help reaches you in seconds. 💜
            </p>
            <div className="cz2 mt-10 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <a href="#join">
                <Button className="btn-fire h-13 rounded-full px-7 text-base font-bold text-white shadow-[0_16px_44px_-12px] shadow-brand-red/70">
                  Join the waitlist <Icon.Arrow className="size-4" />
                </Button>
              </a>
              <a href="#how">
                <Button variant="outline" className="h-13 rounded-full border-brand-yellow/45 bg-transparent px-7 text-base font-semibold text-brand-yellow hover:bg-brand-yellow/12 hover:text-brand-yellow">
                  See how it works
                </Button>
              </a>
            </div>
            <dl className="cz1 mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 lg:justify-start">
              {[["<60s", "avg alert time"], ["120dB", "built-in siren"], ["24/7", "community net"]].map(([v, l]) => (
                <div key={l} className="text-center lg:text-left">
                  <dt className="font-display text-3xl font-extrabold text-brand-yellow">{v}</dt>
                  <dd className="text-xs uppercase tracking-wider text-muted-foreground">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* 3D phone scene */}
          <div className="p3d relative flex-1 py-10">
            <RevolveRing />
            <div className="persp-near p3d relative z-10 mx-auto w-[290px]" style={{ animation: "swing 9s ease-in-out infinite" }}>
              <div className="p3d relative rounded-[44px] border border-white/15 bg-gradient-to-b from-[#1d1340] to-[#120b27] p-6 shadow-[0_50px_110px_-24px] shadow-brand-red/50">
                <div className="z1 mb-1 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                  <span>9:41</span>
                  <span className="flex items-center gap-1 text-brand-teal">● Safety mode on</span>
                </div>
                <div className="z1 mb-5 text-center font-display text-base font-bold">SafeHer</div>
                <SosDemo />
                <div className="z1 mt-5 space-y-2">
                  <div className="rounded-2xl bg-white/[0.07] px-4 py-3 text-sm">
                    <span className="font-bold text-brand-yellow">Trusted circle</span>
                    <span className="text-muted-foreground"> · Amma, Riya, Dev +2</span>
                  </div>
                  <div className="rounded-2xl bg-white/[0.07] px-4 py-3 text-sm">
                    <span className="font-bold text-brand-red">Code word</span>
                    <span className="text-muted-foreground"> · say “moonlight”</span>
                  </div>
                </div>
              </div>

              {/* floating depth chips */}
              <div className="cz3 absolute -left-16 top-16 hidden sm:block">
                <div className="glass animate-float rounded-2xl px-4 py-3 text-sm font-bold text-brand-teal shadow-xl shadow-black/50">📍 live location</div>
              </div>
              <div className="cz4 absolute -right-20 top-40 hidden sm:block">
                <div className="glass animate-float rounded-2xl px-4 py-3 text-sm font-bold text-brand-red shadow-xl shadow-black/50" style={{ animationDelay: "-2s" }}>🚨 siren armed</div>
              </div>
              <div className="cz3 absolute -right-14 bottom-24 hidden sm:block">
                <div className="glass animate-float rounded-2xl px-4 py-3 text-sm font-bold text-brand-yellow shadow-xl shadow-black/50" style={{ animationDelay: "-4s" }}>🫶 12 nearby</div>
              </div>

              {/* orbit ring */}
              <div className="orbit left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2" aria-hidden="true" />
            </div>

            {/* floating cubes */}
            <div className="absolute -left-6 top-0 hidden lg:block"><Cube size={64} dur="11s" tone="yellow" label="✦" /></div>
            <div className="absolute -right-2 bottom-0 hidden lg:block"><Cube size={84} dur="16s" tone="red" label="⌚" /></div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- page ---------------------------------- */
export default function App() {
  useReveal();
  useCursorScene();

  return (
    <div id="top" className="grain relative min-h-dvh">
      <Backdrop />
      <Nav />

      <Hero />

      <PrismTicker
        rows={[
          ["ONE-TAP SOS", "LIVE LOCATION", "120dB SIREN", "SECRET CODE WORD", "VERIFIED VOLUNTEERS", "SMART WEARABLE", "NIGHT MODE"],
          ["SAFETY IN 3D", "DEPTH OF CARE", "ALWAYS ON", "HANDS-FREE", "CAMPUS FIRST", "BUILT WITH 💜", "ZERO SPAM"],
          ["TRIGGER", "ALERT", "RESPOND", "RECOVER", "TRIGGER", "ALERT", "RESPOND", "RECOVER"],
          ["JOIN THE WAITLIST", "BE FIRST", "FOUNDER PERKS", "EARLY ACCESS", "JOIN THE WAITLIST", "BE FIRST", "FOUNDER PERKS", "EARLY ACCESS"],
        ]}
      />

      {/* PROBLEM */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-28">
        <SectionHead kicker="The problem" title={<><span className="t3d">Safety shows up</span> <span className="t3d-red">too late.</span></>}
          sub="Most apps only help after something already happened. We're building for the moment before." />
        <div className="persp">
          <div className="rev-soft p3d grid gap-6 md:grid-cols-3">
            {[
              { e: "⏱️", t: "Reactive, not proactive", d: "Existing tools kick in after the incident. Nobody has your back in the tense walk home." },
              { e: "🚇", t: "Public spaces feel risky", d: "Students, professionals and parents worry about streets, metros and late-night cabs." },
              { e: "📵", t: "No signal, no help", d: "Fumbling for a phone under stress wastes the seconds that matter most." },
            ].map((c) => (
              <TiltCard key={c.t} className="r3d">
                <article className="glass p3d h-full rounded-3xl p-8">
                  <div className="z2 mb-5 text-4xl">{c.e}</div>
                  <h3 className="z1 font-display text-xl font-bold">{c.t}</h3>
                  <p className="z1 mt-2 text-muted-foreground">{c.d}</p>
                </article>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ECOSYSTEM */}
      <section id="ecosystem" className="relative z-10 mx-auto max-w-6xl px-5 py-28">
        <SectionHead kicker="The ecosystem" title={<><span className="t3d-yellow">One tap.</span> <span className="t3d">Four layers</span> <span className="t3d-red">deep.</span></>}
          sub="Hardware, software and humans — stacked in every dimension around you." />
        <div className="persp">
          <div className="rev-soft p3d grid auto-rows-[minmax(190px,auto)] gap-6 md:grid-cols-3">
            <TiltCard className="r3d md:col-span-2">
              <article className="glass p3d relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-brand-red/30 to-transparent p-9">
                <div className="z2 text-5xl">⌚</div>
                <h3 className="z1 mt-5 font-display text-3xl font-extrabold">Smart wearable</h3>
                <p className="z1 mt-2 max-w-md text-lg text-foreground/80">A ring or bracelet with a panic button, GPS and a 120dB siren. One press starts safety mode — even from your pocket.</p>
              </article>
            </TiltCard>
            <TiltCard className="r3d">
              <article className="glass p3d h-full rounded-3xl p-8">
                <div className="z2 text-4xl">🤖</div>
                <h3 className="z1 mt-4 font-display text-xl font-bold">AI-powered app</h3>
                <p className="z1 mt-2 text-muted-foreground">Auto-sends your live location and route to your trusted circle.</p>
              </article>
            </TiltCard>
            <TiltCard className="r3d">
              <article className="glass p3d h-full rounded-3xl p-8">
                <div className="z2 text-4xl">🫶</div>
                <h3 className="z1 mt-4 font-display text-xl font-bold">Community network</h3>
                <p className="z1 mt-2 text-muted-foreground">Verified volunteers nearby respond while help is on the way.</p>
              </article>
            </TiltCard>
            <TiltCard className="r3d md:col-span-2">
              <article className="glass p3d relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-brand-yellow/22 to-transparent p-9">
                <div className="z2 text-5xl">🎙️</div>
                <h3 className="z1 mt-5 font-display text-3xl font-extrabold">Voice activation</h3>
                <p className="z1 mt-2 max-w-md text-lg text-foreground/85">Say your secret code word to trigger safety mode — hands-free, phone-free, no one else knows.</p>
              </article>
            </TiltCard>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-5 py-28">
        <SectionHead kicker="How it works" title={<><span className="t3d">Panic to help</span> <span className="t3d-teal">in 3 moves.</span></>} />
        <div className="persp grid gap-10 md:grid-cols-3">
          {[
            { n: "1", t: "Trigger", d: "Press the wearable, hold SOS in-app, or say your code word.", tone: "red" as Tone },
            { n: "2", t: "Alert", d: "Your live location flies to trusted contacts instantly.", tone: "yellow" as Tone },
            { n: "3", t: "Respond", d: "Siren sounds and nearby verified volunteers get pinged.", tone: "teal" as Tone },
          ].map((s) => (
            <div key={s.n} className="r3d persp-near flex flex-col items-center text-center">
              <div className="z2 mb-6"><Cube size={86} dur={`${10 + Number(s.n) * 3}s`} tone={s.tone} label={s.n} /></div>
              <h3 className="z1 font-display text-2xl font-bold">{s.t}</h3>
              <p className="z1 mt-2 max-w-xs text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PLANS */}
      <section id="plans" className="relative z-10 mx-auto max-w-6xl px-5 py-28">
        <SectionHead kicker="Pricing" title={<><span className="t3d-yellow">Honest pricing,</span> <span className="t3d-red">real impact.</span></>}
          sub="Planned launch pricing — early waitlist members lock in founder perks." />
        <div className="persp">
          <div className="rev-soft p3d grid gap-6 md:grid-cols-3">
            {[
              { tag: "Hardware", name: "Wearable", price: "₹1,500–2,000", unit: "one-time", feats: ["Ring or bracelet", "Panic button + siren", "GPS + 30-day battery"], featured: false, href: "#join", cta: "Get early access" },
              { tag: "Most popular", name: "Premium app", price: "₹99", unit: "/month", feats: ["Unlimited trusted circle", "Voice code word", "Route check-ins & alerts"], featured: true, href: "#join", cta: "Get early access" },
              { tag: "B2B", name: "Partnerships", price: "Custom", unit: "for orgs", feats: ["Colleges & hostels", "Corporate safety", "Cab & fleet networks"], featured: false, href: "#partners", cta: "Talk to us" },
            ].map((p) => (
              <TiltCard key={p.name} className="r3d" max={7}>
                <article className={cn("glass p3d relative flex h-full flex-col rounded-3xl p-8",
                  p.featured && "border-2 border-brand-yellow/70 bg-gradient-to-b from-brand-yellow/14 to-transparent shadow-[0_30px_80px_-24px] shadow-brand-yellow/50")}>
                  <span className={cn("z2 mb-4 w-fit rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider",
                    p.featured ? "bg-brand-yellow text-[#2a1a00]" : "bg-white/10 text-muted-foreground")}>{p.tag}</span>
                  <h3 className="z1 font-display text-lg font-bold text-muted-foreground">{p.name}</h3>
                  <div className="z1 mt-2 flex items-baseline gap-1">
                    <span className="font-display text-4xl font-extrabold text-foreground">{p.price}</span>
                    <span className="text-sm text-muted-foreground">{p.unit}</span>
                  </div>
                  <ul className="z1 mt-6 flex-1 space-y-3">
                    {p.feats.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/85">
                        <Icon.Check className={cn("mt-0.5 size-4 shrink-0", p.featured ? "text-brand-yellow" : "text-brand-teal")} /> {f}
                      </li>
                    ))}
                  </ul>
                  <a href={p.href} className="z2 mt-7">
                    <Button className={cn("w-full rounded-full font-bold",
                      p.featured ? "btn-fire text-white" : "border border-white/25 bg-transparent text-foreground hover:bg-white/10")}>
                      {p.cta}
                    </Button>
                  </a>
                </article>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section id="roadmap" className="relative z-10 mx-auto max-w-5xl px-5 py-28">
        <SectionHead kicker="Roadmap" title={<><span className="t3d-teal">How we</span> <span className="t3d">roll out.</span></>} />
        <ol className="persp relative space-y-7 border-l border-white/15 pl-8">
          {[
            { p: "Phase 1", t: "College campuses", d: "Pilot with students to test hardware + volunteer response in real conditions.", s: "In progress" },
            { p: "Phase 2", t: "Metro commuters", d: "Expand to women travelling by metro and cabs every single day.", s: "Next" },
            { p: "Phase 3", t: "NGOs & government", d: "Partner with safety initiatives and city-level emergency networks.", s: "Planned" },
          ].map((r, i) => (
            <li key={r.p} className="r3d relative">
              <span className={cn("absolute -left-[41px] grid size-6 place-items-center rounded-full border-2 border-brand-ink font-display text-[11px] font-bold",
                i === 0 ? "bg-brand-yellow text-[#2a1a00]" : "bg-white/15 text-foreground")}>{i + 1}</span>
              <TiltCard max={5}>
                <div className="glass p3d rounded-2xl p-7">
                  <div className="z1 flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-brand-red/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-red">{r.p}</span>
                    <span className="text-xs font-semibold text-muted-foreground">{r.s}</span>
                  </div>
                  <h3 className="z1 mt-3 font-display text-2xl font-bold">{r.t}</h3>
                  <p className="z1 mt-1.5 text-muted-foreground">{r.d}</p>
                </div>
              </TiltCard>
            </li>
          ))}
        </ol>
      </section>

      <HelpNearYou />

      {/* PARTNERS */}
      <section id="partners" className="relative z-10 mx-auto max-w-5xl px-5 py-28">
        <SectionHead kicker="Partners" title={<><span className="t3d-yellow">Bring SafeHer</span> <span className="t3d">to your campus</span> <span className="t3d-red">or team.</span></>}
          sub="Colleges, NGOs, corporates and fleet operators — tell us what you need and we'll come back with a pilot plan." />
        <div className="persp">
          <div className="rev-soft p3d">
            <PartnerForm />
          </div>
        </div>
      </section>

      {/* WAITLIST CTA */}
      <section id="join" className="relative z-10 mx-auto max-w-6xl px-5 pb-28">
        <div className="r3d persp relative overflow-visible rounded-[36px] border border-white/15 bg-[linear-gradient(135deg,#ff3131,#b5179e_52%,#4c1d95)] px-6 py-20 text-center sm:px-12">
          <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-brand-yellow/25 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 size-64 rounded-full bg-brand-teal/20 blur-3xl" aria-hidden="true" />
          <div className="absolute -top-10 left-8 hidden md:block"><Cube size={70} dur="12s" tone="yellow" label="💜" /></div>
          <div className="absolute -bottom-8 right-10 hidden md:block"><Cube size={56} dur="9s" tone="teal" label="✦" /></div>
          <div className="rev-soft p3d relative">
            <h2 className="z1 mx-auto max-w-3xl font-display text-4xl font-extrabold uppercase leading-[1.02] tracking-tight text-balance sm:text-6xl">
              <span className="t3d block">Be first in line</span>
              <span className="t3d-yellow block">for safer days.</span>
            </h2>
            <p className="z1 mx-auto mt-6 max-w-xl text-lg text-white/85">
              Join the waitlist and help us build a world where every woman feels safe, everywhere.
            </p>
            <div className="z2 mt-12">
              <LiveCounter />
              <WaitlistForm />
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-white/10 px-5 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <Logo />
          <p className="text-center text-sm text-muted-foreground sm:text-right">
            SafeHer is an early-stage concept. Features shown are planned.<br />
            Built with 💜 for women, everywhere.
          </p>
        </div>
      </footer>
    </div>
  );
}
