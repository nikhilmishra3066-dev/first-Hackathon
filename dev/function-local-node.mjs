// Local-only Node server that runs the REAL business handler with a fake supabase,
// so the Vite proxy at /functions/v1/app can be exercised end-to-end without Deno.
// Also serves a stub Overpass API so action=nearby can be tested offline.
import http from "node:http";
import { createFakeSupabase } from "./fake-supabase.mjs";

process.env.OVERPASS_URL = "http://127.0.0.1:8001/overpass";
const { handleWaitlist } = await import("../functions/handler.mjs");

const supabase = createFakeSupabase();

const OVERPASS_FIXTURE = {
  elements: [
    { type: "node", lat: 18.5204, lon: 73.8567, tags: { amenity: "police", name: "Shivajinagar Police Station", phone: "+91 20 26200100" } },
    { type: "node", lat: 18.531, lon: 73.849, tags: { amenity: "police", name: "Deccan Police Station" } },
    { type: "node", lat: 18.5214, lon: 73.8577, tags: { amenity: "hospital", name: "Sassoon General Hospital", "contact:phone": "+91 20 26128000" } },
    { type: "node", lat: 18.5144, lon: 73.862, tags: { amenity: "hospital", name: "Ruby Hall Clinic" } },
  ],
};

http
  .createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(OVERPASS_FIXTURE));
  })
  .listen(8001, "127.0.0.1");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const request = new Request(url.toString(), {
    method: req.method,
    headers: req.headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
  });
  const response = await handleWaitlist({ request, supabase });
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(await response.text());
});

server.listen(8000, "127.0.0.1", () => {
  console.log("Local waitlist Function on http://127.0.0.1:8000/functions/v1/app?action=ping");
});
