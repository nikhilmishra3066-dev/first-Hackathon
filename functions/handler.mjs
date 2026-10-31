// SafeHer backend Function.
// waitlist/partners: anonymous INSERT only — visitor emails are never publicly readable.
// events: insert + select of non-PII columns (kind/city/source) to power the public counter.
const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PARTNER_KINDS = ["college", "ngo", "corporate", "fleet", "other"];
const OVERPASS_URL = globalThis.process?.env?.OVERPASS_URL || null;
// Global-coverage Overpass instances only — region-limited mirrors answer empty elsewhere.
const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_UA = "SafeHer-web/1.0 (women-safety help directory)";
const NEARBY_RADIUS_M = 4000;

// Best-effort per-IP sliding window (isolates may not share memory; this is a speed bump, not a guarantee).
const hits = new Map();
function rateLimited(ip) {
  if (hits.size > 10000) hits.clear();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

function readText(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

const toRad = (d) => (d * Math.PI) / 180;

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

// Nominatim structured search: tiny payloads with global coverage; sequential calls per its usage policy.
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
      lists = {
        police: await nominatimPlaces("police", lat, lon),
        hospitals: await nominatimPlaces("hospital", lat, lon),
      };
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
  const params = new URL(request.url).searchParams;
  const action = params.get("action");

  if (action === "ping") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    return json({ ok: true, service: "safeher-waitlist", schema: 2 });
  }

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

  if (action === "nearby") {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return json({ ok: false, error: "invalid_location" }, 400);
    }
    try {
      const value = await nearbyPlaces(lat, lon);
      return json({ ok: true, radius_m: NEARBY_RADIUS_M, ...value });
    } catch {
      return json({ ok: false, error: "nearby_unavailable" }, 503);
    }
  }

  if (action === "join") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });

    const type = request.headers.get("content-type") ?? "";
    if (!type.includes("application/json")) return json({ ok: false, error: "invalid_body" }, 400);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid_body" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ ok: false, error: "invalid_body" }, 400);
    }

    // Honeypot: humans never see this field, bots fill it. Silent success poisons their loop.
    if (readText(body.website, 200)) return json({ ok: true, joined: false });

    // Bots submit instantly; a real reader needs >1.2s from form render.
    const renderedAt = Number(body.ts);
    if (!Number.isFinite(renderedAt) || renderedAt <= 0 || Date.now() - renderedAt < 1200) {
      return json({ ok: false, error: "too_fast" }, 429);
    }

    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    if (rateLimited(ip)) return json({ ok: false, error: "rate_limited" }, 429);

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
        // 23505 = unique violation on email: already signed up. Treat as success.
        if (String(error.code) === "23505") return json({ ok: true, joined: false });
        return json({ ok: false, error: "write_rejected" }, 503);
      }
      // Public counter feed: no PII, best-effort (a missed row only under-counts).
      try {
        await supabase.from("events").insert({
          id: crypto.randomUUID(),
          kind: "join",
          city: city ?? "",
          source,
          created_at: new Date().toISOString(),
        });
      } catch {
        // counter is best-effort; never fail a real signup over it
      }
      return json({ ok: true, joined: true });
    } catch {
      return json({ ok: false, error: "write_result_unknown" }, 503);
    }
  }

  if (action === "partner") {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });

    const type = request.headers.get("content-type") ?? "";
    if (!type.includes("application/json")) return json({ ok: false, error: "invalid_body" }, 400);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid_body" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ ok: false, error: "invalid_body" }, 400);
    }
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

  return json({ error: "not_found" }, 404);
}
