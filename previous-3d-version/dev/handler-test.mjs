import http from "node:http";
import { createFakeSupabase } from "./fake-supabase.mjs";

process.env.OVERPASS_URL = "http://127.0.0.1:8002/overpass";
const { handleWaitlist } = await import("../functions/handler.mjs");

const supabase = createFakeSupabase();

http
  .createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      elements: [
        { type: "node", lat: 18.5204, lon: 73.8567, tags: { amenity: "police", name: "Shivajinagar Police Station", phone: "+91 20 26200100" } },
        { type: "node", lat: 18.5214, lon: 73.8577, tags: { amenity: "hospital", name: "Sassoon General Hospital" } },
      ],
    }));
  })
  .listen(8002, "127.0.0.1");

const base = "http://x/functions/v1/app";
const slow = Date.now() - 5000;

const call = (method, url, body, headers = {}) =>
  handleWaitlist({
    request: new Request(url, {
      method,
      headers: body ? { "content-type": "application/json", ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
    supabase,
  });

const show = async (label, p) => {
  const r = await p;
  console.log(label, r.status, JSON.stringify(await r.json()));
};

await show("ping          ", call("GET", `${base}?action=ping`));
await show("stats empty   ", call("GET", `${base}?action=stats`));
await show("valid join    ", call("POST", `${base}?action=join`, { name: "Asha Rao", email: "asha@ex.com", city: "Pune", source: "instagram", ts: slow }));
await show("dup email     ", call("POST", `${base}?action=join`, { name: "Asha Again", email: "ASHA@ex.com ", city: "", ts: slow }));
await show("bad email     ", call("POST", `${base}?action=join`, { name: "Bob", email: "nope", ts: slow }));
await show("missing name  ", call("POST", `${base}?action=join`, { name: "  ", email: "b@ex.com", ts: slow }));
await show("too fast      ", call("POST", `${base}?action=join`, { name: "Bot", email: "bot@ex.com", ts: Date.now() }));
await show("no ts         ", call("POST", `${base}?action=join`, { name: "Bot", email: "bot@ex.com" }));
await show("honeypot      ", call("POST", `${base}?action=join`, { name: "Bot", email: "bot@ex.com", website: "http://spam", ts: slow }));
for (let i = 1; i <= 6; i += 1) {
  await show(`rate ${i}/6      `, call("POST", `${base}?action=join`, { name: `R${i}`, email: `r${i}@ex.com`, city: "Mumbai", ts: slow }, { "x-forwarded-for": "9.9.9.9" }));
}
await show("stats after   ", call("GET", `${base}?action=stats`));
await show("partner ok    ", call("POST", `${base}?action=partner`, { org: "Fergusson College", email: "dean@ferg.edu", kind: "college", message: "Pilot with our hostels." }));
await show("partner kind  ", call("POST", `${base}?action=partner`, { org: "X", email: "x@x.com", kind: "nope", message: "hi" }));
await show("partner msg   ", call("POST", `${base}?action=partner`, { org: "X", email: "x@x.com", kind: "ngo", message: "  " }));
await show("nearby ok     ", call("GET", `${base}?action=nearby&lat=18.52&lon=73.856`));
await show("nearby bad    ", call("GET", `${base}?action=nearby&lat=999&lon=0`));
await show("wrong method  ", call("GET", `${base}?action=join`));
await show("unknown action", call("GET", `${base}?action=nope`));
await show("non-json body ", handleWaitlist({ request: new Request(`${base}?action=join`, { method: "POST", headers: { "content-type": "text/plain" }, body: "hi" }), supabase }));
console.log("stored:", Object.fromEntries(Object.entries(supabase.tables).map(([k, v]) => [k, v.length])));
process.exit(0);
