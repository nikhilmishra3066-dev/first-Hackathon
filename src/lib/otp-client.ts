export type OtpChannel = "email" | "mobile";

export type OtpDelivery = {
  token: string;
  target: string;
  expiresIn: number;
  resendIn: number;
  demoCode?: string;
};

export class OtpError extends Error {
  code: string;
  attemptsLeft?: number;
  retryAfter?: number;

  constructor(code: string, message: string, extra: { attemptsLeft?: number; retryAfter?: number } = {}) {
    super(message);
    this.name = "OtpError";
    this.code = code;
    this.attemptsLeft = extra.attemptsLeft;
    this.retryAfter = extra.retryAfter;
  }
}

async function post(path: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new OtpError("network", "Couldn’t reach SafeHer. Check your connection and try again.");
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }

  if (!response.ok || data?.ok !== true) {
    throw new OtpError(
      typeof data?.error === "string" ? data.error : "network",
      typeof data?.message === "string" ? data.message : "Something went wrong. Try again.",
      {
        attemptsLeft: typeof data?.attemptsLeft === "number" ? data.attemptsLeft : undefined,
        retryAfter: typeof data?.retryAfter === "number" ? data.retryAfter : undefined,
      },
    );
  }

  return data;
}

export async function requestOtp(channel: OtpChannel, target: string): Promise<OtpDelivery> {
  const data = await post("/api/otp-send", { channel, target });
  return {
    token: String(data.token),
    target: String(data.target),
    expiresIn: Number(data.expiresIn) || 120_000,
    resendIn: Number(data.resendIn) || 30_000,
    demoCode: typeof data.demoCode === "string" ? data.demoCode : undefined,
  };
}

export async function confirmOtp(token: string, code: string): Promise<void> {
  await post("/api/otp-verify", { token, code });
}

export function describeOtpError(error: unknown): string {
  if (!(error instanceof OtpError)) return "Something went wrong. Try again.";
  switch (error.code) {
    case "invalid_target":
      return error.message;
    case "delivery_failed":
      return error.message;
    case "not_configured":
      return "Code delivery isn’t set up on this deployment yet.";
    case "rate_limited":
      return error.retryAfter && error.retryAfter > 1
        ? `Slow down a moment — try again in ${error.retryAfter}s.`
        : "Slow down a moment and try again.";
    case "expired":
      return "That code expired. Resend a new one.";
    case "too_many_attempts":
      return "Too many wrong codes. Resend a new one.";
    case "invalid_code":
      return error.attemptsLeft
        ? `That code doesn’t match. ${error.attemptsLeft} ${error.attemptsLeft === 1 ? "try" : "tries"} left.`
        : "That code doesn’t match. Check the message and try again.";
    case "invalid_token":
      return "That sign-in attempt expired. Start again.";
    default:
      return error.message || "Something went wrong. Try again.";
  }
}
