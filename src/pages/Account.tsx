import { useState } from "react";
import { Link } from "../router";
import { sessionPersistence, useSession } from "../lib/auth";
import { AccountMenu, initials, logOut } from "../components/account-menu";

function Mark() {
  return (
    <span className="grid size-8 place-items-center rounded-lg bg-brand-yellow text-brand-ink">
      <svg viewBox="0 0 24 24" fill="none" className="size-4.5" aria-hidden="true">
        <path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function Account() {
  const session = useSession();
  const [persistence] = useState(() => sessionPersistence());

  if (!session) return null;

  const methodLabel = session.method === "mobile" ? "Mobile number" : "Email address";
  const signedInAt = new Date(session.at).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="min-h-svh bg-brand-bone text-brand-ink">
      <header className="sticky top-0 z-50 bg-brand-ink">
        <div className="mx-auto flex h-15 max-w-5xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5 text-white">
            <Mark />
            <span className="poster text-xl tracking-wide">SafeHer</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/" className="micro hidden text-white/75 transition hover:text-brand-yellow sm:block">
              Back to home
            </Link>
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
        <p className="micro inline-block rounded-full bg-brand-ink px-4 py-2 text-brand-yellow">Your account</p>
        <h1 className="poster mt-6 text-5xl leading-[0.92] sm:text-7xl">
          Stay in <span className="text-brand-red">control.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg font-medium text-brand-ink/70">
          Everything tied to your sign-in lives here. Use the three-line menu any time to jump between sections or log out.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border-[3px] border-brand-ink bg-brand-white p-7 shadow-[8px_8px_0_#101010]">
            <div className="flex items-center gap-4">
              <span className="poster grid size-16 shrink-0 place-items-center rounded-2xl border-[3px] border-brand-ink bg-brand-red text-2xl text-white">
                {initials(session.who)}
              </span>
              <div className="min-w-0">
                <p className="micro text-brand-ink/50">Signed in as</p>
                <p className="mt-1 truncate text-lg font-extrabold" title={session.who}>{session.who}</p>
                <span className="micro mt-2 inline-block rounded-full bg-brand-yellow px-3 py-1">{methodLabel}</span>
              </div>
            </div>
            <p className="mt-6 rounded-xl bg-brand-bone px-4 py-3 text-sm font-semibold text-brand-ink/65">
              This is a demo account. Profile details, trusted contacts and wearable pairing arrive with the campus pilot.
            </p>
          </section>

          <section className="rounded-2xl border-[3px] border-brand-ink bg-brand-white p-7 shadow-[8px_8px_0_#101010]">
            <h2 className="poster text-2xl">This session</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4 border-b-2 border-dashed border-brand-ink/15 pb-3">
                <dt className="font-semibold text-brand-ink/55">Signed in</dt>
                <dd className="font-extrabold">{signedInAt}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b-2 border-dashed border-brand-ink/15 pb-3">
                <dt className="font-semibold text-brand-ink/55">Login method</dt>
                <dd className="font-extrabold">{methodLabel}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="font-semibold text-brand-ink/55">Stays signed in</dt>
                <dd className="text-right font-extrabold">
                  {persistence === "local" ? "On this device" : "Until this tab closes"}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={logOut}
              className="micro mt-6 inline-flex h-12 items-center gap-2 rounded-full border-[3px] border-brand-ink bg-brand-red px-6 text-white shadow-[5px_5px_0_#101010] transition hover:-translate-y-0.5"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Log out
            </button>
          </section>

          <section className="rounded-2xl border-[3px] border-brand-ink bg-brand-yellow p-7 shadow-[8px_8px_0_#101010]">
            <h2 className="poster text-2xl">Quick actions</h2>
            <div className="mt-5 grid gap-3">
              <Link to="/live-demo" className="flex items-center justify-between rounded-xl border-[3px] border-brand-ink bg-brand-white px-4 py-3 font-extrabold transition hover:-translate-y-0.5">
                Try the live demo <span aria-hidden="true">→</span>
              </Link>
              <a href="/#help" className="flex items-center justify-between rounded-xl border-[3px] border-brand-ink bg-brand-white px-4 py-3 font-extrabold transition hover:-translate-y-0.5">
                Find help near you <span aria-hidden="true">→</span>
              </a>
              <a href="/#join" className="flex items-center justify-between rounded-xl border-[3px] border-brand-ink bg-brand-white px-4 py-3 font-extrabold transition hover:-translate-y-0.5">
                Join the waitlist <span aria-hidden="true">→</span>
              </a>
            </div>
          </section>

          <section className="rounded-2xl border-[3px] border-brand-ink bg-brand-ink p-7 text-white shadow-[8px_8px_0_#e7221a]">
            <h2 className="poster text-2xl text-brand-yellow">Need help now?</h2>
            <p className="mt-3 font-medium text-white/75">
              In an emergency, call the national helpline. Your account stays out of the way.
            </p>
            <a href="tel:112" className="poster mt-5 inline-flex items-center gap-3 rounded-full bg-brand-red px-6 py-3 text-2xl text-white">
              Call 112
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                <path d="M6.5 3h3l1.4 4.1-2 1.5a13.3 13.3 0 0 0 5.5 5.5l1.5-2L20 13.5v3A3.5 3.5 0 0 1 16.5 20 13.5 13.5 0 0 1 4 7.5 3.5 3.5 0 0 1 6.5 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </a>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { n: "100", l: "Police" },
                { n: "108", l: "Ambulance" },
                { n: "1091", l: "Women helpline" },
              ].map((h) => (
                <a key={h.n} href={`tel:${h.n}`} className="micro rounded-full border-2 border-white/30 px-4 py-2 text-white/85 transition hover:border-brand-yellow hover:text-brand-yellow">
                  {h.n} · {h.l}
                </a>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t-[3px] border-brand-ink px-5 py-8">
        <p className="micro mx-auto max-w-5xl text-brand-ink/50">SafeHer · demo account · no details leave your device</p>
      </footer>
    </div>
  );
}
