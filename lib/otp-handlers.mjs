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

export async function handleSend(body, { env, ip }) {
  try {
    const channel = body?.channel;
    if (channel !== "email" && channel !== "mobile") {
      throw new OtpError("invalid_request", 400, "Choose email or mobile number.");
    }
    const target = normalizeTarget(channel, body?.target);
    deliveryMode(channel, env);

    enforceRateLimit(`target:${channel}:${target}`, TARGET_BUDGET);
    if (ip) enforceRateLimit(`ip:${ip}`, IP_BUDGET);

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
    return { status: 200, body: { ok: true, channel: result.channel, target: result.target } };
  } catch (error) {
    return failure(error);
  }
}
