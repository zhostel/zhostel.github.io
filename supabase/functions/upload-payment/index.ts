// =============================================================================
// upload-payment — the guest's payment screenshot from /pay/.
// The page posts multipart form data { code, email, file }. This function
// checks the booking (code + the email on it), stores the file in the private
// "payment-proofs" bucket and records it with submit_payment_proof(), which
// works out the amount itself. Guests never get write access to storage.
//
// Deploy with "Verify JWT" OFF (the page calls it without a login).
// Optional secret: ALLOWED_ORIGINS (comma-separated; defaults below).
// =============================================================================
// deno-lint-ignore-file no-explicit-any
type Any = any;
const env = (k: string, d = "") => { const v = (globalThis as Any).Deno?.env.get(k); return v === undefined || v === null || v === "" ? d : String(v); };
const SB_URL = () => env("SUPABASE_URL");
const SR = () => env("SUPABASE_SERVICE_ROLE_KEY");
const ORIGINS = () => env("ALLOWED_ORIGINS", "https://zhostel.github.io,https://zhostel.com,https://www.zhostel.com").split(",").map((s) => s.trim());
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" };
const MAX = 10 * 1024 * 1024;

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  const allow = ORIGINS().includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) ? o : ORIGINS()[0];
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info", Vary: "Origin" };
}
const reply = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

async function rpc(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${SB_URL()}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: SR(), Authorization: `Bearer ${SR()}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
  });
  const t = await res.text();
  let j: Any = null; try { j = t ? JSON.parse(t) : null; } catch { /* text */ }
  if (!res.ok) throw new Error((j && (j.message || j.hint)) || `Something went wrong (${res.status}). Please try again.`);
  return j;
}
const objUrl = (path: string) => `${SB_URL()}/storage/v1/object/payment-proofs/${path.split("/").map(encodeURIComponent).join("/")}`;

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, { error: "Method not allowed" }, 405);
  let form: FormData;
  try { form = await req.formData(); } catch { return reply(req, { error: "Please choose a screenshot to upload." }, 400); }
  const code = String(form.get("code") || "").trim().toUpperCase();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const method = String(form.get("method") || "transfer");
  const file = form.get("file");
  if (!/^Z-\d{3,7}$/.test(code) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply(req, { error: "Enter your booking code (like Z-1042) and the email on the booking." }, 400);
  if (!(file instanceof File) || !file.size) return reply(req, { error: "Please choose a screenshot to upload." }, 400);
  if (file.size > MAX) return reply(req, { error: "That file is over 10 MB. Please upload a smaller screenshot." }, 400);
  const ext = TYPES[file.type];
  if (!ext) return reply(req, { error: "Please upload a JPG, PNG, WebP, HEIC image or a PDF." }, 400);

  try {
    const b = await rpc("my_booking", { p_code: code, p_email: email });
    if (!b?.ok) return reply(req, { error: "We couldn't find a booking with that code and email." }, 404);
    if (b.status === "expired") return reply(req, { error: "This booking's hold ended before a payment was uploaded. Please book again or message us." }, 409);
    if (!b.can_upload) return reply(req, { error: "Nothing left to pay on this booking — thank you!" }, 409);

    const path = `${code}/${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const up = await fetch(objUrl(path), {
      method: "POST", headers: { apikey: SR(), Authorization: `Bearer ${SR()}`, "Content-Type": file.type, "x-upsert": "false" }, body: new Uint8Array(await file.arrayBuffer()),
    });
    if (!up.ok) return reply(req, { error: "The upload didn't go through. Please try again." }, 502);
    try {
      const r = await rpc("submit_payment_proof", { p_code: code, p_email: email, p_path: path, p_method: method });
      return reply(req, { ok: true, code, amount: r.amount, status: r.status });
    } catch (e) {
      await fetch(objUrl(path), { method: "DELETE", headers: { apikey: SR(), Authorization: `Bearer ${SR()}` } }).catch(() => null);
      return reply(req, { error: (e as Error).message }, 409);
    }
  } catch (e) {
    console.error(e);
    return reply(req, { error: (e as Error).message || "Something went wrong. Please try again." }, 500);
  }
}
if ((globalThis as Any).Deno?.serve) (globalThis as Any).Deno.serve(handle);
