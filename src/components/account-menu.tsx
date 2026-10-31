import { useEffect, useRef, useState } from "react";
import { Link, replace } from "../router";
import { clearSession, useSession } from "../lib/auth";

export function initials(who: string): string {
  if (who.includes("@")) {
    const local = who.split("@")[0].replace(/[._-]+/g, " ").trim();
    const parts = local.split(/\s+/).filter(Boolean);
    return `${parts[0]?.[0] ?? "S"}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  const digits = who.replace(/\D/g, "");
  return digits.slice(-2) || "SH";
}

export function logOut(): void {
  clearSession();
  replace("/login");
  window.scrollTo({ top: 0 });
}

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const session = useSession();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="inline-flex h-10 items-center gap-2.5 rounded-full border-2 border-white/25 px-2.5 pr-3 text-white transition hover:border-brand-yellow hover:text-brand-yellow"
      >
        <span className="grid size-6 place-items-center rounded-full bg-brand-red text-[0.62rem] font-extrabold text-white">
          {session ? initials(session.who) : "SH"}
        </span>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border-[3px] border-brand-ink bg-brand-white text-brand-ink shadow-[8px_8px_0_rgba(255,212,0,0.9)]"
        >
          <div className="border-b-[3px] border-brand-ink bg-brand-yellow px-4 py-3">
            <p className="micro text-brand-ink/60">Signed in</p>
            <p className="mt-1 truncate font-extrabold" title={session?.who}>
              {session?.who ?? "SafeHer member"}
            </p>
          </div>
          <div className="p-2">
            <Link
              to="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-extrabold transition hover:bg-brand-bone"
            >
              My account <span aria-hidden="true">→</span>
            </Link>
            <Link
              to="/"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-extrabold transition hover:bg-brand-bone"
            >
              Home
            </Link>
            <Link
              to="/live-demo"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-extrabold transition hover:bg-brand-bone"
            >
              Live demo
            </Link>
            <a
              href="/#help"
              role="menuitem"
              className="block rounded-lg px-3 py-2.5 text-sm font-extrabold transition hover:bg-brand-bone"
            >
              Help near you
            </a>
          </div>
          <div className="border-t-[3px] border-brand-ink p-2">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                logOut();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-extrabold text-brand-red transition hover:bg-brand-red hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
