import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
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

const OTP_TTL_MS = 2 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;

function generateCode(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return String(buffer[0] % 1_000_000).padStart(6, "0");
}

function maskTarget(method: LoginMethod, value: string): string {
  if (method === "email") {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 2)}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
  }
  return `+91 ${value.slice(0, 2)}•••• ${value.slice(-4)}`;
}

function formatSeconds(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
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
  const [step, setStep] = useState<"credentials" | "otp" | "success">("credentials");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [who, setWho] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [digits, setDigits] = useState<string[]>(() => Array(6).fill(""));
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [otpInvalid, setOtpInvalid] = useState(false);
  const [invalid, setInvalid] = useState<{ identifier: boolean; password: boolean }>({
    identifier: false,
    password: false,
  });

  const memory = useRef<Record<LoginMethod, string>>({ email: "", mobile: "" });
  const pending = useRef<{ who: string; method: LoginMethod; remember: boolean } | null>(null);
  const redirectTimer = useRef(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

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
    if (step === "otp") {
      setNow(Date.now());
      const timer = window.setInterval(() => setNow(Date.now()), 1000);
      return () => window.clearInterval(timer);
    }
    if (step === "credentials" && window.matchMedia("(pointer: fine)").matches) {
      document.getElementById("identifier")?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (step === "otp") otpRefs.current[0]?.focus();
  }, [step]);

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
    setWho(signedInAs);

    window.setTimeout(() => {
      const startedAt = Date.now();
      setBusy(false);
      setCode(generateCode());
      setDigits(Array(6).fill(""));
      setExpiresAt(startedAt + OTP_TTL_MS);
      setResendAt(startedAt + OTP_RESEND_MS);
      setNow(startedAt);
      setOtpInvalid(false);
      setStep("otp");
    }, 900);
  }

  function onVerify(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (Date.now() >= expiresAt) {
      setError("That code expired. Resend a new one.");
      return;
    }

    const entered = digits.join("");
    if (entered.length < 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    if (entered !== code) {
      setError("That code doesn’t match. Check and try again.");
      setOtpInvalid(true);
      setDigits(Array(6).fill(""));
      otpRefs.current[0]?.focus();
      return;
    }

    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setStep("success");
      redirectTimer.current = window.setTimeout(finish, 1800);
    }, 700);
  }

  function resendCode() {
    const startedAt = Date.now();
    if (startedAt < resendAt || busy) return;
    setCode(generateCode());
    setDigits(Array(6).fill(""));
    setExpiresAt(startedAt + OTP_TTL_MS);
    setResendAt(startedAt + OTP_RESEND_MS);
    setNow(startedAt);
    setError(null);
    setOtpInvalid(false);
    otpRefs.current[0]?.focus();
  }

  function changeAccount() {
    setStep("credentials");
    setDigits(Array(6).fill(""));
    setCode("");
    setError(null);
    setNote(null);
    setOtpInvalid(false);
    setBusy(false);
  }

  function onDigitChange(index: number, raw: string) {
    const only = raw.replace(/\D/g, "");
    setError(null);
    setOtpInvalid(false);

    const next = [...digits];
    if (!only) {
      next[index] = "";
      setDigits(next);
      return;
    }
    const chars = only.slice(0, 6 - index).split("");
    chars.forEach((char, offset) => {
      next[index + offset] = char;
    });
    setDigits(next);
    const last = Math.min(5, index + chars.length - 1);
    otpRefs.current[last]?.focus();
    otpRefs.current[last]?.select();
  }

  function onOtpKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      otpRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      otpRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      otpRefs.current[index + 1]?.focus();
    }
  }

  function onOtpPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    event.preventDefault();
    const next = Array(6).fill("") as string[];
    text.split("").forEach((char, index) => {
      next[index] = char;
    });
    setDigits(next);
    setError(null);
    setOtpInvalid(false);
    const last = Math.min(5, text.length - 1);
    otpRefs.current[last]?.focus();
    otpRefs.current[last]?.select();
  }

  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const resendLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

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

              {step === "success" ? (
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
              ) : step === "otp" ? (
                <>
                  <header className={styles["card-head"]}>
                    <h1 className={`poster ${styles["card-title"]}`}>
                      {method === "email" ? (
                        <>Check your <span>inbox.</span></>
                      ) : (
                        <>Check your <span>phone.</span></>
                      )}
                    </h1>
                    <p className={styles["card-sub"]}>
                      We sent a 6-digit code to <strong>{maskTarget(method, identifier)}</strong>. It’s valid for 2 minutes.
                    </p>
                  </header>

                  <form className={styles.form} onSubmit={onVerify} noValidate>
                    <div
                      className={`${styles.otp} ${otpInvalid ? styles["is-invalid"] : ""}`}
                      role="group"
                      aria-label="One-time code"
                    >
                      {digits.map((digit, index) => (
                        <input
                          key={index}
                          ref={(el) => {
                            otpRefs.current[index] = el;
                          }}
                          className={styles["otp-box"]}
                          type="text"
                          inputMode="numeric"
                          autoComplete={index === 0 ? "one-time-code" : "off"}
                          maxLength={1}
                          value={digit}
                          aria-label={`Digit ${index + 1} of 6`}
                          onChange={(e) => onDigitChange(index, e.target.value)}
                          onKeyDown={(e) => onOtpKeyDown(index, e)}
                          onPaste={onOtpPaste}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                      ))}
                    </div>

                    <p className={styles.hint}>
                      {secondsLeft > 0
                        ? `Code expires in ${formatSeconds(secondsLeft)}.`
                        : "Code expired — resend a new one."}
                    </p>

                    {error && (
                      <p className={styles.error} role="alert">
                        {error}
                      </p>
                    )}
                    <p className={styles.note} role="status">
                      Demo mode: your code is <strong>{code}</strong>. Nothing is sent to a real inbox.
                    </p>

                    <button className={styles.submit} type="submit" disabled={busy}>
                      {busy && <span className={styles.spinner} aria-hidden="true" />}
                      <span>{busy ? "Verifying…" : "Verify & sign in"}</span>
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    <div className={styles["otp-actions"]}>
                      <button type="button" disabled={resendLeft > 0 || busy} onClick={resendCode}>
                        {resendLeft > 0 ? `Resend in ${resendLeft}s` : "Resend code"}
                      </button>
                      <button type="button" onClick={changeAccount}>
                        Change {method === "email" ? "email" : "number"}
                      </button>
                    </div>

                    <a className={styles.emergency} href="tel:112">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M6.5 3h3l1.4 4.1-2 1.5a13.3 13.3 0 0 0 5.5 5.5l1.5-2L20 13.5v3A3.5 3.5 0 0 1 16.5 20 13.5 13.5 0 0 1 4 7.5 3.5 3.5 0 0 1 6.5 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      </svg>
                      Emergency? Call 112
                    </a>
                  </form>
                </>
              ) : (
                <>
                  <header className={styles["card-head"]}>
                    <h1 className={`poster ${styles["card-title"]}`}>
                      Welcome <span>back.</span>
                    </h1>
                    <p className={styles["card-sub"]}>Use your email address or mobile number. We’ll text or email a one-time code to verify it’s you.</p>
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
                      <span>{busy ? "Sending code…" : "Send code"}</span>
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
