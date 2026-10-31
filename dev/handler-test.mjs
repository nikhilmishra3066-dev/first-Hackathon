import http from "node:http";
import { createFakeSupabase } from "./fake-supabase.mjs";

process.env.OVERPASS_URL = "http://127.0.0.1:8002/overpass";
const { handleWaitlist } = await import("../functions/handler.mjs");

const supabase = createFakeSupabase();

http
  .createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        elements: [
          {
            type: "node",
            lat: 18.5204,
            lon: 73.8567,
            tags: { amenity: "police", name: "Shivajinagar Police Station", phone: "+91 20 26200100" },
          },
          {
            type: "node",
            lat: 18.5214,
            lon: 73.8577,
            tags: { amenity: "hospital", name: "Sassoon General Hospital" },
          },
        ],
      })
    );
  })
  .listen(8002, "127.0.0.1");

const base = "http://127.0.0.1/functions/v1/app";
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
  const data = await r.json();
  console.log(label.padEnd(20), r.status, JSON.stringify(data).slice(0, 100));
  return data;
};

console.log("=== RUNNING SAFEHER BACKEND TESTS ===");

await show("ping", call("GET", `${base}?action=ping`));
await show("stats empty", call("GET", `${base}?action=stats`));
await show("valid join", call("POST", `${base}?action=join`, { name: "Asha Rao", email: "asha@ex.com", city: "Pune", source: "instagram", ts: slow }));
await show("dup email", call("POST", `${base}?action=join`, { name: "Asha Again", email: "ASHA@ex.com ", city: "", ts: slow }));
await show("partner ok", call("POST", `${base}?action=partner`, { org: "Fergusson College", email: "dean@ferg.edu", kind: "college", message: "Pilot with our hostels." }));

// 1. Contact Management
console.log("\n--- Contact Tests ---");
const addedContact = await show("add contact 1", call("POST", `${base}?action=contacts`, {
  name: "Pooja Sharma",
  phone: "+919876543210",
  email: "pooja@example.com",
  relationship: "Sister",
  is_primary: true,
}));
const contactId = addedContact.contact?.id;

await show("add contact 2", call("POST", `${base}?action=contacts`, {
  name: "Campus Security",
  phone: "+912026000000",
  relationship: "Campus Guard",
  is_primary: false,
}));

await show("list contacts", call("GET", `${base}?action=contacts`));

if (contactId) {
  await show("update contact", call("PUT", `${base}?action=contacts`, {
    id: contactId,
    name: "Pooja Sharma (Emergency)",
    relationship: "Sister & Flatmate",
  }));
}

// 2. Test Notification
console.log("\n--- Notification Tests ---");
await show("test notification", call("POST", `${base}?action=test_alert`, {
  name: "Pooja Sharma",
  phone: "+919876543210",
  email: "pooja@example.com",
}));

// 3. SOS Trigger & Workflow
console.log("\n--- SOS Emergency Workflow Tests ---");
const triggerRes = await show("sos trigger", call("POST", `${base}?action=sos_trigger`, {
  triggerType: "manual",
  location: { lat: 18.5204, lon: 73.8567, accuracy: 12 },
}));

const sessionId = triggerRes.session?.id;
const token = triggerRes.session?.token;

if (sessionId) {
  await show("sos status", call("GET", `${base}?action=sos_status&sessionId=${sessionId}`));

  await show("location update", call("POST", `${base}?action=sos_location`, {
    sessionId,
    lat: 18.5215,
    lon: 73.8580,
    accuracy: 8,
    speed: 1.2,
  }));
}

if (token) {
  await show("public tracking", call("GET", `${base}?action=sos_track&token=${token}`));
}

if (sessionId) {
  await show("sos resolve", call("POST", `${base}?action=sos_resolve`, { sessionId }));
  await show("sos status after", call("GET", `${base}?action=sos_status&sessionId=${sessionId}`));
}

// 4. Preferences
console.log("\n--- Preferences Tests ---");
await show("get prefs", call("GET", `${base}?action=preferences`));
await show("save prefs", call("POST", `${base}?action=preferences`, {
  scream_sensitivity: 0.65,
  secret_code_word: "SAFEHER RED",
  siren_auto_play: true,
}));
await show("get prefs after", call("GET", `${base}?action=preferences`));

console.log("\nAll Backend Handler tests finished successfully!");
process.exit(0);
