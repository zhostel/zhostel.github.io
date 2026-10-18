// =============================================================================
// send-booking-email — every Z Hostel booking email, sent from one mailbox
// (ai@zhostel.com for now; set MAILBOX to switch, e.g. reservations@zhostel.com)
// through Gmail SMTP, so replies land in that inbox. Ported from Virgin Beach.
//
// Fired by the database (trg_booking_email / _email_event in
// supabase/migrations/20261017090000_payments_staff.sql) with a JSON body
// { type, id, ... } and header x-webhook-secret (vault: booking_email_webhook_secret):
//
//   INSERT   new booking
//            → guest: "complete your payment" (pay ahead, 2-hour hold) or
//                     "booking confirmed" (pay at check-in)       [if email_guest]
//            → staff: new website booking alert
//   PROOF    guest uploaded a payment proof on /pay/
//            → staff: "please verify" (proof attached)  → guest: "we got it"
//   STATUS   { from, to }
//            → confirmed (from pending/pending_payment/expired): guest "payment verified"
//            → expired: guest "your hold has ended"
//            → pending  (from pending_payment = proof rejected): guest "we couldn't verify it"
//   CHANGE   { changes:[{field,before,after}] } staff edited + ticked "Email the guest"
//   RESEND_BOOKING / RESEND_CONFIRMED  staff resend from /staff/
//
// Every send is logged in booking_email_log, which also stops doubles.
// Secrets (Edge Functions → Secrets): SMTP_PASSWORD = Google App Password of MAILBOX.
// Optional: MAILBOX, REPLY_TO, SITE_URL, STAFF_EMAILS (else booking_settings.staff_alert_emails),
//           TEST_MODE=true ([TEST] subjects), SMTP_DRY_RUN=true (build, don't send).
// Deploy with "Verify JWT" OFF — the function checks the webhook secret itself.
// =============================================================================
// deno-lint-ignore-file no-explicit-any
type Any = any;

const env = (k: string, d = "") => { const v = (globalThis as Any).Deno?.env.get(k); return v === undefined || v === null || v === "" ? d : String(v); };
const SB_URL = () => env("SUPABASE_URL");
const SR = () => env("SUPABASE_SERVICE_ROLE_KEY");
const MAILBOX = () => env("MAILBOX", "ai@zhostel.com");
const SITE = () => env("SITE_URL", "https://zhostel.github.io").replace(/\/+$/, "");
const TEST = () => env("TEST_MODE") === "true";
const PHONE = "(63) 917 889 8531";
const ADDRESS = "5660 Don Pedro St., Brgy. Poblacion, Makati City";
const MAPS = "https://maps.google.com/?q=Z+Hostel+5660+Don+Pedro+Street+Poblacion+Makati";

// ---------------------------------------------------------------- database
async function rpc(name: string, args: Record<string, unknown> = {}): Promise<Any> {
  const res = await fetch(`${SB_URL()}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: SR(), Authorization: `Bearer ${SR()}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`${name}: ${res.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
let secretCache: string | null = null;
async function secret() { if (!secretCache) secretCache = await rpc("booking_email_secret"); return secretCache; }

// ---------------------------------------------------------------- formatting
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const peso = (n: unknown) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
const fmtDate = (s: string) => new Date(s + "T00:00:00+08:00").toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const fmtTime = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const first = (b: Any) => String(b.guest_name || "").trim().split(/\s+/)[0] || "there";
const payLink = (b: Any) => `${SITE()}/pay/?${new URLSearchParams({ code: b.code, email: b.guest_email || "" })}`;
const manageLink = (b: Any) => `${SITE()}/book/manage/?code=${encodeURIComponent(b.code)}`;
const staffLink = (b: Any) => `${SITE()}/staff/?q=${encodeURIComponent(b.code)}`;
const toPay = (b: Any) => Math.max(Number(b.total) - Number(b.amount_paid) - Number(b.amount_pending), 0);

const p = (html: string, style = "") => `<p style="margin:0 0 14px;line-height:1.55;${style}">${html}</p>`;
const btn = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:#ff5b2e;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px">${esc(label)}</a></p>`;
const box = (inner: string, tone = "#f6f3ef") => `<div style="background:${tone};border-radius:12px;padding:16px 18px;margin:16px 0">${inner}</div>`;

function receipt(b: Any) {
  const row = (l: string, r: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#444">${l}</td><td style="padding:6px 0;text-align:right;${strong ? "font-weight:700;color:#111" : "color:#111"}">${r}</td></tr>`;
  let rows = (b.items || []).map((i: Any) => row(`${i.units} × ${esc(i.room)}${i.plan ? ` <span style="color:#888">· ${esc(i.plan)}</span>` : ""}`, peso(i.amount))).join("");
  rows += (b.addons || []).map((a: Any) => row(`${a.qty > 1 ? a.qty + " × " : ""}${esc(a.name)}`, a.amount == null ? "at the desk" : peso(a.amount))).join("");
  if (Number(b.transfer_discount) > 0) rows += row("5% off · paid ahead by transfer", "−" + peso(b.transfer_discount));
  if (Number(b.discount_amount) > 0) rows += row(esc(b.discount_reason || "Discount"), "−" + peso(b.discount_amount));
  rows += `<tr><td colspan="2" style="border-top:1px solid #ddd;padding:0"></td></tr>` + row("Total", peso(b.total), true);
  if (Number(b.amount_paid) > 0) rows += row("Paid", peso(b.amount_paid)) + row("Balance", peso(Math.max(Number(b.total) - Number(b.amount_paid), 0)), true);
  const nights = Number(b.nights) || 0;
  return box(`<div style="font-size:13px;color:#888;letter-spacing:.08em;text-transform:uppercase">Booking ${esc(b.code)}</div>
    <div style="font-size:17px;font-weight:700;margin:6px 0 10px">${esc(fmtDate(b.checkin))} → ${esc(fmtDate(b.checkout))} · ${nights} night${nights === 1 ? "" : "s"} · ${Number(b.guests) || 1} guest${Number(b.guests) === 1 ? "" : "s"}</div>
    <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>`);
}
function accounts(b: Any) {
  const list = (b.settings?.pay_accounts || []) as Any[];
  if (!list.length) return p(`Our bank and e-wallet details will follow from the front desk — or call/text us at ${PHONE}.`);
  return list.map((a) => `<div style="border:1px solid #e5e0da;border-radius:10px;padding:12px 14px;margin:8px 0">
    <div style="font-weight:700">${esc(a.label)}</div><div>${esc(a.name || "")}</div><div style="font-size:17px;letter-spacing:.04em">${esc(a.number || "")}</div>${a.note ? `<div style="color:#666;font-size:13px">${esc(a.note)}</div>` : ""}</div>`).join("");
}
function arrival(b: Any) {
  const s = b.settings || {};
  return p(`Check-in from <b>${esc(s.checkin_time || "2:00 PM")}</b>, check-out by <b>${esc(s.checkout_time || "11:00 AM")}</b>. Bring a valid ID. Find us at <a href="${MAPS}" style="color:#ff5b2e">${ADDRESS}</a>.`);
}

function layout(b: Any, title: string, body: string, preheader = "") {
  return `<!doctype html><html><body style="margin:0;background:#efebe6;font-family:Helvetica,Arial,sans-serif;color:#111">
<div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div>
<div style="max-width:600px;margin:0 auto;padding:20px 12px">
${TEST() ? `<div style="background:#ff5b2e;color:#fff;padding:8px 12px;border-radius:8px;margin-bottom:10px;font-weight:700">TEST EMAIL — not a real booking message</div>` : ""}
<div style="background:#111;color:#fff;border-radius:16px 16px 0 0;padding:22px 24px">
  <div style="font-weight:900;font-size:22px;letter-spacing:.02em">Z HOSTEL <span style="color:#ff5b2e">·</span> <span style="font-weight:400;font-size:14px;color:#bbb">Poblacion, Makati</span></div>
</div>
<div style="background:#fff;border-radius:0 0 16px 16px;padding:24px">
  <h1 style="font-size:22px;line-height:1.25;margin:0 0 14px">${title}</h1>
  ${body}
  <hr style="border:0;border-top:1px solid #eee;margin:22px 0">
  <p style="margin:0;color:#777;font-size:13px;line-height:1.5">Questions? Just reply to this email, or call/text ${PHONE}.<br>
  Z Hostel · ${ADDRESS} · <a href="${SITE()}" style="color:#777">${esc(SITE().replace(/^https?:\/\//, ""))}</a></p>
</div></div></body></html>`;
}
const guestSubject = (b: Any) => `${TEST() ? "[TEST] " : ""}Your Z Hostel booking · ${b.code}`;
const staffSubject = (b: Any, what: string) => `${TEST() ? "[TEST] " : ""}${what} · ${b.code} · ${b.guest_name}`;

// ---------------------------------------------------------------- emails
function guestPending(b: Any) {
  const until = b.hold_until ? fmtTime(b.hold_until) : "within 2 hours";
  return layout(b, `Almost there, ${esc(first(b))} — complete your payment`, `
${p(`We're holding your ${b.items?.length > 1 || Number(b.guests) > 1 ? "beds/rooms" : "bed"} for <b>2 hours</b>. Transfer <b>${peso(toPay(b))}</b> and upload a screenshot of the payment by <b>${esc(until)}</b> to secure the booking. You save <b>${peso(b.transfer_discount)}</b> (5%) by paying ahead.`)}
${receipt(b)}
<h2 style="font-size:17px;margin:18px 0 6px">Pay to</h2>${accounts(b)}
${btn(payLink(b), "Upload your payment")}
${p(`If the payment isn't uploaded in time, the hold ends and the beds go back on sale — you can still book again (pay at check-in).`, "color:#666;font-size:14px")}
${p(esc(b.settings?.cancellation_policy || ""), "color:#666;font-size:13px")}`, `Pay ${peso(toPay(b))} by ${until} to secure your booking`);
}
function guestConfirmed(b: Any, verified = false) {
  const desk = b.pay_method === "desk" && Number(b.amount_paid) < Number(b.total);
  return layout(b, verified ? `Payment received — you're booked, ${esc(first(b))}!` : `You're booked, ${esc(first(b))}!`, `
${p(verified ? `Thank you! We've verified your payment and your booking is <b>confirmed</b>.` : `Your booking is <b>confirmed</b>. ${desk ? "Pay at check-in: cash, card or GCash." : ""}`)}
${receipt(b)}
${arrival(b)}
${p(`Keep your booking code <b>${esc(b.code)}</b> handy. Something on in Poblacion while you're here? See <a href="${SITE()}/events/" style="color:#ff5b2e">what's on at Z</a>.`)}
${btn(manageLink(b), "View my booking")}
${p(esc(b.settings?.cancellation_policy || ""), "color:#666;font-size:13px")}`, `Booking ${b.code} confirmed`);
}
function guestProof(b: Any) {
  return layout(b, `We received your payment, ${esc(first(b))}`, `
${p(`Thanks — we got your payment screenshot for <b>${esc(b.code)}</b>. Your beds stay on hold while our front desk checks it; you'll get a confirmation email once it's verified.`)}
${receipt(b)}`, "We're verifying your payment");
}
function guestExpired(b: Any) {
  return layout(b, `Your hold has ended`, `
${p(`Hi ${esc(first(b))}, we didn't receive a payment for booking <b>${esc(b.code)}</b> within 2 hours, so the hold has ended and those beds are back on sale.`)}
${p(`Still coming? Book again in a minute — or choose <b>pay at check-in</b>. Already paid? Reply to this email with your screenshot and we'll sort it out.`)}
${btn(`${SITE()}/book/?${new URLSearchParams({ checkin: b.checkin, checkout: b.checkout })}`, "Book again")}`, "Your booking hold has ended");
}
function guestRejected(b: Any) {
  return layout(b, `We couldn't verify your payment`, `
${p(`Hi ${esc(first(b))}, we couldn't match the payment you uploaded for <b>${esc(b.code)}</b> with our account. ${b.hold_until ? `We're holding your beds again until <b>${esc(fmtTime(b.hold_until))}</b>.` : ""}`)}
${p(`Please check the amount and the account, then upload the right screenshot — or reply to this email and we'll help.`)}
<h2 style="font-size:17px;margin:18px 0 6px">Pay to</h2>${accounts(b)}
${btn(payLink(b), "Upload your payment")}`, "Please re-upload your payment");
}
function guestChanged(b: Any, changes: Any[]) {
  const rows = changes.map((c) => `<tr><td style="padding:6px 8px 6px 0;color:#666">${esc(c.field)}</td><td style="padding:6px 8px;color:#999;text-decoration:line-through">${esc(c.before ?? "—")}</td><td style="padding:6px 0;font-weight:700">${esc(c.after ?? "—")}</td></tr>`).join("");
  return layout(b, `Your booking was updated`, `
${p(`Hi ${esc(first(b))}, we've made these changes to booking <b>${esc(b.code)}</b>:`)}
<table style="border-collapse:collapse;font-size:15px;margin:0 0 10px">${rows}</table>
${receipt(b)}
${btn(manageLink(b), "View my booking")}`, `Changes to booking ${b.code}`);
}
function staffNew(b: Any) {
  const pay = b.pay_method === "transfer" ? `Pay ahead by transfer (hold until ${b.hold_until ? fmtTime(b.hold_until) : "—"})` : "Pay at check-in";
  return layout(b, `New website booking ${esc(b.code)}`, `
${p(`<b>${esc(b.guest_name)}</b> · ${esc(b.guest_email || "no email")} · ${esc(b.guest_phone || "no phone")}${b.country ? " · " + esc(b.country) : ""}`)}
${p(`<b>${esc(pay)}</b>${b.arrival_time ? ` · arriving ${esc(b.arrival_time)}` : ""}`)}
${b.notes ? box(`<b>Guest notes</b><br>${esc(b.notes)}`, "#fff4e5") : ""}
${receipt(b)}
${btn(staffLink(b), "Open in the staff desk")}`, `${b.guest_name} · ${peso(b.total)}`);
}
function staffProof(b: Any) {
  const last = (b.payments || []).filter((x: Any) => x.status === "pending").pop();
  return layout(b, `Payment proof — please verify ${esc(b.code)}`, `
${p(`<b>${esc(b.guest_name)}</b> uploaded a payment of <b>${peso(last?.amount ?? b.amount_pending)}</b>. The screenshot is attached. Check it against the bank / e-wallet, then <b>Verify</b> or <b>Reject</b> it in the staff desk — the guest is emailed either way.`)}
${receipt(b)}
${btn(staffLink(b), "Verify in the staff desk")}`, `${b.guest_name} paid ${peso(last?.amount)}`);
}

// ---------------------------------------------------------------- sending
let transporter: Any = null;
async function smtp() {
  if (transporter) return transporter;
  const nodemailer = (await import("npm:nodemailer@6.9.16")).default;
  transporter = env("SMTP_DRY_RUN") === "true"
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: MAILBOX(), pass: env("SMTP_PASSWORD") } });
  return transporter;
}
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<div style="display:none[\s\S]*?<\/div>/i, "")
  .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, h, t) => `${t} (${h})`).replace(/<(br|\/p|\/tr|\/h1|\/h2|\/div)[^>]*>/gi, "\n")
  .replace(/<\/td>/gi, "  ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
const root = (b: Any, thread: string) => `<${thread}.${String(b.code).toLowerCase()}@zhostel.com>`;

async function send(b: Any, kind: string, to: string | string[], subject: string, html: string, thread: "guest" | "staff", attachments: Any[] = []) {
  const list = (Array.isArray(to) ? to : [to]).map((s) => s.trim()).filter(Boolean);
  if (!list.length) return { skipped: "no address" };
  const logId = await rpc("email_claim", { p_booking: b.id, p_kind: kind, p_to: list.join(", "), p_subject: subject });
  if (!logId) return { skipped: "already sent" };
  const r = root(b, thread);
  const firstMsg = kind === "guest_booking" || kind === "staff_new";
  const messageId = firstMsg ? r : `<${kind.replace(/[^a-z0-9]+/gi, ".")}.${Date.now()}.${r.slice(1)}`;
  try {
    await (await smtp()).sendMail({
      from: `Z Hostel <${MAILBOX()}>`, to: list.join(", "), replyTo: env("REPLY_TO", MAILBOX()), subject, html, text: text(html), messageId,
      ...(firstMsg ? {} : { inReplyTo: r, references: [r] }), attachments, headers: { "X-Z-Booking": b.code, "X-Z-Email-Kind": kind },
    });
    await rpc("email_finish", { p_id: logId, p_ok: true, p_message_id: messageId });
    return { ok: true };
  } catch (e) {
    await rpc("email_finish", { p_id: logId, p_ok: false, p_message_id: messageId, p_error: String((e as Error)?.message || e).slice(0, 500) });
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}
async function proofFile(path: string | null) {
  if (!path) return [];
  try {
    const res = await fetch(`${SB_URL()}/storage/v1/object/payment-proofs/${path.split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: SR(), Authorization: `Bearer ${SR()}` } });
    if (!res.ok) return [];
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > 10 * 1024 * 1024 ? [] : [{ filename: `payment-${path.split("/").pop()}`, content: buf, contentType: res.headers.get("content-type") || "image/jpeg" }];
  } catch { return []; }
}
function staffTo(b: Any) {
  return env("STAFF_EMAILS", b.settings?.staff_alert_emails || MAILBOX()).split(",").map((s: string) => s.trim()).filter(Boolean);
}
const guestOk = (b: Any) => !!b.guest_email && b.email_guest !== false && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.guest_email);

// ---------------------------------------------------------------- handler
async function handleEvent(body: Any) {
  const b = await rpc("email_booking_data", { p_id: body.id });
  if (!b) return { error: "booking not found" };
  if (b.cb_owned) return { skipped: "Cloudbeds booking" };
  const out: Record<string, unknown> = {};
  const now = Date.now();
  switch (body.type) {
    case "INSERT":
      if (guestOk(b)) {
        if (b.status === "pending") out.guest = await send(b, "guest_booking", b.guest_email, guestSubject(b), guestPending(b), "guest");
        else if (b.status === "confirmed") out.guest = await send(b, "guest_booking", b.guest_email, guestSubject(b), guestConfirmed(b), "guest");
      }
      if (b.source === "website") out.staff = await send(b, "staff_new", staffTo(b), staffSubject(b, "New booking"), staffNew(b), "staff");
      break;
    case "PROOF": {
      const last = (b.payments || []).filter((x: Any) => x.status === "pending").pop();
      out.staff = await send(b, `staff_proof:${last?.id || now}`, staffTo(b), staffSubject(b, "Payment to verify"), staffProof(b), "staff", await proofFile(last?.proof_path || null));
      if (guestOk(b)) out.guest = await send(b, `guest_proof:${last?.id || now}`, b.guest_email, guestSubject(b), guestProof(b), "guest");
      break;
    }
    case "STATUS":
      if (!guestOk(b)) { out.skipped = "guest emails off"; break; }
      if (body.to === "confirmed" && ["pending", "pending_payment", "expired"].includes(body.from)) {
        out.guest = await send(b, "guest_confirmed", b.guest_email, guestSubject(b), guestConfirmed(b, Number(b.amount_paid) > 0), "guest");
      } else if (body.to === "expired") {
        out.guest = await send(b, "guest_expired", b.guest_email, guestSubject(b), guestExpired(b), "guest");
      } else if (body.to === "pending" && body.from === "pending_payment") {
        out.guest = await send(b, `guest_rejected:${now}`, b.guest_email, guestSubject(b), guestRejected(b), "guest");
      }
      break;
    case "CHANGE":
      if (b.guest_email) out.guest = await send(b, `guest_changed:${now}`, b.guest_email, guestSubject(b), guestChanged(b, body.changes || []), "guest");
      break;
    case "RESEND_BOOKING":
    case "RESEND_CONFIRMED":
      if (!b.guest_email) { out.skipped = "no guest email"; break; }
      out.guest = await send(b, `guest_resend:${now}`, b.guest_email, guestSubject(b),
        b.status === "pending" && body.type === "RESEND_BOOKING" ? guestPending(b) : guestConfirmed(b, Number(b.amount_paid) > 0), "guest");
      break;
    default:
      return { error: "unknown type" };
  }
  return out;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const s = await secret().catch(() => null);
  if (!s || req.headers.get("x-webhook-secret") !== s) return new Response("Unauthorized", { status: 401 });
  if (!env("SMTP_PASSWORD") && env("SMTP_DRY_RUN") !== "true") return new Response("SMTP_PASSWORD not set (Edge Functions → Secrets)", { status: 500 });
  let body: Any;
  try { body = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
  if (!body?.id) return new Response("No booking id", { status: 400 });
  try {
    return new Response(JSON.stringify(await handleEvent(body)), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
if ((globalThis as Any).Deno?.serve) (globalThis as Any).Deno.serve(handle);
