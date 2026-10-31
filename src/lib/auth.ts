import { useEffect, useState } from "react";

export const AUTH_KEY = "safeher.login.v1";
const AUTH_EVENT = "safeher:auth";

export type LoginMethod = "email" | "mobile";

export type Session = {
  who: string;
  method: LoginMethod;
  at: number;
};

export function readSession(): Session | null {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(AUTH_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<Session> | null;
      if (parsed && typeof parsed.who === "string" && parsed.who) {
        return {
          who: parsed.who,
          method: parsed.method === "mobile" ? "mobile" : "email",
          at: typeof parsed.at === "number" ? parsed.at : Date.now(),
        };
      }
    } catch {
      // storage can be unavailable in private modes
    }
  }
  return null;
}

export function saveSession(who: string, method: LoginMethod, remember: boolean): void {
  const target = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  try {
    other.removeItem(AUTH_KEY);
    target.setItem(AUTH_KEY, JSON.stringify({ who, method, at: Date.now() }));
  } catch {
    // still signed in for this page view
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearSession(): void {
  try {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

/** "local" = kept across browser restarts, "session" = this tab/window only. */
export function sessionPersistence(): "local" | "session" {
  try {
    return localStorage.getItem(AUTH_KEY) ? "local" : "session";
  } catch {
    return "session";
  }
}

export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(() => readSession());

  useEffect(() => {
    const sync = () => setSession(readSession());
    sync();
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return session;
}
