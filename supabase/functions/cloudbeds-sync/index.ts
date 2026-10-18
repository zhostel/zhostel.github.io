// =============================================================================
// cloudbeds-sync — keeps zhostel.com and Cloudbeds (property 6309) in step.
// Cloudbeds is the master for inventory. Ported from the Virgin Beach sync.
// See supabase/migrations/20261016150000_cloudbeds_sync.sql.
//
// Called with header x-webhook-secret (vault secret 'cloudbeds_webhook_secret')
// and a JSON body { action, ... }:
//   test     check the API key
//   setup    link Cloudbeds rooms/beds to our room types, count physical units,
//            register Cloudbeds webhooks, load room blocks
//   pull     every 5 min (pg_cron): reservations changed since the last run
//   full     nightly: every stay checking out from yesterday on
//   history  one-off: EVERY reservation since 2015 into cb_history (archive),
//            year by year, chaining itself until done
//   push     { booking_id } website booking -> new Cloudbeds reservation
//   status   { booking_id } website cancelled it -> same in Cloudbeds
// TEST MODE (cb_sync_state.push_enabled = false, the default): nothing is
// written to Cloudbeds. Cloudbeds -> website always runs.
//
// Secrets (Edge Functions -> Secrets): CLOUDBEDS_API_KEY.
// Optional: CLOUDBEDS_PROPERTY_ID (default 6309).
// Deploy with "Verify JWT" OFF (pg_net and Cloudbeds call it without a JWT).
// =============================================================================
// deno-lint-ignore-file no-explicit-any
type Any = any;

const env = (k: string, d = "") => (globalThis as Any).Deno?.env.get(k) ?? d;
const CB = "https://api.cloudbeds.com/api/v1.3";
const PROPERTY = () => env("CLOUDBEDS_PROPERTY_ID", "6309");
const SB_URL = () => env("SUPABASE_URL");
const SR = () => env("SUPABASE_SERVICE_ROLE_KEY");
const SELF = () => `${SB_URL()}/functions/v1/cloudbeds-sync`;
const RESERVATION_EVENTS = ["created", "status_changed", "dates_changed", "accommodation_changed", "accommodation_type_changed", "accommodation_removed", "deleted"];
const HISTORY_FROM_YEAR = 2015;

// ---------------------------------------------------------------- Supabase
async function rpc(name: string, args: Record<string, unknown> = {}): Promise<Any> {
  const res = await fetch(`${SB_URL()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SR(), Authorization: `Bearer ${SR()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function rest(path: string): Promise<Any> {
  const res = await fetch(`${SB_URL()}/rest/v1/${path}`, { headers: { apikey: SR(), Authorization: `Bearer ${SR()}` } });
  return await res.json();
}
let secretCache: string | null = null;
async function secret(): Promise<string | null> { if (!secretCache) secretCache = await rpc("cb_webhook_secret"); return secretCache; }
const stateSet = (key: string, value: unknown) => rpc("cb_state_set", { p_key: key, p_value: value }).catch(() => null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- Cloudbeds
let lastCall = 0;
function form(params: Record<string, unknown>): URLSearchParams {
  const out = new URLSearchParams();
  const add = (key: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => add(`${key}[${i}]`, x));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) add(`${key}[${k}]`, x);
    else out.append(key, String(v));
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  return out;
}
async function cb(method: "GET" | "POST" | "PUT" | "DELETE", path: string, params: Record<string, unknown> = {}): Promise<Any> {
  const key = env("CLOUDBEDS_API_KEY");
  if (!key) throw new Error("CLOUDBEDS_API_KEY is not set (Edge Functions -> Secrets)");
  const p = { propertyID: PROPERTY(), ...params };
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + 220 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const inQuery = method === "GET" || method === "DELETE";
    const res = await fetch(inQuery ? `${CB}/${path}?${form(p)}` : `${CB}/${path}`, {
      method,
      headers: { "x-api-key": key, Accept: "application/json", ...(inQuery ? {} : { "Content-Type": "application/x-www-form-urlencoded" }) },
      body: inQuery ? undefined : form(p),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(1500 * (attempt + 1)); continue; }
    const text = await res.text();
    let json: Any;
    try { json = JSON.parse(text); } catch { throw new Error(`${path}: HTTP ${res.status} ${text.slice(0, 200)}`); }
    if (!res.ok || json?.success === false) throw new Error(`${path}: ${json?.message || "HTTP " + res.status}`);
    return json;
  }
}

// ---------------------------------------------------------------- mapping
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const sumBy = (xs: Any[], k: string) => xs.reduce((a, x) => a + (Number(x?.[k]) || 0), 0);
function manila(dt: unknown): string | null {
  const s = String(dt || "").trim();
  if (!s) return null;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) return s;
  return s.replace(" ", "T") + "+08:00";
}
function normalize(d: Any) {
  const guests = Object.values(d.guestList || {}) as Any[];
  const main = guests.find((g) => g?.isMainGuest) || guests[0] || {};
  const assigned = Array.isArray(d.assigned) ? d.assigned : [];
  const unassigned = Array.isArray(d.unassigned) ? d.unassigned : [];
  const all = [...assigned, ...unassigned];
  const bal = Array.isArray(d.balanceDetailed) ? d.balanceDetailed[0] : d.balanceDetailed;
  return {
    id: String(d.reservationID), status: d.status, source: d.sourceName || d.source || null,
    guest_name: d.guestName || [main.guestFirstName, main.guestLastName].filter(Boolean).join(" ") || null,
    guest_email: d.guestEmail || main.guestEmail || null,
    guest_phone: main.guestCellPhone || main.guestPhone || null,
    country: main.guestCountry || null,
    start: d.startDate, end: d.endDate,
    adults: all.length ? sumBy(all, "adults") : num(d.adults),
    children: all.length ? sumBy(all, "children") : num(d.children),
    total: num(d.total), balance: num(d.balance), paid: num(bal?.paid),
    created: manila(d.dateCreated), modified: d.dateModified ? String(d.dateModified) : null,
    ota_ref: d.thirdPartyIdentifier || null,
    rooms: assigned.map((a: Any) => ({ room_id: String(a.roomID), room_name: a.roomName, room_type_id: String(a.roomTypeID), room_type_name: a.roomTypeName })),
    unassigned: unassigned.map((u: Any) => ({ room_type_id: String(u.roomTypeID), room_type_name: u.roomTypeName })),
  };
}
async function syncOne(id: string): Promise<Any> {
  try {
    const r = await cb("GET", "getReservation", { reservationID: id });
    return await rpc("cb_apply_reservation", { p: normalize(r.data) });
  } catch (e) {
    if (/not found|does not exist|invalid reservation/i.test(String((e as Error).message))) return await rpc("cb_apply_reservation", { p: { id, status: "deleted" } });
    throw e;
  }
}

// ---------------------------------------------------------------- actions
const fmtUtc = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const listPage = (params: Record<string, unknown>, page: number) => cb("GET", "getReservations", { ...params, pageSize: 100, pageNumber: page });

async function processList(items: Any[], force: boolean, deadline: number) {
  const ids = items.map((x) => String(x.reservationID));
  const known: Record<string, string> = force ? {} : (await rpc("cb_known", { p_ids: ids })) || {};
  let applied = 0, skipped = 0, failed = 0, stopped = false;
  const errors: string[] = [];
  for (const it of items) {
    const id = String(it.reservationID);
    if (!force && id in known && known[id] && known[id] === String(it.dateModified || "")) { skipped++; continue; }
    if (Date.now() > deadline) { stopped = true; break; }
    try { await syncOne(id); applied++; } catch (e) { failed++; errors.push(`${id}: ${(e as Error).message}`); }
  }
  return { applied, skipped, failed, stopped, errors: errors.slice(0, 5) };
}

async function syncBlocks(days: number) {
  const from = new Date(Date.now() - 86_400_000);
  const to = new Date(from.getTime() + days * 86_400_000);
  const blocks = new Map<string, Any>();
  for (let a = from; a < to; a = new Date(a.getTime() + 35 * 86_400_000)) {
    const b = new Date(Math.min(a.getTime() + 34 * 86_400_000, to.getTime()));
    for (let page = 1; page <= 10; page++) {
      const res = await cb("GET", "getRoomBlocks", { startDate: ymd(a), endDate: ymd(b), pageSize: 100, pageNumber: page });
      const list = (Array.isArray(res.data) ? res.data.flatMap((d: Any) => d.roomBlocks || []) : res.data?.roomBlocks) || [];
      for (const k of list) blocks.set(String(k.roomBlockID), { block_id: String(k.roomBlockID), type: k.roomBlockType, reason: k.roomBlockReason, start: k.startDate, end: k.endDate, rooms: (k.rooms || []).map((r: Any) => String(r.roomID)) });
      if (list.length < 100) break;
    }
  }
  return await rpc("cb_apply_blocks", { p_from: ymd(from), p_to: ymd(to), p: [...blocks.values()] });
}

async function pull() {
  const started = new Date();
  const deadline = Date.now() + 110_000;
  const st = (await rest("cb_sync_state?key=eq.last_pull&select=value"))?.[0]?.value;
  const from = st?.at ? new Date(new Date(st.at).getTime() - 30 * 60_000) : new Date(Date.now() - 2 * 86_400_000);
  const params = { modifiedFrom: fmtUtc(from), modifiedTo: fmtUtc(new Date(Date.now() + 86_400_000)) };
  const totals = { applied: 0, skipped: 0, failed: 0, pushed: 0, push_failed: 0 };
  const errors: string[] = [];
  let complete = true;
  for (let page = 1; page <= 20; page++) {
    const res = await listPage(params, page);
    const items = Array.isArray(res.data) ? res.data : [];
    const r = await processList(items, false, deadline);
    totals.applied += r.applied; totals.skipped += r.skipped; totals.failed += r.failed; errors.push(...r.errors);
    if (r.stopped) { complete = false; break; }
    if (items.length < 100) break;
  }
  const blocks = await syncBlocks(105).catch((e) => { errors.push("room blocks: " + (e as Error).message); return null; });
  for (const id of ((await rpc("cb_pending_pushes")) || []) as string[]) {
    if (Date.now() > deadline) break;
    const r = await push(String(id));
    if (r?.reservation_id) totals.pushed++; else if (r?.error) { totals.push_failed++; errors.push(`push ${id}: ${r.error}`); }
  }
  const value = { at: complete && totals.failed === 0 ? started.toISOString() : (st?.at || from.toISOString()), ran_at: new Date().toISOString(), ...totals, complete, blocks };
  await stateSet("last_pull", value);
  if (errors.length) await stateSet("last_error", { at: new Date().toISOString(), errors: errors.slice(0, 10) });
  return value;
}

async function chain(body: Record<string, unknown>) {
  const s = await secret();
  fetch(SELF(), { method: "POST", headers: { "Content-Type": "application/json", "x-webhook-secret": s || "" }, body: JSON.stringify(body) }).catch(() => null);
  await sleep(500);
}

async function full(page = 1, force = true) {
  const deadline = Date.now() + 110_000;
  if (page === 1) await syncBlocks(400).catch(() => null);
  const res = await listPage({ checkOutFrom: ymd(new Date(Date.now() - 86_400_000)), checkOutTo: ymd(new Date(Date.now() + 2 * 365 * 86_400_000)) }, page);
  const items = Array.isArray(res.data) ? res.data : [];
  const r = await processList(items, force, deadline);
  const more = items.length === 100 || r.stopped;
  if (more) await chain({ action: "full", page: r.stopped ? page : page + 1, force: r.stopped ? false : force });
  const value = { page, items: items.length, ...r, more, at: new Date().toISOString() };
  await stateSet("last_full", value);
  return value;
}

// Every reservation ever, by check-in year, into the cb_history archive (list data only — fast).
async function history(year = HISTORY_FROM_YEAR, page = 1) {
  const deadline = Date.now() + 100_000;
  const thisYear = new Date().getUTCFullYear() + 2;
  let saved = 0;
  while (Date.now() < deadline) {
    const res = await listPage({ checkInFrom: `${year}-01-01`, checkInTo: `${year}-12-31`, includeAllRooms: "true" }, page);
    const items = Array.isArray(res.data) ? res.data : [];
    if (items.length) saved += (await rpc("cb_apply_history", { p: items })) || 0;
    if (items.length === 100) { page++; continue; }
    year++; page = 1;
    if (year > thisYear) break;
  }
  const done = year > thisYear;
  const value = { year, page, saved, done, at: new Date().toISOString() };
  await stateSet("last_history", value);
  if (!done) await chain({ action: "history", year, page });
  return value;
}

function splitName(name: unknown): [string, string] {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return ["Guest", "Website"];
  if (parts.length === 1) return [parts[0], "-"];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}
const ISO2: Record<string, string> = { philippines: "PH", "united states": "US", "united kingdom": "GB", australia: "AU", canada: "CA", japan: "JP", "south korea": "KR", china: "CN", singapore: "SG", germany: "DE", france: "FR", spain: "ES", italy: "IT", netherlands: "NL", "hong kong": "HK", taiwan: "TW", india: "IN", malaysia: "MY", indonesia: "ID", vietnam: "VN", thailand: "TH", "new zealand": "NZ", "united arab emirates": "AE", switzerland: "CH", sweden: "SE", israel: "IL" };
const iso2 = (c: unknown) => { const s = String(c || "").trim(); return /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : ISO2[s.toLowerCase()] || "PH"; };

async function push(bookingId: string): Promise<Any> {
  const b = await rpc("cb_claim_push", { p_booking_id: bookingId });
  if (!b) return { skipped: "test mode or not waiting to be pushed" };
  let reservationId: string | null = null;
  try {
    const items = (b.items || []) as Any[];
    const missing = items.filter((i) => !i.cb_room_type_id).map((i) => i.name);
    if (missing.length) throw new Error(`Not linked to a Cloudbeds room type yet: ${missing.join(", ")} (run setup)`);
    const [first, last] = splitName(b.guest_name);
    const email = String(b.guest_email || "").trim();
    const created = await cb("POST", "postReservation", {
      startDate: b.checkin, endDate: b.checkout, guestFirstName: first, guestLastName: last, guestCountry: iso2(b.country), guestZip: "1210",
      guestEmail: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : "reservations@zhostel.com", guestPhone: b.guest_phone || undefined,
      rooms: items.map((i) => ({ roomTypeID: i.cb_room_type_id, quantity: i.units })),
      adults: items.map((i) => ({ roomTypeID: i.cb_room_type_id, quantity: i.kind === "dorm" ? i.units : i.units * 2 })),
      children: items.map((i) => ({ roomTypeID: i.cb_room_type_id, quantity: 0 })),
      paymentMethod: "cash", thirdPartyIdentifier: b.code, sendEmailConfirmation: "false",
    });
    reservationId = String(created.reservationID);
    await cb("POST", "postReservationNote", { reservationID: reservationId, reservationNote: `Booked on zhostel.com · ${b.code} · website total ₱${Number(b.total).toLocaleString("en-PH")} · pay at check-in.` }).catch(() => null);
  } catch (e) {
    const msg = String((e as Error).message || e);
    await rpc("cb_push_result", { p_booking_id: bookingId, p_reservation_id: reservationId, p_error: msg });
    return { booking_id: bookingId, reservation_id: reservationId, error: msg };
  }
  await rpc("cb_push_result", { p_booking_id: bookingId, p_reservation_id: reservationId, p_error: null });
  return { booking_id: bookingId, reservation_id: reservationId };
}

async function pushStatus(bookingId: string) {
  if (!(await rpc("cb_push_enabled"))) return { skipped: "test mode" };
  const b = (await rest(`bookings?id=eq.${encodeURIComponent(bookingId)}&select=id,status,cb_reservation_id,cb_owned`))?.[0];
  if (!b?.cb_reservation_id || b.cb_owned) return { skipped: "not a website booking in Cloudbeds" };
  const want = b.status === "cancelled" ? "canceled" : b.status === "no_show" ? "no_show" : null;
  if (!want) return { skipped: "status " + b.status };
  await cb("PUT", "putReservation", { reservationID: b.cb_reservation_id, status: want, sendStatusChangeEmail: "false" });
  return { reservation_id: b.cb_reservation_id, status: want };
}

const isOurs = (w: Any) => { const u = String(w.subscriptionData?.endpoint ?? w.endpointUrl ?? w.endpoint ?? ""); return !u || u.includes("/functions/v1/cloudbeds-sync"); };
const hookKey = (w: Any) => `${w.event?.entity ?? w.object ?? ""}/${w.event?.action ?? w.action ?? ""}`.toLowerCase();

async function setup() {
  const rooms: Any[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await cb("GET", "getRooms", { propertyIDs: PROPERTY(), pageSize: 100, pageNumber: page });
    const list = (res.data || []).flatMap((p: Any) => p.rooms || []);
    rooms.push(...list);
    if (list.length < 100) break;
  }
  const linked = await rpc("cb_set_rooms", { p: rooms.filter((r) => !r.isVirtual).map((r) => ({ room_id: String(r.roomID), room_name: r.roomName, room_type_id: String(r.roomTypeID), room_type_name: r.roomTypeName })) });
  const s = await secret();
  const existing: Any[] = (await cb("GET", "getWebhooks").catch(() => ({ data: [] }))).data || [];
  const have = new Set(existing.filter(isOurs).map(hookKey));
  const hooks: Record<string, string> = {};
  for (const action of RESERVATION_EVENTS) {
    if (have.has(`reservation/${action}`)) { hooks[action] = "already registered"; continue; }
    try { await cb("POST", "postWebhook", { object: "reservation", action, endpointUrl: SELF(), authHeaderName: "x-webhook-secret", authHeaderValue: s }); hooks[action] = "registered"; }
    catch (e) { hooks[action] = "error: " + (e as Error).message; }
  }
  const blocks = await syncBlocks(400).catch((e) => ({ error: (e as Error).message }));
  const value = { at: new Date().toISOString(), rooms: rooms.length, linked, webhooks: hooks, blocks };
  await stateSet("setup", value);
  return value;
}

// ---------------------------------------------------------------- handler
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function background(p: Promise<unknown>) {
  const done = p.catch(async (e) => { console.error(e); await stateSet("last_error", { at: new Date().toISOString(), errors: [String((e as Error)?.message || e)] }); });
  const rt = (globalThis as Any).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(done);
  return done;
}
async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const s = await secret().catch(() => null);
  if (!s || (req.headers.get("x-webhook-secret") || "") !== s) return new Response("Unauthorized", { status: 401 });
  let body: Any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const event = String(body?.event || "");
  if (!body?.action && event.startsWith("reservation/")) {
    const id = String(body.reservationID ?? body.reservationId ?? "");
    if (id) background(syncOne(id));
    return json({ ok: true });
  }
  try {
    switch (body.action) {
      case "test": { const r = await cb("GET", "getRooms", { propertyIDs: PROPERTY(), pageSize: 1 }); return json({ ok: true, rooms_total: r.total ?? null }); }
      case "setup": return json(await setup());
      case "pull": return json(await pull());
      case "full": background(full(Number(body.page) || 1, body.force !== false)); return json({ started: true });
      case "history": background(history(Number(body.year) || HISTORY_FROM_YEAR, Number(body.page) || 1)); return json({ started: true });
      case "push": return json(await push(String(body.booking_id)));
      case "status": return json(await pushStatus(String(body.booking_id)));
      case "sync_one": return json(await syncOne(String(body.reservation_id)));
      default: return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    await stateSet("last_error", { at: new Date().toISOString(), action: body.action, errors: [msg] });
    return json({ error: msg }, 500);
  }
}
if ((globalThis as Any).Deno?.serve) (globalThis as Any).Deno.serve(handle);
