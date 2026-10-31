import { fileURLToPath, URL } from "node:url";
import type { ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleSend, handleVerify } from "./lib/otp-handlers.mjs";

const proxy = { "/functions/v1/app": "http://127.0.0.1:8000" };

function otpApi(env: Record<string, string | undefined>): Plugin {
  function middleware(req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
    const path = req.url?.split("?")[0];
    if (req.method !== "POST" || (path !== "/api/otp-send" && path !== "/api/otp-verify")) {
      next();
      return;
    }

    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk;
      if (raw.length > 16_384) req.destroy();
    });
    req.on("end", async () => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json; charset=utf-8");

      let body: unknown;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "invalid_request", message: "Send a JSON body." }));
        return;
      }

      const ip = req.socket.remoteAddress || "local";
      const result =
        path === "/api/otp-send"
          ? await handleSend(body, { env, ip })
          : await handleVerify(body, { env, ip });

      if (result.body.retryAfter) res.setHeader("Retry-After", String(result.body.retryAfter));
      res.statusCode = result.status;
      res.end(JSON.stringify(result.body));
    });
  }

  return {
    name: "safeher-otp-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), "");
  const env = { ...process.env, ...loaded } as Record<string, string | undefined>;

  return {
    plugins: [react(), otpApi(env)],
    resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
    server: { host: "127.0.0.1", proxy },
    preview: { host: "127.0.0.1", proxy },
    build: { outDir: "dist" },
  };
});
