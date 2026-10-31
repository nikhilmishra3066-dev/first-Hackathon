// Same-origin Function client. Application-owned messages keyed by public error codes.
export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number = 0) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requestJson(
  url: string,
  init: RequestInit = {},
  messages: Readonly<Record<string, string>> = {},
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, credentials: "same-origin" });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError("Network issue. Check your connection and try again.", "network_error");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ApiError("Access denied. Refresh and try again.", "access_denied", response.status);
  }
  if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError("Unexpected response from the service.", "invalid_response", response.status);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError("Invalid response from the service.", "invalid_response", response.status);
  }
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const code =
    typeof body?.error === "string"
      ? body.error
      : (!response.ok || body?.ok === false) && typeof body?.code === "string"
        ? body.code
        : response.ok
          ? null
          : "request_failed";
  if (!response.ok || body?.ok === false || code) {
    const resolved = code ?? "request_failed";
    const message = Object.prototype.hasOwnProperty.call(messages, resolved)
      ? messages[resolved]
      : "Something went wrong. Please try again.";
    throw new ApiError(message, resolved, response.status);
  }
  return data;
}
