import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import mascot from "../assets/mascot.jpg";
import { navigate } from "../router";
import { saveSession, type LoginMethod } from "../lib/auth";
import styles from "./login.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE_RE = /^[6-9]\d{9}$/;

const EYES = [
  { key: "left", x: 461, y: 167, r: 18 },
  { key: "right", x: 527, y: 181, r: 18 },
];

function cleanMobile(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return digits.slice(0, 10);
}

function formatWho(method: LoginMethod, value: string): string {
  if (method === "email") return value.toLowerCase();
  return `+91 ${value.slice(0, 5)} ${value.slice(5)}`;
}

/** Feathered mascot crops nudged toward the pointer so her eyes follow it. */
function useGaze(visualRef: RefObject<HTMLElement | null>, imgRef: RefObject<HTMLImageElement | null>) {
  const leftRef = useRef<HTMLSpanElement | null>(null);
  const rightRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const visualNode = visualRef.current;
    const imgNode = imgRef.current;
    const leftNode = leftRef.current;
    const rightNode = rightRef.current;
    if (!visualNode || !imgNode || !leftNode || !rightNode) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const visual: HTMLElement = visualNode;
    const img: HTMLImageElement = imgNode;
    const patches = [leftNode, rightNode];

    const eyes = patches.map((el, i) => ({
      el: el as HTMLSpanElement,
      x: EYES[i].x,
      y: EYES[i].y,
      r: EYES[i].r,
      baseX: 0,
      baseY: 0,
      offsetX: 0,
      offsetY: 0,
      targetX: 0,
      targetY: 0,
      max: 3,
    }));

    const crop = { x: 0.5, y: 0.1 };
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;

    function readCrop() {
      const computed = getComputedStyle(visual);
      crop.x = (parseFloat(computed.getPropertyValue("--eye-crop-x")) || 50) / 100;
      crop.y = (parseFloat(computed.getPropertyValue("--eye-crop-y")) || 10) / 100;
    }

    function start() {
      if (!frame) frame = requestAnimationFrame(step);
    }

    function step() {
      frame = 0;
      let moving = false;
      for (const eye of eyes) {
        eye.offsetX += (eye.targetX - eye.offsetX) * 0.16;
        eye.offsetY += (eye.targetY - eye.offsetY) * 0.16;
        if (Math.abs(eye.targetX - eye.offsetX) > 0.04 || Math.abs(eye.targetY - eye.offsetY) > 0.04) moving = true;
        eye.el.style.transform = `translate3d(${eye.offsetX.toFixed(2)}px,${eye.offsetY.toFixed(2)}px,0)`;
      }
      if (moving) start();
    }

    function aim() {
      if (!pointer) return;
      const rect = visual.getBoundingClientRect();
      const spreadX = Math.max(420, window.innerWidth * 0.32);
      const spreadY = Math.max(320, window.innerHeight * 0.32);
      for (const eye of eyes) {
        const nx = Math.max(-1, Math.min(1, (pointer.x - (rect.left + eye.baseX)) / spreadX));
        const ny = Math.max(-1, Math.min(1, (pointer.y - (rect.top + eye.baseY)) / spreadY));
        eye.targetX = nx * eye.max;
        eye.targetY = ny * eye.max;
      }
      start();
    }

    function layout() {
      readCrop();
      const vw = visual.clientWidth;
      const vh = visual.clientHeight;
      const nw = img.naturalWidth || 1024;
      const nh = img.naturalHeight || 1280;
      const scale = Math.max(vw / nw, vh / nh);
      const dw = nw * scale;
      const dh = nh * scale;
      const dx = (vw - dw) * crop.x;
      const dy = (vh - dh) * crop.y;

      for (const eye of eyes) {
        const size = 2 * eye.r * scale;
        const left = dx + eye.x * scale - size / 2;
        const top = dy + eye.y * scale - size / 2;
        eye.el.style.width = `${size}px`;
        eye.el.style.height = `${size}px`;
        eye.el.style.left = `${left}px`;
        eye.el.style.top = `${top}px`;
        eye.el.style.backgroundSize = `${dw}px ${dh}px`;
        eye.el.style.backgroundPosition = `${dx - left}px ${dy - top}px`;
        eye.baseX = left + size / 2;
        eye.baseY = top + size / 2;
        eye.max = Math.min(4, size * 0.14);
      }
      aim();
    }

    function onMove(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY };
      aim();
    }

    function onLeave() {
      pointer = null;
      for (const eye of eyes) {
        eye.targetX = 0;
        eye.targetY = 0;
      }
      start();
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    const observer = new ResizeObserver(layout);
    observer.observe(visual);

    if (img.complete) layout();
    else img.addEventListener("load", layout, { once: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [visualRef, imgRef]);

  return { leftRef, rightRef };
}

export default function Login() {
  const [method, setMethod] = useState<LoginMethod>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<{ identifier: boolean; password: boolean }>({
    identifier: false,
    password: false,
  });

  const memory = useRef<Record<LoginMethod, string>>({ email: "", mobile: "" });
  const pending = useRef<{ who: string; method: LoginMethod; remember: boolean } | null>(null);
  const redirectTimer = useRef(0);

  const visualRef = useRef<HTMLElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const { leftRef, rightRef } = useGaze(visualRef, imgRef);

  const finish = useCallback(() => {
    const next = pending.current;
    if (!next) return;
    window.clearTimeout(redirectTimer.current);
    saveSession(next.who, next.method, next.remember);
    navigate("/");
  }, []);

  useEffect(() => () => window.clearTimeout(redirectTimer.current), []);

  useEffect(() => {
    if (!who && window.matchMedia("(pointer: fine)").matches) {
      document.getElementById("identifier")?.focus();
    }
  }, [who]);

  function switchMethod(next: LoginMethod) {
    if (next === method) return;
    memory.current[method] = identifier;
    setMethod(next);
    setIdentifier(memory.current[next]);
    setInvalid({ identifier: false, password: false });
    setError(null);
    setNote(null);
  }

  function onIdentifierChange(value: string) {
    const next = method === "mobile" ? cleanMobile(value) : value;
    setIdentifier(next);
    memory.current[method] = next;
    setInvalid((v) => ({ ...v, identifier: false }));
    setError(null);
    setNote(null);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setNote(null);

    const raw = identifier.trim();
    const value = method === "email" ? raw : cleanMobile(raw);

    if (method === "email") {
      if (!value) {
        setError("Enter your email address.");
        setInvalid({ identifier: true, password: false });
        document.getElementById("identifier")?.focus();
        return;
      }
      if (!EMAIL_RE.test(value)) {
        setError("That email doesn’t look right.");
        setInvalid({ identifier: true, password: false });
        document.getElementById("identifier")?.focus();
        return;
      }
    } else {
      if (!value) {
        setError("Enter your mobile number.");
        setInvalid({ identifier: true, password: false });
        document.getElementById("identifier")?.focus();
        return;
      }
      if (!MOBILE_RE.test(value)) {
        setError("Enter a valid 10-digit Indian mobile number.");
        setInvalid({ identifier: true, password: false });
        document.getElementById("identifier")?.focus();
        return;
      }
      setIdentifier(value);
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setInvalid({ identifier: false, password: true });
      document.getElementById("password")?.focus();
      return;
    }

    setInvalid({ identifier: false, password: false });
    setBusy(true);

    const signedInAs = formatWho(method, value);
    pending.current = { who: signedInAs, method, remember };

    window.setTimeout(() => {
      setBusy(false);
      setWho(signedInAs);
      redirectTimer.current = window.setTimeout(finish, 1800);
    }, 900);
  }

  return (
    <div className={styles.root}>
      <main className={styles.page}>
        <section className={styles["login-card"]} aria-label="SafeHer login">
          <aside className={styles.visual} ref={visualRef}>
            <div className={styles["visual-top"]}>
              <span className={`micro ${styles["visual-tag"]}`}>Campus pilot soon</span>
            </div>

            <img
              ref={imgRef}
              className={styles["visual-img"]}
              src={mascot}
              alt="SafeHer mascot wearing the smart bracelet and holding up the smart ring"
            />
            <div className={styles["eye-track"]} aria-hidden="true">
              <span ref={leftRef} className={styles["eye-patch"]} />
              <span ref={rightRef} className={styles["eye-patch"]} />
            </div>
            <div className={styles["visual-shade"]} aria-hidden="true" />

            <div className={styles["visual-copy"]}>
              <p className={`poster ${styles["visual-title"]}`}>
                Safety<br />moves<br /><span>with you.</span>
              </p>
              <p className={styles["visual-sub"]}>Wearable · App · Verified community</p>
            </div>
          </aside>

          <section className={styles.pane}>
            <div className={styles["pane-inner"]}>
              <div className={styles["form-logo"]} aria-label="SafeHer">
                <span className={styles["logo-mark"]} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className={`poster ${styles["logo-type"]}`}>SafeHer</span>
              </div>

              {who ? (
                <div className={styles.success} aria-live="polite">
                  <span className={styles["success-mark"]} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M4 12.5 9 17.5 20 6.5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <h2 className={`poster ${styles["success-title"]}`}>You’re in.</h2>
                  <p className={styles["success-text"]}>
                    Signed in as <strong>{who}</strong>. Taking you to SafeHer…
                  </p>
                  <button type="button" className={styles.submit} onClick={finish}>
                    <span>Continue to SafeHer</span>
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <header className={styles["card-head"]}>
                    <h1 className={`poster ${styles["card-title"]}`}>
                      Welcome <span>back.</span>
                    </h1>
                    <p className={styles["card-sub"]}>Use your email address or mobile number to continue.</p>
                  </header>

                  <div className={styles.tabs} role="group" aria-label="Choose login method">
                    <button type="button" className={styles.tab} aria-pressed={method === "email"} onClick={() => switchMethod("email")}>
                      Email
                    </button>
                    <button type="button" className={styles.tab} aria-pressed={method === "mobile"} onClick={() => switchMethod("mobile")}>
                      Mobile number
                    </button>
                  </div>

                  <form className={styles.form} onSubmit={onSubmit} noValidate>
                    <div className={styles.field}>
                      <label htmlFor="identifier">{method === "email" ? "Email" : "Mobile number"}</label>
                      <div className={`${styles.control} ${invalid.identifier ? styles["is-invalid"] : ""}`}>
                        {method === "mobile" && <span className={styles.prefix}>+91</span>}
                        <input
                          id="identifier"
                          name="identifier"
                          type={method === "email" ? "email" : "tel"}
                          inputMode={method === "email" ? "email" : "numeric"}
                          autoComplete={method === "email" ? "email" : "tel-national"}
                          placeholder={method === "email" ? "you@email.com" : "98765 43210"}
                          spellCheck={false}
                          maxLength={method === "email" ? 254 : 10}
                          value={identifier}
                          onChange={(e) => onIdentifierChange(e.target.value)}
                        />
                      </div>
                      <p className={styles.hint}>
                        {method === "email" ? "We’ll never share your email." : "10-digit Indian mobile number."}
                      </p>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="password">Password</label>
                      <div className={`${styles.control} ${invalid.password ? styles["is-invalid"] : ""}`}>
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setInvalid((v) => ({ ...v, password: false }));
                            setError(null);
                          }}
                        />
                        <button
                          type="button"
                          className={styles.eye}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword}
                          onClick={() => {
                            setShowPassword((v) => !v);
                            document.getElementById("password")?.focus();
                          }}
                        >
                          {showPassword ? (
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M4 4l16 16M9.9 5.2A9.5 9.5 0 0 1 12 5c6.2 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.1M6.2 6.9C3.9 8.6 2.5 12 2.5 12S5.8 19 12 19c1.3 0 2.5-.3 3.6-.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M2.5 12S5.8 6.5 12 6.5 21.5 12 21.5 12 18.2 17.5 12 17.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <p className={styles.hint}>At least 6 characters.</p>
                    </div>

                    <div className={styles["meta-row"]}>
                      <label className={styles.remember}>
                        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                        Keep me signed in
                      </label>
                      <button
                        type="button"
                        className={styles["link-button"]}
                        onClick={() => {
                          setError(null);
                          setNote("Password reset isn’t live yet. Join the waitlist and we’ll email you as soon as accounts open.");
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>

                    {error && (
                      <p className={styles.error} role="alert">
                        {error}
                      </p>
                    )}
                    {note && (
                      <p className={styles.note} role="status">
                        {note}
                      </p>
                    )}

                    <button className={styles.submit} type="submit" disabled={busy}>
                      {busy && <span className={styles.spinner} aria-hidden="true" />}
                      <span>{busy ? "Signing in…" : "Sign in"}</span>
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    <a className={styles.emergency} href="tel:112">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M6.5 3h3l1.4 4.1-2 1.5a13.3 13.3 0 0 0 5.5 5.5l1.5-2L20 13.5v3A3.5 3.5 0 0 1 16.5 20 13.5 13.5 0 0 1 4 7.5 3.5 3.5 0 0 1 6.5 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      </svg>
                      Emergency? Call 112
                    </a>
                  </form>
                </>
              )}

              <footer className={styles["card-foot"]}>
                <p>New to SafeHer? Accounts open with the campus pilot.</p>
                <p className={`micro ${styles["demo-note"]}`}>Demo sign-in · accounts aren’t live yet</p>
              </footer>
            </div>
          </section>
        </section>

        <p className={styles["page-foot"]}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Your sign-in stays in this browser. No details leave your device.
        </p>
      </main>
    </div>
  );
}
