import {
  StoreError,
  accountKey,
  createAccount,
  readAccount,
  storeMode,
  writeAccount,
} from "./account-store.mjs";
import { hashPassword, passwordProblem, verifyPassword } from "./passwords.mjs";
import {
  IP_BUDGET,
  OtpError,
  TARGET_BUDGET,
  VERIFY_BUDGET,
  checkOtp,
  createOtp,
  deliveryMode,
  enforceRateLimit,
  normalizeTarget,
} from "./otp-server.mjs";

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const STORE_DOWN = "Sign-in is temporarily unavailable. Try again in a moment.";
const STORE_MISSING = "Sign-in accounts aren’t set up on this deployment yet.";

function failure(error) {
  if (error instanceof OtpError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: error.code,
        message: error.message,
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      },
    };
  }
  console.error("[otp] unexpected error", error);
  return { status: 500, body: { ok: false, error: "server_error", message: "Something went wrong. Try again." } };
}

async function loadAccount(env, key) {
  try {
    return await readAccount(env, key);
  } catch (error) {
    if (error instanceof StoreError) throw new OtpError("accounts_unavailable", 503, STORE_DOWN);
    throw error;
  }
}

async function storeAccount(env, key, record) {
  try {
    return await writeAccount(env, key, record);
  } catch (error) {
    if (error instanceof StoreError) throw new OtpError("accounts_unavailable", 503, STORE_DOWN);
    throw error;
  }
}

function requireStore(env) {
  if (storeMode(env) === "unconfigured") {
    throw new OtpError("accounts_not_configured", 503, STORE_MISSING);
  }
}

export async function handleSend(body, { env, ip }) {
  try {
    const channel = body?.channel;
    if (channel !== "email" && channel !== "mobile") {
      throw new OtpError("invalid_request", 400, "Choose email or mobile number.");
    }
    const target = normalizeTarget(channel, body?.target);
    const password = typeof body?.password === "string" ? body.password : "";
    const problem = passwordProblem(password);
    if (problem) throw new OtpError("weak_password", 400, problem);

    deliveryMode(channel, env);
    requireStore(env);
    if (ip) enforceRateLimit(`send:${ip}`, IP_BUDGET);

    const key = accountKey(channel, target);
    const now = Date.now();
    const account = await loadAccount(env, key);

    if (account) {
      if (account.lockedUntil && now < account.lockedUntil) {
        throw new OtpError(
          "locked",
          429,
          "Too many wrong passwords. Try again later.",
          Math.ceil((account.lockedUntil - now) / 1000),
        );
      }
      const matches = await verifyPassword(password, account.passwordHash);
      if (!matches) {
        const failed = (Number(account.failed) || 0) + 1;
        const lockedUntil = failed >= MAX_FAILED ? now + LOCK_MS : 0;
        try {
          await storeAccount(env, key, { ...account, failed, lockedUntil, updatedAt: new Date(now).toISOString() });
        } catch (error) {
          console.error("[otp] failed to record wrong password", error);
        }
        if (lockedUntil) {
          throw new OtpError("locked", 429, "Too many wrong passwords. Try again in 15 minutes.", Math.ceil(LOCK_MS / 1000));
        }
        throw new OtpError("invalid_credentials", 401, "Incorrect password. Try again.");
      }
    }

    enforceRateLimit(`target:${channel}:${target}`, TARGET_BUDGET);
    const result = await createOtp({ channel, target, env });

    return {
      status: 200,
      body: {
        ok: true,
        channel: result.channel,
        target: result.target,
        token: result.token,
        expiresIn: result.expiresIn,
        resendIn: result.resendIn,
        serverNow: Date.now(),
        newAccount: !account,
        ...(result.demo ? { demo: true, demoCode: result.demoCode } : {}),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function handleVerify(body, { env, ip }) {
  try {
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token) {
      throw new OtpError("invalid_request", 400, "Start again — that sign-in attempt is no longer valid.");
    }
    const code = typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";
    if (code.length !== 6) {
      throw new OtpError("invalid_code", 400, "Enter the 6-digit code.");
    }
    if (ip) enforceRateLimit(`verify:${ip}`, VERIFY_BUDGET);

    const result = checkOtp({ token, code, env });
    if (!result.ok) {
      const status = result.error === "expired" ? 410 : result.error === "invalid_token" ? 400 : 401;
      return { status, body: result };
    }

    requireStore(env);
    const key = accountKey(result.channel, result.target);
    const now = new Date().toISOString();
    let created = false;

    const existing = await loadAccount(env, key);
    if (existing) {
      await storeAccount(env, key, { ...existing, failed: 0, lockedUntil: 0, lastSeenAt: now });
    } else {
      const password = typeof body?.password === "string" ? body.password : "";
      const problem = passwordProblem(password);
      if (problem) throw new OtpError("weak_password", 400, problem);

      const passwordHash = await hashPassword(password);
      let outcome;
      try {
        outcome = await createAccount(env, key, {
          v: 1,
          passwordHash,
          createdAt: now,
          lastSeenAt: now,
          failed: 0,
          lockedUntil: 0,
        });
      } catch (error) {
        if (error instanceof StoreError) throw new OtpError("accounts_unavailable", 503, STORE_DOWN);
        throw error;
      }
      created = outcome.created;
    }

    return { status: 200, body: { ok: true, channel: result.channel, target: result.target, created } };
  } catch (error) {
    return failure(error);
  }
}
