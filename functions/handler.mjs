// SafeHer backend Function.
// Supports waitlist, partners, nearby amenities, emergency contacts,
// and complete real-time SOS workflow with notification dispatch & live tracking.

import { sendSmsNotification, sendEmailNotification, getProviderCapabilities } from "./notifications.mjs";

const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9\s\-()]{7,20}$/;
const PARTNER_KINDS = ["college", "ngo", "corporate", "fleet", "other"];
const OVERPASS_URL = globalThis.process?.env?.OVERPASS_URL || null;
const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_UA = "SafeHer-web/1.0 (women-safety help directory)";
const NEARBY_RADIUS_M = 4000;

// Rate limiting map
const hits = new Map();
function rateLimited(ip, maxHits = 5, windowMs = 600_000) {
  if (hits.size > 10000) hits.clear();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > maxHits;
}

function readText(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

const toRad = (d) => (d * Math.PI) / 180;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const NOMINATIM_GAP_MS = 1100;

function distanceM(aLat, aLon, bLat, bLon) {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
}

const nearbyCache = new Map();

function placeEntry(kind, name, phone, lat, lon, pLat, pLon) {
  return {
    name: readText(name, 120) || (kind === "police" ? "Police station" : "Hospital"),
    distance_m: Math.round(distanceM(lat, lon, pLat, pLon)),
    phone: readText(phone, 40),
    maps_url: `https://www.google.com/maps/search/?api=1&query=${pLat},${pLon}`,
  };
}

const byDistance = (a, b) => a.distance_m - b.distance_m;
const trimList = (list) => list.sort(byDistance).slice(0, 5);

async function nominatimPlaces(kind, lat, lon) {
  const dLat = NEARBY_RADIUS_M / 111_320;
  const dLon = dLat / Math.cos(toRad(lat));
  const viewbox = `${lon - dLon},${lat + dLat},${lon + dLon},${lat - dLat}`;
  const url =
    `${NOMINATIM_URL}?amenity=${kind}&viewbox=${viewbox}&bounded=1` +
    `&limit=10&format=jsonv2&extratags=1`;
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": NOMINATIM_UA },
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error(`nominatim ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("nominatim bad payload");
  const out = [];
  for (const row of rows) {
    const pLat = Number(row?.lat);
    const pLon = Number(row?.lon);
    if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) continue;
    if (distanceM(lat, lon, pLat, pLon) > NEARBY_RADIUS_M) continue;
    const tags = row.extratags ?? {};
    const fallback = String(row.display_name ?? "").split(",")[0];
    out.push(
      placeEntry(
        kind,
        row.name ?? fallback,
        tags.phone || tags["contact:phone"] || tags["emergency:phone"],
        lat, lon, pLat, pLon,
      ),
    );
  }
  return out;
}

async function geocode(query) {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`;
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": NOMINATIM_UA },
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error(`nominatim ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const lat = Number(rows[0]?.lat);
  const lon = Number(rows[0]?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const name = String(rows[0]?.display_name ?? "").split(",").slice(0, 2).join(",").trim();
  return { lat, lon, name };
}

async function overpassPlaces(lat, lon) {
  const query =
    `[out:json][timeout:12];` +
    `(node[amenity=police](around:${NEARBY_RADIUS_M},${lat},${lon});` +
    `node[amenity=hospital](around:${NEARBY_RADIUS_M},${lat},${lon}););out 60;`;
  const urls = OVERPASS_URL ? [OVERPASS_URL] : OVERPASS_MIRRORS;
  let payload = null;
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(9_000),
      });
      if (!response.ok) {
        lastError = new Error(`overpass ${response.status}`);
        continue;
      }
      payload = await response.json();
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!payload) throw lastError ?? new Error("overpass unreachable");

  const police = [];
  const hospitals = [];
  for (const el of payload?.elements ?? []) {
    const tags = el.tags ?? {};
    const kind = tags.amenity;
    if (kind !== "police" && kind !== "hospital") continue;
    if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue;
    const entry = placeEntry(
      kind,
      tags.name,
      tags.phone || tags["contact:phone"] || tags["emergency:phone"],
      lat, lon, el.lat, el.lon,
    );
    (kind === "police" ? police : hospitals).push(entry);
  }
  return { police, hospitals };
}

async function nearbyPlaces(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = nearbyCache.get(key);
  if (cached && Date.now() - cached.at < 600_000) return cached.value;

  let lists = null;
  if (!OVERPASS_URL) {
    try {
      const police = await nominatimPlaces("police", lat, lon);
      await sleep(NOMINATIM_GAP_MS);
      const hospitals = await nominatimPlaces("hospital", lat, lon);
      lists = { police, hospitals };
    } catch {
      lists = null;
    }
  }
  if (!lists) lists = await overpassPlaces(lat, lon);

  const value = { police: trimList(lists.police), hospitals: trimList(lists.hospitals) };
  nearbyCache.set(key, { at: Date.now(), value });
  return value;
}

export async function handleWaitlist({ request, supabase }) {
  const urlObj = new URL(request.url);
  const params = urlObj.searchParams;
  const action = params.get("action");
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "127.0.0.1";

  // ----------------------------------------------------
  // System & Providers
  // ----------------------------------------------------
  if (action === "ping") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    return json({ ok: true, service: "safeher-core", version: "2.1.0", schema: 3 });
  }

  if (action === "providers") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    return json({ ok: true, providers: getProviderCapabilities() });
  }

  // ----------------------------------------------------
  // Stats
  // ----------------------------------------------------
  if (action === "stats") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    try {
      const { count, error } = await supabase.from("events").select("id", { head: true, count: "exact" });
      if (error) return json({ ok: false, error: "stats_unavailable" }, 503);
      const { data, error: cityError } = await supabase.from("events").select("city").eq("kind", "join").limit(5000);
      const tally = new Map();
      if (!cityError) {
        for (const row of data ?? []) {
          const city = readText(row.city, 80);
          if (city) tally.set(city, (tally.get(city) ?? 0) + 1);
        }
      }
      const cities = [...tally.entries()]
        .map(([city, n]) => ({ city, n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 5);
      return json({ ok: true, count: count ?? 0, cities });
    } catch {
      return json({ ok: false, error: "stats_unavailable" }, 503);
    }
  }

  // ----------------------------------------------------
  // Nearby Police & Hospitals
  // ----------------------------------------------------
  if (action === "nearby") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    const latRaw = params.get("lat");
    const lonRaw = params.get("lon");
    let lat = Number(latRaw);
    let lon = Number(lonRaw);
    const hasCoords =
      latRaw !== null && lonRaw !== null &&
      Number.isFinite(lat) && Number.isFinite(lon) &&
      Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

    let resolved = null;
    if (!hasCoords) {
      const q = readText(params.get("q"), 80);
      if (!q) return json({ ok: false, error: "invalid_location" }, 400);
      try {
        const place = await geocode(q);
        if (!place) return json({ ok: false, error: "place_not_found" }, 404);
        lat = place.lat;
        lon = place.lon;
        resolved = place.name || q;
        await sleep(NOMINATIM_GAP_MS);
      } catch {
        return json({ ok: false, error: "nearby_unavailable" }, 503);
      }
    }

    try {
      const value = await nearbyPlaces(lat, lon);
      return json({ ok: true, radius_m: NEARBY_RADIUS_M, ...(resolved ? { resolved } : {}), ...value });
    } catch {
      return json({ ok: false, error: "nearby_unavailable" }, 503);
    }
  }

  // ----------------------------------------------------
  // Waitlist Join
  // ----------------------------------------------------
  if (action === "join") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    const type = request.headers.get("content-type") ?? "";
    if (!type.includes("application/json")) return json({ ok: false, error: "invalid_body" }, 400);

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_body" }, 400);

    if (readText(body.website, 200)) return json({ ok: true, joined: false });

    const renderedAt = Number(body.ts);
    if (!Number.isFinite(renderedAt) || renderedAt <= 0 || Date.now() - renderedAt < 1200) {
      return json({ ok: false, error: "too_fast" }, 429);
    }

    if (rateLimited(ip, 5, 600_000)) return json({ ok: false, error: "rate_limited" }, 429);

    const name = readText(body.name, 80);
    const emailRaw = readText(body.email, 254);
    let city = null;
    if (typeof body.city === "string" && body.city.trim() !== "") {
      city = readText(body.city, 80);
      if (!city) return json({ ok: false, error: "invalid_city" }, 400);
    }
    const source = readText(body.source, 60) || "direct";

    if (!name) return json({ ok: false, error: "invalid_name" }, 400);
    if (!emailRaw || !EMAIL.test(emailRaw)) return json({ ok: false, error: "invalid_email" }, 400);
    const email = emailRaw.toLowerCase();

    try {
      const { error } = await supabase.from("waitlist").insert({
        id: crypto.randomUUID(),
        name,
        email,
        city,
        source,
        created_at: new Date().toISOString(),
      });
      if (error) {
        if (String(error.code) === "23505") return json({ ok: true, joined: false });
        return json({ ok: false, error: "write_rejected" }, 503);
      }
      try {
        await supabase.from("events").insert({
          id: crypto.randomUUID(),
          kind: "join",
          city: city ?? "",
          source,
          created_at: new Date().toISOString(),
        });
      } catch {
        // counter is best-effort
      }
      return json({ ok: true, joined: true });
    } catch {
      return json({ ok: false, error: "write_result_unknown" }, 503);
    }
  }

  // ----------------------------------------------------
  // Partner Form
  // ----------------------------------------------------
  if (action === "partner") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    const type = request.headers.get("content-type") ?? "";
    if (!type.includes("application/json")) return json({ ok: false, error: "invalid_body" }, 400);

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_body" }, 400);
    if (readText(body.website, 200)) return json({ ok: true, received: false });

    const org = readText(body.org, 120);
    const emailRaw = readText(body.email, 254);
    const kindRaw = readText(body.kind, 20);
    const message = readText(body.message, 600);

    if (!org) return json({ ok: false, error: "invalid_org" }, 400);
    if (!emailRaw || !EMAIL.test(emailRaw)) return json({ ok: false, error: "invalid_email" }, 400);
    if (!kindRaw || !PARTNER_KINDS.includes(kindRaw)) return json({ ok: false, error: "invalid_kind" }, 400);
    if (!message) return json({ ok: false, error: "invalid_message" }, 400);

    try {
      const { error } = await supabase.from("partners").insert({
        id: crypto.randomUUID(),
        org,
        email: emailRaw.toLowerCase(),
        kind: kindRaw,
        message,
        created_at: new Date().toISOString(),
      });
      if (error) return json({ ok: false, error: "write_rejected" }, 503);
      return json({ ok: true, received: true });
    } catch {
      return json({ ok: false, error: "write_result_unknown" }, 503);
    }
  }

  // ====================================================
  // EMERGENCY CONTACT MANAGEMENT (PHASE 5)
  // ====================================================
  if (action === "contacts") {
    const userId = params.get("userId") || "default-user";

    // GET: List contacts
    if (request.method === "GET") {
      try {
        const { data, error } = await supabase
          .from("contacts")
          .select("*")
          .eq("user_id", userId)
          .order("is_primary", { ascending: false });
        if (error) return json({ ok: false, error: "contacts_lookup_failed" }, 500);
        return json({ ok: true, contacts: data || [] });
      } catch {
        return json({ ok: false, error: "contacts_lookup_failed" }, 500);
      }
    }

    // POST: Add new contact
    if (request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
      const name = readText(body?.name, 80);
      const phoneRaw = readText(body?.phone, 30);
      const emailRaw = readText(body?.email, 254);
      const relationship = readText(body?.relationship, 40) || "Trusted Contact";
      const isPrimary = Boolean(body?.is_primary);

      if (!name) return json({ ok: false, error: "invalid_contact_name" }, 400);
      if (!phoneRaw || !PHONE.test(phoneRaw)) return json({ ok: false, error: "invalid_phone_number" }, 400);
      if (emailRaw && !EMAIL.test(emailRaw)) return json({ ok: false, error: "invalid_email_address" }, 400);

      const newContact = {
        id: crypto.randomUUID(),
        user_id: userId,
        name,
        phone: phoneRaw,
        email: emailRaw ? emailRaw.toLowerCase() : null,
        relationship,
        is_primary: isPrimary,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      try {
        // If this one is marked primary, demote existing primary contacts
        if (isPrimary) {
          await supabase.from("contacts").update({ is_primary: false }).eq("user_id", userId);
        }
        const { error } = await supabase.from("contacts").insert(newContact);
        if (error) return json({ ok: false, error: "contact_save_failed" }, 500);
        return json({ ok: true, contact: newContact });
      } catch {
        return json({ ok: false, error: "contact_save_failed" }, 500);
      }
    }

    // PUT: Update contact
    if (request.method === "PUT") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
      const id = readText(body?.id, 50);
      if (!id) return json({ ok: false, error: "missing_contact_id" }, 400);

      const updates = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) {
        const name = readText(body.name, 80);
        if (!name) return json({ ok: false, error: "invalid_contact_name" }, 400);
        updates.name = name;
      }
      if (body.phone !== undefined) {
        const phone = readText(body.phone, 30);
        if (!phone || !PHONE.test(phone)) return json({ ok: false, error: "invalid_phone_number" }, 400);
        updates.phone = phone;
      }
      if (body.email !== undefined) {
        if (body.email === null || body.email === "") {
          updates.email = null;
        } else {
          const email = readText(body.email, 254);
          if (!email || !EMAIL.test(email)) return json({ ok: false, error: "invalid_email_address" }, 400);
          updates.email = email.toLowerCase();
        }
      }
      if (body.relationship !== undefined) {
        updates.relationship = readText(body.relationship, 40) || "Trusted Contact";
      }
      if (body.is_primary !== undefined) {
        updates.is_primary = Boolean(body.is_primary);
        if (updates.is_primary) {
          await supabase.from("contacts").update({ is_primary: false }).eq("user_id", userId);
        }
      }

      try {
        const { error } = await supabase.from("contacts").update(updates).eq("id", id);
        if (error) return json({ ok: false, error: "contact_update_failed" }, 500);
        return json({ ok: true, updated: true });
      } catch {
        return json({ ok: false, error: "contact_update_failed" }, 500);
      }
    }

    // DELETE: Delete contact
    if (request.method === "DELETE") {
      const id = params.get("id");
      if (!id) return json({ ok: false, error: "missing_contact_id" }, 400);
      try {
        const { error } = await supabase.from("contacts").delete().eq("id", id);
        if (error) return json({ ok: false, error: "contact_delete_failed" }, 500);
        return json({ ok: true, deleted: true });
      } catch {
        return json({ ok: false, error: "contact_delete_failed" }, 500);
      }
    }

    return json({ error: "method_not_allowed" }, 405);
  }

  // ----------------------------------------------------
  // Send Test Notification (PHASE 5)
  // ----------------------------------------------------
  if (action === "test_alert") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    if (rateLimited(ip, 6, 60_000)) return json({ ok: false, error: "rate_limited" }, 429);

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
    const contactName = readText(body?.name, 80) || "Trusted Contact";
    const phone = readText(body?.phone, 30);
    const email = readText(body?.email, 254);

    const results = [];
    const testMsg = `[SafeHer TEST] Hi ${contactName}, this is a test alert to verify your emergency contact setup with SafeHer. No action is required.`;

    if (phone) {
      const smsRes = await sendSmsNotification({ to: phone, message: testMsg, contactName, isTest: true });
      results.push({ channel: "sms", destination: phone, ...smsRes });
    }

    if (email) {
      const htmlBody = `
        <div style="font-family: sans-serif; max-width: 500px; padding: 20px; border: 3px solid #101010; border-radius: 16px; background-color: #f5f1e8;">
          <h2 style="color: #e7221a; margin-top: 0;">SafeHer Test Verification</h2>
          <p>Hi <strong>${contactName}</strong>,</p>
          <p>This is a verification test to confirm your email is set up to receive emergency SOS alerts from SafeHer.</p>
          <p style="background: #ffffff; padding: 12px; border-radius: 8px; border: 2px solid #101010;">
            Status: <strong>Verified & Ready</strong>
          </p>
          <p style="color: #666; font-size: 12px;">You are receiving this because you were listed as an emergency contact on SafeHer.</p>
        </div>
      `;
      const emailRes = await sendEmailNotification({
        to: email,
        subject: "[SafeHer TEST] Emergency Contact Verification",
        htmlText: htmlBody,
        contactName,
        isTest: true,
      });
      results.push({ channel: "email", destination: email, ...emailRes });
    }

    return json({ ok: true, results });
  }

  // ====================================================
  // EMERGENCY SOS TRIGGER & WORKFLOW (PHASE 2 & 6)
  // ====================================================
  if (action === "sos_trigger") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    if (rateLimited(ip, 10, 60_000)) return json({ ok: false, error: "rate_limited" }, 429);

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }

    const userId = readText(body?.userId, 50) || "default-user";
    const triggerType = readText(body?.triggerType, 30) || "manual";
    const lat = Number(body?.location?.lat);
    const lon = Number(body?.location?.lon);
    const accuracy = Number(body?.location?.accuracy);
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lon);

    // Duplicate check: avoid spamming multiple identical sessions within 90 seconds
    const { data: recentSessions } = await supabase
      .from("emergency_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1);

    let session;
    let isExistingSession = false;

    if (recentSessions && recentSessions.length > 0) {
      const active = recentSessions[0];
      const activeAge = Date.now() - new Date(active.started_at).getTime();
      if (activeAge < 90_000) {
        session = active;
        isExistingSession = true;
      }
    }

    if (!session) {
      const sessionId = crypto.randomUUID();
      const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
      const nowIso = new Date().toISOString();

      session = {
        id: sessionId,
        user_id: userId,
        trigger_type: triggerType,
        status: "active",
        started_at: nowIso,
        resolved_at: null,
        initial_location: hasLocation ? { lat, lon, accuracy: accuracy || 10 } : null,
        last_location: hasLocation ? { lat, lon, accuracy: accuracy || 10, timestamp: Date.now() } : null,
        token,
      };

      await supabase.from("emergency_sessions").insert(session);
    }

    // Origin tracking base URL
    const host = request.headers.get("host") || "safeher.app";
    const proto = host.includes("127.0.0.1") || host.includes("localhost") ? "http" : "https";
    const trackingUrl = `${proto}://${host}/track?token=${session.token}`;
    const mapsLink = hasLocation ? `https://maps.google.com/?q=${lat.toFixed(5)},${lon.toFixed(5)}` : null;

    // Fetch trusted emergency contacts
    const { data: contacts } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", userId);

    const alertResults = [];
    const contactList = contacts || [];

    // Message bodies
    const victimName = "SafeHer User";
    const smsMessage = `🚨 SAFEHER EMERGENCY ALERT: ${victimName} triggered an emergency SOS (${triggerType.replace(/_/g, " ")}). ` +
      (mapsLink ? `Location: ${mapsLink} ` : `Location unavailable. `) +
      `Live Tracking: ${trackingUrl} - Please check on them immediately!`;

    const emailSubject = `🚨 EMERGENCY: SafeHer SOS Alert for ${victimName}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 4px solid #101010; border-radius: 20px; background-color: #f5f1e8;">
        <div style="background-color: #e7221a; color: #ffffff; padding: 16px 20px; border-radius: 12px; text-align: center; font-weight: bold; font-size: 24px; letter-spacing: 1px;">
          EMERGENCY SOS ALERT
        </div>
        <p style="font-size: 18px; margin-top: 20px; color: #101010;">
          <strong>${victimName}</strong> has triggered an emergency SOS alert via SafeHer.
        </p>
        <div style="background: #ffffff; border: 2px solid #101010; border-radius: 12px; padding: 16px; margin: 20px 0;">
          <p style="margin: 6px 0;"><strong>Trigger:</strong> ${triggerType.toUpperCase()}</p>
          <p style="margin: 6px 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
          ${hasLocation ? `<p style="margin: 6px 0;"><strong>Coordinates:</strong> ${lat.toFixed(5)}, ${lon.toFixed(5)} (±${Math.round(accuracy || 10)}m)</p>` : "<p style=\"margin: 6px 0;\"><strong>Location:</strong> Acquiring GPS...</p>"}
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${trackingUrl}" style="background-color: #ffd400; color: #101010; border: 3px solid #101010; padding: 16px 32px; border-radius: 999px; font-weight: 800; font-size: 16px; text-decoration: none; display: inline-block;">
            VIEW LIVE TRACKING MAP →
          </a>
        </div>
        ${mapsLink ? `<p style="text-align: center;"><a href="${mapsLink}" style="color: #e7221a; font-weight: bold;">Open in Google Maps</a></p>` : ""}
        <p style="font-size: 12px; color: #555; text-align: center; margin-top: 30px;">
          SafeHer Emergency Response System · Instant Volunteer & Trusted Contact Network
        </p>
      </div>
    `;

    // Dispatch alerts if this is a new session or explicit retry
    if (!isExistingSession || contactList.length > 0) {
      for (const contact of contactList) {
        // SMS alert
        if (contact.phone) {
          const smsRes = await sendSmsNotification({
            to: contact.phone,
            message: smsMessage,
            contactName: contact.name,
          });
          const alertRecord = {
            id: crypto.randomUUID(),
            session_id: session.id,
            contact_id: contact.id,
            recipient_name: contact.name,
            channel: "sms",
            destination: contact.phone,
            status: smsRes.status,
            error_message: smsRes.error || null,
            tracking_url: trackingUrl,
            dispatched_at: new Date().toISOString(),
            retry_count: 0,
          };
          await supabase.from("sos_alerts").insert(alertRecord);
          alertResults.push(alertRecord);
        }

        // Email alert
        if (contact.email) {
          const emailRes = await sendEmailNotification({
            to: contact.email,
            subject: emailSubject,
            htmlText: emailHtml,
            contactName: contact.name,
          });
          const alertRecord = {
            id: crypto.randomUUID(),
            session_id: session.id,
            contact_id: contact.id,
            recipient_name: contact.name,
            channel: "email",
            destination: contact.email,
            status: emailRes.status,
            error_message: emailRes.error || null,
            tracking_url: trackingUrl,
            dispatched_at: new Date().toISOString(),
            retry_count: 0,
          };
          await supabase.from("sos_alerts").insert(alertRecord);
          alertResults.push(alertRecord);
        }
      }
    }

    return json({
      ok: true,
      session: {
        id: session.id,
        token: session.token,
        status: session.status,
        started_at: session.started_at,
        tracking_url: trackingUrl,
      },
      alerts: alertResults,
      contactsNotified: contactList.length,
      isExistingSession,
    });
  }

  // ----------------------------------------------------
  // Emergency Session Status (PHASE 2)
  // ----------------------------------------------------
  if (action === "sos_status") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    const sessionId = params.get("sessionId");
    if (!sessionId) return json({ ok: false, error: "missing_session_id" }, 400);

    const { data: session } = await supabase
      .from("emergency_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (!session) return json({ ok: false, error: "session_not_found" }, 404);

    const { data: alerts } = await supabase
      .from("sos_alerts")
      .select("*")
      .eq("session_id", sessionId);

    return json({
      ok: true,
      session,
      alerts: alerts || [],
    });
  }

  // ----------------------------------------------------
  // Live Location Update (PHASE 4)
  // ----------------------------------------------------
  if (action === "sos_location") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }

    const sessionId = readText(body?.sessionId, 50);
    const lat = Number(body?.lat);
    const lon = Number(body?.lon);
    const accuracy = Number(body?.accuracy) || 10;
    const speed = body?.speed !== undefined ? Number(body.speed) : null;
    const heading = body?.heading !== undefined ? Number(body.heading) : null;

    if (!sessionId || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return json({ ok: false, error: "invalid_coordinates" }, 400);
    }

    const locRecord = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      lat,
      lon,
      accuracy,
      speed,
      heading,
      timestamp: Date.now(),
      recorded_at: new Date().toISOString(),
    };

    await supabase.from("location_updates").insert(locRecord);
    await supabase.from("emergency_sessions").update({
      last_location: { lat, lon, accuracy, timestamp: Date.now() },
    }).eq("id", sessionId);

    return json({ ok: true, updated: true, location: locRecord });
  }

  // ----------------------------------------------------
  // Public Emergency Tracking View (PHASE 4 & 6)
  // ----------------------------------------------------
  if (action === "sos_track") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    const token = params.get("token");
    if (!token) return json({ ok: false, error: "missing_token" }, 400);

    const { data: session } = await supabase
      .from("emergency_sessions")
      .select("*")
      .eq("token", token)
      .single();

    if (!session) return json({ ok: false, error: "session_not_found" }, 404);

    const { data: trail } = await supabase
      .from("location_updates")
      .select("lat, lon, accuracy, timestamp, recorded_at")
      .eq("session_id", session.id)
      .order("timestamp", { ascending: false })
      .limit(40);

    return json({
      ok: true,
      status: session.status,
      triggerType: session.trigger_type,
      startedAt: session.started_at,
      resolvedAt: session.resolved_at,
      lastLocation: session.last_location,
      trail: trail || [],
    });
  }

  // ----------------------------------------------------
  // Resolve Emergency Session (PHASE 6)
  // ----------------------------------------------------
  if (action === "sos_resolve") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }

    const sessionId = readText(body?.sessionId, 50);
    if (!sessionId) return json({ ok: false, error: "missing_session_id" }, 400);

    const nowIso = new Date().toISOString();
    await supabase.from("emergency_sessions").update({
      status: "resolved",
      resolved_at: nowIso,
    }).eq("id", sessionId);

    // Send "Safe Now" follow-up notification to contacts
    const { data: session } = await supabase
      .from("emergency_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (session) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("*")
        .eq("user_id", session.user_id);

      const safeMessage = "🟢 SafeHer Update: The user has marked themselves SAFE and ended the emergency session. Thank you for being there!";
      for (const contact of contacts || []) {
        if (contact.phone) {
          void sendSmsNotification({ to: contact.phone, message: safeMessage, contactName: contact.name });
        }
      }
    }

    return json({ ok: true, resolved: true, resolvedAt: nowIso });
  }

  // ----------------------------------------------------
  // Cancel Countdown / False Alarm (PHASE 2)
  // ----------------------------------------------------
  if (action === "sos_cancel") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
    const sessionId = readText(body?.sessionId, 50);
    if (sessionId) {
      await supabase.from("emergency_sessions").update({
        status: "cancelled",
        resolved_at: new Date().toISOString(),
      }).eq("id", sessionId);
    }
    return json({ ok: true, cancelled: true });
  }

  // ----------------------------------------------------
  // Retry Failed Alert (PHASE 2)
  // ----------------------------------------------------
  if (action === "sos_retry_alert") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
    const alertId = readText(body?.alertId, 50);
    if (!alertId) return json({ ok: false, error: "missing_alert_id" }, 400);

    const { data: alert } = await supabase
      .from("sos_alerts")
      .select("*")
      .eq("id", alertId)
      .single();

    if (!alert) return json({ ok: false, error: "alert_not_found" }, 404);

    let result;
    if (alert.channel === "sms") {
      result = await sendSmsNotification({
        to: alert.destination,
        message: `🚨 SAFEHER EMERGENCY (RETRY): Check on ${alert.recipient_name}. Live map: ${alert.tracking_url}`,
        contactName: alert.recipient_name,
      });
    } else {
      result = await sendEmailNotification({
        to: alert.destination,
        subject: `🚨 [RETRY] Emergency Alert for ${alert.recipient_name}`,
        htmlText: `<p>Emergency SOS alert for <strong>${alert.recipient_name}</strong>. Tracking: <a href="${alert.tracking_url}">Live Map</a></p>`,
        contactName: alert.recipient_name,
      });
    }

    const updated = {
      status: result.status,
      error_message: result.error || null,
      retry_count: (alert.retry_count || 0) + 1,
      dispatched_at: new Date().toISOString(),
    };
    await supabase.from("sos_alerts").update(updated).eq("id", alertId);

    return json({ ok: true, result: updated });
  }

  // ----------------------------------------------------
  // User Preferences
  // ----------------------------------------------------
  if (action === "preferences") {
    const userId = params.get("userId") || "default-user";
    if (request.method === "GET") {
      const { data: pref } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .single();
      return json({
        ok: true,
        preferences: pref || {
          scream_sensitivity: 0.5,
          secret_code_word: "SAFEHER HELP",
          siren_auto_play: true,
          share_live_route: true,
        },
      });
    }
    if (request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
      const newPrefs = {
        user_id: userId,
        scream_sensitivity: typeof body.scream_sensitivity === "number" ? body.scream_sensitivity : 0.5,
        secret_code_word: readText(body.secret_code_word, 50) || "SAFEHER HELP",
        siren_auto_play: body.siren_auto_play !== false,
        share_live_route: body.share_live_route !== false,
        updated_at: new Date().toISOString(),
      };
      await supabase.from("user_preferences").delete().eq("user_id", userId);
      await supabase.from("user_preferences").insert(newPrefs);
      return json({ ok: true, preferences: newPrefs });
    }
    return json({ error: "method_not_allowed" }, 405);
  }

  return json({ error: "not_found" }, 404);
}
