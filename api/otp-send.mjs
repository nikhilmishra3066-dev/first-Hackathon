import { handleSend } from "../lib/otp-handlers.mjs";

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(value || req.headers["x-real-ip"] || req.socket?.remoteAddress || "").split(",")[0].trim();
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) return null;
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
    return;
  }

  const body = await readJson(req);
  if (!body) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: "invalid_request", message: "Send a JSON body." }));
    return;
  }

  const result = await handleSend(body, { env: process.env, ip: clientIp(req) });
  if (result.body.retryAfter) res.setHeader("Retry-After", String(result.body.retryAfter));
  res.statusCode = result.status;
  res.end(JSON.stringify(result.body));
}
