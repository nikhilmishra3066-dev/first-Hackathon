export type ApiResult = { status: number; body: Record<string, unknown> };

export type HandlerContext = {
  env: Record<string, string | undefined>;
  ip?: string;
};

export function handleSend(body: unknown, context: HandlerContext): Promise<ApiResult>;
export function handleVerify(body: unknown, context: HandlerContext): Promise<ApiResult>;
