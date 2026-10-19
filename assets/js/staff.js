/* Z Hostel front desk (/staff/), v2 — laid out like Cloudbeds so the team feels at home:
   top bar with global search, side menu, Dashboard (date card, today's activity, occupancy, forecast),
   Calendar (room types → beds/rooms, reservation bars), Reservations (filter chips, table, bulk actions),
   a reservation drawer (Overview · Folio · Notes · Guest · Accommodations · Emails · Activity) and the
   New Reservation wizard (Availability → Details → Add-ons → Payment). Plus what Cloudbeds doesn't do for us:
   pay-ahead proofs to verify, 2-hour holds, 5% pay-ahead discount, guest emails, housekeeping board, bed assignment
   by drag and drop, team activity. Every write goes through staff-only database functions (is_staff()). */
(function () {
  "use strict";
  var CFG = window.Z_CONFIG || {};
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" } });

  /* ================= helpers ================= */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function peso(n, dec) { n = Number(n || 0); return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: dec ? 2 : (n % 1 ? 2 : 0), maximumFractionDigits: 2 }); }
  function manila(d) { return (d || new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); }
  function parse(s) { var p = String(s || "").slice(0, 10).split("-"); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function fmtD(s) { var d = parse(s); return d ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : ""; }
  function fmtDs(s) { var d = parse(s); return d ? d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" }) : ""; }
  function fmtDT(t) { return t ? new Date(t).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""; }
  function ago(t) { var m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; }
  function left(t) { var s = Math.round((new Date(t).getTime() - Date.now()) / 1000); if (s <= 0) return "hold ended"; var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + "h " : "") + m + "m left"; }
  function plural(n, w, ws) { return n + " " + (n === 1 ? w : (ws || w + "s")); }
  function initials(name) { var p = String(name || "?").trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
  function splitName(n) { var p = String(n || "").trim().split(/\s+/); return p.length > 1 ? [p.slice(0, -1).join(" "), p[p.length - 1]] : [p[0] || "", ""]; }
  var TODAY = manila();
  var toastT;
  function toast(msg, err) { var t = $("#toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, err ? 6500 : 3200); }
  function fail(e) { toast((e && (e.message || e.error_description || e.hint)) || String(e), true); }
  function must(r) { if (r && r.error) throw r.error; return r ? r.data : null; }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem("z.desk." + k)); localStorage.setItem("z.desk." + k, JSON.stringify(v)); } catch (e) { return null; } }

  /* small stroke icons */
  var ICONS = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', bed: '<path d="M3 18v-8M21 18v-5a3 3 0 0 0-3-3H10v8M3 14h18M6.5 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>',
    bell: '<path d="M18 16V11a6 6 0 1 0-12 0v5l-2 2h16zM10 20a2 2 0 0 0 4 0"/>', home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>', cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>', cloud: '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 1 0 6 18.9h11.5z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    moonl: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', down: '<path d="M12 4v12M6 11l6 6 6-6M4 20h16"/>', moon2: "",
    night: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', adult: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>', check: '<path d="M5 12l5 5 9-10"/>',
    left: '<path d="M15 18l-6-6 6-6"/>', right: '<path d="M9 18l6-6-6-6"/>', door: '<path d="M14 3H6v18h8M14 3l6 2v16l-6-2zM11 12h.01"/>', out: '<path d="M10 17l5-5-5-5M15 12H3M21 3v18"/>'
  };
  function ic(n, cls) { return '<svg class="i' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || "") + "</svg>"; }
  function paintIcons(root) { $$("[data-ic]", root).forEach(function (el) { if (!el._ic) { el._ic = 1; el.insertAdjacentHTML("afterbegin", ic(el.getAttribute("data-ic"))); } }); }

  /* ================= vocab ================= */
  var STATUS = [
    ["pending", "Awaiting payment"], ["pending_payment", "Payment to verify"], ["confirmed", "Confirmed"], ["checked_in", "In-house"],
    ["checked_out", "Checked out"], ["cancelled", "Canceled"], ["no_show", "No-show"], ["expired", "Hold ended"]];
  var STATUS_L = {}; STATUS.forEach(function (s) { STATUS_L[s[0]] = s[1]; });
  var ACTIVE = { pending: 1, pending_payment: 1, confirmed: 1, checked_in: 1 };
  var OCC = { pending: 1, pending_payment: 1, confirmed: 1, checked_in: 1, checked_out: 1 };
  // Sources, grouped the way Cloudbeds' "Select Source" is (values are what we store)
  var SOURCE_GROUPS = [
    ["Direct", [["walk-in", "Walk-In"], ["phone", "Phone"], ["email", "Email"], ["messenger", "Messenger / Facebook"], ["instagram", "Instagram"], ["website", "Website / Booking Engine"], ["returnee", "Returnee"], ["direct-extension", "Direct Extension"], ["foc", "FOC (free of charge)"], ["staff-stay", "Staff / friend stay"], ["partners", "Partners & Investor"]]],
    ["Third party", [["corporate", "Corporate client"], ["educational", "Educational group"], ["group", "Group / event"], ["agency", "Travel agency"]]],
    ["Other", [["other", "Other"]]]];
  var SOURCE_L = { cloudbeds: "Cloudbeds" };
  SOURCE_GROUPS.forEach(function (g) { g[1].forEach(function (s) { SOURCE_L[s[0]] = s[1]; }); });
  SOURCE_L["phone"] = "Phone"; SOURCE_L["walk-in"] = "Walk-In";
  var PAYM = { desk: "Pay at check-in", transfer: "Pay ahead (transfer)" };
  var METHOD = { transfer: "Bank transfer", gcash: "GCash", maya: "Maya", cash: "Cash", card: "Card", other: "Other", bank: "Bank" };
  var VAT = 0.12;

  /* ================= state ================= */
  var ME = null, MYNAME = "", ROWS = [], CAT = { types: [], plans: [], addons: [], settings: {} }, STAFF = [];
  var ROOMS = [], ROOM_BY_NAME = {}, ROOM_BY_ID = {}, BLOCKS = [], HK = {};
  var ROUTE = "dashboard", ROUTE_ARG = null;

  function staffName(email) {
    if (!email) return "—";
    if (email === "website") return "Website"; if (email === "cloudbeds") return "Cloudbeds"; if (email === "guest") return "Guest"; if (email === "system") return "System";
    var s = STAFF.filter(function (x) { return String(x.email).toLowerCase() === String(email).toLowerCase(); })[0];
    return s && s.name ? s.name : String(email).split("@")[0];
  }
  function planBy(id) { return CAT.plans.filter(function (p) { return p.id === id; })[0]; }
  function typeBy(slug) { return CAT.types.filter(function (t) { return t.slug === slug; })[0]; }
  function typeName(slug) { var t = typeBy(slug); return t ? t.name : slug || "—"; }
  function byId(id) { return ROWS.filter(function (r) { return r.id === id; })[0]; }
  function balance(r) { return Math.max(Number(r.total || 0) - Number(r.amount_paid || 0), 0); }
  function units(r) { var n = (r.items || []).reduce(function (a, i) { return a + (+i.units || 0); }, 0); return n || (r.cb_rooms || []).length || 1; }
  function roomsOf(r) { var a = r.cb_owned ? r.cb_rooms : r.assigned_rooms; return Array.isArray(a) ? a.filter(Boolean) : []; }
  function sourceOf(r) { return r.cb_owned ? (r.cb_source || "Cloudbeds") : (SOURCE_L[r.source] || r.source || ""); }
  function typesText(r) {
    var by = {}; (r.items || []).forEach(function (i) { by[i.room_type] = (by[i.room_type] || 0) + (+i.units || 0); });
    return Object.keys(by).map(function (k) { return (by[k] > 1 ? by[k] + "× " : "") + typeName(k); }).join(", ") || "—";
  }
  function roomsText(r) { var a = roomsOf(r); return a.length ? a.join(", ") : ""; }
  function canEdit(r) { return r && !r.cb_owned; }
  function stTag(s) { return '<span class="tag s-' + esc(s) + '">' + esc(STATUS_L[s] || s) + "</span>"; }
  function payTag(r) { return '<span class="tag p-' + esc(r.payment_status) + '">' + esc({ unpaid: "Unpaid", partial: "Part-paid", paid: "Paid", refunded: "Refunded" }[r.payment_status] || r.payment_status || "") + "</span>"; }
  function stayIcons(r) { return '<span class="stay-ic"><span>' + ic("night") + (r.nights || diffDays(r.checkin, r.checkout)) + "</span><span>" + ic("adult") + (r.guests || 1) + "</span>" + (units(r) > 1 ? "<span>" + ic("bed") + units(r) + "</span>" : "") + "</span>"; }
  function hkOfName(name) { var room = ROOM_BY_NAME[name]; return room && HK[room.room_id] ? HK[room.room_id].condition : room ? "clean" : null; }

  /* ================= auth ================= */
  var lm = $("#l-msg");
  function lmsg(t, cls) { lm.className = "msg" + (cls ? " " + cls : ""); lm.textContent = t || ""; }
  $("#login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("#l-email").value.trim().toLowerCase(), pass = $("#l-pass").value;
    if (!email) { lmsg("Enter your staff email.", "err"); return; }
    if (!pass) { lmsg("Enter your password, or use the sign-in link.", "err"); return; }
    lmsg("Signing in…");
    sb.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
      if (r.error) throw new Error(/invalid/i.test(r.error.message) ? "Wrong email or password." : r.error.message);
      lmsg("");
    }).catch(function (err) { lmsg(err.message, "err"); });
  });
  $("#l-link").addEventListener("click", function () {
    var email = $("#l-email").value.trim().toLowerCase();
    if (!email) { lmsg("Enter your staff email first.", "err"); return; }
    if (/@staff\.local$/.test(email)) { lmsg("Front-desk logins (@staff.local) sign in with their password. The sign-in link only works for real mailboxes.", "err"); return; }
    lmsg("Checking…");
    sb.rpc("staff_can_login", { p_email: email }).then(function (r) {
      if (r.error) throw r.error;
      if (!r.data) throw new Error("That email isn't on the staff list. Ask the owner to add you in Admin → Staff.");
      return sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + "/staff/", shouldCreateUser: true } });
    }).then(function (r) {
      if (r && r.error) throw r.error;
      lmsg("Check your inbox for the sign-in link (it can take a minute).", "ok");
    }).catch(function (err) { lmsg(/rate limit/i.test(err.message) ? "Too many sign-in emails were sent in the last hour. Sign in with your password instead, or try the link again later." : err.message, "err"); });
  });
  function signOut() { sb.auth.signOut().then(function () { location.href = "/staff/"; }); }

  var booted = false;
  sb.auth.onAuthStateChange(function (_e, s) { boot(s); });
  sb.auth.getSession().then(function (r) { boot(r.data.session); });
  function boot(session) {
    if (!session) { $("#login").hidden = false; $("#app").hidden = true; return; }
    if (booted) return; booted = true;
    ME = session.user.email.toLowerCase();
    if (location.hash.indexOf("access_token") > -1) history.replaceState(null, "", location.pathname + location.search + "#/dashboard");
    sb.rpc("staff_can_login", { p_email: ME }).then(function (r) {
      if (!r.data) { $("#login").hidden = false; lmsg(ME + " isn't on the staff list. Ask the owner to add you, then sign in again.", "err"); sb.auth.signOut(); booted = false; return; }
      $("#login").hidden = true; $("#app").hidden = false;
      try { if (!sessionStorage.getItem("z.signin")) { sessionStorage.setItem("z.signin", "1"); sb.rpc("staff_ping", { p_kind: "signin" }); } } catch (e) {}
      init();
    });
  }
  var lastPing = 0;
  ["click", "keydown"].forEach(function (ev) { document.addEventListener(ev, function () { if (!ME || Date.now() - lastPing < 120000) return; lastPing = Date.now(); sb.rpc("staff_ping", { p_kind: "use" }).then(function () {}); }, true); });

  /* ================= data ================= */
  var READY = false;
  function init() {
    paintIcons(document);
    shell();
    Promise.all([
      sb.from("room_types").select("*").order("sort"), sb.from("rate_plans").select("*").order("sort"),
      sb.from("addons").select("*").order("sort"), sb.from("booking_settings").select("*").eq("id", 1), sb.from("staff").select("*"),
      sb.from("cb_rooms").select("room_id,room_name,cb_room_type_name,room_type").order("room_name"),
      sb.from("cb_blocks").select("*").gte("end_date", addDays(TODAY, -60)),
      sb.from("room_housekeeping").select("*")
    ]).then(function (rs) {
      CAT.types = must(rs[0]) || []; CAT.plans = must(rs[1]) || []; CAT.addons = must(rs[2]) || []; CAT.settings = (must(rs[3]) || [])[0] || {}; STAFF = must(rs[4]) || [];
      ROOMS = (rs[5].data || []).slice(); BLOCKS = rs[6].data || [];
      HK = {}; (rs[7].data || []).forEach(function (h) { HK[h.room_id] = h; });
      var order = {}; CAT.types.forEach(function (t, i) { order[t.slug] = i; });
      ROOMS.sort(function (a, b) { return (order[a.room_type] || 0) - (order[b.room_type] || 0) || String(a.room_name).localeCompare(String(b.room_name), "en", { numeric: true }); });
      ROOM_BY_NAME = {}; ROOM_BY_ID = {}; ROOMS.forEach(function (r) { ROOM_BY_NAME[r.room_name] = r; ROOM_BY_ID[r.room_id] = r; });
      var me = STAFF.filter(function (s) { return String(s.email).toLowerCase() === ME; })[0];
      MYNAME = me && me.name ? me.name : ME.split("@")[0];
      $("#acct").textContent = initials(MYNAME);
      return refresh();
    }).then(function () { READY = true; route(); }).catch(fail);
    setInterval(function () { if (document.visibilityState === "visible" && !$("#drawer").contains(document.activeElement)) refresh(true); }, 60000);
    setInterval(function () { $$("[data-hold]").forEach(function (el) { el.textContent = left(el.getAttribute("data-hold")); el.classList.toggle("late", new Date(el.getAttribute("data-hold")) < new Date()); }); }, 30000);
  }
  function refresh(quiet) {
    TODAY = manila();
    return Promise.all([sb.rpc("staff_bookings", { p_from: null, p_limit: 5000 }), sb.from("room_housekeeping").select("*")]).then(function (rs) {
      ROWS = must(rs[0]) || [];
      if (rs[1].data) { HK = {}; rs[1].data.forEach(function (h) { HK[h.room_id] = h; }); }
      alerts(); bell();
      if (READY) redraw(quiet);
      if (DR.id && !$("#drawer").hidden) { var r = byId(DR.id); if (r) drawDrawer(r, true); }
    }).catch(function (e) { if (!quiet) fail(e); });
  }
  function reloadSettings() { return sb.from("booking_settings").select("*").eq("id", 1).then(function (r) { CAT.settings = (r.data || [])[0] || CAT.settings; }); }

  /* ================= shell: router, side menu, search, bell, account ================= */
  var VIEWS = {};
  function shell() {
    $("#menu-btn").addEventListener("click", function () {
      if (window.matchMedia("(max-width: 1000px)").matches) { document.body.classList.toggle("side-open"); scrim(document.body.classList.contains("side-open")); }
      else { document.body.classList.toggle("mini"); store("mini", document.body.classList.contains("mini")); }
    });
    if (store("mini")) document.body.classList.add("mini");
    $$("#side a").forEach(function (a) { a.addEventListener("click", function () { document.body.classList.remove("side-open"); scrim(false); }); });
    var th = $("#theme-btn");
    function themeIcon() { th.innerHTML = ic(document.documentElement.getAttribute("data-theme") === "dark" ? "sun" : "moon"); }
    themeIcon();
    th.addEventListener("click", function () {
      var dark = document.documentElement.getAttribute("data-theme") !== "dark";
      if (dark) document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme");
      try { localStorage.setItem("z.desk.theme", dark ? "dark" : "light"); } catch (e) {}
      themeIcon();
    });
    $("#acct").addEventListener("click", function (e) { e.stopPropagation(); acctMenu(); });
    $("#bell").addEventListener("click", function (e) { e.stopPropagation(); bellMenu(); });
    search();
    window.addEventListener("hashchange", route);
    document.addEventListener("click", function (e) { if (POP && !POP.contains(e.target)) closePop(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { if ($(".lightbox")) { $(".lightbox").remove(); return; } if (POP) { closePop(); return; } if (!$("#drawer").hidden) closeDrawer(); }
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $("#gs-q").focus(); }
    });
    $("#dr-scrim").addEventListener("click", closeDrawer);
  }
  var scrimEl = null;
  function scrim(on) {
    if (on && !scrimEl) { scrimEl = document.createElement("div"); scrimEl.className = "cb-scrim"; scrimEl.addEventListener("click", function () { document.body.classList.remove("side-open"); scrim(false); }); document.body.appendChild(scrimEl); }
    if (!on && scrimEl) { scrimEl.remove(); scrimEl = null; }
  }
  function route() {
    if (!READY) return;
    var h = (location.hash || "#/dashboard").replace(/^#\/?/, "").split("?")[0].split("/");
    var v = h[0] || "dashboard", arg = h.slice(1).join("/");
    if (v === "reservations" && arg === "new") { v = "new"; arg = null; }
    else if (v === "reservations" && /^edit\//.test(arg)) { v = "new"; arg = arg.slice(5); }
    if (!VIEWS[v]) v = "dashboard";
    var changed = v !== ROUTE || arg !== ROUTE_ARG || !VIEWS[v].built;
    ROUTE = v; ROUTE_ARG = arg || null;
    if (changed && !$("#drawer").hidden) closeDrawer();
    $$("[data-view]").forEach(function (s) { s.hidden = s.id !== "v-" + v; });
    $$("#side a[data-r]").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-r") === v); });
    var V = VIEWS[v], el = $("#v-" + v);
    if (!V.built || V.rebuild) { V.build(el, ROUTE_ARG); V.built = true; paintIcons(el); }
    else if (changed && V.enter) V.enter(el, ROUTE_ARG);
    if (V.draw) V.draw(el);
    document.title = (V.title || "Front desk") + " · Z Hostel";
    if (changed) window.scrollTo(0, 0);
  }
  function redraw(quiet) { var V = VIEWS[ROUTE]; if (V && V.built && V.draw && !(quiet && V.noAuto)) V.draw($("#v-" + ROUTE)); updateNav(); }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function updateNav() { var v = ROWS.filter(function (r) { return r.proofs_to_check > 0; }).length; $("#nav-verify").textContent = v || ""; }

  /* popovers (menus, filter chips) */
  var POP = null;
  function closePop() { if (POP) { POP.remove(); POP = null; } }
  function openPop(anchor, html, cls, alignRight) {
    closePop();
    var p = document.createElement("div"); p.className = "pop " + (cls || ""); p.innerHTML = html;
    document.body.appendChild(p);
    var r = anchor.getBoundingClientRect(), w = p.offsetWidth;
    var x = alignRight ? r.right - w : r.left; x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    var y = r.bottom + 6; if (y + p.offsetHeight > window.innerHeight - 8) y = Math.max(8, r.top - p.offsetHeight - 6);
    p.style.left = x + "px"; p.style.top = y + "px";
    p.addEventListener("click", function (e) { e.stopPropagation(); });
    POP = p; paintIcons(p); return p;
  }
  function acctMenu() {
    var p = openPop($("#acct"), '<div class="hd"><b>' + esc(MYNAME) + '</b><small class="muted">' + esc(ME) + "</small></div>" +
      '<a class="mi" href="#/team"><span data-ic="users"></span>Team activity</a><a class="mi" href="#/settings"><span data-ic="gear"></span>Payment settings</a>' +
      '<a class="mi" href="/admin/"><span data-ic="tag"></span>Rates, marketing &amp; staff list</a><hr><button class="mi danger" type="button" id="so"><span data-ic="out"></span>Sign out</button>', "", true);
    $$("a", p).forEach(function (a) { a.addEventListener("click", closePop); });
    $("#so", p).addEventListener("click", signOut);
  }
  function notifications() {
    var n = [];
    ROWS.filter(function (r) { return r.proofs_to_check > 0; }).forEach(function (r) { n.push({ hot: 1, r: r, tab: "folio", t: "Payment to verify · " + r.code, s: r.guest_name + " uploaded " + peso(r.amount_pending) + (r.payment_uploaded_at ? " · " + ago(r.payment_uploaded_at) : "") }); });
    ROWS.filter(function (r) { return r.status === "pending" && r.hold_until && new Date(r.hold_until) - Date.now() < 30 * 60000; }).forEach(function (r) { n.push({ hot: 1, r: r, tab: "overview", t: "Hold ending · " + r.code, s: r.guest_name + " · " + left(r.hold_until) + ", no payment uploaded yet" }); });
    var un = ROWS.filter(function (r) { return !r.cb_owned && ACTIVE[r.status] && r.checkin === TODAY && !roomsOf(r).length; });
    if (un.length) n.push({ go: "#/calendar", t: plural(un.length, "arrival") + " today without a bed/room", s: "Drag them onto a bed in the Calendar, or assign them in the reservation." });
    ROWS.filter(function (r) { return r.source === "website" && !r.cb_owned && Date.now() - new Date(r.created_at) < 86400000 && r.status !== "expired"; }).slice(0, 10).forEach(function (r) { n.push({ r: r, tab: "overview", t: "New website booking · " + r.code, s: r.guest_name + " · " + fmtDs(r.checkin) + " · " + peso(r.total) + " · " + ago(r.created_at) }); });
    return n;
  }
  function bell() { var n = notifications().filter(function (x) { return x.hot; }).length; var b = $("#bell-n"); b.hidden = !n; b.textContent = n > 99 ? "99+" : n; }
  function bellMenu() {
    var list = notifications();
    var p = openPop($("#bell"), '<div class="hd"><b>Notifications</b></div>' + (list.length ? list.map(function (x, i) { return '<button class="it" type="button" data-i="' + i + '"><b' + (x.hot ? ' style="color:var(--vio)"' : "") + ">" + esc(x.t) + "</b><small>" + esc(x.s) + "</small></button>"; }).join("") : '<div class="empty">You\'re all caught up.</div>'), "notif", true);
    $$("[data-i]", p).forEach(function (b) { b.addEventListener("click", function () { var x = list[+b.getAttribute("data-i")]; closePop(); if (x.r) openRes(x.r.id, x.tab); else go(x.go); }); });
  }
  function search() {
    var q = $("#gs-q"), box = $("#gs-res"), act = -1, hits = [];
    function find(s) {
      var w = s.toLowerCase().split(/\s+/).filter(Boolean);
      return ROWS.filter(function (r) {
        var hay = [r.code, r.guest_name, r.guest_email, r.guest_phone, r.ota_ref, r.cb_reservation_id, roomsText(r)].join(" ").toLowerCase();
        return w.every(function (x) { return hay.indexOf(x) > -1; });
      }).sort(function (a, b) { return Math.abs(diffDays(TODAY, a.checkin)) - Math.abs(diffDays(TODAY, b.checkin)); });
    }
    function draw() {
      var s = q.value.trim(); if (s.length < 2) { box.hidden = true; return; }
      hits = find(s); act = -1;
      box.innerHTML = (hits.length ? hits.slice(0, 8).map(function (r, i) {
        return '<button type="button" data-i="' + i + '"><span class="avatar" style="background:var(--pri)">' + esc(initials(r.guest_name)) + '</span><span class="who"><b>' + esc(r.guest_name) + "</b><small>" + esc(r.code) + " · " + esc(fmtDs(r.checkin)) + " → " + esc(fmtDs(r.checkout)) + (roomsText(r) ? " · " + esc(roomsText(r)) : "") + "</small></span>" + stTag(r.status) + "</button>";
      }).join("") : '<div class="foot">No reservations match “' + esc(s) + "”.</div>") + (hits.length ? '<button type="button" data-all="1" class="foot">See all ' + hits.length + " result" + (hits.length > 1 ? "s" : "") + " in Reservations →</button>" : "");
      box.hidden = false;
      $$("[data-i]", box).forEach(function (b) { b.addEventListener("mousedown", function (e) { e.preventDefault(); pick(+b.getAttribute("data-i")); }); });
      var all = $("[data-all]", box); if (all) all.addEventListener("mousedown", function (e) { e.preventDefault(); all_(); });
    }
    function pick(i) { var r = hits[i]; box.hidden = true; q.blur(); q.value = ""; if (r) openRes(r.id); }
    function all_() { box.hidden = true; RES.q = q.value.trim(); RES.tab = "all"; RES.page = 0; q.blur(); q.value = ""; go("#/reservations"); if (ROUTE === "reservations") { var i = $("#rs-q"); if (i) i.value = RES.q; VIEWS.reservations.draw($("#v-reservations")); } }
    var t; q.addEventListener("input", function () { clearTimeout(t); t = setTimeout(draw, 120); });
    q.addEventListener("focus", draw);
    q.addEventListener("blur", function () { setTimeout(function () { box.hidden = true; }, 150); });
    q.addEventListener("keydown", function (e) {
      var bs = $$("[data-i]", box);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); act = Math.max(0, Math.min(bs.length - 1, act + (e.key === "ArrowDown" ? 1 : -1))); bs.forEach(function (b, i) { b.classList.toggle("act", i === act); }); }
      else if (e.key === "Enter") { e.preventDefault(); if (act > -1) pick(act); else if (hits.length === 1) pick(0); else if (q.value.trim()) all_(); }
    });
  }
  function alerts() {
    var h = "", v = ROWS.filter(function (r) { return r.proofs_to_check > 0; });
    if (v.length) h += '<div class="alert hot"><span><b>' + plural(v.length, "payment") + " to verify.</b> Check " + (v.length > 1 ? "them" : "it") + ' against the bank / e-wallet; the guest is waiting for a confirmation.</span><a class="btn sm" href="#/payments">Verify now</a></div>';
    var acc = CAT.settings.pay_accounts || [];
    if (!acc.length || JSON.stringify(acc).indexOf("CONFIRM") > -1) h += '<div class="alert warn"><span><b>Bank / e-wallet accounts aren\'t set yet.</b> Guests who pay ahead see them on the booking page and in their email.</span><a class="btn sm ghost" href="#/settings">Set them</a></div>';
    $("#alerts").innerHTML = h;
  }
  function lightbox(url) { var d = document.createElement("div"); d.className = "lightbox"; d.innerHTML = '<img alt="Payment proof" src="' + esc(url) + '">'; d.addEventListener("click", function () { d.remove(); }); document.body.appendChild(d); }

  /* ================= occupancy maths (shared by dashboard, calendar, housekeeping, reports) ================= */
  function blockedOn(d) { var out = {}; BLOCKS.forEach(function (b) { if (b.start_date <= d && b.end_date >= d) (b.rooms || []).forEach(function (id) { out[id] = b; }); }); return out; }
  function totalUnits(slug) { var n = ROOMS.filter(function (r) { return !slug || r.room_type === slug; }).length; if (n) return n; return CAT.types.filter(function (t) { return !slug || t.slug === slug; }).reduce(function (a, t) { return a + (+t.total_units || +t.web_allotment || 0); }, 0); }
  function stayingOn(d) { return ROWS.filter(function (r) { return OCC[r.status] && r.checkin <= d && r.checkout > d; }); }
  function unitsOn(d, slug) {
    return stayingOn(d).reduce(function (a, r) {
      if (!slug) return a + units(r);
      var n = (r.items || []).filter(function (i) { return i.room_type === slug; }).reduce(function (x, i) { return x + (+i.units || 0); }, 0);
      if (!r.items || !r.items.length) n = roomsOf(r).filter(function (nm) { return ROOM_BY_NAME[nm] && ROOM_BY_NAME[nm].room_type === slug; }).length;
      return a + n;
    }, 0);
  }
  function blockedCount(d, slug) { var b = blockedOn(d); return Object.keys(b).filter(function (id) { var r = ROOM_BY_ID[id]; return r && (!slug || r.room_type === slug); }).length; }
  function nightRevenue(r) { var n = r.nights || diffDays(r.checkin, r.checkout) || 1; return Number(r.total || 0) / n; }
  function stats(from, days) {
    var out = [], tot = totalUnits();
    for (var k = 0; k < days; k++) {
      var d = addDays(from, k), st = stayingOn(d).filter(function (r) { return r.status !== "pending" || d >= TODAY; });
      var u = st.reduce(function (a, r) { return a + units(r); }, 0), rev = st.reduce(function (a, r) { return a + nightRevenue(r); }, 0), bl = blockedCount(d);
      var avail = Math.max(tot - bl, 0);
      out.push({ d: d, units: u, rev: rev, blocked: bl, avail: avail, occ: avail ? Math.min(u / avail, 1) : 0, adr: u ? rev / u : 0, revpar: avail ? rev / avail : 0 });
    }
    return out;
  }

  /* ================= Dashboard ================= */
  var DASH = { d: null, tab: "arrivals", fc: 14 };
  var DTABS = [
    ["arrivals", "Arrivals", function (r, d) { return ACTIVE[r.status] && r.checkin === d; }],
    ["departures", "Departures", function (r, d) { return (r.status === "confirmed" || r.status === "checked_in" || r.status === "checked_out") && r.checkout === d; }],
    ["inhouse", "In-house", function (r, d) { return d === TODAY ? r.status === "checked_in" : (r.status === "checked_in" || r.status === "confirmed" || r.status === "checked_out") && r.checkin <= d && r.checkout > d; }],
    ["stayovers", "Stayovers", function (r, d) { return (ACTIVE[r.status] || r.status === "checked_out") && r.checkin < d && r.checkout > d; }],
    ["bookings", "Bookings", function (r, d) { return manila(new Date(r.created_at)) === d && r.status !== "expired"; }],
    ["cancellations", "Cancellations", function (r, d) { return (r.status === "cancelled" || r.status === "no_show") && manila(new Date(r.updated_at || r.created_at)) === d; }],
    ["verify", "To verify", function (r) { return r.proofs_to_check > 0; }, true],
    ["holds", "Awaiting payment", function (r) { return r.status === "pending"; }, true]];
  VIEWS.dashboard = {
    title: "Dashboard",
    build: function (el) {
      DASH.d = DASH.d || TODAY;
      el.innerHTML = '<div class="ph"><h1>Dashboard</h1><span class="sp"></span><a class="btn ghost" href="#/calendar">' + ic("cal") + 'Calendar</a><a class="btn" href="#/reservations/new">' + ic("plus") + "New reservation</a></div>" +
        '<div class="dash">' +
        '<div class="col"><div class="card"><div class="datecard"><span class="dow" id="d-dow"></span><span class="dt" id="d-dt"></span><div class="nav">' +
        '<button class="ib" type="button" id="d-prev" aria-label="Previous day">' + ic("left") + '</button><button class="btn ghost sm" type="button" id="d-today">Today</button><button class="ib" type="button" id="d-next" aria-label="Next day">' + ic("right") + '</button><input class="inp" type="date" id="d-pick" aria-label="Pick a date"></div></div><div class="kpis" id="d-kpis"></div></div></div>' +
        '<div class="card"><div class="card-h"><h2>Occupancy</h2><span class="sp"></span><small id="d-occ-d"></small></div><div class="donut" id="d-donut"></div></div>' +
        '<div class="card fcst"><div class="card-h"><h2>Forecast</h2><span class="sp"></span><select class="sel" id="d-fc" style="width:auto;height:30px"><option value="7">Next 7 days</option><option value="14">Next 14 days</option><option value="30">Next 30 days</option></select></div><div class="fc-k" id="d-fck"></div><div class="fc-bars" id="d-fcb"></div><div class="fc-x" id="d-fcx"></div><p class="small muted" style="padding:8px 16px 14px;margin:0">All sources (website, staff and Cloudbeds/OTA). Revenue is the booking total spread evenly over its nights.</p></div>' +
        '<div class="card wide" id="d-act"><div class="card-h"><h2>Activity</h2><span class="sp"></span><a class="btn link sm" href="#/reservations" id="d-all">View all reservations →</a></div><div class="tabs" id="d-tabs" role="tablist"></div><div class="tw"><table class="t" id="d-tbl"></table></div></div>' +
        "</div>";
      $("#d-prev").addEventListener("click", function () { DASH.d = addDays(DASH.d, -1); this_draw(); });
      $("#d-next").addEventListener("click", function () { DASH.d = addDays(DASH.d, 1); this_draw(); });
      $("#d-today").addEventListener("click", function () { DASH.d = TODAY; this_draw(); });
      $("#d-pick").addEventListener("change", function () { if (this.value) { DASH.d = this.value; this_draw(); } });
      $("#d-fc").value = String(DASH.fc);
      $("#d-fc").addEventListener("change", function () { DASH.fc = +this.value; this_draw(); });
      function this_draw() { VIEWS.dashboard.draw(el); }
    },
    draw: function (el) {
      var d = DASH.d || TODAY, dt = parse(d);
      $("#d-dow", el).textContent = dt.toLocaleDateString("en-PH", { weekday: "long" }) + (d === TODAY ? " · Today" : "");
      $("#d-dt", el).textContent = dt.toLocaleDateString("en-PH", { day: "numeric", month: "long", year: "numeric" });
      $("#d-pick", el).value = d;
      var cnt = {}; DTABS.forEach(function (t) { cnt[t[0]] = ROWS.filter(function (r) { return t[2](r, d); }); });
      var guests = cnt.inhouse.reduce(function (a, r) { return a + (+r.guests || 0); }, 0);
      var dueArr = cnt.arrivals.filter(function (r) { return !r.cb_owned; }).reduce(function (a, r) { return a + balance(r); }, 0);
      $("#d-kpis", el).innerHTML = [["arrivals", cnt.arrivals.length, "Arrivals"], ["departures", cnt.departures.length, "Departures"], ["inhouse", guests, "Guests in-house"], ["arrivals", peso(dueArr), "To collect from arrivals"],
        ["verify", cnt.verify.length, "Payments to verify", cnt.verify.length], ["holds", cnt.holds.length, "Awaiting payment (2-h hold)", cnt.holds.length]].map(function (k) {
        return '<button type="button" data-t="' + k[0] + '"' + (k[3] ? ' class="hot"' : "") + "><b>" + k[1] + "</b><small>" + k[2] + "</small></button>";
      }).join("");
      $$("#d-kpis [data-t]", el).forEach(function (b) { b.addEventListener("click", function () { DASH.tab = b.getAttribute("data-t"); VIEWS.dashboard.draw(el); }); });
      $("#d-tabs", el).innerHTML = DTABS.map(function (t) { return '<button type="button" role="tab" data-t="' + t[0] + '" aria-selected="' + (DASH.tab === t[0]) + '"' + (t[3] && cnt[t[0]].length ? ' class="hot"' : "") + "><b>" + cnt[t[0]].length + "</b>" + t[1] + "</button>"; }).join("");
      $$("#d-tabs button", el).forEach(function (b) { b.addEventListener("click", function () { DASH.tab = b.getAttribute("data-t"); VIEWS.dashboard.draw(el); }); });
      var rows = cnt[DASH.tab].slice().sort(function (a, b) { return String(a.arrival_time || "").localeCompare(String(b.arrival_time || "")) || a.guest_name.localeCompare(b.guest_name); });
      $("#d-tbl", el).innerHTML = "<thead><tr><th>Guest</th><th>Accommodation</th><th>Stay</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>" + (rows.length ? rows.map(function (r) { return actRow(r, d); }).join("") : '<tr class="empty"><td colspan="6">Nothing here for ' + esc(fmtDs(d)) + ".</td></tr>") + "</tbody>";
      wireAct($("#d-tbl", el));
      // occupancy donut
      var st = stats(d, 1)[0], tot = totalUnits(), free = Math.max(st.avail - st.units, 0);
      $("#d-occ-d", el).textContent = fmtDs(d);
      var C = 2 * Math.PI * 52, segs = [[st.units, "var(--pri)"], [st.blocked, "var(--faint)"], [free, "var(--line)"]], off = 0;
      var svg = '<svg viewBox="0 0 124 124"><circle cx="62" cy="62" r="52" fill="none" stroke="var(--line)" stroke-width="14"/>' + segs.map(function (s) {
        var len = tot ? C * s[0] / tot : 0, h = '<circle cx="62" cy="62" r="52" fill="none" stroke="' + s[1] + '" stroke-width="14" stroke-dasharray="' + len + " " + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 62 62)"/>'; off += len; return h;
      }).join("") + '<text x="62" y="60" text-anchor="middle" font-size="20" font-weight="800" fill="var(--ink)">' + Math.round(st.occ * 1000) / 10 + '%</text><text x="62" y="78" text-anchor="middle" font-size="11" fill="var(--muted)">occupied</text></svg>';
      $("#d-donut", el).innerHTML = svg + '<div class="lg"><div><span><i style="background:var(--line)"></i>Available units</span><b>' + free + '</b></div><div><span><i style="background:var(--pri)"></i>Booked units</span><b>' + st.units + '</b></div><div><span><i style="background:var(--faint)"></i>Out of service</span><b>' + st.blocked + '</b></div><div><span>Total beds/rooms</span><b>' + tot + "</b></div></div>";
      // forecast
      var fc = stats(d, DASH.fc), sum = function (k) { return fc.reduce(function (a, x) { return a + x[k]; }, 0); };
      var u = sum("units"), rev = sum("rev"), av = sum("avail");
      $("#d-fck", el).innerHTML = "<div><b>" + (av ? Math.round(u / av * 1000) / 10 : 0) + "%</b><small>Avg occupancy</small></div><div><b>" + peso(u ? rev / u : 0) + "</b><small>ADR (per bed/room)</small></div><div><b>" + peso(av ? rev / av : 0) + "</b><small>RevPAR</small></div><div><b>" + peso(Math.round(rev)) + "</b><small>Room revenue</small></div>";
      $("#d-fcb", el).innerHTML = fc.map(function (x) { var w = parse(x.d).getDay(); return '<div class="' + (w === 5 || w === 6 ? "we" : "") + '" title="' + esc(fmtDs(x.d)) + ": " + Math.round(x.occ * 100) + "% · " + x.units + " units · " + peso(Math.round(x.rev)) + '"><i style="height:' + Math.max(2, Math.round(x.occ * 100)) + '%"></i></div>'; }).join("");
      $("#d-fcx", el).innerHTML = fc.map(function (x, i) { return "<span>" + (DASH.fc <= 14 || i % 3 === 0 ? parse(x.d).getDate() : "") + "</span>"; }).join("");
    }
  };
  function actRow(r, d) {
    var btn = "";
    if (r.cb_owned) btn = stTag(r.status) + '<small class="muted">in Cloudbeds</small>';
    else if (r.proofs_to_check > 0) btn = '<button class="btn sm" style="background:var(--vio);border-color:var(--vio)" type="button" data-a="verify" data-id="' + r.id + '">Verify payment</button>';
    else if ((r.status === "confirmed" || r.status === "pending_payment") && r.checkin <= TODAY && r.checkout > TODAY) btn = '<button class="btn sm" type="button" data-a="in" data-id="' + r.id + '">Check-in</button>';
    else if (r.status === "checked_in" && (r.checkout <= TODAY || r.checkout === d)) btn = '<button class="btn sm ghost" type="button" data-a="out" data-id="' + r.id + '">Check-out</button>';
    else btn = stTag(r.status) + (r.status === "pending" && r.hold_until ? '<small class="hold" data-hold="' + esc(r.hold_until) + '">' + left(r.hold_until) + "</small>" : "");
    var rooms = roomsOf(r), hk = rooms.map(function (n) { var c = hkOfName(n); return c && c !== "clean" ? ' <span class="tag c-' + c + '">' + (c === "dirty" ? "Dirty" : "Inspected") + "</span>" : ""; }).join("");
    return '<tr class="click" data-open="' + r.id + '"><td><b>' + esc(r.guest_name) + '</b><small class="code">' + esc(r.code) + (r.cb_owned ? "" : ' <span class="tag z">Z</span>') + "</small></td>" +
      "<td>" + (rooms.length ? "<b>" + esc(rooms.join(", ")) + "</b>" + hk : '<span class="muted">Unassigned</span>') + "<small>" + esc(typesText(r)) + "</small></td>" +
      '<td class="nw">' + esc(fmtDs(r.checkin)) + " – " + esc(fmtDs(r.checkout)) + stayIcons(r) + (r.arrival_time ? "<small>ETA " + esc(r.arrival_time) + "</small>" : "") + "</td>" +
      '<td class="num">' + (r.cb_owned ? '<span class="muted">—</span>' : balance(r) > 0.5 ? '<b style="color:var(--err)">' + peso(balance(r)) + "</b>" : '<span style="color:var(--ok)">Paid</span>') + "<small>" + esc(r.cb_owned ? sourceOf(r) : PAYM[r.pay_method] || "") + "</small></td>" +
      "<td>" + btn + '</td><td class="num"><button class="ib" type="button" data-open="' + r.id + '" aria-label="Open">' + ic("right") + "</button></td></tr>";
  }
  function wireAct(root) {
    $$("tr[data-open]", root).forEach(function (tr) { tr.addEventListener("click", function (e) { if (e.target.closest("[data-a]")) return; openRes(tr.getAttribute("data-open")); }); });
    $$("[data-a]", root).forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation(); var r = byId(b.getAttribute("data-id")), a = b.getAttribute("data-a");
        if (a === "verify") openRes(r.id, "folio"); else if (a === "in") checkIn(r, b); else if (a === "out") checkOut(r, b);
      });
    });
  }
  function setStatus(r, st, btn, okMsg) {
    if (btn) btn.disabled = true;
    return sb.rpc("staff_update_booking", { p_id: r.id, p: { status: st } }).then(must).then(function () { toast(okMsg || r.code + " → " + STATUS_L[st]); return refresh(); }).catch(function (e) { if (btn) btn.disabled = false; fail(e); });
  }
  function checkIn(r, btn) {
    var bal = balance(r);
    if (r.checkin > TODAY && !window.confirm(r.code + " arrives on " + fmtDs(r.checkin) + ". Check in early today?")) return;
    if (bal > 0.5 && !window.confirm(r.guest_name + " still owes " + peso(bal) + ". Check in anyway? (You can take the payment in the Folio.)")) return;
    if (!roomsOf(r).length && ROOMS.length) toast("Tip: assign a bed/room in the reservation (Accommodations) or by dragging in the Calendar.");
    setStatus(r, "checked_in", btn, r.guest_name + " checked in");
  }
  function checkOut(r, btn) {
    var bal = balance(r);
    if (bal > 0.5 && !window.confirm(r.guest_name + " still owes " + peso(bal) + ". Check out anyway?")) return;
    setStatus(r, "checked_out", btn, r.guest_name + " checked out").then(function () {
      // a departure leaves its beds dirty
      var ids = roomsOf(r).map(function (n) { return ROOM_BY_NAME[n] && ROOM_BY_NAME[n].room_id; }).filter(Boolean);
      if (ids.length) hkSave(ids.map(function (id) { return { room_id: id, condition: "dirty" }; }), true);
    });
  }

  /* ================= Calendar ================= */
  var CALS = { from: null, days: store("cal.days") || 14, type: "", q: "", closed: store("cal.closed") || {} };
  var OVR = { key: "", map: {} };
  VIEWS.calendar = {
    title: "Calendar",
    build: function (el) {
      CALS.from = CALS.from || addDays(TODAY, -1);
      el.innerHTML = '<div class="ph"><h1>Calendar</h1><span class="cnt" id="cl-sub"></span><span class="sp"></span><a class="btn ghost" href="/admin/">' + ic("tag") + 'Rates &amp; availability</a><a class="btn" href="#/reservations/new">' + ic("plus") + "New reservation</a></div>" +
        '<div class="card"><div class="cal-tb">' +
        '<button class="btn ghost sm up" type="button" id="cl-today">Today</button><button class="ib" type="button" id="cl-prev" aria-label="Back">' + ic("left") + '</button><button class="ib" type="button" id="cl-next" aria-label="Forward">' + ic("right") + "</button>" +
        '<input class="inp" type="date" id="cl-from" aria-label="Start date"><select class="sel" id="cl-days" aria-label="Days shown"><option value="7">7 days</option><option value="14">14 days</option><option value="21">21 days</option><option value="31">31 days</option></select>' +
        '<select class="sel" id="cl-type" aria-label="Room type"><option value="">All room types</option></select><span class="sp"></span>' +
        '<input class="inp" type="search" id="cl-q" placeholder="Highlight guest, code, bed…" style="width:200px"><button class="btn ghost sm" type="button" id="cl-exp" title="Expand all room types">Expand</button><button class="btn ghost sm" type="button" id="cl-col" title="Collapse all room types">Collapse</button></div>' +
        '<div class="cal" id="cl"><div class="cal-inner" id="cl-in"></div></div>' +
        '<div class="legend"><span><i class="b-confirmed"></i>Confirmed</span><span><i class="b-checked_in"></i>In-house</span><span><i class="b-checked_out"></i>Checked out</span><span><i class="b-pending"></i>Awaiting payment (hold)</span><span><i class="b-pending_payment"></i>Payment to verify</span><span><i class="b-block"></i>Blocked / out of service</span>' +
        '<span>◆ = booked on our website / desk (drag it onto a bed to assign) · Header: <b>free beds/rooms</b> and the lowest website price · Click an empty night to book it</span></div></div>';
      $("#cl-type").innerHTML += CAT.types.filter(function (t) { return t.active || totalUnits(t.slug); }).map(function (t) { return '<option value="' + esc(t.slug) + '">' + esc(t.name) + "</option>"; }).join("");
      $("#cl-days").value = String(CALS.days);
      var redo = function () { VIEWS.calendar.draw(el); };
      $("#cl-today").addEventListener("click", function () { CALS.from = addDays(TODAY, -1); redo(); });
      $("#cl-prev").addEventListener("click", function () { CALS.from = addDays(CALS.from, -Math.max(7, Math.floor(CALS.days / 2))); redo(); });
      $("#cl-next").addEventListener("click", function () { CALS.from = addDays(CALS.from, Math.max(7, Math.floor(CALS.days / 2))); redo(); });
      $("#cl-from").addEventListener("change", function () { if (this.value) { CALS.from = this.value; redo(); } });
      $("#cl-days").addEventListener("change", function () { CALS.days = +this.value; store("cal.days", CALS.days); redo(); });
      $("#cl-type").addEventListener("change", function () { CALS.type = this.value; redo(); });
      var t; $("#cl-q").addEventListener("input", function () { clearTimeout(t); var v = this.value; t = setTimeout(function () { CALS.q = v.trim().toLowerCase(); highlight(); }, 150); });
      $("#cl-exp").addEventListener("click", function () { CALS.closed = {}; store("cal.closed", CALS.closed); redo(); });
      $("#cl-col").addEventListener("click", function () { CAT.types.forEach(function (x) { CALS.closed[x.slug] = 1; }); store("cal.closed", CALS.closed); redo(); });
      calEvents($("#cl"));
      var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { if (ROUTE === "calendar") VIEWS.calendar.draw(el); }, 200); });
    },
    draw: function (el) {
      $("#cl-from", el).value = CALS.from;
      var from = CALS.from, days = CALS.days, to = addDays(from, days), dates = [];
      for (var i = 0; i < days; i++) dates.push(addDays(from, i));
      var key = from + "|" + days;
      if (OVR.key !== key) { OVR.key = key; sb.from("rate_overrides").select("rate_plan,night,price").gte("night", from).lt("night", to).then(function (r) { if (OVR.key !== key) return; OVR.map = {}; (r.data || []).forEach(function (o) { OVR.map[o.rate_plan + "|" + o.night] = +o.price; }); if (ROUTE === "calendar") drawGrid(dates, to); }); }
      drawGrid(dates, to);
    }
  };
  function cheapest(slug, d) {
    var best = null; CAT.plans.forEach(function (p) { if (p.room_type !== slug || !p.active) return; var v = OVR.map[p.id + "|" + d]; v = v == null ? +p.price : v; if (best == null || v < best) best = v; }); return best;
  }
  function packLanes(list) {
    var lanes = [];
    list.sort(function (a, b) { return a.a < b.a ? -1 : a.a > b.a ? 1 : 0; }).forEach(function (bar) {
      for (var i = 0; i < lanes.length; i++) { if (lanes[i].every(function (x) { return x.b <= bar.a || x.a >= bar.b; })) { lanes[i].push(bar); return; } }
      lanes.push([bar]);
    });
    return lanes;
  }
  function barHtml(bar, from, days) {
    var i0 = diffDays(from, bar.a), n = diffDays(bar.a, bar.b), s = i0 + (bar.block ? 0 : 0.5), e = s + n;
    var cl = s < 0, cr = e > days; s = Math.max(s, 0); e = Math.min(e, days);
    if (e <= s) return "";
    var r = bar.r, cls = "bar " + (bar.block ? "b-block" : "b-" + r.status) + (cl ? " cut-l" : "") + (cr ? " cut-r" : "");
    var style = "left:calc(var(--w) * " + s + " + 1px);width:calc(var(--w) * " + (e - s) + " - 3px)";
    if (bar.block) return '<div class="' + cls + '" style="' + style + '" title="' + esc((bar.block.reason || "Blocked") + " · " + fmtD(bar.block.start_date) + " – " + fmtD(bar.block.end_date) + " (set in Cloudbeds)") + '">' + esc(bar.block.reason || "Blocked") + "</div>";
    var tip = r.code + " · " + r.guest_name + "\n" + fmtDs(r.checkin) + " → " + fmtDs(r.checkout) + " · " + plural(r.nights, "night") + " · " + plural(r.guests || 1, "guest") + "\n" + STATUS_L[r.status] + " · " + sourceOf(r) + (r.cb_owned ? "" : " · " + peso(r.total) + (balance(r) > 0.5 ? " (bal " + peso(balance(r)) + ")" : ""));
    var hay = [r.code, r.guest_name, r.guest_email, r.guest_phone, r.ota_ref, roomsText(r)].join(" ").toLowerCase();
    return '<div class="' + cls + '" style="' + style + '" data-bk="' + r.id + '" data-from="' + esc(bar.room || "") + '" data-hay="' + esc(hay) + '"' + (r.cb_owned ? "" : ' draggable="true"') + ' title="' + esc(tip) + '">' + (r.cb_owned ? "" : "◆ ") + esc(r.guest_name) + "</div>";
  }
  function drawGrid(dates, to) {
    var from = dates[0], days = dates.length, inner = $("#cl-in");
    if (!inner) return;
    inner.style.setProperty("--days", days);
    var cal = $("#cl"), lw = parseFloat(getComputedStyle(cal).getPropertyValue("--lw")) || 190, base = window.innerWidth < 700 ? 46 : 58;
    cal.style.setProperty("--w", Math.max(base, Math.floor((cal.clientWidth - lw - 2) / days)) + "px");
    var total = totalUnits();
    var head = '<div class="cal-row cal-head"><div class="lbl">' + esc(fmtD(from)) + " – " + esc(fmtD(addDays(to, -1))) + '</div><div class="cells">' + dates.map(function (d) {
      var dt = parse(d), w = dt.getDay(), st = stats(d, 1)[0];
      return '<div class="c' + (w === 5 || w === 6 ? " we" : "") + (d === TODAY ? " td" : "") + '">' + dt.toLocaleDateString("en-PH", { weekday: "short" }) + "<b>" + dt.getDate() + "</b>" + dt.toLocaleDateString("en-PH", { month: "short" }) + '<span class="occ">' + Math.round(st.occ * 100) + "%</span></div>";
    }).join("") + "</div></div>";
    var inRange = ROWS.filter(function (r) { return OCC[r.status] && r.checkin < to && r.checkout > from; });
    var byRoom = {}, pool = {};
    inRange.forEach(function (r) {
      var matched = roomsOf(r).filter(function (n) { return ROOM_BY_NAME[n]; });
      matched.forEach(function (n) { (byRoom[n] = byRoom[n] || []).push({ r: r, a: r.checkin, b: r.checkout, room: n }); });
      var items = r.items && r.items.length ? r.items : [];
      items.forEach(function (it) {
        var need = (+it.units || 0) - matched.filter(function (n) { return ROOM_BY_NAME[n].room_type === it.room_type; }).length;
        for (var k = 0; k < need; k++) (pool[it.room_type] = pool[it.room_type] || []).push({ r: r, a: r.checkin, b: r.checkout });
      });
    });
    BLOCKS.forEach(function (b) {
      var a = b.start_date, e = addDays(b.end_date, 1); if (a >= to || e <= from) return;
      (b.rooms || []).forEach(function (id) { var rm = ROOM_BY_ID[id]; if (rm) (byRoom[rm.room_name] = byRoom[rm.room_name] || []).push({ block: b, a: a, b: e }); });
    });
    var cellsHtml = function (slug, room) { return dates.map(function (d) { var w = parse(d).getDay(); return '<div class="c' + (w === 5 || w === 6 ? " we" : "") + (d === TODAY ? " td" : "") + '" data-d="' + d + '" data-t="' + esc(slug) + '"' + (room ? ' data-room="' + esc(room) + '"' : "") + "></div>"; }).join(""); };
    var body = CAT.types.filter(function (t) { return (!CALS.type || CALS.type === t.slug) && (t.active || totalUnits(t.slug) || pool[t.slug]); }).map(function (t) {
      var rooms = ROOMS.filter(function (x) { return x.room_type === t.slug; }), n = totalUnits(t.slug), closed = CALS.closed[t.slug];
      var h = '<div class="cal-row cal-type' + (closed ? " closed" : "") + '"><div class="lbl" data-toggle="' + esc(t.slug) + '"><span class="car">▾</span><span>' + esc(t.name) + '</span><small class="muted" style="margin-left:auto">' + n + '</small></div><div class="cells">' + dates.map(function (d) {
        var free = n - blockedCount(d, t.slug) - unitsOn(d, t.slug), pr = cheapest(t.slug, d), w = parse(d).getDay();
        return '<div class="c' + (free <= 0 ? " full" : free <= Math.max(1, Math.round(n * .15)) ? " low" : "") + (w === 5 || w === 6 ? " we" : "") + (d === TODAY ? " td" : "") + '" data-d="' + d + '" data-t="' + esc(t.slug) + '" title="' + esc(t.name + " · " + fmtDs(d) + ": " + free + " free of " + n) + '"><b>' + free + "</b>" + (pr != null ? peso(pr) : "") + "</div>";
      }).join("") + "</div></div>";
      if (closed) return h;
      rooms.forEach(function (rm) {
        var c = HK[rm.room_id] ? HK[rm.room_id].condition : "clean";
        h += '<div class="cal-room cal-row" data-room="' + esc(rm.room_name) + '" data-t="' + esc(t.slug) + '"><div class="lbl"><i class="hk ' + c + '" title="' + esc(c) + '"></i><span>' + esc(rm.room_name) + '</span></div><div class="cells">' + cellsHtml(t.slug, rm.room_name) + (byRoom[rm.room_name] || []).map(function (b) { return barHtml(b, from, days); }).join("") + "</div></div>";
      });
      packLanes(pool[t.slug] || []).forEach(function (lane, i) {
        h += '<div class="cal-room cal-row un" data-t="' + esc(t.slug) + '"><div class="lbl" title="Bookings not yet on a bed/room. Drag them up onto one."><span>Unassigned' + (i ? " " + (i + 1) : "") + '</span></div><div class="cells">' + cellsHtml(t.slug, "") + lane.map(function (b) { return barHtml(b, from, days); }).join("") + "</div></div>";
      });
      return h;
    }).join("");
    inner.innerHTML = head + body;
    var sub = $("#cl-sub"); if (sub) sub.textContent = total + " beds/rooms · " + ROOMS.length + " from Cloudbeds";
    highlight();
  }
  function highlight() { var q = CALS.q; $$("#cl-in .bar[data-hay]").forEach(function (b) { b.classList.toggle("hl", !!q && b.getAttribute("data-hay").indexOf(q) > -1); }); }
  function occupant(name, a, b, exceptId) {
    var r = ROWS.filter(function (x) { return x.id !== exceptId && OCC[x.status] && x.checkin < b && x.checkout > a && roomsOf(x).indexOf(name) > -1; })[0];
    if (r) return r.guest_name + " (" + r.code + ")";
    var rm = ROOM_BY_NAME[name], bl = rm && BLOCKS.filter(function (x) { return x.start_date < b && addDays(x.end_date, 1) > a && (x.rooms || []).indexOf(rm.room_id) > -1; })[0];
    return bl ? "a block (" + (bl.reason || "blocked") + ")" : null;
  }
  function assignRooms(r, list) {
    return sb.rpc("staff_assign_rooms", { p_id: r.id, p_rooms: list.length ? list : null }).then(must).then(function () { toast(r.code + (list.length ? " → " + list.join(", ") : " unassigned")); return refresh(); });
  }
  function moveTo(r, fromName, toName, slug) {
    if (!canEdit(r)) { toast("Cloudbeds bookings are moved in Cloudbeds; they sync here.", true); return; }
    var cur = roomsOf(r).slice();
    if (cur.indexOf(toName) > -1) return;
    if (!(r.items || []).some(function (i) { return i.room_type === slug; })) { toast("That's a different room type. Change the booking's room type first (Edit reservation).", true); return; }
    var who = occupant(toName, r.checkin, r.checkout, r.id);
    if (who) { toast(toName + " is taken by " + who + " on some of these nights.", true); return; }
    if (fromName && cur.indexOf(fromName) > -1) cur[cur.indexOf(fromName)] = toName;
    else if (cur.length >= units(r)) { toast("All " + plural(units(r), "bed/room", "beds/rooms") + " of " + r.code + " are assigned. Drag one of its assigned bars instead.", true); return; }
    else cur.push(toName);
    assignRooms(r, cur).catch(fail);
  }
  function calEvents(cal) {
    cal.addEventListener("click", function (e) {
      var bar = e.target.closest(".bar[data-bk]"); if (bar) { openRes(bar.getAttribute("data-bk")); return; }
      var tg = e.target.closest("[data-toggle]"); if (tg) { var s = tg.getAttribute("data-toggle"); if (CALS.closed[s]) delete CALS.closed[s]; else CALS.closed[s] = 1; store("cal.closed", CALS.closed); VIEWS.calendar.draw($("#v-calendar")); return; }
      var c = e.target.closest(".c[data-d]"); if (!c) return;
      var d = c.getAttribute("data-d"), room = c.getAttribute("data-room");
      if (room && occupant(room, d, addDays(d, 1))) return;
      WZ_PREFILL = { checkin: d < TODAY ? TODAY : d, checkout: addDays(d < TODAY ? TODAY : d, 1), type: c.getAttribute("data-t"), room: room || null };
      go("#/reservations/new");
    });
    var dragId = null, dragFrom = null;
    cal.addEventListener("dragstart", function (e) {
      var bar = e.target.closest(".bar[draggable]"); if (!bar) return;
      dragId = bar.getAttribute("data-bk"); dragFrom = bar.getAttribute("data-from") || "";
      e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragId); } catch (x) {}
    });
    cal.addEventListener("dragover", function (e) {
      var row = e.target.closest(".cal-room[data-room]"); if (!row || !dragId) return;
      e.preventDefault(); $$(".cal-room.drop", cal).forEach(function (x) { if (x !== row) x.classList.remove("drop"); }); row.classList.add("drop");
    });
    cal.addEventListener("dragleave", function (e) { var row = e.target.closest(".cal-room"); if (row && !row.contains(e.relatedTarget)) row.classList.remove("drop"); });
    cal.addEventListener("drop", function (e) {
      var row = e.target.closest(".cal-room[data-room]"); $$(".cal-room.drop", cal).forEach(function (x) { x.classList.remove("drop"); });
      if (!row || !dragId) return; e.preventDefault();
      var r = byId(dragId); dragId = null; if (r) moveTo(r, dragFrom, row.getAttribute("data-room"), row.getAttribute("data-t"));
    });
    cal.addEventListener("dragend", function () { dragId = null; $$(".cal-room.drop", cal).forEach(function (x) { x.classList.remove("drop"); }); });
  }

  /* ================= Reservations list ================= */
  var RES = { tab: "upcoming", q: "", page: 0, per: store("res.per") || 25, sort: { f: "checkin", dir: 1 }, sel: {},
    f: { dates: {}, status: [], types: [], sources: [], pay: "", by: "", cb: true } };
  var RTABS = [
    ["upcoming", "Upcoming", function (r) { return ACTIVE[r.status] && r.checkout >= TODAY; }],
    ["arrivals", "Arrivals today", function (r) { return ACTIVE[r.status] && r.checkin === TODAY; }],
    ["inhouse", "In-house", function (r) { return r.status === "checked_in"; }],
    ["departures", "Departures today", function (r) { return (r.status === "confirmed" || r.status === "checked_in" || r.status === "checked_out") && r.checkout === TODAY; }],
    ["verify", "To verify", function (r) { return r.proofs_to_check > 0; }, true],
    ["holds", "Awaiting payment", function (r) { return r.status === "pending"; }, true],
    ["unpaid", "Balance due", function (r) { return ACTIVE[r.status] && !r.cb_owned && balance(r) > 0.5 && r.checkout >= TODAY; }],
    ["website", "Website", function (r) { return r.source === "website" && !r.cb_owned; }],
    ["closed", "Canceled / ended", function (r) { return r.status === "cancelled" || r.status === "expired" || r.status === "no_show"; }],
    ["all", "All", function () { return true; }]];
  var DATE_F = [["created", "Booking Date"], ["checkin", "Check In Date"], ["checkout", "Check Out Date"], ["stay", "Stay Date"]];
  VIEWS.reservations = {
    title: "Reservations",
    build: function (el) {
      el.innerHTML = '<div class="ph"><h1>Reservations</h1><span class="cnt" id="rs-cnt"></span><span class="sp"></span>' +
        '<button class="btn ghost" type="button" id="rs-csv">' + ic("down") + 'Export</button><button class="btn ghost" type="button" id="rs-print">' + ic("print") + 'Print</button><a class="btn" href="#/reservations/new">' + ic("plus") + "New reservation</a></div>" +
        '<div class="card"><div class="tabs flat" id="rs-tabs" role="tablist"></div>' +
        '<div class="chips" id="rs-chips"></div><div class="bulk" id="rs-bulk" hidden></div><div class="sumbar" id="rs-sum"></div>' +
        '<div class="tw"><table class="t" id="rs-t"><thead><tr><th style="width:30px"><input type="checkbox" id="rs-all" aria-label="Select all on this page"></th>' +
        '<th data-sort="code">Reservation</th><th data-sort="_first">Name</th><th data-sort="_last">Surname</th><th data-sort="created_at">Date Booked</th><th data-sort="_rooms">Room Number(s)</th><th data-sort="_type">Room Type</th>' +
        '<th data-sort="checkin">Check-In</th><th data-sort="checkout">Check-Out</th><th data-sort="nights" class="num">Nights</th><th data-sort="total" class="num">Total Price</th><th data-sort="_bal" class="num">Balance</th><th data-sort="status">Status</th><th data-sort="_src">Source</th></tr></thead><tbody id="rs-rows"></tbody></table></div>' +
        '<div class="tfoot"><span>View up to</span><select class="sel" id="rs-per"><option>10</option><option>25</option><option>50</option><option>100</option></select><span class="sp"></span><span id="rs-pg"></span><button class="ib" type="button" id="rs-prev" aria-label="Previous page">' + ic("left") + '</button><button class="ib" type="button" id="rs-next" aria-label="Next page">' + ic("right") + "</button></div></div>";
      $("#rs-per").value = String(RES.per);
      $("#rs-per").addEventListener("change", function () { RES.per = +this.value; RES.page = 0; store("res.per", RES.per); VIEWS.reservations.draw(el); });
      $("#rs-prev").addEventListener("click", function () { if (RES.page > 0) { RES.page--; VIEWS.reservations.draw(el); } });
      $("#rs-next").addEventListener("click", function () { RES.page++; VIEWS.reservations.draw(el); });
      $("#rs-csv").addEventListener("click", function () { exportCsv(resRows()); });
      $("#rs-print").addEventListener("click", function () { window.print(); });
      $$("#rs-t th[data-sort]").forEach(function (th) { th.addEventListener("click", function () { var f = th.getAttribute("data-sort"); RES.sort = { f: f, dir: RES.sort.f === f ? -RES.sort.dir : (f === "created_at" ? -1 : 1) }; VIEWS.reservations.draw(el); }); });
      $("#rs-all").addEventListener("change", function () { var on = this.checked; $$("#rs-rows input[data-sel]").forEach(function (c) { c.checked = on; if (on) RES.sel[c.getAttribute("data-sel")] = 1; else delete RES.sel[c.getAttribute("data-sel")]; }); bulkBar(); });
      $("#rs-rows").addEventListener("click", function (e) {
        var cb = e.target.closest("input[data-sel]");
        if (cb) { if (cb.checked) RES.sel[cb.getAttribute("data-sel")] = 1; else delete RES.sel[cb.getAttribute("data-sel")]; cb.closest("tr").classList.toggle("sel", cb.checked); bulkBar(); e.stopPropagation(); return; }
        if (e.target.closest("td:first-child")) return;
        var tr = e.target.closest("tr[data-open]"); if (tr) openRes(tr.getAttribute("data-open"));
      });
    },
    draw: function (el) {
      var base = resBase(), cnt = {};
      RTABS.forEach(function (t) { cnt[t[0]] = base.filter(t[2]).length; });
      $("#rs-tabs", el).innerHTML = RTABS.map(function (t) { return '<button type="button" role="tab" data-t="' + t[0] + '" aria-selected="' + (RES.tab === t[0]) + '"' + (t[3] && cnt[t[0]] ? ' class="hot"' : "") + ">" + t[1] + '<span class="n">' + cnt[t[0]] + "</span></button>"; }).join("");
      $$("#rs-tabs button", el).forEach(function (b) { b.addEventListener("click", function () { RES.tab = b.getAttribute("data-t"); RES.page = 0; RES.sort = RES.tab === "all" || RES.tab === "closed" || RES.tab === "website" ? { f: "created_at", dir: -1 } : { f: "checkin", dir: 1 }; VIEWS.reservations.draw(el); }); });
      drawChips();
      var rows = resRows(), n = rows.length, pages = Math.max(1, Math.ceil(n / RES.per));
      if (RES.page >= pages) RES.page = pages - 1;
      var page = rows.slice(RES.page * RES.per, RES.page * RES.per + RES.per);
      $("#rs-cnt", el).textContent = plural(n, "reservation");
      $$("#rs-t th[data-sort]", el).forEach(function (th) { th.classList.toggle("on", th.getAttribute("data-sort") === RES.sort.f); th.classList.toggle("asc", RES.sort.dir === 1); });
      var g = 0, tot = 0, paid = 0, nights = 0;
      rows.forEach(function (r) { if (OCC[r.status]) { g += +r.guests || 0; tot += +r.total || 0; paid += +r.amount_paid || 0; nights += (+r.nights || 0) * units(r); } });
      $("#rs-sum", el).innerHTML = "<span><b>" + g + "</b> guests</span><span><b>" + nights + "</b> room/bed-nights</span><span>Value <b>" + peso(tot) + "</b></span><span>Paid <b>" + peso(paid) + "</b></span><span>Balance <b>" + peso(Math.max(tot - paid, 0)) + '</b></span><span class="muted">Cloudbeds bookings show their Cloudbeds totals.</span>';
      $("#rs-rows", el).innerHTML = page.length ? page.map(resRow).join("") : '<tr class="empty"><td colspan="14">No reservations match. Try “All” or Reset Filters.</td></tr>';
      $("#rs-pg", el).textContent = n ? (RES.page * RES.per + 1) + "–" + Math.min(n, (RES.page + 1) * RES.per) + " of " + n : "0 of 0";
      $("#rs-prev", el).disabled = RES.page === 0; $("#rs-next", el).disabled = RES.page >= pages - 1;
      $("#rs-all", el).checked = page.length > 0 && page.every(function (r) { return RES.sel[r.id]; });
      bulkBar();
    }
  };
  function decorate(r) {
    var nm = splitName(r.guest_name);
    r._first = nm[0]; r._last = nm[1]; r._rooms = roomsText(r); r._type = typesText(r); r._bal = r.cb_owned ? 0 : balance(r); r._src = sourceOf(r);
    return r;
  }
  function resBase() {
    var f = RES.f, q = RES.q.toLowerCase();
    return ROWS.filter(function (r) {
      if (!f.cb && r.cb_owned) return false;
      for (var k in f.dates) {
        var x = f.dates[k]; if (!x || (!x.from && !x.to)) continue;
        var a = k === "created" ? manila(new Date(r.created_at)) : k === "checkout" ? r.checkout : r.checkin, b = k === "stay" ? addDays(r.checkout, -1) : a;
        if (x.from && b < x.from) return false; if (x.to && a > x.to) return false;
      }
      if (f.status.length && f.status.indexOf(r.status) === -1) return false;
      if (f.types.length && !(r.items || []).some(function (i) { return f.types.indexOf(i.room_type) > -1; })) return false;
      if (f.sources.length && f.sources.indexOf(sourceOf(r)) === -1) return false;
      if (f.pay && !(f.pay === r.payment_status || (!r.cb_owned && f.pay === r.pay_method))) return false;
      if (f.by && r.booked_by !== f.by) return false;
      if (q) { var hay = [r.code, r.guest_name, r.guest_email, r.guest_phone, r.ota_ref, r.cb_reservation_id, r.notes, r.staff_notes, roomsText(r)].join(" ").toLowerCase(); if (q.split(/\s+/).some(function (w) { return hay.indexOf(w) === -1; })) return false; }
      return true;
    });
  }
  function resRows() {
    var t = (RTABS.filter(function (x) { return x[0] === RES.tab; })[0] || RTABS[0])[2];
    var f = RES.sort.f, d = RES.sort.dir;
    return resBase().filter(t).map(decorate).sort(function (a, b) {
      var x = a[f], y = b[f];
      if (typeof x === "number" || typeof y === "number") { x = Number(x || 0); y = Number(y || 0); } else { x = String(x || "").toLowerCase(); y = String(y || "").toLowerCase(); }
      return x < y ? -d : x > y ? d : (a.created_at < b.created_at ? 1 : -1);
    });
  }
  function resRow(r) {
    return '<tr class="click' + (RES.sel[r.id] ? " sel" : "") + '" data-open="' + r.id + '"><td><input type="checkbox" data-sel="' + r.id + '"' + (RES.sel[r.id] ? " checked" : "") + ' aria-label="Select ' + esc(r.code) + '"></td>' +
      '<td class="nw"><span class="code">' + esc(r.code) + "</span>" + (r.cb_owned ? "" : ' <span class="tag z">Z</span>') + (r.ota_ref ? "<small>" + esc(r.ota_ref) + "</small>" : "") + "</td>" +
      "<td>" + esc(r._first) + "</td><td>" + esc(r._last) + '</td><td class="nw">' + esc(fmtD(manila(new Date(r.created_at)))) + "</td>" +
      "<td>" + (r._rooms ? esc(r._rooms) : '<span class="muted">—</span>') + "</td><td>" + esc(r._type) + "</td>" +
      '<td class="nw">' + esc(fmtD(r.checkin)) + '</td><td class="nw">' + esc(fmtD(r.checkout)) + '</td><td class="num">' + (r.nights || "") + "</td>" +
      '<td class="num">' + peso(r.total, true) + '</td><td class="num">' + (r.cb_owned ? '<span class="muted">—</span>' : r._bal > 0.5 ? '<b style="color:var(--err)">' + peso(r._bal, true) + "</b>" : peso(0, true)) + "</td>" +
      "<td>" + stTag(r.status) + (r.proofs_to_check > 0 ? ' <span class="tag s-pending_payment">Verify</span>' : "") + (r.status === "pending" && r.hold_until ? '<small class="hold" data-hold="' + esc(r.hold_until) + '">' + left(r.hold_until) + "</small>" : "") + "</td>" +
      "<td>" + esc(r._src) + "</td></tr>";
  }
  function bulkBar() {
    var ids = Object.keys(RES.sel).filter(function (id) { return byId(id); }), bar = $("#rs-bulk");
    if (!bar) return;
    bar.hidden = !ids.length;
    if (!ids.length) return;
    bar.innerHTML = "<b>" + ids.length + " selected</b><span>Bulk action:</span>" +
      '<button class="btn xs" type="button" data-b="checked_in">Check in</button><button class="btn xs ghost" type="button" data-b="checked_out">Check out</button><button class="btn xs ghost" type="button" data-b="confirmed">Confirm</button><button class="btn xs danger" type="button" data-b="cancelled">Cancel</button>' +
      '<button class="btn xs ghost" type="button" data-b="csv">Export selected</button><button class="btn xs link" type="button" data-b="clear">Clear selection</button><span class="muted small">Cloudbeds bookings are skipped (change them in Cloudbeds).</span>';
    $$("[data-b]", bar).forEach(function (b) {
      b.addEventListener("click", function () {
        var a = b.getAttribute("data-b"), rows = ids.map(byId).filter(Boolean);
        if (a === "clear") { RES.sel = {}; VIEWS.reservations.draw($("#v-reservations")); return; }
        if (a === "csv") { exportCsv(rows); return; }
        var ok = rows.filter(canEdit);
        if (!ok.length) { toast("Only Cloudbeds bookings selected; change those in Cloudbeds.", true); return; }
        if (!window.confirm("Set " + plural(ok.length, "reservation") + " to " + STATUS_L[a] + "?" + (a === "cancelled" ? " This releases their beds and emails guests who have emails on." : ""))) return;
        b.disabled = true;
        var done = 0, errs = [];
        ok.reduce(function (p, r) { return p.then(function () { return sb.rpc("staff_update_booking", { p_id: r.id, p: { status: a } }).then(function (res) { if (res.error) errs.push(r.code + ": " + res.error.message); else done++; }); }); }, Promise.resolve())
          .then(function () { RES.sel = {}; toast(done + " updated" + (errs.length ? " · " + errs.length + " failed: " + errs[0] : ""), !!errs.length); return refresh(); });
      });
    });
  }
  function drawChips() {
    var f = RES.f, box = $("#rs-chips"); if (!box) return;
    var dchip = DATE_F.map(function (d) { var x = f.dates[d[0]], on = x && (x.from || x.to); return '<button class="chip' + (on ? " on" : "") + '" type="button" data-c="date:' + d[0] + '">' + d[1] + (on ? ": " + esc((x.from ? fmtD(x.from) : "…") + " – " + (x.to ? fmtD(x.to) : "…")) : "") + " ▾</button>"; }).join("");
    var lab = function (arr, map) { return arr.length ? ": " + (arr.length > 2 ? arr.length + " selected" : arr.map(function (v) { return map ? map(v) : v; }).join(", ")) : ""; };
    box.innerHTML = '<input class="inp" type="search" id="rs-q" placeholder="Search name, code, email, phone, OTA ref, bed…" value="' + esc(RES.q) + '">' + dchip +
      '<button class="chip' + (f.status.length ? " on" : "") + '" type="button" data-c="status">Status' + esc(lab(f.status, function (v) { return STATUS_L[v]; })) + " ▾</button>" +
      '<button class="chip' + (f.types.length ? " on" : "") + '" type="button" data-c="types">Room Types' + esc(lab(f.types, typeName)) + " ▾</button>" +
      '<button class="chip' + (f.sources.length ? " on" : "") + '" type="button" data-c="sources">Source' + esc(lab(f.sources)) + " ▾</button>" +
      '<button class="chip' + (f.pay ? " on" : "") + '" type="button" data-c="pay">Payment' + (f.pay ? ": " + esc({ transfer: "Pay ahead", desk: "Pay at check-in", unpaid: "Unpaid", partial: "Part-paid", paid: "Paid" }[f.pay]) : "") + " ▾</button>" +
      '<button class="chip' + (f.by ? " on" : "") + '" type="button" data-c="by">Booked by' + (f.by ? ": " + esc(staffName(f.by)) : "") + " ▾</button>" +
      '<label class="chip' + (f.cb ? " on" : "") + '"><input type="checkbox" id="rs-cb"' + (f.cb ? " checked" : "") + ' style="accent-color:var(--pri)"> Cloudbeds / OTA</label>' +
      '<button class="btn link sm" type="button" id="rs-reset">Reset Filters</button>';
    var t; $("#rs-q").addEventListener("input", function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { RES.q = v.trim(); RES.page = 0; var pos = $("#rs-q").selectionStart; VIEWS.reservations.draw($("#v-reservations")); var i = $("#rs-q"); i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) {} }, 220); });
    $("#rs-cb").addEventListener("change", function () { f.cb = this.checked; RES.page = 0; VIEWS.reservations.draw($("#v-reservations")); });
    $("#rs-reset").addEventListener("click", function () { RES.f = { dates: {}, status: [], types: [], sources: [], pay: "", by: "", cb: true }; RES.q = ""; RES.page = 0; VIEWS.reservations.draw($("#v-reservations")); });
    $$("[data-c]", box).forEach(function (c) { c.addEventListener("click", function (e) { e.stopPropagation(); chipPop(c, c.getAttribute("data-c")); }); });
  }
  function chipPop(anchor, kind) {
    var f = RES.f, redraw = function () { RES.page = 0; closePop(); VIEWS.reservations.draw($("#v-reservations")); };
    var multi = function (key, opts) {
      var p = openPop(anchor, '<div class="chip-pop"><div class="opts">' + opts.map(function (o) { return '<label class="chk"><input type="checkbox" value="' + esc(o[0]) + '"' + (f[key].indexOf(o[0]) > -1 ? " checked" : "") + "> " + esc(o[1]) + "</label>"; }).join("") + '</div><div class="row"><button class="btn sm ghost" type="button" data-x>Clear</button><button class="btn sm" type="button" data-ok>Apply</button></div></div>');
      $("[data-x]", p).addEventListener("click", function () { f[key] = []; redraw(); });
      $("[data-ok]", p).addEventListener("click", function () { f[key] = $$("input:checked", p).map(function (i) { return i.value; }); redraw(); });
    };
    if (kind.indexOf("date:") === 0) {
      var k = kind.slice(5), x = f.dates[k] || {};
      var p = openPop(anchor, '<div class="chip-pop"><b>' + esc(DATE_F.filter(function (d) { return d[0] === k; })[0][1]) + '</b><div class="grid g2"><div class="fld"><label>From</label><input class="inp" type="date" data-f value="' + esc(x.from || "") + '"></div><div class="fld"><label>To</label><input class="inp" type="date" data-t value="' + esc(x.to || "") + '"></div></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn xs ghost" type="button" data-q="0">Today</button><button class="btn xs ghost" type="button" data-q="1">Tomorrow</button><button class="btn xs ghost" type="button" data-q="7">Next 7 days</button><button class="btn xs ghost" type="button" data-q="30">Next 30 days</button><button class="btn xs ghost" type="button" data-q="-7">Last 7 days</button></div>' +
        '<div class="row"><button class="btn sm ghost" type="button" data-x>Clear</button><button class="btn sm" type="button" data-ok>Apply</button></div></div>');
      $$("[data-q]", p).forEach(function (b) { b.addEventListener("click", function () { var n = +b.getAttribute("data-q"); var a = n < 0 ? addDays(TODAY, n) : n === 1 ? addDays(TODAY, 1) : TODAY, z = n <= 1 && n >= 0 ? a : n < 0 ? TODAY : addDays(TODAY, n); $("[data-f]", p).value = a; $("[data-t]", p).value = z; }); });
      $("[data-x]", p).addEventListener("click", function () { delete f.dates[k]; redraw(); });
      $("[data-ok]", p).addEventListener("click", function () { f.dates[k] = { from: $("[data-f]", p).value, to: $("[data-t]", p).value }; if (RES.tab !== "all") RES.tab = "all"; redraw(); });
    } else if (kind === "status") multi("status", STATUS);
    else if (kind === "types") multi("types", CAT.types.map(function (t) { return [t.slug, t.name]; }));
    else if (kind === "sources") { var s = {}; ROWS.forEach(function (r) { s[sourceOf(r)] = 1; }); multi("sources", Object.keys(s).filter(Boolean).sort().map(function (v) { return [v, v]; })); }
    else if (kind === "pay" || kind === "by") {
      var opts = kind === "pay" ? [["", "Any"], ["transfer", "Pay ahead (transfer)"], ["desk", "Pay at check-in"], ["unpaid", "Unpaid"], ["partial", "Part-paid"], ["paid", "Paid"]]
        : [["", "Anyone"]].concat(Object.keys(ROWS.reduce(function (a, r) { if (r.booked_by) a[r.booked_by] = 1; return a; }, {})).sort().map(function (e) { return [e, staffName(e)]; }));
      var p2 = openPop(anchor, '<div class="chip-pop"><div class="opts">' + opts.map(function (o) { return '<label class="chk"><input type="radio" name="cp" value="' + esc(o[0]) + '"' + (f[kind] === o[0] ? " checked" : "") + "> " + esc(o[1]) + "</label>"; }).join("") + "</div></div>");
      $$("input", p2).forEach(function (i) { i.addEventListener("change", function () { f[kind] = i.value; redraw(); }); });
    }
  }
  function exportCsv(rows) {
    if (!rows.length) { toast("Nothing to export.", true); return; }
    rows = rows.map(decorate);
    var cols = [["code", "Reservation"], ["_first", "Name"], ["_last", "Surname"], ["status", "Status"], ["guest_email", "Email"], ["guest_phone", "Mobile"], ["country", "Country"], ["_booked", "Date Booked"], ["checkin", "Check-In"], ["checkout", "Check-Out"], ["nights", "Nights"], ["guests", "Guests"],
      ["_rooms", "Room Number(s)"], ["_type", "Room Type"], ["subtotal", "Subtotal"], ["transfer_discount", "5% pay-ahead"], ["discount_amount", "Discount"], ["total", "Total Price"], ["amount_paid", "Paid"], ["_bal", "Balance"], ["pay_method", "Way of paying"], ["payment_status", "Payment"],
      ["_src", "Source"], ["_by", "Booked by"], ["ota_ref", "OTA ref"], ["notes", "Guest requests"], ["staff_notes", "Staff notes"]];
    var cell = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [cols.map(function (c) { return c[1]; }).join(",")].concat(rows.map(function (r) {
      var x = Object.assign({}, r, { _booked: fmtDT(r.created_at), _by: staffName(r.booked_by), status: STATUS_L[r.status] || r.status });
      return cols.map(function (c) { return cell(x[c[0]]); }).join(",");
    }));
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
    a.download = "z-reservations-" + TODAY + ".csv"; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ================= Reservation drawer ================= */
  var DR = { id: null, tab: "overview", full: store("dr.full") || false };
  var DTAB = [["overview", "Overview"], ["folio", "Folio"], ["notes", "Notes"], ["guest", "Guest"], ["rooms", "Accommodations"], ["emails", "Emails"], ["activity", "Activity"]];
  function openRes(id, tab) {
    var r = byId(id); if (!r) { toast("That reservation isn't loaded (older than 60 days?).", true); return; }
    DR.id = id; DR.tab = tab || "overview";
    $("#drawer").hidden = false; $("#dr-scrim").hidden = false; document.body.style.overflow = "hidden";
    drawDrawer(r);
  }
  function closeDrawer() { $("#drawer").hidden = true; $("#dr-scrim").hidden = true; document.body.style.overflow = ""; DR.id = null; }
  function drawDrawer(r, quiet) {
    var d = $("#drawer");
    if (quiet && (d.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) return;
    d.classList.toggle("full", !!DR.full);
    var ed = canEdit(r);
    var st = ed ? '<select class="sel s-' + esc(r.status) + '" id="dr-st" aria-label="Status">' + STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === r.status ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + "</select>" : stTag(r.status) + ' <span class="tag cb">Cloudbeds</span>';
    d.innerHTML = '<div class="dr-h"><span class="avatar lg">' + esc(initials(r.guest_name)) + '</span><div class="ttl"><b>' + esc(r.guest_name) + "</b><small>" + esc(r.code) + " · " + esc(sourceOf(r)) + " · booked " + esc(fmtDT(r.created_at)) + "</small></div>" + st +
      (ed ? '<a class="ib" href="#/reservations/edit/' + r.id + '" title="Edit reservation" aria-label="Edit reservation" id="dr-edit">' + ic("edit") + "</a>" : "") +
      '<button class="ib" type="button" id="dr-more" title="More" aria-label="More actions">' + ic("more") + "</button>" +
      '<button class="ib" type="button" id="dr-full" title="Expand" aria-label="Expand">' + ic("expand") + '</button><button class="ib" type="button" id="dr-x" title="Close" aria-label="Close">' + ic("x") + "</button></div>" +
      '<div class="tabs flat dr-tabs" role="tablist">' + DTAB.map(function (t) { return '<button type="button" role="tab" data-t="' + t[0] + '" aria-selected="' + (DR.tab === t[0]) + '"' + (t[0] === "folio" && r.proofs_to_check > 0 ? ' class="hot"' : "") + ">" + t[1] + (t[0] === "folio" && r.proofs_to_check > 0 ? ' <span class="n">' + r.proofs_to_check + "</span>" : "") + "</button>"; }).join("") + "</div>" +
      '<div class="dr-b" id="dr-b"></div>';
    $("#dr-x", d).addEventListener("click", closeDrawer);
    $("#dr-full", d).addEventListener("click", function () { DR.full = !DR.full; store("dr.full", DR.full); d.classList.toggle("full", DR.full); });
    var e = $("#dr-edit", d); if (e) e.addEventListener("click", closeDrawer);
    $$(".dr-tabs button", d).forEach(function (b) { b.addEventListener("click", function () { DR.tab = b.getAttribute("data-t"); drawDrawer(byId(DR.id)); }); });
    var sel = $("#dr-st", d);
    if (sel) sel.addEventListener("change", function () {
      var v = sel.value;
      if ((v === "cancelled" || v === "no_show") && !window.confirm("Set " + r.code + " (" + r.guest_name + ") to " + STATUS_L[v] + "? This releases the beds.")) { sel.value = r.status; return; }
      if (v === "checked_in") { sel.value = r.status; checkIn(r); return; }
      if (v === "checked_out") { sel.value = r.status; checkOut(r); return; }
      setStatus(r, v, sel);
    });
    $("#dr-more", d).addEventListener("click", function (ev) {
      ev.stopPropagation();
      var h = "";
      if (ed && (r.status === "confirmed" || r.status === "pending_payment")) h += '<button class="mi" type="button" data-m="in">' + ic("door") + "Check in</button>";
      if (ed && r.status === "checked_in") h += '<button class="mi" type="button" data-m="out">' + ic("out") + "Check out</button>";
      if (ed && r.guest_email) h += '<button class="mi" type="button" data-m="mail">' + ic("mail") + "Resend " + (r.status === "pending" ? "payment instructions" : "confirmation") + " email</button>";
      if (ed) h += '<button class="mi" type="button" data-m="pay">' + ic("cash") + "Add payment</button>";
      h += '<button class="mi" type="button" data-m="print">' + ic("print") + "Print reservation</button>";
      if (r.cb_owned) h += '<a class="mi" href="https://hotels.cloudbeds.com/connect/6309#/reservations/' + esc(r.cb_reservation_id || "") + '" target="_blank" rel="noopener">' + ic("cloud") + "Open in Cloudbeds</a>";
      if (ed && ACTIVE[r.status]) h += '<hr><button class="mi danger" type="button" data-m="no_show">No-show</button><button class="mi danger" type="button" data-m="cancelled">Cancel reservation</button>';
      var p = openPop($("#dr-more"), h, "", true);
      $$("[data-m]", p).forEach(function (b) {
        b.addEventListener("click", function () {
          var m = b.getAttribute("data-m"); closePop();
          if (m === "in") checkIn(r); else if (m === "out") checkOut(r);
          else if (m === "mail") resend(r);
          else if (m === "pay") { DR.tab = "folio"; drawDrawer(r); setTimeout(function () { var a = $("#fo-amt"); if (a) a.focus(); }, 50); }
          else if (m === "print") printRes(r);
          else if (window.confirm("Set " + r.code + " to " + STATUS_L[m] + "? This releases the beds.")) setStatus(r, m);
        });
      });
    });
    var b = $("#dr-b", d);
    ({ overview: drOverview, folio: drFolio, notes: drNotes, guest: drGuest, rooms: drRooms, emails: drEmails, activity: drActivity })[DR.tab](r, b);
  }
  function resend(r) { sb.rpc("staff_send_email", { p_id: r.id, p_kind: r.status === "pending" ? "RESEND_BOOKING" : "RESEND_CONFIRMED" }).then(must).then(function () { toast("Email on its way to " + r.guest_email); }).catch(fail); }
  function printRes(r) {
    var w = window.open("", "_blank"); if (!w) return;
    w.document.write("<title>" + esc(r.code) + "</title><style>body{font:14px system-ui;padding:24px}td{padding:4px 12px 4px 0;vertical-align:top}h1{font-size:20px}</style><h1>Z Hostel · " + esc(r.code) + "</h1><table>" +
      [["Guest", r.guest_name], ["Email", r.guest_email], ["Mobile", r.guest_phone], ["Stay", fmtDs(r.checkin) + " → " + fmtDs(r.checkout) + " (" + plural(r.nights, "night") + ")"], ["Guests", r.guests], ["Beds / rooms", typesText(r) + (roomsText(r) ? " · " + roomsText(r) : "")],
        ["Status", STATUS_L[r.status]], ["Total", peso(r.total, true)], ["Paid", peso(r.amount_paid, true)], ["Balance", peso(balance(r), true)], ["Source", sourceOf(r)], ["Requests", r.notes || "—"]].map(function (x) { return "<tr><td><b>" + esc(x[0]) + "</b></td><td>" + esc(x[1] == null ? "" : x[1]) + "</td></tr>"; }).join("") + "</table><script>print()<\/script>");
    w.document.close();
  }
  function drOverview(r, b) {
    var ed = canEdit(r), bal = balance(r), done = function (s) { return s.indexOf(r.status) > -1 ? " done" : ""; };
    var h = "";
    if (r.status === "pending") h += '<div class="alert warn"><span><b>Awaiting payment.</b> The beds are held until ' + esc(fmtDT(r.hold_until)) + ' (<span class="hold" data-hold="' + esc(r.hold_until) + '">' + left(r.hold_until) + "</span>). If no payment is uploaded or recorded by then, the hold ends and the beds go back on sale.</span>" + (ed ? '<button class="btn sm" type="button" data-go="folio">Record payment</button>' : "") + "</div><br>";
    if (r.proofs_to_check > 0) h += '<div class="alert hot"><span><b>' + plural(+r.proofs_to_check, "payment upload") + " to verify</b> (" + peso(r.amount_pending) + ").</span><button class=\"btn sm\" type=\"button\" data-go=\"folio\">Verify in Folio</button></div><br>";
    if (r.cb_owned) h += '<div class="alert"><span>This reservation lives in <b>Cloudbeds</b> (it syncs here every few minutes). Change it, take payments and check guests in there.</span><a class="btn sm ghost" href="https://hotels.cloudbeds.com/connect/6309" target="_blank" rel="noopener">Open Cloudbeds</a></div><br>';
    h += '<div class="card"><div class="tl"><div class="done"><b>Booked</b>' + esc(fmtD(manila(new Date(r.created_at)))) + '</div><div class="' + done(["checked_in", "checked_out"]) + '"><b>Check-in</b>' + esc(fmtDs(r.checkin)) + (r.arrival_time ? "<br><small>ETA " + esc(r.arrival_time) + "</small>" : "") + '</div><div class="' + done(["checked_out"]) + '"><b>Check-out</b>' + esc(fmtDs(r.checkout)) + "</div></div>" +
      (ed && (r.status === "confirmed" || r.status === "pending_payment" || r.status === "checked_in") ? '<div style="display:flex;justify-content:center;gap:8px;padding:0 16px 16px">' + (r.status !== "checked_in" ? '<button class="btn" type="button" data-a="in">' + ic("door") + "Check-in</button>" : '<button class="btn ghost" type="button" data-a="out">' + ic("out") + "Check-out</button>") + "</div>" : "") + "</div>";
    h += '<div class="card"><div class="bal"><div><small>Grand total</small><b>' + peso(r.total, true) + '</b></div><div><small>Paid</small><b>' + peso(r.amount_paid, true) + '</b></div><div><small>To verify</small><b>' + peso(r.amount_pending, true) + '</b></div><div class="' + (r.cb_owned ? "" : bal > 0.5 ? "due" : "zero") + '"><small>Balance due</small><b>' + (r.cb_owned ? "—" : peso(bal, true)) + "</b></div></div>" +
      (ed ? '<div style="padding:0 16px 14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" type="button" data-go="folio">' + ic("plus") + "Add payment</button>" + '<span class="muted small" style="align-self:center">' + esc(PAYM[r.pay_method] || "") + (+r.transfer_discount > 0 ? " · 5% pay-ahead discount applied" : "") + "</span></div>" : "") + "</div>";
    h += '<div class="grid g2"><div class="card"><div class="card-h"><h2>Reservation</h2></div><div class="card-b"><dl class="kv">' +
      [["Source", esc(sourceOf(r)) + (r.ota_ref ? "<br><small>OTA ref " + esc(r.ota_ref) + "</small>" : "") + (r.cb_reservation_id ? "<br><small>Cloudbeds #" + esc(r.cb_reservation_id) + "</small>" : "")],
        ["Stay", plural(r.nights, "night") + " · " + plural(r.guests || 1, "guest")], ["Booked by", esc(staffName(r.booked_by))], ["Payment", payTag(r) + (r.cb_owned ? "" : " " + esc(PAYM[r.pay_method] || ""))],
        ["Guest emails", r.cb_owned ? "Cloudbeds sends its own" : r.email_guest ? "On" : "Off"], ["Sent to Cloudbeds", r.cb_owned ? "—" : esc(r.cb_reservation_id ? "Yes (#" + r.cb_reservation_id + ")" : r.cb_push_state === "error" ? "Failed, will retry" : "Not yet")]].map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("") + "</dl></div></div>" +
      '<div class="card"><div class="card-h"><h2>Guest</h2><span class="sp"></span>' + (ed ? '<button class="btn link sm" type="button" data-go="guest">Edit</button>' : "") + '</div><div class="card-b"><dl class="kv">' +
      [["Mobile", r.guest_phone ? '<a href="tel:' + esc(r.guest_phone) + '">' + esc(r.guest_phone) + "</a>" : "—"], ["Email", r.guest_email ? '<a href="mailto:' + esc(r.guest_email) + '">' + esc(r.guest_email) + "</a>" : "—"], ["Country", esc(r.country || "—")], ["Arrival time", esc(r.arrival_time || "—")]].map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("") + "</dl></div></div></div>";
    h += '<div class="card"><div class="card-h"><h2>Special instructions</h2><span class="sp"></span><button class="btn link sm" type="button" data-go="notes">Edit notes</button></div><div class="card-b"><p style="margin:0 0 8px"><b>Guest requests:</b> ' + esc(r.notes || "—") + '</p><p style="margin:0"><b>Staff notes:</b> ' + esc(r.staff_notes || "—") + "</p></div></div>";
    h += '<div class="card"><div class="card-h"><h2>Accommodations</h2><span class="sp"></span><button class="btn link sm" type="button" data-go="rooms">' + (ed ? "Assign beds / rooms" : "Details") + "</button></div>" + accList(r) + "</div>";
    b.innerHTML = h;
    $$("[data-go]", b).forEach(function (x) { x.addEventListener("click", function () { DR.tab = x.getAttribute("data-go"); drawDrawer(r); }); });
    $$("[data-a]", b).forEach(function (x) { x.addEventListener("click", function () { if (x.getAttribute("data-a") === "in") checkIn(r, x); else checkOut(r, x); }); });
  }
  function accList(r) {
    var rooms = roomsOf(r).slice();
    return (r.items || []).map(function (i) {
      var t = typeBy(i.room_type), p = planBy(i.rate_plan), mine = [];
      rooms = rooms.filter(function (n) { var rm = ROOM_BY_NAME[n]; if (mine.length < i.units && (!rm || rm.room_type === i.room_type)) { mine.push(n); return false; } return true; });
      return '<div class="acc"><span class="ico">' + ic("bed") + '</span><div class="mid"><b>' + (i.units > 1 ? i.units + "× " : "") + esc(t ? t.name : i.room_type) + "</b><small>" + esc(p ? p.name : r.cb_owned ? "Cloudbeds rate" : "") + " · " + esc(fmtDs(r.checkin)) + " → " + esc(fmtDs(r.checkout)) + "</small><div>" +
        (mine.length ? mine.map(function (n) { var c = hkOfName(n); return '<span class="tag" style="margin:4px 4px 0 0">' + esc(n) + "</span>" + (c && c !== "clean" ? '<span class="tag c-' + c + '" style="margin:4px 6px 0 0">' + c + "</span>" : ""); }).join("") : '<span class="muted small">No bed/room assigned yet</span>') + "</div></div>" +
        '<div class="num"><b>' + (i.amount != null ? peso(i.amount, true) : "") + "</b></div></div>";
    }).join("") || '<div class="acc"><span class="muted">No items.</span></div>';
  }
  function folioLines(r) {
    var lines = [], n = r.nights || diffDays(r.checkin, r.checkout) || 1;
    (r.items || []).forEach(function (i) {
      if (i.amount == null) return;
      var per = Math.round(+i.amount / n * 100) / 100, acc = 0, t = typeName(i.room_type), p = planBy(i.rate_plan);
      for (var k = 0; k < n; k++) { var amt = k === n - 1 ? Math.round((+i.amount - acc) * 100) / 100 : per; acc += amt; lines.push({ d: addDays(r.checkin, k), desc: "Room rate · " + (i.units > 1 ? i.units + "× " : "") + t + (p ? " (" + p.name + ")" : ""), amt: amt, cls: "" }); }
    });
    (r.addons || []).forEach(function (a) { lines.push({ d: r.checkin, desc: (a.qty > 1 ? a.qty + "× " : "") + a.name, amt: a.amount, cls: "" }); });
    if (+r.transfer_discount > 0) lines.push({ d: manila(new Date(r.created_at)), desc: "5% off · paid ahead by transfer", amt: -r.transfer_discount, cls: "disc" });
    if (+r.discount_amount > 0) lines.push({ d: manila(new Date(r.created_at)), desc: r.discount_reason || "Discount", amt: -r.discount_amount, cls: "disc" });
    return lines;
  }
  function drFolio(r, b) {
    var lines = folioLines(r), bal = balance(r), vat = +r.total * VAT / (1 + VAT), ed = canEdit(r);
    var grp = {}; lines.forEach(function (l) { (grp[l.d] = grp[l.d] || []).push(l); });
    var h = '<div class="card folio"><div class="card-h"><h2>Folio</h2><span class="sp"></span><small class="muted">Prices include 12% VAT</small></div><div class="tw"><table class="t"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th></tr></thead><tbody>' +
      (lines.length ? Object.keys(grp).sort().map(function (d) { return '<tr class="grp"><td colspan="3">' + esc(fmtDs(d)) + "</td></tr>" + grp[d].map(function (l) { return '<tr class="' + l.cls + '"><td></td><td>' + esc(l.desc) + '</td><td class="amt">' + (l.amt == null ? "at the desk" : peso(l.amt, true)) + "</td></tr>"; }).join(""); }).join("") : '<tr class="empty"><td colspan="3">' + (r.cb_owned ? "The folio for this reservation is kept in Cloudbeds." : "No charges.") + "</td></tr>") +
      '</tbody><tbody id="fo-pays"></tbody></table></div><div class="folio-sum"><div><span>Subtotal</span><span>' + peso(r.subtotal != null ? r.subtotal : r.total, true) + "</span></div>" +
      (+r.transfer_discount + +r.discount_amount > 0 ? "<div><span>Discounts</span><span>−" + peso(+r.transfer_discount + +r.discount_amount, true) + "</span></div>" : "") +
      '<div class="gt"><span>Grand total</span><span>' + peso(r.total, true) + '</span></div><div class="muted"><span>of which VAT (12%)</span><span>' + peso(vat, true) + "</span></div><div><span>Paid</span><span>" + peso(r.amount_paid, true) + "</span></div>" +
      (+r.amount_pending > 0 ? '<div style="color:var(--vio)"><span>Uploaded, to verify</span><span>' + peso(r.amount_pending, true) + "</span></div>" : "") +
      '<div class="' + (bal > 0.5 ? "due" : "") + '"><span>Balance due</span><span>' + (r.cb_owned ? "see Cloudbeds" : peso(bal, true)) + "</span></div></div></div>";
    if (ed) h += '<div class="card"><div class="card-h"><h2>Payments</h2><span class="sp"></span><small class="muted">Verify each upload against the bank / e-wallet. The first verified payment confirms the booking and emails the guest.</small></div><div id="fo-list"><p class="muted small" style="padding:0 16px">Loading…</p></div></div>' +
      '<div class="card"><div class="card-h"><h2>+ Add payment</h2><span class="sp"></span><small class="muted">Cash or card at the desk, or a transfer you saw in the bank. Counts as verified.</small></div><form class="card-b grid g4" id="fo-form" novalidate>' +
      '<div class="fld"><label for="fo-amt">Amount (₱)</label><input class="inp" id="fo-amt" type="number" min="1" step="0.01" value="' + (Math.max(bal - +r.amount_pending, 0) || "") + '"></div>' +
      '<div class="fld"><label for="fo-m">Method</label><select class="sel" id="fo-m"><option value="cash">Cash</option><option value="card">Card</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="transfer">Bank transfer</option><option value="other">Other</option></select></div>' +
      '<div class="fld"><label for="fo-note">Note</label><input class="inp" id="fo-note" type="text" maxlength="200" placeholder="OR no., reference…"></div>' +
      '<div class="fld"><label for="fo-file">Proof (optional)</label><input id="fo-file" type="file" accept="image/*,application/pdf"></div>' +
      '<div style="grid-column:1/-1;display:flex;gap:10px;align-items:center;justify-content:flex-end"><p class="msg" id="fo-msg" role="alert"></p><button class="btn" type="submit">Record payment</button></div></form></div>';
    b.innerHTML = h;
    if (!ed) return;
    $("#fo-form", b).addEventListener("submit", function (e) {
      e.preventDefault();
      var amt = +$("#fo-amt").value, m = $("#fo-msg"), f = $("#fo-file").files[0], btn = $("#fo-form button[type=submit]");
      if (!amt || amt <= 0) { m.className = "msg err"; m.textContent = "Enter the amount received."; return; }
      btn.disabled = true; m.className = "msg"; m.textContent = "Saving…";
      var up = f ? sb.storage.from("payment-proofs").upload(r.code + "/staff-" + Date.now() + "." + (f.name.split(".").pop() || "jpg").toLowerCase(), f, { contentType: f.type }).then(function (x) { if (x.error) throw x.error; return x.data.path; }) : Promise.resolve(null);
      up.then(function (path) { return sb.rpc("staff_record_payment", { p_booking_id: r.id, p_amount: amt, p_method: $("#fo-m").value, p_note: $("#fo-note").value || null, p_proof_path: path }); })
        .then(must).then(function () { toast("Payment recorded · " + r.code); DR.tab = "folio"; return refresh(); })
        .catch(function (err) { btn.disabled = false; m.className = "msg err"; m.textContent = err.message; });
    });
    loadPayments(r, $("#fo-list", b), $("#fo-pays", b));
  }
  function loadPayments(r, box, folioBody) {
    sb.from("booking_payments").select("*").eq("booking_id", r.id).order("created_at").then(function (res) {
      var list = must(res) || [];
      if (folioBody) folioBody.innerHTML = list.filter(function (p) { return p.status !== "rejected"; }).map(function (p) { return '<tr class="pay"><td class="nw">' + esc(fmtDs(manila(new Date(p.created_at)))) + "</td><td>Payment · " + esc(METHOD[p.method] || p.method) + (p.status === "pending" ? " <i>(uploaded, to verify)</i>" : "") + '</td><td class="amt">−' + peso(p.amount, true) + "</td></tr>"; }).join("");
      if (!list.length) { box.innerHTML = '<p class="muted small" style="padding:0 16px 14px;margin:0">No payments yet.</p>'; return; }
      box.innerHTML = list.map(function (p) { return proofRow(p, r); }).join("");
      wireProofs(box, function () { return refresh(); });
    }).catch(fail);
  }
  function proofRow(p, r) {
    return '<div class="proof" data-pid="' + p.id + '" data-code="' + esc(r ? r.code : "") + '">' + (p.proof_path ? '<span class="noimg" data-proof="' + esc(p.proof_path) + '">Loading…</span>' : '<span class="noimg">No proof</span>') +
      "<div>" + (r && r._showName ? '<b class="code">' + esc(r.code) + "</b> · <b>" + esc(r.guest_name) + "</b><br>" : "") + "<b>" + peso(p.amount, true) + "</b> · " + esc(METHOD[p.method] || p.method) + ' · <span class="tag ' + (p.status === "verified" ? "p-paid" : p.status === "rejected" ? "s-cancelled" : "s-pending_payment") + '">' + esc(p.status) + "</span>" +
      '<small class="muted" style="display:block">' + esc(fmtDT(p.created_at)) + " · " + esc(p.created_by ? "recorded by " + staffName(p.created_by) : "uploaded by the guest") + (p.verified_by ? " · " + esc(p.status) + " by " + esc(staffName(p.verified_by)) : "") + "</small>" + (p.note ? '<small style="display:block">' + esc(p.note) + "</small>" : "") + "</div>" +
      (p.status === "pending" ? '<div class="pa"><input class="inp" type="number" step="0.01" min="0" value="' + Number(p.amount) + '" aria-label="Amount received"><input class="inp" type="text" placeholder="Note (optional)" aria-label="Note"><div><button class="btn sm ok" type="button" data-v="ok">Verify</button><button class="btn sm danger" type="button" data-v="no">Reject</button></div></div>' : "<span></span>") + "</div>";
  }
  function wireProofs(box, after) {
    $$("[data-proof]", box).forEach(function (el) {
      var path = el.getAttribute("data-proof");
      sb.storage.from("payment-proofs").createSignedUrl(path, 900).then(function (s) {
        if (s.error || !s.data) { el.textContent = "Can't load"; return; }
        var url = s.data.signedUrl;
        if (/\.pdf$/i.test(path)) { el.outerHTML = '<a class="noimg" href="' + esc(url) + '" target="_blank" rel="noopener">PDF ↗</a>'; return; }
        var img = document.createElement("img"); img.src = url; img.alt = "Payment proof"; img.addEventListener("click", function () { lightbox(url); }); el.replaceWith(img);
      });
    });
    $$("[data-v]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        var row = b.closest(".proof"), ins = $$("input", row), rej = b.getAttribute("data-v") === "no";
        if (rej && !window.confirm("Reject this payment? The guest is emailed and gets a fresh 2-hour hold to re-upload.")) return;
        $$("button", row).forEach(function (x) { x.disabled = true; });
        sb.rpc("staff_verify_payment", { p_payment_id: row.getAttribute("data-pid"), p_amount: rej ? null : +ins[0].value || null, p_reject: rej, p_note: ins[1].value || null }).then(must).then(function () {
          toast(rej ? "Payment rejected · guest emailed" : "Payment verified · " + row.getAttribute("data-code"));
          return after();
        }).catch(function (e) { $$("button", row).forEach(function (x) { x.disabled = false; }); fail(e); });
      });
    });
  }
  function drNotes(r, b) {
    var ed = canEdit(r);
    b.innerHTML = '<div class="card"><div class="card-b grid"><div class="fld"><label for="nt-g">Guest requests' + (ed ? "" : " · from Cloudbeds") + '</label><textarea class="inp" id="nt-g" maxlength="2000"' + (ed ? "" : " readonly") + ">" + esc(r.notes || "") + '</textarea></div><div class="fld"><label for="nt-s">Staff notes · internal, never shown to the guest</label><textarea class="inp" id="nt-s" maxlength="2000" style="min-height:140px">' + esc(r.staff_notes || "") + '</textarea></div><div style="display:flex;justify-content:flex-end;gap:8px"><p class="msg" id="nt-msg"></p><button class="btn" type="button" id="nt-save">Save notes</button></div></div></div>';
    $("#nt-save", b).addEventListener("click", function () {
      var btn = this, g = $("#nt-g").value.trim(), s = $("#nt-s").value.trim(); btn.disabled = true;
      var pr = ed ? sb.rpc("staff_update_booking", { p_id: r.id, p: { notes: g, staff_notes: s } }) : sb.from("bookings").update({ staff_notes: s || null }).eq("id", r.id);
      pr.then(must).then(function () { toast("Notes saved · " + r.code); return refresh(); }).catch(function (e) { btn.disabled = false; fail(e); });
    });
  }
  function drGuest(r, b) {
    var ed = canEdit(r), nm = splitName(r.guest_name), ro = ed ? "" : " readonly";
    b.innerHTML = '<div class="card"><div class="card-h"><h2>Guest details</h2></div><div class="card-b grid g2">' +
      '<div class="fld"><label for="gu-f">First name</label><input class="inp" id="gu-f" value="' + esc(nm[0]) + '"' + ro + '></div><div class="fld"><label for="gu-l">Last name</label><input class="inp" id="gu-l" value="' + esc(nm[1]) + '"' + ro + "></div>" +
      '<div class="fld"><label for="gu-e">Email</label><input class="inp" id="gu-e" type="email" value="' + esc(r.guest_email || "") + '"' + ro + '></div><div class="fld"><label for="gu-p">Mobile</label><input class="inp" id="gu-p" type="tel" value="' + esc(r.guest_phone || "") + '"' + ro + "></div>" +
      '<div class="fld"><label for="gu-c">Country</label><input class="inp" id="gu-c" list="countries" value="' + esc(r.country || "") + '"' + ro + '></div><div class="fld"><label for="gu-a">Estimated arrival time</label><input class="inp" id="gu-a" value="' + esc(r.arrival_time || "") + '"' + ro + "></div>" +
      (ed ? '<label class="chk span2"><input type="checkbox" id="gu-n"> Email the guest a summary of the changes</label><div class="span2" style="display:flex;justify-content:flex-end;gap:8px"><p class="msg" id="gu-msg"></p><button class="btn" type="button" id="gu-save">Save guest</button></div>' : '<p class="muted small span2">Edit Cloudbeds guests in Cloudbeds.</p>') + "</div></div>" +
      '<div class="card"><div class="card-h"><h2>Stays with us</h2></div><div id="gu-hist" class="card-b"><span class="muted small">Looking up…</span></div></div>';
    if (ed) $("#gu-save", b).addEventListener("click", function () {
      var btn = this, name = ($("#gu-f").value.trim() + " " + $("#gu-l").value.trim()).trim(), email = $("#gu-e").value.trim();
      if (!name) { $("#gu-msg").className = "msg err"; $("#gu-msg").textContent = "Enter the guest's name."; return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { $("#gu-msg").className = "msg err"; $("#gu-msg").textContent = "That email doesn't look right."; return; }
      btn.disabled = true;
      sb.rpc("staff_update_booking", { p_id: r.id, p: { guest_name: name, guest_email: email, guest_phone: $("#gu-p").value.trim(), country: $("#gu-c").value.trim(), arrival_time: $("#gu-a").value.trim(), notify: $("#gu-n").checked } })
        .then(must).then(function () { toast("Guest saved · " + r.code); return refresh(); }).catch(function (e) { btn.disabled = false; fail(e); });
    });
    var others = ROWS.filter(function (x) { return x.id !== r.id && ((r.guest_email && x.guest_email && x.guest_email.toLowerCase() === r.guest_email.toLowerCase()) || (r.guest_phone && x.guest_phone && x.guest_phone.replace(/\D/g, "").slice(-9) === r.guest_phone.replace(/\D/g, "").slice(-9) && r.guest_phone.replace(/\D/g, "").length >= 9)); });
    var hist = function (past) {
      var h = (others.length ? "<b>Recent / upcoming</b>" + others.map(function (x) { return '<div style="padding:6px 0;border-bottom:1px solid var(--line)"><a href="#" data-o="' + x.id + '">' + esc(x.code) + "</a> · " + esc(fmtD(x.checkin)) + " → " + esc(fmtD(x.checkout)) + " · " + stTag(x.status) + "</div>"; }).join("") : "");
      h += past && past.length ? '<p style="margin:12px 0 4px"><b>' + plural(past.length, "earlier stay") + "</b> in the Cloudbeds history</p>" + past.slice(0, 6).map(function (x) { return '<div class="small" style="padding:4px 0">' + esc(fmtD(x.checkin)) + " → " + esc(fmtD(x.checkout)) + " · " + esc(x.source || "") + " · " + esc(x.status || "") + (x.total ? " · " + peso(x.total) : "") + "</div>"; }).join("") : "";
      $("#gu-hist").innerHTML = h || '<span class="muted small">First stay with us (no earlier bookings under this email or mobile).</span>';
      $$("[data-o]", $("#gu-hist")).forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); openRes(a.getAttribute("data-o")); }); });
    };
    if (r.guest_email) sb.from("cb_history").select("checkin,checkout,status,source,total").eq("guest_email", r.guest_email).lt("checkin", r.checkin).order("checkin", { ascending: false }).limit(50).then(function (x) { hist(x.data || []); });
    else hist([]);
  }
  function freeRooms(slug, a, b, exceptId) { return ROOMS.filter(function (rm) { return rm.room_type === slug && !occupant(rm.room_name, a, b, exceptId); }); }
  function drRooms(r, b) {
    var ed = canEdit(r), cur = roomsOf(r).slice(), slots = [];
    (r.items || []).forEach(function (i) { for (var k = 0; k < (+i.units || 0); k++) slots.push(i.room_type); });
    var used = {}, pre = slots.map(function (slug) { var n = cur.filter(function (x) { return !used[x] && (!ROOM_BY_NAME[x] || ROOM_BY_NAME[x].room_type === slug); })[0]; if (n) used[n] = 1; return n || ""; });
    if (!ed) {
      b.innerHTML = '<div class="card"><div class="card-h"><h2>Accommodations</h2><span class="sp"></span><small class="muted">Assigned in Cloudbeds</small></div>' + accList(r) + "</div>";
      return;
    }
    if (!ROOMS.length) { b.innerHTML = '<div class="card">' + accList(r) + '<div class="card-b muted small">The bed/room list comes from Cloudbeds and hasn\'t synced yet.</div></div>'; return; }
    b.innerHTML = '<div class="card"><div class="card-h"><h2>Assign beds / rooms</h2><span class="sp"></span><button class="btn sm ghost" type="button" id="as-auto">Auto assign</button></div><div class="card-b grid">' +
      slots.map(function (slug, k) {
        var opts = ROOMS.filter(function (rm) { return rm.room_type === slug; }).map(function (rm) {
          var who = occupant(rm.room_name, r.checkin, r.checkout, r.id), c = HK[rm.room_id] ? HK[rm.room_id].condition : "clean";
          return '<option value="' + esc(rm.room_name) + '"' + (who ? " disabled" : "") + (pre[k] === rm.room_name ? " selected" : "") + ">" + esc(rm.room_name) + (who ? " — taken by " + esc(who) : c !== "clean" ? " — " + c : "") + "</option>";
        }).join("");
        return '<div class="fld"><label>' + esc(typeName(slug)) + " · unit " + (k + 1) + '</label><select class="sel" data-slot="' + k + '"><option value="">Unassigned</option>' + opts + "</select></div>";
      }).join("") +
      '<p class="muted small" style="margin:0">' + esc(fmtDs(r.checkin)) + " → " + esc(fmtDs(r.checkout)) + '. Beds already taken on any of these nights are greyed out. You can also drag the booking in the Calendar.</p><div style="display:flex;justify-content:flex-end"><button class="btn" type="button" id="as-save">Save assignment</button></div></div></div>';
    $("#as-auto", b).addEventListener("click", function () {
      var taken = {};
      $$("[data-slot]", b).forEach(function (s) { if (s.value) taken[s.value] = 1; });
      $$("[data-slot]", b).forEach(function (s, k) {
        if (s.value) return;
        var free = freeRooms(slots[k], r.checkin, r.checkout, r.id).filter(function (rm) { return !taken[rm.room_name]; });
        free.sort(function (x, y) { var cx = HK[x.room_id] && HK[x.room_id].condition === "dirty" ? 1 : 0, cy = HK[y.room_id] && HK[y.room_id].condition === "dirty" ? 1 : 0; return cx - cy; });
        if (free[0]) { s.value = free[0].room_name; taken[free[0].room_name] = 1; }
      });
    });
    $("#as-save", b).addEventListener("click", function () {
      var list = $$("[data-slot]", b).map(function (s) { return s.value; }).filter(Boolean);
      var dup = list.filter(function (x, i) { return list.indexOf(x) !== i; });
      if (dup.length) { toast(dup[0] + " is chosen twice.", true); return; }
      this.disabled = true; var btn = this;
      assignRooms(r, list).catch(function (e) { btn.disabled = false; fail(e); });
    });
  }
  function drEmails(r, b) {
    var ed = canEdit(r);
    b.innerHTML = '<div class="card"><div class="card-h"><h2>Emails</h2><span class="sp"></span>' + (ed && r.guest_email ? '<button class="btn sm ghost" type="button" id="em-1">Resend booking / payment email</button><button class="btn sm ghost" type="button" id="em-2">Resend confirmation</button>' : "") + '</div><div class="card-b" id="em-l"><span class="muted small">' + (r.cb_owned ? "Cloudbeds sends its own emails for this reservation." : "Loading…") + "</span></div></div>";
    if (r.cb_owned) return;
    if ($("#em-1", b)) {
      $("#em-1", b).addEventListener("click", function () { this.disabled = true; sb.rpc("staff_send_email", { p_id: r.id, p_kind: "RESEND_BOOKING" }).then(must).then(function () { toast("Email on its way to " + r.guest_email); }).catch(fail); });
      $("#em-2", b).addEventListener("click", function () { this.disabled = true; sb.rpc("staff_send_email", { p_id: r.id, p_kind: "RESEND_CONFIRMED" }).then(must).then(function () { toast("Confirmation on its way to " + r.guest_email); }).catch(fail); });
    }
    sb.from("booking_email_log").select("kind,to_email,ok,error,created_at,subject").eq("booking_id", r.id).order("created_at").then(function (res) {
      var list = res.data || [];
      $("#em-l").innerHTML = list.length ? '<table class="t"><tbody>' + list.map(function (x) { return '<tr><td class="nw">' + esc(fmtDT(x.created_at)) + "</td><td>" + (x.ok ? '<span class="tag p-paid">Sent</span>' : x.ok === false ? '<span class="tag s-cancelled">Failed</span>' : '<span class="tag">Sending</span>') + "</td><td><b>" + esc(x.kind.split(":")[0].replace(/_/g, " ").toLowerCase()) + "</b><small>" + esc(x.to_email) + (x.error ? ' · <span style="color:var(--err)">' + esc(x.error) + "</span>" : "") + "</small></td></tr>"; }).join("") + "</tbody></table>" : '<span class="muted small">No emails yet' + (r.email_guest ? "." : " (guest emails are off for this booking).") + "</span>";
    });
  }
  function describe(e) {
    var d = e.detail || {};
    if (d.changes) return d.changes.map(function (c) { return esc(c.field) + ": " + esc(c.before || "—") + " → <b>" + esc(c.after || "—") + "</b>"; }).join("<br>");
    return Object.keys(d).map(function (k) { return esc(k) + ": " + esc(typeof d[k] === "object" ? JSON.stringify(d[k]) : d[k]); }).join(" · ");
  }
  function drActivity(r, b) {
    b.innerHTML = '<div class="card"><div class="card-h"><h2>Activity</h2><span class="sp"></span><small class="muted">Recorded automatically, can\'t be edited</small></div><div class="tw"><table class="t"><tbody id="ac-l"><tr><td class="muted">Loading…</td></tr></tbody></table></div></div>';
    sb.from("booking_log").select("at,actor,action,detail").eq("booking_id", r.id).order("at", { ascending: false }).limit(200).then(function (res) {
      var list = res.data || [];
      $("#ac-l").innerHTML = list.length ? list.map(function (e) { return '<tr><td class="nw">' + esc(fmtDT(e.at)) + "</td><td><b>" + esc(staffName(e.actor)) + "</b><small>" + esc(e.action) + "</small></td><td>" + describe(e) + "</td></tr>"; }).join("") : '<tr class="empty"><td>Nothing logged yet.</td></tr>';
    });
  }

  /* ================= New / edit reservation wizard ================= */
  var WZ = null, WZ_PREFILL = null;
  var WSTEPS = [["avail", "Availability"], ["details", "Details"], ["addons", "Add-ons"], ["pay", "Payment"]];
  function sourceSelect(val) {
    var known = {}; SOURCE_GROUPS.forEach(function (g) { g[1].forEach(function (s) { known[s[0]] = 1; }); });
    return '<option value="">Select source…</option>' + SOURCE_GROUPS.map(function (g) { return '<optgroup label="' + esc(g[0]) + '">' + g[1].map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === val ? " selected" : "") + ">" + esc(s[1]) + "</option>"; }).join("") + "</optgroup>"; }).join("") +
      (val && !known[val] ? '<option value="' + esc(val) + '" selected>' + esc(SOURCE_L[val] || val) + "</option>" : "");
  }
  VIEWS["new"] = {
    title: "New reservation", rebuild: true, noAuto: true,
    build: function (el, arg) {
      var r = arg ? byId(arg) : null;
      if (arg && (!r || r.cb_owned)) { el.innerHTML = '<div class="card card-b">' + (r ? "Cloudbeds reservations are changed in Cloudbeds." : "Reservation not found.") + ' <a href="#/reservations">Back to Reservations</a></div>'; return; }
      var pf = WZ_PREFILL || {}; WZ_PREFILL = null;
      var nm = splitName(r && r.guest_name);
      WZ = { row: r, step: 0, maxStep: r ? 3 : 0, cart: {}, aqty: {}, av: null, plansTotal: {}, past: false, nights: 0, override: false, itemsTouched: false, addonsTouched: false,
        source: r ? r.source : "walk-in", checkin: r ? r.checkin : pf.checkin || TODAY, checkout: r ? r.checkout : pf.checkout || addDays(TODAY, 1), ref: "",
        prefType: pf.type || null, prefRoom: pf.room || null,
        g: { first: nm[0], last: nm[1], email: r ? r.guest_email || "" : "", phone: r ? r.guest_phone || "" : "", country: r ? r.country || "" : "Philippines", arrival: r ? r.arrival_time || "" : "", notes: r ? r.notes || "" : "", snotes: r ? r.staff_notes || "" : "", autoAssign: !r && ROOMS.length > 0 },
        p: { method: r ? r.pay_method : "desk", tdisc: !!(r && +r.transfer_discount > 0), dtype: r ? r.discount_type || "" : "", dval: r ? r.discount_value || "" : "", dreason: r ? r.discount_reason || "" : "", status: r ? r.status : "confirmed", statusTouched: false, email: !r, recAmt: "", recMethod: "cash", recNote: "", notify: false } };
      if (r) { (r.items || []).forEach(function (i) { if (i.rate_plan) WZ.cart[i.rate_plan] = (WZ.cart[i.rate_plan] || 0) + i.units; }); (r.addons || []).forEach(function (a) { WZ.aqty[a.slug] = a.qty; }); }
      el.innerHTML = '<div class="ph"><h1>' + (r ? "Edit reservation " + esc(r.code) : "New Reservation") + '</h1><span class="cnt">' + (r ? esc(r.guest_name) : "Same live availability and prices as the website") + '</span><span class="sp"></span><a class="btn ghost" href="' + (r ? "#/reservations" : "#/dashboard") + '" id="wz-cancel">Cancel</a></div>' +
        '<div class="wz-steps" id="wz-steps"></div><div class="wz"><aside class="card cart" id="wz-cart"></aside><div id="wz-body"></div></div>' +
        '<div class="wz-foot"><div class="tt" id="wz-tt"></div><div class="act"><button class="btn ghost up" type="button" id="wz-back"></button><button class="btn up" type="button" id="wz-next"></button></div></div>';
      $("#wz-back").addEventListener("click", function () { if (WZ.step > 0) wzGo(WZ.step - 1); });
      $("#wz-next").addEventListener("click", function () { if (WZ.step < 3) { if (wzCheck(WZ.step)) wzGo(WZ.step + 1); } else wzSave(); });
      if (r) $("#wz-cancel").addEventListener("click", function () { setTimeout(function () { openRes(r.id); }, 50); });
      wzGo(0);
      wzAvail();
    }
  };
  function wzGo(s) {
    WZ.step = s; WZ.maxStep = Math.max(WZ.maxStep, s);
    $("#wz-steps").innerHTML = WSTEPS.map(function (x, i) { return '<button type="button" data-s="' + i + '" class="' + (i === s ? "on" : i < WZ.maxStep || (WZ.row && i !== s) ? "done" : "") + '"' + (i > WZ.maxStep ? " disabled" : "") + "><i>" + (i < s ? "✓" : i + 1) + "</i>" + x[1] + "</button>"; }).join("");
    $$("#wz-steps button").forEach(function (b) { b.addEventListener("click", function () { var t = +b.getAttribute("data-s"); if (t === WZ.step) return; if (t < WZ.step || wzCheck(WZ.step)) wzGo(t); }); });
    $("#wz-back").textContent = s ? "‹ " + WSTEPS[s - 1][1] : "";
    $("#wz-back").hidden = !s;
    $("#wz-next").textContent = s < 3 ? WSTEPS[s + 1][1] + " ›" : WZ.row ? "Save changes" : "Confirm reservation";
    var body = $("#wz-body");
    [wzStepAvail, wzStepDetails, wzStepAddons, wzStepPay][s](body);
    wzCart(); wzTotals();
    window.scrollTo(0, 0);
  }
  function wzCheck(s) {
    if (s === 0) {
      if (!WZ.checkin || !WZ.checkout || WZ.checkout <= WZ.checkin) { toast("Set the check-in and check-out dates.", true); return false; }
      if (!Object.keys(WZ.cart).length) { toast("Add at least one bed or room to the reservation.", true); return false; }
      if (!WZ.source) { toast("Select the source.", true); return false; }
      var short = wzShort(); if (short && !WZ.override) { toast(short + " Tick “Allow over the website allotment” if you've checked it's free.", true); return false; }
    }
    if (s === 1) {
      readDetails();
      if (!WZ.g.first.trim()) { toast("Enter the guest's first name.", true); $("#wz-first").focus(); return false; }
      if (WZ.g.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(WZ.g.email)) { toast("That email doesn't look right.", true); $("#wz-email").focus(); return false; }
    }
    return true;
  }
  function wzAvail() {
    var a = WZ.checkin, b = WZ.checkout;
    if (!a || !b || b <= a) { WZ.av = null; WZ.nights = 0; if (WZ.step === 0) wzTable(); wzCart(); wzTotals(); return; }
    WZ.nights = diffDays(a, b);
    var tb = $("#wz-av"); if (tb) tb.innerHTML = '<p class="muted small" style="padding:16px">Checking availability…</p>';
    var past = a < TODAY;
    (past ? Promise.resolve({ data: null }) : sb.rpc("booking_availability", { p_checkin: a, p_checkout: b })).then(function (res) {
      var d = res.data; WZ.av = {}; WZ.plansTotal = {};
      if (d && d.ok !== false && d.room_types) d.room_types.forEach(function (t) { WZ.av[t.room_type] = { web: t.available }; (t.plans || []).forEach(function (p) { WZ.plansTotal[p.id] = p.stay_total; }); });
      if (WZ.row && WZ.row.checkin < b && WZ.row.checkout > a) (WZ.row.items || []).forEach(function (i) { if (WZ.av[i.room_type]) WZ.av[i.room_type].web += i.units; });
      WZ.past = past || !(d && d.room_types);
      if (WZ.step === 0) wzTable(); wzCart(); wzTotals();
    }).catch(function (e) { fail(e); WZ.av = {}; WZ.past = true; if (WZ.step === 0) wzTable(); });
  }
  function hotelFree(slug, a, b) {
    var n = totalUnits(slug), worst = n;
    for (var d = a; d < b; d = addDays(d, 1)) {
      var used = unitsOn(d, slug);
      if (WZ.row && WZ.row.checkin <= d && WZ.row.checkout > d) used -= (WZ.row.items || []).filter(function (i) { return i.room_type === slug; }).reduce(function (x, i) { return x + i.units; }, 0);
      worst = Math.min(worst, n - blockedCount(d, slug) - used);
    }
    return worst;
  }
  function planTotal(id) { if (WZ.plansTotal && WZ.plansTotal[id] != null) return +WZ.plansTotal[id]; var p = planBy(id); return p ? +p.price * WZ.nights : 0; }
  function usedFor(slug) { return Object.keys(WZ.cart).reduce(function (n, k) { var p = planBy(k); return n + (p && p.room_type === slug ? WZ.cart[k] : 0); }, 0); }
  function wzShort() {
    if (WZ.past || !WZ.av) return "";
    var s = ""; CAT.types.forEach(function (t) { var u = usedFor(t.slug), av = WZ.av[t.slug]; if (u && av && u > av.web) s = s || "Only " + av.web + " left in " + t.name + " on the website allotment."; }); return s;
  }
  function wzStepAvail(body) {
    body.innerHTML = '<div class="card"><div class="card-b grid g4">' +
      '<div class="fld"><label for="wz-src">Select Source <i>*</i></label><select class="sel" id="wz-src">' + sourceSelect(WZ.source) + "</select></div>" +
      '<div class="fld"><label for="wz-in">Check-In <i>*</i></label><input class="inp" type="date" id="wz-in" value="' + esc(WZ.checkin) + '"></div>' +
      '<div class="fld"><label for="wz-out">Check-Out <i>*</i></label><input class="inp" type="date" id="wz-out" value="' + esc(WZ.checkout) + '"></div>' +
      '<div class="fld"><label for="wz-ref">Promo code / referral</label><input class="inp" id="wz-ref" value="' + esc(WZ.ref) + '"' + (WZ.row ? " disabled" : "") + ' maxlength="40"></div>' +
      '<div style="grid-column:1/-1;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="muted" id="wz-n"></span><span style="flex:1"></span><label class="chk"><input type="checkbox" id="wz-over"' + (WZ.override ? " checked" : "") + '> Allow over the website allotment (I\'ve checked it\'s free in Cloudbeds)</label><button class="btn up" type="button" id="wz-search">' + ic("search") + "Search</button></div></div></div>" +
      '<div class="card"><div class="card-h"><h2>Available accommodations</h2><span class="sp"></span><small class="muted"><b>Website</b> = what the website may still sell · <b>In hotel</b> = beds/rooms free in the building (all channels)</small></div><div class="tw" id="wz-av"></div></div>';
    $("#wz-src").addEventListener("change", function () { WZ.source = this.value; });
    $("#wz-ref").addEventListener("input", function () { WZ.ref = this.value.trim(); });
    var dates = function () {
      var a = $("#wz-in").value, b = $("#wz-out").value;
      if (a && (!b || b <= a)) { b = addDays(a, 1); $("#wz-out").value = b; }
      WZ.checkin = a; WZ.checkout = b; WZ.itemsTouched = true; wzAvail();
    };
    $("#wz-in").addEventListener("change", dates); $("#wz-out").addEventListener("change", dates);
    $("#wz-search").addEventListener("click", dates);
    $("#wz-over").addEventListener("change", function () { WZ.override = this.checked; wzTable(); });
    wzTable();
  }
  function wzTable() {
    var box = $("#wz-av"); if (!box) return;
    var n = $("#wz-n"); if (n) n.textContent = WZ.nights ? plural(WZ.nights, "night") + " · " + fmtDs(WZ.checkin) + " → " + fmtDs(WZ.checkout) : "Choose the dates";
    if (!WZ.nights) { box.innerHTML = '<p class="muted small" style="padding:16px">Set the check-in and check-out dates, then Search.</p>'; return; }
    if (!WZ.av) { box.innerHTML = '<p class="muted small" style="padding:16px">Checking availability…</p>'; return; }
    var rows = CAT.types.filter(function (t) { return t.active || usedFor(t.slug); }).map(function (t) {
      var plans = CAT.plans.filter(function (p) { return p.room_type === t.slug && (p.active || WZ.cart[p.id]); });
      if (!plans.length) return "";
      var av = WZ.av[t.slug], web = av ? av.web : null, hotel = hotelFree(t.slug, WZ.checkin, WZ.checkout), used = usedFor(t.slug), unit = t.kind === "dorm" ? "bed" : "room";
      var maxAdd = WZ.override || WZ.past || web == null ? Math.max(hotel - used, 0) : Math.max(Math.min(web, hotel) - used, 0);
      var short = web != null && !WZ.past && used > web;
      return '<tr class="' + (short ? "short" : "") + (WZ.prefType === t.slug ? " sel" : "") + '" data-t="' + esc(t.slug) + '"><td><b>' + esc(t.name) + "</b><small>" + (t.kind === "dorm" ? "BEDS" : "ROOMS") + (t.women_only ? " · women only" : "") + "</small></td>" +
        '<td><select class="sel" data-plan aria-label="Rate plan">' + plans.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + (p.active ? "" : " (hidden)") + "</option>"; }).join("") + "</select></td>" +
        '<td class="pr" data-price></td>' +
        '<td class="free nw"><b>' + (web == null || WZ.past ? "—" : web) + '</b> <span class="muted small">on website</span><small>' + hotel + " free in hotel</small></td>" +
        '<td class="num">' + t.guests_per_unit + " / " + unit + "</td>" +
        '<td><input class="inp qty" type="number" min="1" max="' + Math.max(maxAdd, 1) + '" value="1" data-q aria-label="Quantity"></td>' +
        '<td><button class="btn sm" type="button" data-add' + (maxAdd < 1 ? " disabled" : "") + ">ADD</button>" + (used ? '<small class="muted">' + used + " in reservation</small>" : "") + (maxAdd < 1 && !WZ.override && hotel > used ? '<small style="color:var(--err)">Website allotment full</small>' : maxAdd < 1 ? '<small style="color:var(--err)">Sold out</small>' : "") + "</td></tr>";
    }).join("");
    box.innerHTML = (WZ.past ? '<p class="small" style="color:var(--warn);padding:10px 16px 0;margin:0">Past dates: the website allotment isn\'t checked and prices use the standard rate.</p>' : "") +
      '<table class="t av-t"><thead><tr><th>Type</th><th>Rate plan</th><th>Price</th><th>Available</th><th class="num">Guests</th><th>Quantity</th><th></th></tr></thead><tbody>' + rows + "</tbody></table>";
    $$("tr[data-t]", box).forEach(function (tr) {
      var sel = $("[data-plan]", tr), pr = $("[data-price]", tr);
      var show = function () { var id = sel.value, tot = planTotal(id), per = WZ.nights ? tot / WZ.nights : 0; pr.innerHTML = peso(tot, true) + '<small class="muted">' + peso(per, true) + " / night</small>"; };
      sel.addEventListener("change", show); show();
      $("[data-add]", tr).addEventListener("click", function () {
        var q = Math.max(1, Math.min(+$("[data-q]", tr).value || 1, +$("[data-q]", tr).max || 1)), id = sel.value;
        WZ.cart[id] = (WZ.cart[id] || 0) + q; WZ.itemsTouched = true;
        toast("Added " + q + "× " + typeName(planBy(id).room_type)); wzTable(); wzCart(); wzTotals();
      });
    });
  }
  function wzBill() {
    var lines = [], sub = 0, g = 0;
    Object.keys(WZ.cart).forEach(function (k) { var p = planBy(k), t = p && typeBy(p.room_type), amt = planTotal(k) * WZ.cart[k]; sub += amt; g += WZ.cart[k] * (t ? t.guests_per_unit : 1); lines.push([WZ.cart[k] + "× " + (t ? t.name : "") + " · " + (p ? p.name : k), amt]); });
    Object.keys(WZ.aqty).forEach(function (s) {
      var a = CAT.addons.filter(function (x) { return x.slug === s; })[0]; if (!a) return;
      var mult = { per_night: WZ.nights, per_guest: g, per_guest_night: g * WZ.nights }[a.unit] || 1, amt = a.price == null ? null : a.price * WZ.aqty[s] * mult;
      if (amt != null) sub += amt; lines.push([(WZ.aqty[s] > 1 ? WZ.aqty[s] + "× " : "") + a.name, amt]);
    });
    var rate = CAT.settings.transfer_discount_rate != null ? +CAT.settings.transfer_discount_rate : 0.05;
    var td = WZ.p.tdisc && WZ.p.method === "transfer" ? Math.round(sub * rate * 100) / 100 : 0;
    var dv = +WZ.p.dval || 0, da = WZ.p.dtype === "percent" ? Math.round((sub - td) * Math.min(dv, 100)) / 100 : WZ.p.dtype === "amount" ? Math.min(dv, sub - td) : 0;
    var total = Math.max(sub - td - da, 0), paid = WZ.row ? +WZ.row.amount_paid || 0 : +WZ.p.recAmt || 0;
    return { lines: lines, sub: sub, td: td, da: da, total: total, guests: g, rate: rate, paid: paid, vat: total * VAT / (1 + VAT) };
  }
  function wzTotals() {
    var b = wzBill(), box = $("#wz-tt"); if (!box) return;
    var dep = WZ.p.method === "transfer" ? b.total : Math.round(b.total * 0.5 * 100) / 100;
    box.innerHTML = '<div class="x">Subtotal<b>' + peso(b.sub, true) + '</b></div><div class="x">Taxes (VAT incl.)<b>' + peso(b.vat, true) + "</b></div>" + (b.td + b.da > 0 ? '<div class="x">Discounts<b>−' + peso(b.td + b.da, true) + "</b></div>" : "") +
      "<div>Grand Total<b>" + peso(b.total, true) + '</b></div><div class="x">Suggested Deposit<b>' + peso(dep, true) + '</b></div><div class="x">' + (WZ.row ? "Paid" : "Paying now") + "<b>" + peso(b.paid, true) + "</b></div><div>Balance Due<b>" + peso(Math.max(b.total - b.paid, 0), true) + "</b></div>";
  }
  function wzCart() {
    var box = $("#wz-cart"); if (!box) return;
    var b = wzBill();
    var items = Object.keys(WZ.cart).map(function (k) {
      var p = planBy(k), t = p && typeBy(p.room_type);
      return '<div class="ci"><div class="top"><span>' + esc(t ? t.name : k) + "</span><span>" + peso(planTotal(k) * WZ.cart[k], true) + "</span></div><small>" + esc(p ? p.name.toUpperCase() : "") + " · " + esc(fmtD(WZ.checkin)) + " – " + esc(fmtD(WZ.checkout)) + "</small><small>" + plural(WZ.cart[k], t && t.kind === "private" ? "room" : "bed") + " · " + plural(WZ.cart[k] * (t ? t.guests_per_unit : 1), "guest") + " · " + plural(WZ.nights, "night") + "</small>" +
        (WZ.step === 0 ? '<div style="display:flex;gap:10px;align-items:center;margin-top:4px"><span class="qtyb"><button type="button" data-cq="' + k + '" data-d="-1" aria-label="Fewer">−</button><b>' + WZ.cart[k] + '</b><button type="button" data-cq="' + k + '" data-d="1" aria-label="More">+</button></span><button class="rm" type="button" data-rm="' + k + '">Remove</button></div>' : "") + "</div>";
    }).join("");
    var g = WZ.g, nm = (g.first + " " + g.last).trim();
    box.innerHTML = "<h3>ACCOMMODATIONS</h3>" + (items || '<div class="empty">Nothing added yet. Search the dates and press ADD.</div>') +
      (WZ.prefRoom ? '<div class="gl">Bed/room picked on the calendar: <b>' + esc(WZ.prefRoom) + "</b></div>" : "") +
      (WZ.step > 0 ? "<h3>GUEST</h3><div class=\"gl\">" + (nm ? "<b>" + esc(nm) + "</b><br>" : '<span class="muted">Not entered yet</span>') + (g.email ? esc(g.email) + "<br>" : "") + (g.phone ? esc(g.phone) : "") + "</div>" : "") +
      (Object.keys(WZ.aqty).length ? "<h3>ADD-ONS</h3>" + b.lines.slice(Object.keys(WZ.cart).length).map(function (l) { return '<div class="gl" style="display:flex;justify-content:space-between"><span>' + esc(l[0]) + "</span><span>" + (l[1] == null ? "at the desk" : peso(l[1], true)) + "</span></div>"; }).join("") : "") +
      '<h3>SOURCE</h3><div class="gl">' + esc(SOURCE_L[WZ.source] || WZ.source || "—") + "</div>";
    $$("[data-cq]", box).forEach(function (x) { x.addEventListener("click", function () { var k = x.getAttribute("data-cq"), n = Math.max(0, (WZ.cart[k] || 0) + +x.getAttribute("data-d")); if (n) WZ.cart[k] = n; else delete WZ.cart[k]; WZ.itemsTouched = true; wzTable(); wzCart(); wzTotals(); }); });
    $$("[data-rm]", box).forEach(function (x) { x.addEventListener("click", function () { delete WZ.cart[x.getAttribute("data-rm")]; WZ.itemsTouched = true; wzTable(); wzCart(); wzTotals(); }); });
  }
  function readDetails() {
    if (!$("#wz-first")) return;
    var g = WZ.g; g.first = $("#wz-first").value.trim(); g.last = $("#wz-last").value.trim(); g.email = $("#wz-email").value.trim(); g.phone = $("#wz-phone").value.trim();
    g.country = $("#wz-country").value.trim(); g.arrival = $("#wz-arr").value.trim(); g.notes = $("#wz-notes").value.trim(); g.snotes = $("#wz-snotes").value.trim();
    var aa = $("#wz-aa"); if (aa) g.autoAssign = aa.checked;
  }
  function wzStepDetails(body) {
    var g = WZ.g;
    body.innerHTML = '<div class="card"><div class="card-h"><h2>Guest details</h2><span class="sp"></span><span id="wz-ret"></span></div><div class="card-b grid g3">' +
      '<div class="fld"><label for="wz-first">First Name <i>*</i></label><input class="inp" id="wz-first" value="' + esc(g.first) + '" maxlength="80" autocomplete="off"></div>' +
      '<div class="fld"><label for="wz-last">Last Name</label><input class="inp" id="wz-last" value="' + esc(g.last) + '" maxlength="80" autocomplete="off"></div>' +
      '<div class="fld"><label for="wz-email">Email</label><input class="inp" id="wz-email" type="email" value="' + esc(g.email) + '" maxlength="200" autocomplete="off"></div>' +
      '<div class="fld"><label for="wz-phone">Mobile</label><input class="inp" id="wz-phone" type="tel" value="' + esc(g.phone) + '" maxlength="40" autocomplete="off"></div>' +
      '<div class="fld"><label for="wz-country">Country</label><input class="inp" id="wz-country" list="countries" value="' + esc(g.country) + '" maxlength="60"></div>' +
      '<div class="fld"><label for="wz-arr">Estimated Arrival Time</label><input class="inp" id="wz-arr" value="' + esc(g.arrival) + '" maxlength="40" placeholder="e.g. 3 PM"></div>' +
      (WZ.row ? "" : '<label class="chk" style="grid-column:1/-1"><input type="checkbox" id="wz-aa"' + (g.autoAssign ? " checked" : "") + (ROOMS.length ? "" : " disabled") + "> Assignment: <b>AUTO ASSIGN</b> beds/rooms after booking" + (WZ.prefRoom ? " (starting with " + esc(WZ.prefRoom) + ")" : "") + ' <span class="muted">— you can change it in the reservation or by dragging in the Calendar</span></label>') +
      "</div></div>" +
      '<div class="card"><div class="card-h"><h2>Notes</h2></div><div class="card-b grid g2"><div class="fld"><label for="wz-notes">Guest requests · shown on the guest\'s emails</label><textarea class="inp" id="wz-notes" maxlength="2000">' + esc(g.notes) + '</textarea></div><div class="fld"><label for="wz-snotes">Staff notes · internal</label><textarea class="inp" id="wz-snotes" maxlength="2000">' + esc(g.snotes) + "</textarea></div></div></div>";
    var look = function () {
      readDetails(); wzCart();
      var e = g.email.toLowerCase(), ph = g.phone.replace(/\D/g, "").slice(-9), box = $("#wz-ret");
      if (!box) return;
      var prev = ROWS.filter(function (x) { return (!WZ.row || x.id !== WZ.row.id) && ((e && x.guest_email && x.guest_email.toLowerCase() === e) || (ph.length >= 9 && x.guest_phone && x.guest_phone.replace(/\D/g, "").slice(-9) === ph)); });
      if (prev.length) { box.innerHTML = '<span class="retg">Returning guest · ' + plural(prev.length, "booking") + " on file (last " + esc(fmtD(prev[0].checkin)) + ")</span>"; return; }
      if (e) sb.from("cb_history").select("checkin", { count: "exact", head: false }).eq("guest_email", e).limit(1).then(function (x) { if (x.count) box.innerHTML = '<span class="retg">Returning guest · ' + plural(x.count, "stay") + " in the Cloudbeds history</span>"; else box.innerHTML = ""; });
      else box.innerHTML = "";
    };
    $("#wz-email").addEventListener("change", look); $("#wz-phone").addEventListener("change", look);
    $$("input,textarea", body).forEach(function (i) { i.addEventListener("input", function () { readDetails(); }); });
    look();
    setTimeout(function () { $("#wz-first").focus(); }, 30);
  }
  function wzStepAddons(body) {
    var list = CAT.addons.filter(function (a) { return a.active || WZ.aqty[a.slug]; });
    body.innerHTML = '<div class="card"><div class="card-h"><h2>Add-ons</h2><span class="sp"></span><small class="muted">Optional extras, same as the website</small></div><div class="addon-l">' +
      (list.length ? list.map(function (a) {
        var q = WZ.aqty[a.slug] || 0;
        return '<div class="ad"><div class="nm"><b>' + esc(a.name) + "</b><small class=\"muted\" style=\"display:block\">" + esc(a.description || "") + (a.price == null ? " · priced at the desk" : " · " + peso(a.price) + " " + a.unit.replace(/_/g, " ").replace("per ", "/ ")) + '</small></div><span class="qtyb"><button type="button" data-aq="' + esc(a.slug) + '" data-d="-1"' + (q ? "" : " disabled") + ' aria-label="Fewer">−</button><b>' + q + '</b><button type="button" data-aq="' + esc(a.slug) + '" data-d="1"' + (q >= a.max_qty ? " disabled" : "") + ' aria-label="More">+</button></span></div>';
      }).join("") : '<div class="ad muted">No add-ons are set up. Add them in Admin.</div>') + "</div></div>";
    $$("[data-aq]", body).forEach(function (b) { b.addEventListener("click", function () { var s = b.getAttribute("data-aq"), n = Math.max(0, (WZ.aqty[s] || 0) + +b.getAttribute("data-d")); if (n) WZ.aqty[s] = n; else delete WZ.aqty[s]; WZ.addonsTouched = true; wzStepAddons(body); wzCart(); wzTotals(); }); });
  }
  function wzStepPay(body) {
    var p = WZ.p, r = WZ.row, b = wzBill(), rate = Math.round(b.rate * 1000) / 10;
    var cutoff = CAT.settings.transfer_cutoff_hours != null ? +CAT.settings.transfer_cutoff_hours : 24;
    body.innerHTML = '<div class="card"><div class="card-h"><h2>Way of paying</h2></div><div class="card-b grid">' +
      '<div class="radio-c"><label class="' + (p.method === "desk" ? "on" : "") + '"><input type="radio" name="wz-pm" value="desk"' + (p.method === "desk" ? " checked" : "") + '><span><b>Pay at check-in</b><br><small class="muted">Cash, card or GCash at the front desk. Standard rate.</small></span></label>' +
      '<label class="' + (p.method === "transfer" ? "on" : "") + '"><input type="radio" name="wz-pm" value="transfer"' + (p.method === "transfer" ? " checked" : "") + '><span><b>Pay ahead by bank / e-wallet transfer</b><br><small class="muted">The guest gets the account details, a ' + Math.round((CAT.settings.hold_minutes || 120) / 60 * 10) / 10 + "-hour hold and uploads the screenshot at least " + cutoff + " hours before check-in. You verify it under Payments.</small></span></label></div>" +
      '<label class="chk" id="wz-td-w"' + (p.method === "transfer" ? "" : ' style="opacity:.5"') + '><input type="checkbox" id="wz-td"' + (p.tdisc ? " checked" : "") + (p.method === "transfer" ? "" : " disabled") + "> " + rate + "% convenience discount (official website + paid ahead by bank / e-wallet transfer)</label>" +
      '<div class="grid g3"><div class="fld"><label for="wz-st">Status</label><select class="sel" id="wz-st">' + STATUS.filter(function (s) { return r || ["pending", "confirmed", "checked_in"].indexOf(s[0]) > -1; }).map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === p.status ? " selected" : "") + ">" + (s[0] === "pending" && !r ? "Awaiting payment (2-hour hold)" : s[1]) + "</option>"; }).join("") + "</select></div>" +
      '<div class="fld"><label for="wz-dt">Discount</label><select class="sel" id="wz-dt"><option value="">No discount</option><option value="percent"' + (p.dtype === "percent" ? " selected" : "") + '>Percent (%)</option><option value="amount"' + (p.dtype === "amount" ? " selected" : "") + '>Amount (₱)</option></select></div>' +
      '<div class="fld"><label for="wz-dv">Value</label><input class="inp" id="wz-dv" type="number" min="0" step="0.01" value="' + esc(p.dval) + '"></div>' +
      '<div class="fld" style="grid-column:1/-1"><label for="wz-dr">Discount reason · shown to the guest</label><input class="inp" id="wz-dr" maxlength="200" value="' + esc(p.dreason) + '" placeholder="e.g. Returning guest, long stay"></div></div></div></div>' +
      (r ? "" : '<div class="card"><div class="card-h"><h2>Take a payment now</h2><span class="sp"></span><small class="muted">Optional · recorded as verified</small></div><div class="card-b grid g3"><div class="fld"><label for="wz-ra">Amount (₱)</label><input class="inp" id="wz-ra" type="number" min="0" step="0.01" value="' + esc(p.recAmt) + '"></div><div class="fld"><label for="wz-rm">Method</label><select class="sel" id="wz-rm">' + ["cash", "card", "gcash", "maya", "transfer", "other"].map(function (m) { return '<option value="' + m + '"' + (p.recMethod === m ? " selected" : "") + ">" + METHOD[m] + "</option>"; }).join("") + '</select></div><div class="fld"><label for="wz-rn">Note</label><input class="inp" id="wz-rn" maxlength="200" value="' + esc(p.recNote) + '" placeholder="OR no., reference…"></div>' +
        '<div style="grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap"><button class="btn xs ghost" type="button" data-amt="full">Full amount</button><button class="btn xs ghost" type="button" data-amt="half">50% deposit</button><button class="btn xs ghost" type="button" data-amt="0">None</button></div></div></div>') +
      '<div class="card"><div class="card-h"><h2>Summary</h2></div><div class="tw"><table class="t folio"><tbody>' + b.lines.map(function (l) { return "<tr><td>" + esc(l[0]) + '</td><td class="amt">' + (l[1] == null ? "at the desk" : peso(l[1], true)) + "</td></tr>"; }).join("") +
      (b.td ? '<tr class="disc"><td>' + rate + '% convenience discount</td><td class="amt">−' + peso(b.td, true) + "</td></tr>" : "") + (b.da ? '<tr class="disc"><td>' + esc(p.dreason || "Discount") + (p.dtype === "percent" ? " (" + p.dval + "%)" : "") + '</td><td class="amt">−' + peso(b.da, true) + "</td></tr>" : "") +
      '<tr><td><b>Grand total · ' + plural(WZ.nights, "night") + " · " + plural(b.guests, "guest") + '</b></td><td class="amt"><b>' + peso(b.total, true) + "</b></td></tr>" + (r && +r.amount_paid > 0 ? '<tr class="pay"><td>Already paid</td><td class="amt">' + peso(r.amount_paid, true) + "</td></tr>" : "") + "</tbody></table></div>" +
      '<div class="card-b grid"><label class="chk"><input type="checkbox" id="wz-em"' + (r ? (p.notify ? " checked" : "") : p.email ? " checked" : "") + "> " + (r ? "Email the guest a summary of these changes" : "Email the guest (booking details, payment instructions if paying ahead, and the confirmation)") + '</label><p class="msg" id="wz-msg" role="alert"></p></div></div>';
    var sync = function () {
      p.method = ($("input[name=wz-pm]:checked") || {}).value || "desk";
      $$(".radio-c label", body).forEach(function (l) { l.classList.toggle("on", $("input", l).checked); });
      var t = p.method === "transfer"; $("#wz-td").disabled = !t; if (!t) $("#wz-td").checked = false; $("#wz-td-w").style.opacity = t ? 1 : .5;
      if (!r && !p.statusTouched) { var want = t ? "pending" : "confirmed"; $("#wz-st").value = want; }
      p.tdisc = $("#wz-td").checked; p.status = $("#wz-st").value; p.dtype = $("#wz-dt").value; p.dval = $("#wz-dv").value; p.dreason = $("#wz-dr").value.trim();
      if (!r) { p.recAmt = $("#wz-ra").value; p.recMethod = $("#wz-rm").value; p.recNote = $("#wz-rn").value.trim(); p.email = $("#wz-em").checked; } else p.notify = $("#wz-em").checked;
      wzTotals(); wzCart();
    };
    $$("input,select", body).forEach(function (i) { i.addEventListener("change", sync); i.addEventListener("input", function () { if (i.type === "number" || i.type === "text") sync(); }); });
    $("#wz-st").addEventListener("change", function () { p.statusTouched = true; });
    $$("[data-amt]", body).forEach(function (x) { x.addEventListener("click", function () { var a = x.getAttribute("data-amt"), t = wzBill().total; $("#wz-ra").value = a === "full" ? t : a === "half" ? Math.round(t * 50) / 100 : ""; sync(); }); });
    sync();
    // the summary table depends on discounts: refresh it on change
    ["#wz-dt", "#wz-dv", "#wz-td"].forEach(function (s) { $(s).addEventListener("change", function () { var y = window.scrollY; wzStepPay(body); window.scrollTo(0, y); }); });
    $$("input[name=wz-pm]", body).forEach(function (i) { i.addEventListener("change", function () { var y = window.scrollY; wzStepPay(body); window.scrollTo(0, y); }); });
  }
  function wzSave() {
    if (!wzCheck(0)) { wzGo(0); return; }
    readDetails();
    if (!WZ.g.first) { wzGo(1); wzCheck(1); return; }
    var p = WZ.p, r = WZ.row, g = WZ.g, name = (g.first + " " + g.last).trim(), btn = $("#wz-next"), msg = $("#wz-msg");
    var emailOn = r ? p.notify : p.email;
    if (emailOn && !g.email) { msg.className = "msg err"; msg.textContent = "Add the guest's email (Details), or untick “Email the guest”."; return; }
    var items = Object.keys(WZ.cart).map(function (k) { return { rate_plan: k, units: WZ.cart[k] }; });
    var adds = Object.keys(WZ.aqty).map(function (s) { return { slug: s, qty: WZ.aqty[s] }; });
    btn.disabled = true; btn.textContent = "Saving…";
    var bad = function (e) { btn.disabled = false; btn.textContent = r ? "Save changes" : "Confirm reservation"; msg.className = "msg err"; msg.textContent = e.message || String(e); toast(e.message || String(e), true); };
    if (!r) {
      var res;
      sb.rpc("create_booking", {
        p_checkin: WZ.checkin, p_checkout: WZ.checkout, p_items: items, p_addons: adds, p_guest_name: name, p_guest_email: g.email, p_guest_phone: g.phone, p_country: g.country,
        p_arrival_time: g.arrival, p_notes: g.notes, p_consent: false, p_marketing: false, p_ref: WZ.ref || null, p_source: WZ.source,
        p_override: WZ.override, p_pay_method: p.method, p_status: p.status, p_transfer_discount: p.tdisc,
        p_discount_type: p.dtype || null, p_discount_value: +p.dval || null, p_discount_reason: p.dreason || null,
        p_staff_notes: g.snotes || null, p_email_guest: p.email
      }).then(function (x) { if (x.error) throw x.error; res = x.data; return refresh(); }).then(function () {
        var row = byId(res.id), jobs = [];
        if (row && g.autoAssign && ROOMS.length) {
          var picks = [], taken = {};
          (row.items || []).forEach(function (i) {
            for (var k = 0; k < i.units; k++) {
              var free = freeRooms(i.room_type, row.checkin, row.checkout, row.id).filter(function (rm) { return !taken[rm.room_name]; });
              if (WZ.prefRoom) { var pr = free.filter(function (rm) { return rm.room_name === WZ.prefRoom; })[0]; if (pr) free.unshift(pr); }
              free.sort(function (x, y) { return (x.room_name === WZ.prefRoom ? -1 : 0) - (y.room_name === WZ.prefRoom ? -1 : 0) || ((HK[x.room_id] || {}).condition === "dirty") - ((HK[y.room_id] || {}).condition === "dirty"); });
              if (free[0]) { picks.push(free[0].room_name); taken[free[0].room_name] = 1; }
            }
          });
          if (picks.length) jobs.push(sb.rpc("staff_assign_rooms", { p_id: row.id, p_rooms: picks }));
        }
        if (+p.recAmt > 0) jobs.push(sb.rpc("staff_record_payment", { p_booking_id: res.id, p_amount: +p.recAmt, p_method: p.recMethod, p_note: p.recNote || null, p_proof_path: null }));
        return Promise.all(jobs);
      }).then(function (out) {
        var errs = (out || []).filter(function (x) { return x && x.error; });
        toast("Booked " + res.code + (errs.length ? " · but: " + errs[0].error.message : ""), !!errs.length);
        return refresh();
      }).then(function () { WZ = null; go("#/reservations"); setTimeout(function () { openRes(res.id); }, 60); }).catch(bad);
      return;
    }
    var pp = {}, set = function (k, val, old) { if ((val || "") !== (old == null ? "" : String(old))) pp[k] = val; };
    set("guest_name", name, r.guest_name); set("guest_email", g.email, r.guest_email); set("guest_phone", g.phone, r.guest_phone);
    set("country", g.country, r.country); set("arrival_time", g.arrival, r.arrival_time); set("notes", g.notes, r.notes); set("staff_notes", g.snotes, r.staff_notes);
    set("source", WZ.source, r.source); set("status", p.status, r.status); set("pay_method", p.method, r.pay_method);
    if (WZ.checkin !== r.checkin) pp.checkin = WZ.checkin; if (WZ.checkout !== r.checkout) pp.checkout = WZ.checkout;
    if (WZ.itemsTouched) pp.items = items; if (WZ.addonsTouched) pp.addons = adds;
    pp.transfer_discount = p.tdisc; pp.discount_type = p.dtype || null; pp.discount_value = +p.dval || null; pp.discount_reason = p.dreason || null;
    pp.override = WZ.override; pp.notify = p.notify;
    sb.rpc("staff_update_booking", { p_id: r.id, p: pp }).then(function (x) {
      if (x.error) throw x.error;
      if (p.notify && !((x.data || {}).changes || []).length) toast("Nothing changed, so no email was sent.");
      else toast("Saved " + r.code);
      // dates or beds changed: keep assigned beds only if still free
      var keep = roomsOf(r).filter(function (n) { return !occupant(n, WZ.checkin, WZ.checkout, r.id); });
      return (keep.length !== roomsOf(r).length ? sb.rpc("staff_assign_rooms", { p_id: r.id, p_rooms: keep.length ? keep : null }) : Promise.resolve()).then(refresh);
    }).then(function () { var id = r.id; WZ = null; go("#/reservations"); setTimeout(function () { openRes(id); }, 60); }).catch(bad);
  }

  /* ================= Payments (upgrade: one place for proofs, takings and balances) ================= */
  var PAYS = { tab: "verify", from: null, to: null };
  VIEWS.payments = {
    title: "Payments",
    build: function (el) {
      PAYS.from = PAYS.from || TODAY; PAYS.to = PAYS.to || TODAY;
      el.innerHTML = '<div class="ph"><h1>Payments</h1><span class="cnt">Pay-ahead uploads, takings and balances</span><span class="sp"></span><a class="btn ghost" href="#/settings">' + ic("gear") + "Payment settings</a></div>" +
        '<div class="card"><div class="tabs flat" id="py-tabs" role="tablist"></div><div id="py-b"></div></div>';
    },
    draw: function (el) {
      var v = ROWS.filter(function (r) { return r.proofs_to_check > 0; }).length, un = unpaidRows().length;
      var T = [["verify", "To verify", v, true], ["taken", "Payments received", null], ["unpaid", "Balances due (next 7 days)", un]];
      $("#py-tabs", el).innerHTML = T.map(function (t) { return '<button type="button" data-t="' + t[0] + '" aria-selected="' + (PAYS.tab === t[0]) + '"' + (t[3] && t[2] ? ' class="hot"' : "") + ">" + t[1] + (t[2] != null ? ' <span class="n">' + t[2] + "</span>" : "") + "</button>"; }).join("");
      $$("#py-tabs button", el).forEach(function (b) { b.addEventListener("click", function () { PAYS.tab = b.getAttribute("data-t"); VIEWS.payments.draw(el); }); });
      var box = $("#py-b", el);
      if (PAYS.tab === "verify") {
        box.innerHTML = '<p class="muted small" style="padding:12px 16px 0;margin:0">Check each screenshot against the bank / e-wallet, then <b>Verify</b>. The first verified payment confirms the booking and emails the guest. <b>Reject</b> puts it back on a fresh 2-hour hold and asks the guest to upload again.</p><div id="py-list"><p class="muted small" style="padding:16px">Loading…</p></div>';
        sb.from("booking_payments").select("*, bookings(id,code,guest_name,total,amount_paid,checkin,checkout)").eq("status", "pending").order("created_at").then(function (res) {
          var list = must(res) || [], lb = $("#py-list"); if (!lb) return;
          lb.innerHTML = list.length ? list.map(function (p) { var bk = p.bookings || {}; return proofRow(p, { code: bk.code, guest_name: (bk.guest_name || "") + " · " + fmtDs(bk.checkin) + " · total " + peso(bk.total), _showName: true }).replace('<div class="proof"', '<div class="proof" data-bid="' + esc(bk.id || "") + '"'); }).join("") : '<p class="muted" style="padding:24px 16px;text-align:center">Nothing to verify right now.</p>';
          wireProofs(lb, function () { return refresh(); });
          $$(".proof[data-bid] .code", lb).forEach(function (c) { c.style.cursor = "pointer"; c.addEventListener("click", function () { openRes(c.closest(".proof").getAttribute("data-bid"), "folio"); }); });
        }).catch(fail);
      } else if (PAYS.tab === "taken") {
        box.innerHTML = '<div class="cal-tb"><label class="small">From <input class="inp" type="date" id="py-f" value="' + PAYS.from + '"></label><label class="small">To <input class="inp" type="date" id="py-t" value="' + PAYS.to + '"></label><button class="btn xs ghost" type="button" data-r="0">Today</button><button class="btn xs ghost" type="button" data-r="1">Yesterday</button><button class="btn xs ghost" type="button" data-r="7">Last 7 days</button><button class="btn xs ghost" type="button" data-r="30">Last 30 days</button></div><div id="py-sum" class="sumbar"></div><div class="tw"><table class="t"><thead><tr><th>When</th><th>Reservation</th><th>Guest</th><th class="num">Amount</th><th>Method</th><th>Status</th><th>Recorded / verified by</th><th>Note</th></tr></thead><tbody id="py-rows"><tr><td colspan="8" class="muted">Loading…</td></tr></tbody></table></div>';
        var load = function () {
          PAYS.from = $("#py-f").value || TODAY; PAYS.to = $("#py-t").value || PAYS.from;
          sb.from("booking_payments").select("*, bookings(id,code,guest_name)").gte("created_at", PAYS.from + "T00:00:00+08:00").lte("created_at", PAYS.to + "T23:59:59+08:00").order("created_at", { ascending: false }).limit(1000).then(function (res) {
            var list = must(res) || [], by = {}, tot = 0;
            list.forEach(function (p) { if (p.status !== "verified") return; by[p.method] = (by[p.method] || 0) + +p.amount; tot += +p.amount; });
            $("#py-sum").innerHTML = "<span>Verified total <b>" + peso(tot, true) + "</b></span>" + Object.keys(by).map(function (m) { return "<span>" + esc(METHOD[m] || m) + " <b>" + peso(by[m], true) + "</b></span>"; }).join("");
            $("#py-rows").innerHTML = list.length ? list.map(function (p) { var bk = p.bookings || {}; return '<tr class="click" data-open="' + esc(bk.id || "") + '"><td class="nw">' + esc(fmtDT(p.created_at)) + '</td><td class="code">' + esc(bk.code || "") + "</td><td>" + esc(bk.guest_name || "") + '</td><td class="num"><b>' + peso(p.amount, true) + "</b></td><td>" + esc(METHOD[p.method] || p.method) + '</td><td><span class="tag ' + (p.status === "verified" ? "p-paid" : p.status === "rejected" ? "s-cancelled" : "s-pending_payment") + '">' + esc(p.status) + "</span></td><td>" + esc(p.created_by ? staffName(p.created_by) : "Guest upload") + (p.verified_by ? "<small>" + esc(staffName(p.verified_by)) + "</small>" : "") + "</td><td>" + esc(p.note || "") + "</td></tr>"; }).join("") : '<tr class="empty"><td colspan="8">No payments in this period.</td></tr>';
            $$("#py-rows tr[data-open]").forEach(function (tr) { tr.addEventListener("click", function () { if (tr.getAttribute("data-open")) openRes(tr.getAttribute("data-open"), "folio"); }); });
          }).catch(fail);
        };
        $("#py-f").addEventListener("change", load); $("#py-t").addEventListener("change", load);
        $$("[data-r]", box).forEach(function (b) { b.addEventListener("click", function () { var n = +b.getAttribute("data-r"); $("#py-f").value = n === 1 ? addDays(TODAY, -1) : addDays(TODAY, -n); $("#py-t").value = n === 1 ? addDays(TODAY, -1) : TODAY; load(); }); });
        load();
      } else {
        var rows = unpaidRows();
        box.innerHTML = '<div class="tw"><table class="t"><thead><tr><th>Reservation</th><th>Guest</th><th>Check-in</th><th>Way of paying</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>' + (rows.length ? rows.map(function (r) {
          return '<tr class="click" data-open="' + r.id + '"><td class="code">' + esc(r.code) + "</td><td>" + esc(r.guest_name) + "<small>" + esc(r.guest_phone || "") + '</small></td><td class="nw">' + esc(fmtDs(r.checkin)) + "</td><td>" + esc(PAYM[r.pay_method] || "") + '</td><td class="num">' + peso(r.total, true) + '</td><td class="num">' + peso(r.amount_paid, true) + '</td><td class="num"><b style="color:var(--err)">' + peso(balance(r), true) + "</b></td><td>" + stTag(r.status) + "</td></tr>";
        }).join("") : '<tr class="empty"><td colspan="8">No balances due in the next 7 days.</td></tr>') + "</tbody></table></div>";
        $$("tr[data-open]", box).forEach(function (tr) { tr.addEventListener("click", function () { openRes(tr.getAttribute("data-open"), "folio"); }); });
      }
    }
  };
  function unpaidRows() { var lim = addDays(TODAY, 7); return ROWS.filter(function (r) { return ACTIVE[r.status] && !r.cb_owned && balance(r) > 0.5 && r.checkin <= lim && r.checkout >= TODAY; }).sort(function (a, b) { return a.checkin < b.checkin ? -1 : 1; }); }

  /* ================= Housekeeping ================= */
  var HKS = { d: null, f: { type: "", cond: "", fd: "", as: "", q: "" }, sel: {} };
  var FD_L = { turnover: "Turnover", "check-out": "Check-out", stayover: "Stayover", arrival: "Arrival", vacant: "Vacant", blocked: "Out of service" };
  function hkRows(d) {
    var bl = blockedOn(d);
    return ROOMS.map(function (rm) {
      var mine = ROWS.filter(function (r) { return OCC[r.status] && r.checkin <= d && r.checkout >= d && roomsOf(r).indexOf(rm.room_name) > -1; });
      var arr = mine.filter(function (r) { return r.checkin === d && ACTIVE[r.status]; })[0], dep = mine.filter(function (r) { return r.checkout === d; })[0], stay = mine.filter(function (r) { return r.checkin < d && r.checkout > d; })[0];
      var fd = bl[rm.room_id] ? "blocked" : arr && dep ? "turnover" : dep ? "check-out" : stay ? "stayover" : arr ? "arrival" : "vacant";
      var h = HK[rm.room_id] || { room_id: rm.room_id, condition: "clean", assigned_to: "", dnd: false, note: "" };
      var cur = stay || arr || dep;
      return { rm: rm, h: h, fd: fd, occupied: !!(stay || arr && arr.status === "checked_in"), arr: arr, dep: dep, cur: cur, block: bl[rm.room_id] };
    });
  }
  function hkSave(rows, quiet) {
    var payload = rows.map(function (x) { var h = Object.assign({ condition: "clean", dnd: false }, HK[x.room_id] || {}, x); delete h.updated_at; delete h.updated_by; return h; });
    return sb.from("room_housekeeping").upsert(payload, { onConflict: "room_id" }).select().then(function (res) {
      var d = must(res) || []; d.forEach(function (h) { HK[h.room_id] = h; });
      if (!quiet) toast(rows.length > 1 ? plural(rows.length, "bed/room", "beds/rooms") + " updated" : "Saved");
      if (ROUTE === "housekeeping") VIEWS.housekeeping.draw($("#v-housekeeping"));
    }).catch(fail);
  }
  VIEWS.housekeeping = {
    title: "Housekeeping",
    build: function (el) {
      HKS.d = HKS.d || TODAY;
      el.innerHTML = '<div class="ph"><h1>Housekeeping</h1><span class="cnt" id="hk-cnt"></span><span class="sp"></span><button class="ib" type="button" id="hk-prev" aria-label="Previous day">' + ic("left") + '</button><input class="inp" type="date" id="hk-d" style="width:auto"><button class="ib" type="button" id="hk-next" aria-label="Next day">' + ic("right") + '</button><button class="btn ghost" type="button" id="hk-dep">Mark departures dirty</button><button class="btn ghost" type="button" id="hk-print">' + ic("print") + "Print</button></div>" +
        '<div class="card"><div class="hk-sum" id="hk-sum"></div><div class="chips"><input class="inp" type="search" id="hk-q" placeholder="Search bed / room / guest"><select class="sel" id="hk-type" style="width:auto;height:32px"><option value="">All room types</option></select>' +
        '<select class="sel" id="hk-cond" style="width:auto;height:32px"><option value="">Any condition</option><option value="dirty">Dirty</option><option value="clean">Clean</option><option value="inspected">Inspected</option></select>' +
        '<select class="sel" id="hk-fd" style="width:auto;height:32px"><option value="">Any front desk status</option>' + Object.keys(FD_L).map(function (k) { return '<option value="' + k + '">' + FD_L[k] + "</option>"; }).join("") + "</select>" +
        '<select class="sel" id="hk-as" style="width:auto;height:32px"><option value="">Assigned to anyone</option><option value="-">Not assigned</option>' + STAFF.map(function (s) { return '<option value="' + esc(s.name || s.email) + '">' + esc(s.name || s.email) + "</option>"; }).join("") + '</select><button class="btn link sm" type="button" id="hk-reset">Reset Filters</button></div>' +
        '<div class="bulk" id="hk-bulk" hidden></div><div class="tw"><table class="t"><thead><tr><th style="width:30px"><input type="checkbox" id="hk-all" aria-label="Select all"></th><th>Room</th><th>Room Type</th><th>Condition</th><th>Status</th><th>Arrival Time</th><th>Arrival</th><th>Departure</th><th>Front Desk Status</th><th>Assigned To</th><th>Do Not Disturb</th><th>Notes</th></tr></thead><tbody id="hk-rows"></tbody></table></div></div>' +
        '<datalist id="hk-staff">' + STAFF.map(function (s) { return "<option>" + esc(s.name || s.email) + "</option>"; }).join("") + "</datalist>";
      $("#hk-type").innerHTML += CAT.types.map(function (t) { return '<option value="' + esc(t.slug) + '">' + esc(t.name) + "</option>"; }).join("");
      var redo = function () { VIEWS.housekeeping.draw(el); };
      $("#hk-d").addEventListener("change", function () { if (this.value) { HKS.d = this.value; redo(); } });
      $("#hk-prev").addEventListener("click", function () { HKS.d = addDays(HKS.d, -1); redo(); });
      $("#hk-next").addEventListener("click", function () { HKS.d = addDays(HKS.d, 1); redo(); });
      ["type", "cond", "fd", "as"].forEach(function (k) { $("#hk-" + k).addEventListener("change", function () { HKS.f[k] = this.value; redo(); }); });
      var t; $("#hk-q").addEventListener("input", function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { HKS.f.q = v.trim().toLowerCase(); redo(); }, 150); });
      $("#hk-reset").addEventListener("click", function () { HKS.f = { type: "", cond: "", fd: "", as: "", q: "" }; ["type", "cond", "fd", "as", "q"].forEach(function (k) { $("#hk-" + k).value = ""; }); redo(); });
      $("#hk-print").addEventListener("click", function () { window.print(); });
      $("#hk-dep").addEventListener("click", function () {
        var ids = hkRows(HKS.d).filter(function (x) { return (x.fd === "check-out" || x.fd === "turnover") && x.h.condition !== "dirty"; }).map(function (x) { return { room_id: x.rm.room_id, condition: "dirty" }; });
        if (!ids.length) { toast("No departures to mark."); return; } hkSave(ids);
      });
      $("#hk-all").addEventListener("change", function () { var on = this.checked; $$("#hk-rows input[data-sel]").forEach(function (c) { c.checked = on; if (on) HKS.sel[c.getAttribute("data-sel")] = 1; else delete HKS.sel[c.getAttribute("data-sel")]; }); hkBulk(); });
      var rows = $("#hk-rows");
      rows.addEventListener("change", function (e) {
        var x = e.target, id = x.closest("tr") && x.closest("tr").getAttribute("data-room"); if (!id) return;
        if (x.matches("[data-sel]")) { if (x.checked) HKS.sel[id] = 1; else delete HKS.sel[id]; hkBulk(); return; }
        if (x.matches("[data-k]")) { var o = { room_id: id }; o[x.getAttribute("data-k")] = x.type === "checkbox" ? x.checked : x.value.trim() || null; if (o.condition === null) o.condition = "clean"; hkSave([o], true).then(function () { toast("Saved · " + ROOM_BY_ID[id].room_name); }); }
      });
      rows.addEventListener("click", function (e) { var a = e.target.closest("[data-open]"); if (a) { e.preventDefault(); openRes(a.getAttribute("data-open")); } });
    },
    draw: function (el) {
      $("#hk-d", el).value = HKS.d;
      var all = hkRows(HKS.d), f = HKS.f;
      var c = function (fn) { return all.filter(fn).length; };
      var S = [["dirty", c(function (x) { return x.h.condition === "dirty"; }), "Dirty", "cond"], ["clean", c(function (x) { return x.h.condition === "clean"; }), "Clean", "cond"], ["inspected", c(function (x) { return x.h.condition === "inspected"; }), "Inspected", "cond"],
        ["check-out", c(function (x) { return x.fd === "check-out" || x.fd === "turnover"; }), "Departures", "fd"], ["arrival", c(function (x) { return x.fd === "arrival" || x.fd === "turnover"; }), "Arrivals", "fd"], ["blocked", c(function (x) { return x.fd === "blocked"; }), "Out of service", "fd"]];
      $("#hk-sum", el).innerHTML = S.map(function (s) { return '<button type="button" data-k="' + s[3] + '" data-v="' + s[0] + '" class="' + (f[s[3]] === s[0] ? "on" : "") + '"><b>' + s[1] + "</b><small>" + s[2] + "</small></button>"; }).join("");
      $$("#hk-sum button", el).forEach(function (b) { b.addEventListener("click", function () { var k = b.getAttribute("data-k"), v = b.getAttribute("data-v"); f[k] = f[k] === v ? "" : v; $("#hk-" + k).value = f[k]; VIEWS.housekeeping.draw(el); }); });
      var rows = all.filter(function (x) {
        if (f.type && x.rm.room_type !== f.type) return false;
        if (f.cond && x.h.condition !== f.cond) return false;
        if (f.fd && !(x.fd === f.fd || (f.fd === "check-out" || f.fd === "arrival") && x.fd === "turnover")) return false;
        if (f.as && (f.as === "-" ? x.h.assigned_to : x.h.assigned_to !== f.as)) return false;
        if (f.q && (x.rm.room_name + " " + (x.cur ? x.cur.guest_name + " " + x.cur.code : "")).toLowerCase().indexOf(f.q) === -1) return false;
        return true;
      });
      $("#hk-cnt", el).textContent = rows.length + " of " + all.length + " beds/rooms · " + fmtDs(HKS.d);
      $("#hk-rows", el).innerHTML = rows.length ? rows.map(function (x) {
        var h = x.h, cur = x.cur, ar = x.arr || (x.fd === "stayover" ? cur : null);
        return '<tr data-room="' + esc(x.rm.room_id) + '"' + (HKS.sel[x.rm.room_id] ? ' class="sel"' : "") + '><td><input type="checkbox" data-sel' + (HKS.sel[x.rm.room_id] ? " checked" : "") + ' aria-label="Select"></td><td class="nw"><b>' + esc(x.rm.room_name) + "</b></td><td>" + esc(typeName(x.rm.room_type)) + "</td>" +
          '<td><select class="sel hk-c c-' + esc(h.condition) + '" data-k="condition" aria-label="Condition"><option value="dirty"' + (h.condition === "dirty" ? " selected" : "") + '>Dirty</option><option value="clean"' + (h.condition === "clean" ? " selected" : "") + '>Clean</option><option value="inspected"' + (h.condition === "inspected" ? " selected" : "") + ">Inspected</option></select></td>" +
          "<td>" + (x.block ? '<span class="muted">' + esc(x.block.reason || "Blocked") + "</span>" : x.occupied ? "<b>Occupied</b>" : '<span class="muted">Vacant</span>') + "</td>" +
          "<td>" + esc(x.arr && x.arr.arrival_time || "") + "</td>" +
          '<td class="nw">' + (ar ? '<a href="#" data-open="' + ar.id + '">' + esc(fmtDs(ar.checkin)) + "</a><small>" + esc(ar.guest_name) + "</small>" : "") + "</td>" +
          '<td class="nw">' + (cur ? esc(fmtDs((x.dep || cur).checkout)) + (x.dep && x.dep !== ar ? "<small>" + esc(x.dep.guest_name) + "</small>" : "") : "") + "</td>" +
          '<td><span class="fd ' + x.fd + '">' + FD_L[x.fd] + "</span></td>" +
          '<td><input class="inp hk-as" data-k="assigned_to" list="hk-staff" value="' + esc(h.assigned_to || "") + '" placeholder="—" aria-label="Assigned to"></td>' +
          '<td><label class="switch"><input type="checkbox" data-k="dnd"' + (h.dnd ? " checked" : "") + ' aria-label="Do not disturb"><span></span></label></td>' +
          '<td><input class="inp hk-note" data-k="note" value="' + esc(h.note || "") + '" placeholder="Add note…" maxlength="300" aria-label="Notes"></td></tr>';
      }).join("") : '<tr class="empty"><td colspan="12">' + (ROOMS.length ? "No beds/rooms match the filters." : "The bed/room list comes from Cloudbeds and hasn't synced yet.") + "</td></tr>";
      hkBulk();
    }
  };
  function hkBulk() {
    var ids = Object.keys(HKS.sel), bar = $("#hk-bulk"); if (!bar) return;
    bar.hidden = !ids.length; if (!ids.length) return;
    bar.innerHTML = "<b>" + ids.length + ' selected</b><button class="btn xs" type="button" data-c="clean">Mark clean</button><button class="btn xs ghost" type="button" data-c="dirty">Mark dirty</button><button class="btn xs ghost" type="button" data-c="inspected">Mark inspected</button><input class="inp" id="hk-bas" list="hk-staff" placeholder="Assign to…" style="width:160px;height:28px"><button class="btn xs ghost" type="button" data-c="assign">Assign</button><button class="btn xs link" type="button" data-c="clear">Clear</button>';
    $$("[data-c]", bar).forEach(function (b) {
      b.addEventListener("click", function () {
        var c = b.getAttribute("data-c");
        if (c === "clear") { HKS.sel = {}; VIEWS.housekeeping.draw($("#v-housekeeping")); return; }
        var rows = ids.map(function (id) { return c === "assign" ? { room_id: id, assigned_to: $("#hk-bas").value.trim() || null } : { room_id: id, condition: c }; });
        HKS.sel = {}; hkSave(rows);
      });
    });
  }

  /* ================= Reporting ================= */
  var RP = { from: null, to: null };
  VIEWS.reports = {
    title: "Reporting",
    build: function (el) {
      RP.from = RP.from || TODAY.slice(0, 8) + "01"; RP.to = RP.to || addDays(addDays(RP.from, 32).slice(0, 8) + "01", -1);
      el.innerHTML = '<div class="ph"><h1>Reporting</h1><span class="cnt">Stay-night basis, all channels</span><span class="sp"></span><label class="small">From <input class="inp" type="date" id="rp-f" style="width:auto"></label><label class="small">To <input class="inp" type="date" id="rp-t" style="width:auto"></label><button class="btn ghost sm" type="button" data-p="m0">This month</button><button class="btn ghost sm" type="button" data-p="m1">Last month</button><button class="btn ghost sm" type="button" data-p="n30">Next 30 days</button><button class="btn ghost" type="button" id="rp-csv">' + ic("down") + 'Daily CSV</button></div><div id="rp-b"></div>';
      var redo = function () { VIEWS.reports.draw(el); };
      $("#rp-f").addEventListener("change", function () { RP.from = this.value; redo(); });
      $("#rp-t").addEventListener("change", function () { RP.to = this.value; redo(); });
      $$("[data-p]", el).forEach(function (b) { b.addEventListener("click", function () { var p = b.getAttribute("data-p"), m0 = TODAY.slice(0, 8) + "01"; if (p === "m0") { RP.from = m0; RP.to = addDays(addDays(m0, 32).slice(0, 8) + "01", -1); } else if (p === "m1") { RP.to = addDays(m0, -1); RP.from = RP.to.slice(0, 8) + "01"; } else { RP.from = TODAY; RP.to = addDays(TODAY, 29); } redo(); }); });
      $("#rp-csv").addEventListener("click", function () {
        var s = stats(RP.from, diffDays(RP.from, RP.to) + 1), lines = ["Date,Booked units,Available units,Blocked,Occupancy %,Room revenue,ADR,RevPAR"].concat(s.map(function (x) { return [x.d, x.units, x.avail, x.blocked, Math.round(x.occ * 1000) / 10, Math.round(x.rev * 100) / 100, Math.round(x.adr * 100) / 100, Math.round(x.revpar * 100) / 100].join(","); }));
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "z-daily-" + RP.from + "-" + RP.to + ".csv"; document.body.appendChild(a); a.click(); a.remove();
      });
    },
    draw: function (el) {
      $("#rp-f", el).value = RP.from; $("#rp-t", el).value = RP.to;
      if (!RP.from || !RP.to || RP.to < RP.from) { $("#rp-b", el).innerHTML = '<div class="card card-b muted">Pick a date range.</div>'; return; }
      var days = Math.min(diffDays(RP.from, RP.to) + 1, 400), s = stats(RP.from, days), end = addDays(RP.from, days);
      var u = 0, rev = 0, av = 0; s.forEach(function (x) { u += x.units; rev += x.rev; av += x.avail; });
      var made = ROWS.filter(function (r) { var c = manila(new Date(r.created_at)); return c >= RP.from && c < end && r.status !== "expired"; });
      var canc = made.filter(function (r) { return r.status === "cancelled" || r.status === "no_show"; });
      var src = {}, typ = {}, who = {};
      ROWS.forEach(function (r) {
        if (!OCC[r.status]) return;
        var a = r.checkin > RP.from ? r.checkin : RP.from, b = r.checkout < end ? r.checkout : end, n = diffDays(a, b); if (n <= 0) return;
        var rv = nightRevenue(r) * n, k = sourceOf(r) || "—";
        src[k] = src[k] || { b: 0, n: 0, rev: 0 }; src[k].b++; src[k].n += n * units(r); src[k].rev += rv;
        var tu = units(r);
        (r.items || []).forEach(function (i) { var t = typeName(i.room_type); typ[t] = typ[t] || { n: 0, rev: 0 }; typ[t].n += n * i.units; typ[t].rev += rv * i.units / tu; });
      });
      made.forEach(function (r) { if (r.cb_owned) return; var k = staffName(r.booked_by); who[k] = who[k] || { b: 0, v: 0 }; who[k].b++; who[k].v += +r.total || 0; });
      var tbl = function (title, head, obj, cols, sortKey) {
        var keys = Object.keys(obj).sort(function (a, b) { return obj[b][sortKey] - obj[a][sortKey]; }), max = keys.length ? obj[keys[0]][sortKey] || 1 : 1;
        return '<div class="card"><div class="card-h"><h2>' + title + '</h2></div><div class="tw"><table class="t"><thead><tr><th>' + head.join('</th><th class="num">') + "</th><th></th></tr></thead><tbody>" + (keys.length ? keys.map(function (k) { return "<tr><td>" + esc(k) + "</td>" + cols.map(function (c) { return '<td class="num">' + c(obj[k]) + "</td>"; }).join("") + '<td style="width:30%"><div class="hbar" style="width:' + Math.round(obj[k][sortKey] / max * 100) + '%"></div></td></tr>'; }).join("") : '<tr class="empty"><td colspan="' + (head.length + 1) + '">No data.</td></tr>') + "</tbody></table></div></div>";
      };
      $("#rp-b", el).innerHTML = '<div class="card" style="margin-bottom:16px"><div class="rp-k"><div><b>' + (av ? Math.round(u / av * 1000) / 10 : 0) + "%</b><small>Occupancy</small></div><div><b>" + peso(u ? rev / u : 0) + "</b><small>ADR</small></div><div><b>" + peso(av ? rev / av : 0) + "</b><small>RevPAR</small></div><div><b>" + peso(Math.round(rev)) + "</b><small>Room revenue</small></div><div><b>" + made.length + "</b><small>Bookings made</small></div><div><b>" + canc.length + "</b><small>Canceled / no-show (of those)</small></div></div></div>" +
        '<div class="rp">' + tbl("By source", ["Source", "Bookings", "Room/bed-nights", "Revenue"], src, [function (x) { return x.b; }, function (x) { return x.n; }, function (x) { return peso(Math.round(x.rev)); }], "rev") +
        tbl("By room type", ["Room type", "Room/bed-nights", "Revenue"], typ, [function (x) { return x.n; }, function (x) { return peso(Math.round(x.rev)); }], "rev") +
        tbl("Bookings made by (website & desk)", ["Booked by", "Bookings", "Value"], who, [function (x) { return x.b; }, function (x) { return peso(Math.round(x.v)); }], "v") +
        '<div class="card"><div class="card-h"><h2>Occupancy by night</h2></div><div class="fc-bars" style="height:140px;padding-top:12px">' + s.map(function (x) { var w = parse(x.d).getDay(); return '<div class="' + (w === 5 || w === 6 ? "we" : "") + '" title="' + esc(fmtDs(x.d)) + ": " + Math.round(x.occ * 100) + '%"><i style="height:' + Math.max(2, Math.round(x.occ * 100)) + '%"></i></div>'; }).join("") + '</div><div class="fc-x">' + s.map(function (x, i) { return "<span>" + (days <= 31 || i % 7 === 0 ? parse(x.d).getDate() : "") + "</span>"; }).join("") + '</div><p class="small muted" style="padding:8px 16px 14px;margin:0">Orange = Friday & Saturday nights.</p></div></div>';
    }
  };

  /* ================= Activity log ================= */
  VIEWS.activity = {
    title: "Activity log",
    build: function (el) {
      el.innerHTML = '<div class="ph"><h1>Activity log</h1><span class="cnt">Every reservation created, edited, paid or emailed — recorded automatically, nobody can edit it</span></div>' +
        '<div class="card"><div class="cal-tb"><select class="sel" id="al-s"><option value="">Anyone</option><option value="website">Website</option><option value="guest">Guest</option><option value="system">System</option>' + STAFF.map(function (s) { return '<option value="' + esc(s.email) + '">' + esc(s.name || s.email) + "</option>"; }).join("") + '</select><label class="small">From <input class="inp" type="date" id="al-f"></label><label class="small">To <input class="inp" type="date" id="al-t"></label><button class="btn ghost sm" type="button" id="al-r">Refresh</button></div>' +
        '<div class="tw"><table class="t"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Reservation</th><th>Details</th></tr></thead><tbody id="al-rows"></tbody></table></div><p class="muted small" style="padding:10px 16px;margin:0">Most recent 300 entries for these filters.</p></div>';
      ["#al-s", "#al-f", "#al-t"].forEach(function (s) { $(s).addEventListener("change", function () { VIEWS.activity.draw(el); }); });
      $("#al-r").addEventListener("click", function () { VIEWS.activity.draw(el); });
      $("#al-rows").addEventListener("click", function (e) { var a = e.target.closest("[data-open]"); if (a) openRes(a.getAttribute("data-open")); });
    },
    draw: function (el) {
      var q = sb.from("booking_log").select("id,at,actor,action,detail,booking_id,bookings(code,guest_name)").order("at", { ascending: false }).limit(300);
      if ($("#al-s").value) q = q.eq("actor", $("#al-s").value);
      if ($("#al-f").value) q = q.gte("at", $("#al-f").value + "T00:00:00+08:00");
      if ($("#al-t").value) q = q.lte("at", $("#al-t").value + "T23:59:59+08:00");
      q.then(function (res) {
        var list = must(res) || [];
        $("#al-rows").innerHTML = list.length ? list.map(function (e) { return '<tr><td class="nw">' + esc(fmtDT(e.at)) + "</td><td>" + esc(staffName(e.actor)) + "</td><td>" + esc(e.action) + "</td><td>" + (e.bookings ? '<a href="#" class="code" data-open="' + esc(e.booking_id) + '" onclick="return false">' + esc(e.bookings.code) + "</a><small>" + esc(e.bookings.guest_name) + "</small>" : "") + "</td><td>" + describe(e) + "</td></tr>"; }).join("") : '<tr class="empty"><td colspan="5">Nothing logged for these filters.</td></tr>';
      }).catch(fail);
    }
  };

  /* ================= Team activity ================= */
  VIEWS.team = {
    title: "Team activity",
    build: function (el) {
      el.innerHTML = '<div class="ph"><h1>Team activity</h1><span class="cnt">“Last active” is the last time someone actually used this desk</span><span class="sp"></span><a class="btn ghost" href="/admin/">Add / remove staff</a></div><div class="card"><div class="tw"><table class="t"><thead><tr><th>Staff</th><th>Role</th><th>Last active</th><th>Last signed in</th><th>Last booking change</th><th class="num">Days used (30 d)</th><th class="num">Changes (30 d)</th></tr></thead><tbody id="tm-rows"></tbody></table></div></div>';
    },
    draw: function () {
      sb.rpc("team_activity", { p_days: 30 }).then(must).then(function (list) {
        $("#tm-rows").innerHTML = (list || []).map(function (s) { return "<tr><td><b>" + esc(s.name || s.email) + "</b><small>" + esc(s.email) + "</small></td><td>" + esc(s.role) + "</td><td>" + (s.last_active ? esc(ago(s.last_active)) : "—") + "</td><td>" + (s.last_signin ? esc(fmtDT(s.last_signin)) : "—") + "</td><td>" + (s.last_change ? esc(fmtDT(s.last_change)) : "—") + '</td><td class="num">' + s.days_used + '</td><td class="num">' + s.changes + "</td></tr>"; }).join("") || '<tr class="empty"><td colspan="7">No staff yet.</td></tr>';
      }).catch(fail);
    }
  };

  /* ================= Payment settings ================= */
  function acctRow(a) {
    return '<div class="grid g4 acct" style="grid-template-columns:1fr 1fr 1fr 1fr auto;align-items:center;margin-bottom:8px"><input class="inp" placeholder="GCash / BPI / BDO…" value="' + esc(a.label || "") + '" data-k="label" aria-label="Bank or e-wallet"><input class="inp" placeholder="Account name" value="' + esc(a.name || "") + '" data-k="name" aria-label="Account name"><input class="inp" placeholder="Account / mobile number" value="' + esc(a.number || "") + '" data-k="number" aria-label="Account number"><input class="inp" placeholder="Note (optional)" value="' + esc(a.note || "") + '" data-k="note" aria-label="Note"><button class="ib" type="button" aria-label="Remove account" data-rm>' + ic("x") + "</button></div>";
  }
  VIEWS.settings = {
    title: "Payment settings", noAuto: true,
    build: function (el) {
      el.innerHTML = '<div class="ph"><h1>Payment settings</h1><span class="cnt">What guests see when they pay ahead</span></div><form class="card" id="ms-form" novalidate><div class="card-h"><h2>Accounts guests transfer to</h2><span class="sp"></span><button class="btn ghost sm" type="button" id="ms-add">' + ic("plus") + 'Add account</button></div><div class="card-b"><div id="ms-accts"></div>' +
        '<div class="grid g3" style="margin-top:16px"><div class="fld"><label for="ms-rate">Pay-ahead discount (%)</label><input class="inp" id="ms-rate" type="number" min="0" max="50" step="0.5"></div><div class="fld"><label for="ms-hold">Hold (minutes)</label><input class="inp" id="ms-hold" type="number" min="15" max="1440" step="5"></div><div class="fld"><label for="ms-cut">Proof due before check-in (hours)</label><input class="inp" id="ms-cut" type="number" min="0" max="168"></div></div>' +
        '<div class="fld" style="margin-top:14px"><label for="ms-alerts">Staff alert emails (comma-separated)</label><input class="inp" id="ms-alerts"></div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;align-items:center"><p class="msg" id="ms-msg" role="alert"></p><button class="btn" type="submit">Save settings</button></div></div></form>';
      var s = CAT.settings;
      $("#ms-accts").innerHTML = (s.pay_accounts && s.pay_accounts.length ? s.pay_accounts : [{}]).map(acctRow).join("");
      $("#ms-rate").value = s.transfer_discount_rate != null ? Math.round(s.transfer_discount_rate * 1000) / 10 : 5;
      $("#ms-hold").value = s.hold_minutes || 120; $("#ms-cut").value = s.transfer_cutoff_hours != null ? s.transfer_cutoff_hours : 24; $("#ms-alerts").value = s.staff_alert_emails || "";
      $("#ms-add").addEventListener("click", function () { $("#ms-accts").insertAdjacentHTML("beforeend", acctRow({})); });
      $("#ms-accts").addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (b) b.closest(".acct").remove(); });
      $("#ms-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var accts = $$(".acct", $("#ms-accts")).map(function (row) { var o = {}; $$("input", row).forEach(function (i) { if (i.value.trim()) o[i.getAttribute("data-k")] = i.value.trim(); }); return o; }).filter(function (o) { return o.label || o.number; });
        var patch = { pay_accounts: accts, transfer_discount_rate: Math.max(0, Math.min(50, +$("#ms-rate").value || 0)) / 100, hold_minutes: Math.max(15, +$("#ms-hold").value || 120), transfer_cutoff_hours: Math.max(0, +$("#ms-cut").value || 0), staff_alert_emails: $("#ms-alerts").value.trim() || "ai@zhostel.com" };
        sb.from("booking_settings").update(patch).eq("id", 1).select().then(function (res) {
          var d = must(res); if (!d || !d.length) throw new Error("Not saved: only signed-in staff can change settings.");
          CAT.settings = d[0]; $("#ms-msg").className = "msg ok"; $("#ms-msg").textContent = "Saved. New bookings use these straight away."; alerts();
        }).catch(function (err) { $("#ms-msg").className = "msg err"; $("#ms-msg").textContent = err.message; });
      });
    }
  };
})();
