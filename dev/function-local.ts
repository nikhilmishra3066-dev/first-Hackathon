// Local-only test entry. Injects a credential-free fake supabase into the real
// business handler, bypassing the deployment adapter (which needs platform env).
// Fixture data lives here in dev/, never in functions/ or the deployed bundle.
import { handleWaitlist } from "../functions/handler.mjs";

const rows: Array<{ id: string; email: string }> = [];

const fakeSupabase = {
  from(_table: string) {
    return {
      insert(record: { id: string; email: string }) {
        if (rows.some((r) => r.email === record.email)) {
          return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
        }
        rows.push({ id: record.id, email: record.email });
        console.log("[fixture] inserted signup:", record.email, "total:", rows.length);
        return Promise.resolve({ data: null, error: null });
      },
    };
  },
};

Deno.serve({ hostname: "127.0.0.1", port: 8000 }, async (request: Request) => {
  return handleWaitlist({ request, supabase: fakeSupabase });
});
