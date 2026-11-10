import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { smtpConfigured, sendSmtpMail } from "./smtp.mjs";

export const OTP_TTL_MS = 2 * 60 * 1000;
export const OTP_RESEND_MS = 30 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

const RATE_WINDOW_MS = 10 * 60 * 1000;
const TARGET_MAX = 6;
const IP_MAX = 30;
const DEV_SECRET = "safeher-dev-otp-secret";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE_RE = /^[6-9]\d{9}$/;

export class OtpError extends Error {
  constructor(code, status, message, retryAfter) {
    super(message);
    this.name = "OtpError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function normalizeTarget(channel, raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (channel === "email") {
    const email = value.toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      throw new OtpError("invalid_target", 400, "Enter a valid email address.");
    }
    return email;
  }
  if (channel === "mobile") {
    let digits = value.replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    if (!MOBILE_RE.test(digits)) {
      throw new OtpError("invalid_target", 400, "Enter a valid 10-digit Indian mobile number.");
    }
    return digits;
  }
  throw new OtpError("invalid_request", 400, "Choose email or mobile number.");
}

export function maskTarget(channel, target) {
  if (channel === "email") {
    const at = target.indexOf("@");
    const local = target.slice(0, at);
    const domain = target.slice(at);
    const head = local.slice(0, 2);
    return `${head}${"*".repeat(Math.max(3, local.length - 2))}${domain}`;
  }
  return `+91 ${target.slice(0, 2)}****${target.slice(-4)}`;
}

export function deliveryMode(channel, env) {
  const ready =
    channel === "email"
      ? Boolean(env.RESEND_API_KEY) || smtpConfigured(env)
      : Boolean(env.FAST2SMS_AUTH_KEY);
  if (ready) return "live";
  const demo = env.OTP_DEMO === "1" || env.NODE_ENV !== "production";
  if (demo) return "demo";
  throw new OtpError(
    "not_configured",
    503,
    env.OTP_DEMO === "0"
      ? "Code delivery is turned off on this deployment."
      : "Code delivery isn’t configured on this deployment yet.",
  );
}

function secretFor(env) {
  const value = env.OTP_SECRET || env.FAST2SMS_AUTH_KEY || env.RESEND_API_KEY;
  if (value) return value;
  if (env.NODE_ENV !== "production" || env.OTP_DEMO === "1") return DEV_SECRET;
  throw new OtpError("not_configured", 503, "Code signing isn’t configured on this deployment yet.");
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function hashCode(code, target, secret) {
  return createHmac("sha256", secret).update(`${code}:${target}`).digest("base64url").slice(0, 22);
}

function encodeToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `v1.${body}.${sign(`v1.${body}`, secret)}`;
}

function decodeToken(token, secret) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const expected = sign(`v1.${parts[1]}`, secret);
  const given = parts[2];
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return null;
    if (payload.c !== "email" && payload.c !== "mobile") return null;
    if (typeof payload.t !== "string" || typeof payload.e !== "number") return null;
    if (typeof payload.h !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

const sendLog = new Map();

function pruneSendLog(now) {
  for (const [key, hits] of sendLog) {
    const fresh = hits.filter((t) => now - t < RATE_WINDOW_MS);
    if (fresh.length) sendLog.set(key, fresh);
    else sendLog.delete(key);
  }
}

export function enforceRateLimit(key, budget, now = Date.now()) {
  const hits = (sendLog.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  const last = hits[hits.length - 1];
  if (hits.length >= budget.max) {
    throw new OtpError(
      "rate_limited",
      429,
      budget.message || "Too many requests. Try again in a few minutes.",
      Math.ceil((hits[0] + RATE_WINDOW_MS - now) / 1000),
    );
  }
  if (budget.gapMs && last && now - last < budget.gapMs) {
    throw new OtpError(
      "rate_limited",
      429,
      "Wait a moment before asking for another code.",
      Math.ceil((last + budget.gapMs - now) / 1000),
    );
  }
  hits.push(now);
  sendLog.set(key, hits);
  if (sendLog.size > 5000) pruneSendLog(now);
}

export const TARGET_BUDGET = { max: TARGET_MAX, gapMs: OTP_RESEND_MS };
export const IP_BUDGET = { max: IP_MAX, gapMs: 0 };
export const VERIFY_BUDGET = { max: 40, gapMs: 0, message: "Too many attempts. Wait a minute and try again." };

const failures = new Map();

function failureCount(hash, now) {
  const entry = failures.get(hash);
  if (!entry || now > entry.until) {
    failures.delete(hash);
    return 0;
  }
  return entry.count;
}

function recordFailure(hash, now) {
  const entry = failures.get(hash);
  const count = (entry && now <= entry.until ? entry.count : 0) + 1;
  failures.set(hash, { count, until: now + OTP_TTL_MS });
  if (failures.size > 5000) {
    for (const [key, value] of failures) if (now > value.until) failures.delete(key);
  }
  return count;
}

function emailHtml(code) {
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f5f1e8;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:3px solid #101010">
    <div style="background:#e7221a;color:#ffffff;padding:18px 24px;font-size:20px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase">SafeHer</div>
    <div style="padding:28px 24px 24px">
      <h1 style="margin:0 0 10px;font-size:24px;line-height:1.2;color:#101010">Your sign-in code</h1>
      <p style="margin:0;font-size:15px;line-height:1.55;color:#3a3a3a">Enter this code to finish signing in. It expires in 2 minutes.</p>
      <p style="margin:24px 0;padding:18px 0;background:#ffd400;color:#101010;text-align:center;font-family:'Courier New',monospace;font-size:38px;font-weight:800;letter-spacing:10px">${code}</p>
      <p style="margin:0;font-size:14px;line-height:1.55;color:#3a3a3a">Didn’t try to sign in? You can ignore this email — nobody can use the code without this inbox.</p>
    </div>
    <div style="padding:14px 24px;border-top:3px solid #101010;font-size:12px;color:#5a5a5a">Never share this code with anyone. SafeHer staff will never ask for it.</div>
  </div>
</body></html>`;
}

async function deliverEmail(target, code, env) {
  // Prefer Resend when a key is present; otherwise fall back to personal SMTP (Gmail).
  if (!env.RESEND_API_KEY) {
    if (!smtpConfigured(env)) {
      throw new OtpError("delivery_failed", 502, "No email provider is configured on this deployment.");
    }
    try {
      await sendSmtpMail({
        env,
        from: env.OTP_FROM_EMAIL || env.SMTP_USER,
        to: target,
        subject: `${code} is your SafeHer code`,
        text: `Your SafeHer code is ${code}. It expires in 2 minutes. Never share it with anyone.`,
        html: emailHtml(code),
      });
    } catch (error) {
      console.error("[otp] smtp failed", error?.message || error);
      throw new OtpError("delivery_failed", 502, "We couldn’t send the email. Check the mail settings and try again.");
    }
    return;
  }

  const from = env.OTP_FROM_EMAIL || "SafeHer <onboarding@resend.dev>";
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [target],
        subject: `${code} is your SafeHer code`,
        text: `Your SafeHer code is ${code}. It expires in 2 minutes. Never share it with anyone.`,
        html: emailHtml(code),
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    console.error("[otp] resend request failed", error);
    throw new OtpError("delivery_failed", 502, "We couldn’t reach the email service. Try again in a moment.");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[otp] resend failed", response.status, detail.slice(0, 400));
    throw new OtpError("delivery_failed", 502, "We couldn’t send the email. Try again in a moment.");
  }
}

async function deliverSms(target, code, env) {
  const route = env.FAST2SMS_ROUTE || "otp";
  let response;
  try {
    response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: env.FAST2SMS_AUTH_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route,
        variables_values: code,
        numbers: target,
        flash: 0,
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    console.error("[otp] fast2sms request failed", error);
    throw new OtpError("delivery_failed", 502, "We couldn’t reach the SMS service. Try again in a moment.");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok || !data || data.return !== true) {
    console.error("[otp] fast2sms failed", response.status, JSON.stringify(data).slice(0, 400));
    throw new OtpError("delivery_failed", 502, "We couldn’t send the SMS. Check the number and try again.");
  }
}

export async function createOtp({ channel, target, env }) {
  const mode = deliveryMode(channel, env);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  if (mode === "live") {
    if (channel === "email") await deliverEmail(target, code, env);
    else await deliverSms(target, code, env);
  }

  const now = Date.now();
  const token = encodeToken(
    {
      c: channel,
      t: target,
      e: now + OTP_TTL_MS,
      h: hashCode(code, target, secretFor(env)),
    },
    secretFor(env),
  );

  return {
    token,
    channel,
    target: maskTarget(channel, target),
    expiresIn: OTP_TTL_MS,
    resendIn: OTP_RESEND_MS,
    ...(mode === "demo" ? { demo: true, demoCode: code } : {}),
  };
}

export function checkOtp({ token, code, env }) {
  const payload = decodeToken(token, secretFor(env));
  if (!payload) {
    return { ok: false, error: "invalid_token", message: "Start again — that sign-in attempt is no longer valid." };
  }
  const now = Date.now();
  if (now >= payload.e) {
    failures.delete(payload.h);
    return { ok: false, error: "expired", message: "That code expired. Resend a new one." };
  }
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "invalid_code", message: "Enter the 6-digit code." };
  }
  if (failureCount(payload.h, now) >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      error: "too_many_attempts",
      message: "Too many wrong codes. Resend a new one.",
      attemptsLeft: 0,
    };
  }

  const expected = Buffer.from(payload.h);
  const given = Buffer.from(hashCode(code, payload.t, secretFor(env)));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    const attemptsLeft = Math.max(0, OTP_MAX_ATTEMPTS - recordFailure(payload.h, now));
    if (attemptsLeft === 0) {
      return {
        ok: false,
        error: "too_many_attempts",
        message: "Too many wrong codes. Resend a new one.",
        attemptsLeft: 0,
      };
    }
    return {
      ok: false,
      error: "invalid_code",
      message: "That code doesn’t match. Check the message and try again.",
      attemptsLeft,
    };
  }

  failures.delete(payload.h);
  return { ok: true, channel: payload.c, target: payload.t };
}
