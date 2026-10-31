import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ApiError, requestJson } from "@/lib/api";
import { Link } from "./router";
import { useSession } from "./lib/auth";
import { AccountMenu, logOut } from "./components/account-menu";
import mascot from "./assets/mascot.jpg";

/* ---------------------------------- icons --------------------------------- */
const Icon = {
  Arrow: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Check: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M4 12.5 9 17.5 20 6.5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Shield: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Pin: (p: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} aria-hidden="true">
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.6" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
};

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

/* Publishes smoothed cursor position as --cx/--cy so the hero mascot tracks it. */
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

/* ------------------------------ section header ----------------------------- */
function SectionHead({ kicker, title, sub, dark, kickerClass }: {
  kicker: string;
  title: React.ReactNode;
  sub?: string;
  dark?: boolean;
  kickerClass?: string;
}) {
  return (
    <div className="r3d mx-auto mb-16 max-w-4xl text-center">
      <span className={cn("micro inline-block rounded-full px-5 py-2", kickerClass ?? (dark ? "bg-brand-yellow text-brand-ink" : "bg-brand-ink text-brand-bone"))}>
        {kicker}
      </span>
      <h2 className={cn("poster mt-7 text-5xl sm:text-7xl", dark ? "text-white" : "text-brand-ink")}>{title}</h2>
      {sub && <p className={cn("mx-auto mt-6 max-w-2xl text-lg font-medium", dark ? "text-white/80" : "text-brand-ink/70")}>{sub}</p>}
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

type CityTally = { city: string; n: number };

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
      <div className="blk sh-ink mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl bg-brand-white px-8 py-10 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-brand-red text-white">
          <Icon.Check className="size-7" />
        </span>
        <h3 className="poster text-3xl text-brand-ink">
          {joined ? "You're on the list!" : "Already with us!"}
        </h3>
        <p className="font-medium text-brand-ink/70">
          {joined
            ? `Thanks ${name.trim().split(" ")[0]} — we'll email you when SafeHer opens in your city.`
            : "That email is already registered. We'll be in touch soon."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="relative mx-auto w-full max-w-3xl text-left">
      <input
        type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)}
        tabIndex={-1} autoComplete="off" aria-hidden="true"
        className="absolute -left-[9999px] size-px opacity-0"
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="wl-name" className="micro text-brand-ink">Name</Label>
          <Input id="wl-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Asha R."
            className="h-13 rounded-xl border-[3px] border-brand-ink bg-brand-white text-brand-ink placeholder:text-brand-ink/35 focus-visible:outline-brand-red" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wl-email" className="micro text-brand-ink">Email</Label>
          <Input id="wl-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="h-13 rounded-xl border-[3px] border-brand-ink bg-brand-white text-brand-ink placeholder:text-brand-ink/35 focus-visible:outline-brand-red" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wl-city" className="micro text-brand-ink">City / College <span className="text-brand-ink/50">(optional)</span></Label>
          <Input id="wl-city" value={city} onChange={(e) => setCity(e.target.value)}
            placeholder="Pune"
            className="h-13 rounded-xl border-[3px] border-brand-ink bg-brand-white text-brand-ink placeholder:text-brand-ink/35 focus-visible:outline-brand-red" />
        </div>
      </div>
      <div className="mt-7 flex flex-col items-center gap-3">
        <Button type="submit" disabled={status === "submitting"}
          className="micro sh-ink-sm h-13 w-full rounded-full bg-brand-red px-9 text-white transition hover:-translate-y-0.5 hover:bg-[#c81c15] disabled:opacity-60 sm:w-auto">
          {status === "submitting" ? "Joining…" : "Join the waitlist"}
          {status !== "submitting" && <Icon.Arrow className="size-4" />}
        </Button>
        <p className="micro text-brand-ink/60">No spam, ever. We only email about launch.</p>
        {error && <p role="alert" className="text-center text-sm font-extrabold text-brand-red">{error}</p>}
      </div>
    </form>
  );
}

/* -------------------------------- live counter ----------------------------- */
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
    <div className="mx-auto mb-10 flex flex-wrap items-center justify-center gap-3" aria-live="polite">
      <span className="micro rounded-full bg-brand-ink px-5 py-2.5 text-brand-yellow">
        🔥 {stats.count.toLocaleString("en-IN")} {stats.count === 1 ? "person" : "people"} already in line
      </span>
      {stats.cities.slice(0, 3).map((c) => (
        <span key={c.city} className="micro rounded-full bg-brand-red px-4 py-2 text-white">
          {c.city} · {c.n}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------ help near you ----------------------------- */
type Place = { name: string; distance_m: number; phone: string | null; maps_url: string };

const HELPLINES = [
  { n: "112", l: "All-in-one emergency" },
  { n: "100", l: "Police" },
  { n: "108", l: "Ambulance" },
  { n: "1091", l: "Women helpline" },
];

const fmtDistance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

function PlaceList({ title, places }: { title: string; places: Place[] }) {
  return (
    <div className="blk sh-ink h-full rounded-2xl bg-brand-white p-7">
      <h3 className="poster text-2xl text-brand-red">{title}</h3>
      {places.length === 0 ? (
        <p className="mt-3 font-medium text-brand-ink/70">Nothing mapped within 4 km — call 112 and share your live location.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {places.map((p) => (
            <li key={`${p.name}-${p.distance_m}`} className="rounded-xl bg-brand-bone p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-extrabold text-brand-ink">{p.name}</span>
                <span className="micro shrink-0 text-brand-red">{fmtDistance(p.distance_m)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                {p.phone ? (
                  <a href={`tel:${p.phone.replace(/\s+/g, "")}`} className="font-extrabold text-brand-ink underline underline-offset-4 hover:text-brand-red">{p.phone}</a>
                ) : (
                  <span className="font-medium text-brand-ink/50">No public phone listed</span>
                )}
                <a href={p.maps_url} target="_blank" rel="noreferrer" className="font-extrabold text-brand-red underline underline-offset-4 hover:text-brand-ink">Open in Maps</a>
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
  const [resolved, setResolved] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [query, setQuery] = useState("");

  const LOOKUP_MESSAGES = {
    nearby_unavailable: "The live directory is unreachable right now. In an emergency, call 112.",
    invalid_location: "Could not read that location. Try again, or call 112.",
    place_not_found: "We couldn't find that place. Try a nearby city or area name.",
  };

  const runLookup = async (url: string, fallbackName: string | null) => {
    setState("loading");
    setError(null);
    setData(null);
    setResolved(null);
    try {
      const d = await requestJson(url, {}, LOOKUP_MESSAGES);
      const v = d as { police?: Place[]; hospitals?: Place[]; resolved?: string };
      setData({ police: v.police ?? [], hospitals: v.hospitals ?? [] });
      setResolved(v.resolved ?? fallbackName);
      setState("done");
      setManualOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. In an emergency, call 112.");
      setState("idle");
    }
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setManualOpen(true);
      setError("This device can't share location. Type your city below to find help — or call 112.");
      return;
    }
    setState("loading");
    setError(null);
    setData(null);
    setResolved(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void runLookup(
          `/functions/v1/app?action=nearby&lat=${pos.coords.latitude.toFixed(4)}&lon=${pos.coords.longitude.toFixed(4)}`,
          null,
        );
      },
      (err) => {
        setState("idle");
        setManualOpen(true);
        setError(err.code === 1
          ? "Location permission was blocked. Type your city below to find help — or call 112."
          : "We couldn't get your position. Type your city below instead — or call 112.");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  };

  const searchCity = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || state === "loading") return;
    void runLookup(`/functions/v1/app?action=nearby&q=${encodeURIComponent(q)}`, q);
  };

  return (
    <section id="help" className="bg-brand-red py-24 text-white sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHead dark kicker="Safety net" kickerClass="bg-brand-white text-brand-red"
          title={<>Help near you, <span className="text-brand-yellow">mapped live.</span></>}
          sub="One tap pulls the nearest police stations and hospitals from open map data. Your location is used only for this lookup and never stored." />

        <div className="r3d grid grid-cols-2 gap-5 md:grid-cols-4">
          {HELPLINES.map((h) => (
            <a key={h.n} href={`tel:${h.n}`}
              className="blk sh-ink rounded-2xl bg-brand-white p-5 text-center transition hover:-translate-y-1">
              <div className="poster text-4xl text-brand-red">{h.n}</div>
              <div className="micro mt-2 text-brand-ink/70">{h.l}</div>
            </a>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-4">
          <button type="button" onClick={locate} disabled={state === "loading"}
            className="micro sh-ink-sm inline-flex items-center gap-2.5 rounded-full bg-brand-ink px-8 py-4 font-extrabold text-brand-yellow transition hover:-translate-y-0.5 disabled:opacity-60">
            <Icon.Pin className="size-4" />
            {state === "loading" ? "Finding help…" : "Find help near me"}
          </button>
          <button type="button" onClick={() => setManualOpen((v) => !v)}
            className="micro text-brand-white/80 underline underline-offset-4 transition hover:text-brand-yellow">
            {manualOpen ? "Hide city search" : "Location blocked? Enter your city instead"}
          </button>
        </div>

        {manualOpen && (
          <form onSubmit={searchCity} className="mx-auto mt-6 flex max-w-md gap-3">
            <input
              type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Kothrud, Pune" aria-label="City or area"
              className="h-13 w-full rounded-full border-[3px] border-brand-ink bg-brand-white px-5 text-brand-ink placeholder:text-brand-ink/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow"
            />
            <button type="submit" disabled={state === "loading" || !query.trim()}
              className="sh-ink-sm micro rounded-full bg-brand-ink px-6 font-extrabold text-brand-yellow transition hover:-translate-y-0.5 disabled:opacity-60">
              Search
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mx-auto mt-8 max-w-xl rounded-2xl bg-brand-ink px-6 py-4 text-center font-extrabold text-white">
            {error}
          </p>
        )}

        {state === "done" && data && (
          <div className="mt-12">
            {resolved && (
              <p className="mb-6 text-center font-extrabold text-brand-yellow">Showing help near {resolved}</p>
            )}
            <div className="grid gap-8 md:grid-cols-2">
              <PlaceList title="Police stations" places={data.police} />
              <PlaceList title="Hospitals" places={data.hospitals} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------- partner form ------------------------------ */
const PARTNER_MESSAGES: Record<string, string> = {
  invalid_org: "Please tell us your organisation's name.",
  invalid_email: "That work email doesn't look right.",
  invalid_kind: "Please pick the closest match.",
  invalid_message: "A line or two about what you need helps a lot.",
  invalid_body: "Please fill the form correctly.",
  too_fast: "That was too quick — please fill the form and try again.",
  rate_limited: "Too many attempts from this network. Please wait a minute.",
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
      <div className="blk sh-ink mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl bg-brand-yellow px-8 py-10 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-brand-ink text-brand-yellow">
          <Icon.Check className="size-7" />
        </span>
        <h3 className="poster text-3xl text-brand-ink">Message received</h3>
        <p className="font-medium text-brand-ink/75">We'll get back to {email.trim() || "you"} within two working days.</p>
      </div>
    );
  }

  const field = "h-13 w-full rounded-xl border-[3px] border-brand-ink bg-brand-bone px-4 text-brand-ink placeholder:text-brand-ink/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-red";

  return (
    <form onSubmit={onSubmit} noValidate className="blk sh-ink relative mx-auto w-full max-w-3xl rounded-2xl bg-brand-white p-7 text-left sm:p-9">
      <input
        type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)}
        tabIndex={-1} autoComplete="off" aria-hidden="true"
        className="absolute -left-[9999px] size-px opacity-0"
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pt-org" className="micro text-brand-ink">Organisation</Label>
          <Input id="pt-org" autoComplete="organization" value={org} onChange={(e) => setOrg(e.target.value)}
            placeholder="Fergusson College" className={field} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pt-email" className="micro text-brand-ink">Work email</Label>
          <Input id="pt-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@org.in" className={field} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pt-kind" className="micro text-brand-ink">You are a…</Label>
          <select id="pt-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
            {PARTNER_KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 space-y-1.5">
        <Label htmlFor="pt-msg" className="micro text-brand-ink">What do you need?</Label>
        <textarea id="pt-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
          placeholder="Campus pilot for 3 hostels, starting next semester…"
          className="w-full rounded-xl border-[3px] border-brand-ink bg-brand-bone px-4 py-3 text-brand-ink placeholder:text-brand-ink/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-red" />
      </div>
      <div className="mt-7 flex flex-col items-center gap-3">
        <Button type="submit" disabled={status === "submitting"}
          className="micro sh-ink-sm h-13 rounded-full bg-brand-ink px-9 text-brand-yellow transition hover:-translate-y-0.5 hover:bg-black disabled:opacity-60">
          {status === "submitting" ? "Sending…" : "Start a partnership"}
        </Button>
        {error && <p role="alert" className="text-center text-sm font-extrabold text-brand-red">{error}</p>}
      </div>
    </form>
  );
}

/* --------------------------------- pieces --------------------------------- */
function Logo() {
  return (
    <a href="#top" className="flex items-center gap-2.5 text-white">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-yellow text-brand-ink">
        <Icon.Shield className="size-4.5" />
      </span>
      <span className="poster text-xl tracking-wide">SafeHer</span>
    </a>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const links: { href: string; label: string; route?: boolean }[] = [
    { href: "#how", label: "How it works" },
    { href: "#ecosystem", label: "Ecosystem" },
    { href: "#plans", label: "Plans" },
    { href: "#help", label: "Help near you" },
    { href: "#partners", label: "Partners" },
    { href: "/live-demo", label: "Live demo", route: true },
  ];
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-brand-ink">
      <div className="mx-auto flex h-15 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="hidden items-center gap-7 lg:flex">
          {links.map((l) =>
            l.route ? (
              <Link key={l.href} to={l.href} className="micro text-white/75 transition hover:text-brand-yellow">{l.label}</Link>
            ) : (
              <a key={l.href} href={l.href} className="micro text-white/75 transition hover:text-brand-yellow">{l.label}</a>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2">
          <a href="#join" className="hidden sm:block">
            <span className="micro inline-block rounded-full bg-brand-yellow px-5 py-2.5 font-extrabold text-brand-ink transition hover:bg-[#e6bf00]">Join waitlist</span>
          </a>
          <div className="hidden lg:block">
            <AccountMenu />
          </div>
          <button type="button" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
            className="grid size-10 place-items-center rounded-lg text-white lg:hidden">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
              {open
                ? <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                : <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t-2 border-white/15 bg-brand-ink px-5 py-4 lg:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((l) =>
              l.route ? (
                <Link key={l.href} to={l.href} onClick={() => setOpen(false)}
                  className="micro rounded-lg px-3 py-3 text-white/80 transition hover:bg-white/10 hover:text-brand-yellow">{l.label}</Link>
              ) : (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)}
                  className="micro rounded-lg px-3 py-3 text-white/80 transition hover:bg-white/10 hover:text-brand-yellow">{l.label}</a>
              ),
            )}
            <a href="#join" onClick={() => setOpen(false)} className="mt-2">
              <span className="micro block rounded-full bg-brand-yellow px-5 py-3 text-center font-extrabold text-brand-ink">Join waitlist</span>
            </a>
            <div className="mt-4 border-t-2 border-white/15 pt-3">
              <p className="micro px-3 text-white/45">Signed in</p>
              <p className="mt-1 truncate px-3 font-extrabold text-white">{session?.who ?? "SafeHer member"}</p>
              <Link to="/account" onClick={() => setOpen(false)}
                className="micro mt-2 block rounded-lg px-3 py-3 text-white/80 transition hover:bg-white/10 hover:text-brand-yellow">
                My account
              </Link>
              <button type="button" onClick={() => { setOpen(false); logOut(); }}
                className="micro mt-1 block w-full rounded-lg px-3 py-3 text-left text-brand-yellow transition hover:bg-white/10">
                Log out
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function Ticker() {
  const items = ["ONE-TAP SOS", "LIVE LOCATION", "120dB SIREN", "SECRET CODE WORD", "VERIFIED VOLUNTEERS", "SMART WEARABLE", "CAMPUS FIRST", "ZERO SPAM"];
  return (
    <div className="overflow-hidden bg-brand-ink py-4" aria-hidden="true">
      <div className="marquee-track items-center gap-10 pr-10">
        {[...items, ...items].map((t, i) => (
          <span key={i} className="poster flex items-center gap-10 text-xl text-brand-yellow">
            {t} <span className="text-base text-white">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- hero ---------------------------------- */
function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-brand-red pt-15 text-white">
      <div className="persp relative mx-auto max-w-6xl px-5 pb-14 pt-8">
        <div className="mascot-par pointer-events-none flex justify-center">
          <img
            src={mascot}
            alt="3D illustration of a young woman wearing the SafeHer smart bracelet and holding up the smart ring"
            className="h-[44svh] max-h-[460px] w-auto select-none object-contain lg:h-[62svh] lg:max-h-[600px]"
          />
        </div>

        <div className="par-soft relative -mt-[6svh] grid items-end gap-9 lg:-mt-[14svh] lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <span className="micro inline-flex items-center gap-2.5 rounded-full border-2 border-white px-5 py-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-yellow opacity-80" />
                <span className="relative inline-flex size-2 rounded-full bg-brand-yellow" />
              </span>
              In stealth · Campus pilot soon
            </span>
            <h1 className="poster mt-6 text-[13vw] leading-[0.9] sm:text-7xl lg:text-[88px]">
              <span className="block">Safety that</span>
              <span className="block">moves with</span>
              <span className="block text-brand-yellow">you.</span>
            </h1>
          </div>
          <div className="lg:pb-3">
            <p className="max-w-sm text-lg font-medium text-white/90">
              A smart wearable, an AI app and a verified volunteer network — working together so help reaches women faster.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <a href="#join" className="micro sh-ink-sm inline-block rounded-full bg-brand-white px-7 py-4 font-extrabold text-brand-ink transition hover:-translate-y-0.5">
                Join the waitlist
              </a>
              <a href="#how" className="micro inline-block rounded-full border-2 border-white px-7 py-4 font-extrabold text-white transition hover:bg-white hover:text-brand-red">
                See how it works
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- app ----------------------------------- */
export default function App() {
  useReveal();
  useCursorScene();

  return (
    <div className="bg-brand-bone text-brand-ink">
      <Nav />
      <Hero />
      <Ticker />

      {/* PROBLEM */}
      <section className="bg-brand-bone py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHead kicker="The problem"
            title={<>Safety shows up <span className="text-brand-red">too late.</span></>}
            sub="Most tools only help after something already happened. We're building for the moment before." />
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { e: "⏱️", t: "Reactive, not proactive", d: "Existing tools kick in after the incident. Nobody has your back on the tense walk home." },
              { e: "🚇", t: "Public spaces feel risky", d: "Students, professionals and parents worry about streets, metros and late-night cabs." },
              { e: "📵", t: "No signal, no help", d: "Fumbling for a phone under stress wastes the seconds that matter most." },
            ].map((c) => (
              <article key={c.t} className="blk sh-ink r3d rounded-2xl bg-brand-white p-7">
                <div className="blk sh-ink-sm grid size-14 place-items-center rounded-xl bg-brand-yellow text-2xl">{c.e}</div>
                <h3 className="poster mt-6 text-2xl text-brand-ink">{c.t}</h3>
                <p className="mt-2.5 font-medium text-brand-ink/70">{c.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ECOSYSTEM */}
      <section id="ecosystem" className="bg-brand-ink py-24 text-white sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHead dark kicker="The ecosystem"
            title={<>One tap. <span className="text-brand-yellow">Four layers</span> <span className="text-brand-red">deep.</span></>}
            sub="Hardware, software and humans — stacked around you, always on." />
          <div className="grid auto-rows-[minmax(190px,auto)] gap-8 md:grid-cols-3">
            <article className="r3d rounded-2xl border-[3px] border-brand-white bg-brand-red p-8 md:col-span-2">
              <div className="text-5xl">⌚</div>
              <h3 className="poster mt-5 text-3xl">Smart wearable</h3>
              <p className="mt-2.5 max-w-md text-lg font-medium text-white/85">A ring or bracelet with a panic button, GPS and a 120dB siren. One press starts safety mode — even from your pocket.</p>
            </article>
            <article className="r3d rounded-2xl border-[3px] border-brand-ink bg-brand-yellow p-7 text-brand-ink">
              <div className="text-4xl">🤖</div>
              <h3 className="poster mt-4 text-2xl">AI-powered app</h3>
              <p className="mt-2 font-medium text-brand-ink/75">Auto-sends your live location and route to your trusted circle.</p>
            </article>
            <article className="r3d rounded-2xl border-[3px] border-brand-ink bg-brand-bone p-7 text-brand-ink">
              <div className="text-4xl">🫶</div>
              <h3 className="poster mt-4 text-2xl">Community network</h3>
              <p className="mt-2 font-medium text-brand-ink/75">Verified volunteers nearby respond while help is on the way.</p>
            </article>
            <article className="r3d rounded-2xl border-[3px] border-brand-white bg-brand-white p-8 text-brand-ink md:col-span-2">
              <div className="text-5xl">🎙️</div>
              <h3 className="poster mt-5 text-3xl">Voice activation</h3>
              <p className="mt-2.5 max-w-md text-lg font-medium text-brand-ink/75">Say your secret code word to trigger safety mode — hands-free, phone-free, no one else knows.</p>
            </article>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="bg-brand-yellow py-24 text-brand-ink sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHead kicker="How it works" kickerClass="bg-brand-ink text-brand-yellow"
            title={<>Panic to help <span className="text-brand-red">in 3 moves.</span></>} />
          <div className="grid gap-12 md:grid-cols-3 md:gap-8">
            {[
              { n: "1", t: "Trigger", d: "Press the wearable, hold SOS in-app, or say your code word." },
              { n: "2", t: "Alert", d: "Your live location flies to trusted contacts instantly." },
              { n: "3", t: "Respond", d: "Siren sounds and nearby verified volunteers get pinged." },
            ].map((s) => (
              <div key={s.n} className="r3d flex flex-col items-center text-center">
                <div className="poster sh-red grid size-24 place-items-center rounded-2xl border-[3px] border-brand-ink bg-brand-ink text-5xl text-brand-yellow">{s.n}</div>
                <h3 className="poster mt-7 text-3xl">{s.t}</h3>
                <p className="mt-2.5 max-w-xs font-medium text-brand-ink/75">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLANS */}
      <section id="plans" className="bg-brand-bone py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHead kicker="Pricing"
            title={<>Honest pricing, <span className="text-brand-red">real impact.</span></>}
            sub="Planned launch pricing — early waitlist members lock in founder perks." />
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { tag: "Hardware", name: "Wearable", price: "₹1,500–2,000", unit: "one-time", feats: ["Ring or bracelet", "Panic button + siren", "GPS + 30-day battery"], featured: false, href: "#join", cta: "Get early access" },
              { tag: "Most popular", name: "Premium app", price: "₹99", unit: "/month", feats: ["Unlimited trusted circle", "Voice code word", "Route check-ins & alerts"], featured: true, href: "#join", cta: "Get early access" },
              { tag: "B2B", name: "Partnerships", price: "Custom", unit: "for orgs", feats: ["Colleges & hostels", "Corporate safety", "Cab & fleet networks"], featured: false, href: "#partners", cta: "Talk to us" },
            ].map((p) => (
              <article key={p.name}
                className={cn("r3d flex h-full flex-col rounded-2xl border-[3px] border-brand-ink p-8",
                  p.featured ? "sh-yellow bg-brand-red text-white" : "sh-ink bg-brand-white text-brand-ink")}>
                <span className={cn("micro w-fit rounded-full px-4 py-1.5",
                  p.featured ? "bg-brand-yellow text-brand-ink" : "bg-brand-ink text-brand-bone")}>{p.tag}</span>
                <h3 className={cn("micro mt-5", p.featured ? "text-white/80" : "text-brand-ink/60")}>{p.name}</h3>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="poster text-4xl">{p.price}</span>
                  <span className={cn("micro", p.featured ? "text-white/70" : "text-brand-ink/50")}>{p.unit}</span>
                </div>
                <ul className="mt-7 flex-1 space-y-3">
                  {p.feats.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 font-medium">
                      <Icon.Check className={cn("mt-0.5 size-4 shrink-0", p.featured ? "text-brand-yellow" : "text-brand-red")} /> {f}
                    </li>
                  ))}
                </ul>
                <a href={p.href} className="mt-8">
                  <span className={cn("micro block rounded-full px-6 py-3.5 text-center font-extrabold transition hover:-translate-y-0.5",
                    p.featured ? "bg-brand-yellow text-brand-ink" : "bg-brand-ink text-brand-bone")}>
                    {p.cta}
                  </span>
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section id="roadmap" className="bg-brand-ink py-24 text-white sm:py-28">
        <div className="mx-auto max-w-4xl px-5">
          <SectionHead dark kicker="Roadmap"
            title={<>How we <span className="text-brand-yellow">roll out.</span></>} />
          <ol className="relative space-y-9 border-l-4 border-brand-yellow pl-9">
            {[
              { p: "Phase 1", t: "College campuses", d: "Pilot with students to test hardware + volunteer response in real conditions.", s: "In progress" },
              { p: "Phase 2", t: "Metro commuters", d: "Expand to women travelling by metro and cabs every single day.", s: "Next" },
              { p: "Phase 3", t: "NGOs & government", d: "Partner with safety initiatives and city-level emergency networks.", s: "Planned" },
            ].map((r, i) => (
              <li key={r.p} className="r3d relative">
                <span className="poster absolute -left-[51px] grid size-8 place-items-center rounded-full border-[3px] border-brand-ink bg-brand-red text-sm text-white">{i + 1}</span>
                <div className="blk sh-yellow rounded-2xl bg-brand-white p-7 text-brand-ink">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="micro rounded-full bg-brand-red px-4 py-1.5 text-white">{r.p}</span>
                    <span className="micro text-brand-ink/50">{r.s}</span>
                  </div>
                  <h3 className="poster mt-4 text-2xl">{r.t}</h3>
                  <p className="mt-1.5 font-medium text-brand-ink/70">{r.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <HelpNearYou />

      {/* PARTNERS */}
      <section id="partners" className="bg-brand-bone py-24 sm:py-28">
        <div className="mx-auto max-w-5xl px-5">
          <SectionHead kicker="Partners" kickerClass="bg-brand-red text-white"
            title={<>Bring SafeHer to your <span className="bg-brand-yellow px-2 text-brand-ink">campus</span> or team.</>}
            sub="Colleges, NGOs, corporates and fleet operators — tell us what you need and we'll come back with a pilot plan." />
          <div className="r3d">
            <PartnerForm />
          </div>
        </div>
      </section>

      {/* WAITLIST CTA */}
      <section id="join" className="bg-brand-yellow py-24 text-brand-ink sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHead kicker="Waitlist" kickerClass="bg-brand-ink text-brand-yellow"
            title={<>Be first in line <span className="text-brand-red">for safer days.</span></>}
            sub="Join the waitlist and help us build a world where every woman feels safe, everywhere." />
          <div className="r3d">
            <LiveCounter />
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-brand-ink px-5 py-12 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <Logo />
          <p className="text-center text-sm font-medium text-white/60 sm:text-right">
            SafeHer is an early-stage concept. Features shown are planned.<br />
            Built with 💜 for women, everywhere.
          </p>
        </div>
      </footer>
    </div>
  );
}
