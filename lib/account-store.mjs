const memory = new Map();

export class StoreError extends Error {
  constructor() {
    super("Account store unavailable.");
    this.name = "StoreError";
  }
}

function kvConfig(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export function storeMode(env) {
  if (kvConfig(env)) return "kv";
  if (env.NODE_ENV !== "production" || env.OTP_DEMO === "1") return "memory";
  return "unconfigured";
}

async function command(env, args) {
  const config = kvConfig(env);
  let response;
  try {
    response = await fetch(`${config.url}/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(6_000),
    });
  } catch (error) {
    console.error("[accounts] store unreachable", error);
    throw new StoreError();
  }
  if (!response.ok) {
    console.error("[accounts] store failed", response.status, (await response.text().catch(() => "")).slice(0, 300));
    throw new StoreError();
  }
  const data = await response.json().catch(() => null);
  if (!data || data.error) {
    console.error("[accounts] store rejected", JSON.stringify(data).slice(0, 300));
    throw new StoreError();
  }
  return data.result;
}

export function accountKey(channel, target) {
  return `safeher:account:${channel}:${target}`;
}

export async function readAccount(env, key) {
  if (storeMode(env) === "memory") {
    const raw = memory.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  const raw = await command(env, ["GET", key]);
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Creates the record only if it does not exist yet; returns the stored record. */
export async function createAccount(env, key, record) {
  const raw = JSON.stringify(record);
  if (storeMode(env) === "memory") {
    if (memory.has(key)) return { created: false, record: JSON.parse(memory.get(key)) };
    memory.set(key, raw);
    return { created: true, record };
  }
  const result = await command(env, ["SET", key, raw, "NX"]);
  if (result === "OK") return { created: true, record };
  return { created: false, record: await readAccount(env, key) };
}

export async function writeAccount(env, key, record) {
  const raw = JSON.stringify(record);
  if (storeMode(env) === "memory") {
    memory.set(key, raw);
    return;
  }
  await command(env, ["SET", key, raw]);
}
