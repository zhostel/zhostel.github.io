/* Z Reservations — the staff desk (/staff/).
   Modeled on the Virgin Beach Resort staff dashboard: quick filters, one table of every booking
   (website, staff-made and Cloudbeds/OTA), a booking window that creates and edits with the same
   live availability as the website, payment verification, calendar, activity log and team activity.
   All writes go through security-definer functions that check the staff list (is_staff()). */
(function () {
  "use strict";
  var CFG = window.Z_CONFIG || {};
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" } });
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function peso(n) { n = Number(n || 0); return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function manila(d) { return (d || new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); }
  function parse(s) { var p = String(s || "").slice(0, 10).split("-"); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function fmtD(s) { var d = parse(s); return d ? d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" }) : ""; }
  function fmtDY(s) { var d = parse(s); return d ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : ""; }
  function fmtDT(t) { return t ? new Date(t).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""; }
  function ago(t) { var m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; }
  function left(t) { var s = Math.round((new Date(t).getTime() - Date.now()) / 1000); if (s <= 0) return "hold ended"; var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + "h " : "") + m + "m left"; }
  var TODAY = manila();
  var toastT;
  function toast(msg, err) { var t = $("#toast"); t.textContent = msg; t.className = "sd-toast" + (err ? " err" : ""); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, err ? 6000 : 3000); }
  function fail(e) { toast((e && (e.message || e.error_description || e.hint)) || String(e), true); }
  function must(r) { if (r && r.error) throw r.error; return r ? r.data : null; }

  var STATUS = [
    ["pending", "Awaiting payment"], ["pending_payment", "Payment to verify"], ["confirmed", "Confirmed"], ["checked_in", "Checked in"],
    ["checked_out", "Checked out"], ["cancelled", "Cancelled"], ["no_show", "No-show"], ["expired", "Hold ended"]];
  var STATUS_L = {}; STATUS.forEach(function (s) { STATUS_L[s[0]] = s[1]; });
  var ACTIVE = { pending: 1, pending_payment: 1, confirmed: 1, checked_in: 1 };
  var SOURCES = [["walk-in", "Walk-in"], ["phone", "Phone call"], ["messenger", "Messenger"], ["email", "Email"], ["instagram", "Instagram"], ["website", "Website"],
    ["group", "Group / event"], ["agency", "Travel agency"], ["returnee", "Returning guest"], ["staff-stay", "Staff / friend stay"], ["other", "Other"]];
  var SOURCE_L = { cloudbeds: "Cloudbeds" }; SOURCES.forEach(function (s) { SOURCE_L[s[0]] = s[1]; });
  var PAYM = { desk: "Pay at check-in", transfer: "Pay ahead" };
  var METHOD = { transfer: "Bank transfer", gcash: "GCash", maya: "Maya", cash: "Cash", card: "Card", other: "Other", bank: "Bank" };

  var ME = null, ROWS = [], CAT = { types: [], plans: [], addons: [], settings: {} }, STAFF = [];
  var PILL = "upcoming", SORT = { f: "created_at", dir: -1 };
  var qs0 = new URLSearchParams(location.search);

  /* ================= auth ================= */
  var lf = $("#login-form"), lm = $(".form-msg", lf);
  lf.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("#l-email").value.trim().toLowerCase(), pass = $("#l-pass").value;
    if (!email) return;
    if (!pass) { lm.className = "form-msg err"; lm.textContent = "Enter your password, or use the sign-in link."; return; }
    lm.className = "form-msg"; lm.textContent = "Signing in…";
    sb.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
      if (r.error) throw new Error(/invalid/i.test(r.error.message) ? "Wrong email or password." : r.error.message);
      lm.textContent = "";
    }).catch(function (err) { lm.className = "form-msg err"; lm.textContent = err.message; });
  });
  $("#l-link").addEventListener("click", function () {
    var email = $("#l-email").value.trim().toLowerCase();
    if (!email) { lm.className = "form-msg err"; lm.textContent = "Enter your staff email first."; return; }
    lm.className = "form-msg"; lm.textContent = "Checking…";
    sb.rpc("staff_can_login", { p_email: email }).then(function (r) {
      if (r.error) throw r.error;
      if (!r.data) throw new Error("That email isn't on the staff list. Ask the owner to add you in Admin → Staff.");
      return sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + "/staff/", shouldCreateUser: true } });
    }).then(function (r) {
      if (r && r.error) throw r.error;
      lm.className = "form-msg ok"; lm.textContent = "Check your inbox for the sign-in link (it can take a minute).";
    }).catch(function (err) { lm.className = "form-msg err"; lm.textContent = err.message; });
  });
  $("#logout").addEventListener("click", function () { sb.auth.signOut().then(function () { location.href = "/staff/"; }); });

  var booted = false;
  sb.auth.onAuthStateChange(function (_e, s) { boot(s); });
  sb.auth.getSession().then(function (r) { boot(r.data.session); });
  function boot(session) {
    if (!session) { $("#login").hidden = false; $("#app").hidden = true; $("#sd-links").hidden = true; return; }
    if (booted) return; booted = true;
    ME = session.user.email.toLowerCase();
    if (location.hash.indexOf("access_token") > -1) history.replaceState(null, "", location.pathname + location.search);
    sb.rpc("staff_can_login", { p_email: ME }).then(function (r) {
      if (!r.data) { $("#login").hidden = false; lm.className = "form-msg err"; lm.textContent = ME + " isn't on the staff list. Ask the owner to add you, then sign in again."; sb.auth.signOut(); booted = false; return; }
      $("#login").hidden = true; $("#app").hidden = false; $("#sd-links").hidden = false; $("#who").textContent = ME;
      try { if (!sessionStorage.getItem("z.signin")) { sessionStorage.setItem("z.signin", "1"); sb.rpc("staff_ping", { p_kind: "signin" }); } } catch (e) {}
      init();
    });
  }
  // "last active" = real use of the desk, at most one ping per 5 minutes (the database throttles too)
  var lastPing = 0;
  ["click", "keydown"].forEach(function (ev) { document.addEventListener(ev, function () { if (!ME || Date.now() - lastPing < 120000) return; lastPing = Date.now(); sb.rpc("staff_ping", { p_kind: "use" }).then(function () {}); }, true); });

  /* ================= data ================= */
  function init() {
    fillStatic();
    Promise.all([
      sb.from("room_types").select("*").order("sort"), sb.from("rate_plans").select("*").order("sort"),
      sb.from("addons").select("*").order("sort"), sb.from("booking_settings").select("*").eq("id", 1), sb.from("staff").select("*")
    ]).then(function (rs) {
      CAT.types = must(rs[0]) || []; CAT.plans = must(rs[1]) || []; CAT.addons = must(rs[2]) || []; CAT.settings = (must(rs[3]) || [])[0] || {}; STAFF = must(rs[4]) || [];
      return refresh();
    }).catch(fail);
    setInterval(function () { if (!$$(".sd-modal:not([hidden])").length && document.visibilityState === "visible") refresh(true); }, 60000);
    setInterval(function () { $$("[data-hold]").forEach(function (el) { el.textContent = left(el.getAttribute("data-hold")); el.classList.toggle("late", new Date(el.getAttribute("data-hold")) < new Date()); }); }, 30000);
  }
  function refresh(quiet) {
    TODAY = manila();
    return sb.rpc("staff_bookings", { p_from: null, p_limit: 5000 }).then(function (r) {
      ROWS = must(r) || [];
      fillDynamic(); render(); alerts();
    }).catch(function (e) { if (!quiet) fail(e); });
  }
  function staffName(email) {
    if (!email) return "—";
    if (email === "website") return "Website"; if (email === "cloudbeds") return "Cloudbeds"; if (email === "guest") return "Guest";
    var s = STAFF.filter(function (x) { return String(x.email).toLowerCase() === String(email).toLowerCase(); })[0];
    return s && s.name ? s.name : String(email).split("@")[0];
  }
  function planBy(id) { return CAT.plans.filter(function (p) { return p.id === id; })[0]; }
  function typeBy(slug) { return CAT.types.filter(function (t) { return t.slug === slug; })[0]; }
  function itemsText(r) {
    if (r.cb_owned && r.cb_rooms && r.cb_rooms.length) {
      var byType = (r.items || []).map(function (i) { var t = typeBy(i.room_type); return i.units + "× " + (t ? t.name : i.room_type); }).join(", ");
      return (byType ? byType + " · " : "") + r.cb_rooms.join(", ");
    }
    return (r.items || []).map(function (i) { var t = typeBy(i.room_type), p = planBy(i.rate_plan); return i.units + "× " + (t ? t.name : i.room_type) + (p ? " · " + p.name : ""); }).join("<br>") || "—";
  }
  function balance(r) { return Math.max(Number(r.total) - Number(r.amount_paid), 0); }

  /* ================= filters ================= */
  function fillStatic() {
    $("#f-status").innerHTML = '<option value="">All statuses</option>' + STATUS.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("");
    if (qs0.get("q")) $("#f-q").value = qs0.get("q");
    ["#f-field", "#f-from", "#f-to", "#f-status", "#f-pay", "#f-source", "#f-by", "#f-cb"].forEach(function (s) { $(s).addEventListener("change", render); });
    var t; $("#f-q").addEventListener("input", function () { clearTimeout(t); t = setTimeout(render, 150); });
    $("#f-clear").addEventListener("click", function () { ["#f-from", "#f-to", "#f-status", "#f-pay", "#f-source", "#f-by", "#f-q"].forEach(function (s) { $(s).value = ""; }); $("#f-cb").checked = true; PILL = "upcoming"; render(); });
    $$("#table th[data-sort]").forEach(function (th) {
      th.addEventListener("click", function () { var f = th.getAttribute("data-sort"); SORT = { f: f, dir: SORT.f === f ? -SORT.dir : (f === "created_at" ? -1 : 1) }; render(); });
    });
    $("#b-new").addEventListener("click", function () { openBook(null); });
    $("#b-csv").addEventListener("click", exportCsv);
    $$("[data-open]").forEach(function (b) { b.addEventListener("click", function () { ({ cal: openCal, log: function () { openLog(null); }, team: openTeam, settings: openSettings })[b.getAttribute("data-open")](); }); });
    $$(".sd-modal").forEach(function (m) {
      m.addEventListener("click", function (e) { if (e.target === m) closeModal(m); });
      $$("[data-close]", m).forEach(function (b) { b.addEventListener("click", function () { closeModal(m); }); });
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { var open = $$(".sd-modal:not([hidden])").pop(); if (open && !document.querySelector(".zdr-pop:not([hidden])")) closeModal(open); } });
  }
  function fillDynamic() {
    var srcs = {}, bys = {};
    ROWS.forEach(function (r) { srcs[r.cb_owned ? (r.cb_source || "Cloudbeds") : r.source] = 1; bys[r.booked_by || ""] = 1; });
    var keep = function (sel, html) { var v = $(sel).value; $(sel).innerHTML = html; $(sel).value = v; };
    keep("#f-source", '<option value="">All sources</option>' + Object.keys(srcs).sort().map(function (s) { return '<option value="' + esc(s) + '">' + esc(SOURCE_L[s] || s) + "</option>"; }).join(""));
    keep("#f-by", '<option value="">Anyone</option>' + Object.keys(bys).filter(Boolean).sort().map(function (s) { return '<option value="' + esc(s) + '">' + esc(staffName(s)) + "</option>"; }).join(""));
  }
  var PILLS = [
    ["upcoming", "Upcoming", function (r) { return ACTIVE[r.status] && r.checkout >= TODAY; }],
    ["arrivals", "Arrivals today", function (r) { return ACTIVE[r.status] && r.checkin === TODAY; }],
    ["inhouse", "In-house", function (r) { return (r.status === "confirmed" || r.status === "checked_in") && r.checkin <= TODAY && r.checkout > TODAY; }],
    ["departures", "Departures today", function (r) { return (r.status === "confirmed" || r.status === "checked_in" || r.status === "checked_out") && r.checkout === TODAY; }],
    ["verify", "To verify", function (r) { return r.proofs_to_check > 0; }, true],
    ["holds", "Awaiting payment", function (r) { return r.status === "pending"; }, true],
    ["unpaid", "Unpaid", function (r) { return ACTIVE[r.status] && !r.cb_owned && balance(r) > 0.5 && r.checkout >= TODAY; }],
    ["website", "Website", function (r) { return r.source === "website" && !r.cb_owned; }],
    ["closed", "Cancelled / ended", function (r) { return r.status === "cancelled" || r.status === "expired" || r.status === "no_show"; }],
    ["all", "All", function () { return true; }]];
  function renderPills(base) {
    $("#pills").innerHTML = PILLS.map(function (p) {
      var n = base.filter(p[2]).length;
      return '<button type="button" role="tab" data-p="' + p[0] + '" aria-selected="' + (PILL === p[0]) + '"' + (p[3] && n ? ' class="alert"' : "") + ">" + p[1] + '<span class="n">' + n + "</span></button>";
    }).join("");
    $$("#pills button").forEach(function (b) { b.addEventListener("click", function () { PILL = b.getAttribute("data-p"); render(); }); });
  }
  function filtered() {
    var f = { field: $("#f-field").value, from: $("#f-from").value, to: $("#f-to").value, st: $("#f-status").value, pay: $("#f-pay").value, src: $("#f-source").value, by: $("#f-by").value, cb: $("#f-cb").checked, q: $("#f-q").value.trim().toLowerCase() };
    var base = ROWS.filter(function (r) {
      if (!f.cb && r.cb_owned) return false;
      if (f.from || f.to) {
        var a = f.field === "created" ? manila(new Date(r.created_at)) : r.checkin, b = f.field === "stay" ? addDays(r.checkout, -1) : a;
        if (f.from && b < f.from) return false; if (f.to && a > f.to) return false;
      }
      if (f.st && r.status !== f.st) return false;
      if (f.pay && !(f.pay === r.pay_method && !r.cb_owned || f.pay === r.payment_status)) return false;
      if (f.src && (r.cb_owned ? (r.cb_source || "Cloudbeds") : r.source) !== f.src) return false;
      if (f.by && r.booked_by !== f.by) return false;
      if (f.q) {
        var hay = [r.code, r.guest_name, r.guest_email, r.guest_phone, r.ota_ref, r.cb_reservation_id, r.notes, r.staff_notes, (r.cb_rooms || []).join(" ")].join(" ").toLowerCase();
        if (f.q.split(/\s+/).some(function (w) { return hay.indexOf(w) === -1; })) return false;
      }
      return true;
    });
    return { base: base, rows: base.filter((PILLS.filter(function (p) { return p[0] === PILL; })[0] || PILLS[0])[2]) };
  }
  function sortRows(rows) {
    var f = SORT.f, d = SORT.dir;
    if (PILL === "upcoming" && f === "created_at" && d === -1 && !$("#f-q").value) { f = "checkin"; d = 1; }
    return rows.slice().sort(function (a, b) {
      var x = a[f], y = b[f]; if (typeof x === "string" || typeof y === "string") { x = String(x || "").toLowerCase(); y = String(y || "").toLowerCase(); } else { x = Number(x || 0); y = Number(y || 0); }
      return x < y ? -d : x > y ? d : (a.created_at < b.created_at ? 1 : -1);
    });
  }

  /* ================= table ================= */
  function render() {
    var fr = filtered(); renderPills(fr.base);
    var rows = sortRows(fr.rows);
    $$("#table th[data-sort]").forEach(function (th) { th.classList.toggle("on", th.getAttribute("data-sort") === SORT.f); th.classList.toggle("asc", SORT.dir === 1); });
    var g = 0, tot = 0, paid = 0, nights = 0;
    rows.forEach(function (r) { if (ACTIVE[r.status] || r.status === "checked_out") { g += +r.guests || 0; tot += +r.total || 0; paid += +r.amount_paid || 0; nights += (+r.nights || 0) * (+r.guests || 0); } });
    $("#summary").innerHTML = "<span><b>" + rows.length + "</b> booking" + (rows.length === 1 ? "" : "s") + "</span><span><b>" + g + "</b> guests</span><span><b>" + nights + "</b> guest-nights</span><span>Value <b>" + peso(tot) + "</b></span><span>Paid <b>" + peso(paid) + "</b></span><span>Balance <b>" + peso(Math.max(tot - paid, 0)) + "</b></span>";
    if (!rows.length) { $("#rows").innerHTML = '<tr><td colspan="14" class="muted" style="padding:30px;text-align:center">No bookings match. Try “All” or clear the filters.</td></tr>'; return; }
    $("#rows").innerHTML = rows.slice(0, 800).map(rowHtml).join("") + (rows.length > 800 ? '<tr><td colspan="14" class="muted">Showing the first 800, narrow the filters to see the rest.</td></tr>' : "");
    wireRows();
  }
  function statusCell(r) {
    if (r.cb_owned) return '<span class="tagx t-' + esc(r.status) + '">' + esc(STATUS_L[r.status] || r.status) + '</span><small>in Cloudbeds</small>';
    return '<select class="st t-' + esc(r.status) + '" data-st="' + r.id + '" aria-label="Status">' + STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === r.status ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + "</select>";
  }
  function payCell(r) {
    var h = '<span class="tagx t-' + esc(r.payment_status) + '">' + esc({ unpaid: "Unpaid", partial: "Part-paid", paid: "Paid", refunded: "Refunded" }[r.payment_status] || r.payment_status) + "</span>";
    if (!r.cb_owned) h += "<small>" + esc(PAYM[r.pay_method] || "") + (+r.amount_paid > 0 && balance(r) > 0.5 ? " · bal " + peso(balance(r)) : "") + "</small>";
    if (r.status === "pending" && r.hold_until) h += '<span class="hold-left" data-hold="' + esc(r.hold_until) + '">' + left(r.hold_until) + "</span>";
    if (r.proofs_to_check > 0) h += '<br><button class="tagx t-verify" type="button" data-pay="' + r.id + '">Verify payment' + (r.proofs_to_check > 1 ? " (" + r.proofs_to_check + ")" : "") + "</button>";
    return h;
  }
  function rowHtml(r) {
    var disc = (+r.transfer_discount > 0 ? "5% pay-ahead" : "") + (+r.discount_amount > 0 ? (r.transfer_discount > 0 ? " + " : "") + "disc. " + peso(r.discount_amount) : "");
    return '<tr class="' + (r.checkin === TODAY && ACTIVE[r.status] ? "today " : "") + (r.cb_owned ? "cb" : "") + '">' +
      '<td class="code"><button type="button" data-view="' + r.id + '">' + esc(r.code) + "</button>" + (r.cb_owned ? '<small><span class="tagx t-cb">Cloudbeds</span></small>' : "") + (r.ota_ref ? "<small>" + esc(r.ota_ref) + "</small>" : "") + "</td>" +
      "<td><b>" + esc(r.guest_name) + "</b>" + (r.country ? "<small>" + esc(r.country) + "</small>" : "") + "</td>" +
      "<td>" + (r.guest_phone ? '<a href="tel:' + esc(r.guest_phone) + '">' + esc(r.guest_phone) + "</a>" : "") + (r.guest_email ? '<small><a href="mailto:' + esc(r.guest_email) + '">' + esc(r.guest_email) + "</a></small>" : "") + "</td>" +
      '<td style="white-space:nowrap">' + esc(fmtD(r.checkin)) + " →<br>" + esc(fmtD(r.checkout)) + "<small>" + r.nights + " night" + (r.nights === 1 ? "" : "s") + (r.arrival_time ? " · " + esc(r.arrival_time) : "") + "</small></td>" +
      "<td>" + itemsText(r) + "</td>" +
      '<td class="num">' + (r.guests || "") + "</td>" +
      '<td class="num"><b>' + peso(r.total) + "</b>" + (disc ? "<small>" + esc(disc) + "</small>" : "") + "</td>" +
      "<td>" + statusCell(r) + "</td><td>" + payCell(r) + "</td>" +
      "<td>" + esc(r.cb_owned ? (r.cb_source || "Cloudbeds") : (SOURCE_L[r.source] || r.source)) + "</td>" +
      "<td>" + esc(staffName(r.booked_by)) + "</td>" +
      '<td><textarea class="sn" data-sn="' + r.id + '" aria-label="Staff notes" placeholder="Add note…">' + esc(r.staff_notes || "") + "</textarea>" + (r.notes ? '<small title="Guest request">Guest: ' + esc(r.notes) + "</small>" : "") + "</td>" +
      '<td style="white-space:nowrap">' + esc(fmtDT(r.created_at)) + "</td>" +
      '<td class="acts"><button type="button" data-view="' + r.id + '">Open</button>' + (r.cb_owned ? "" : '<button type="button" data-edit="' + r.id + '">Edit</button><button type="button" data-pay="' + r.id + '">₱</button>') + '<button type="button" data-log="' + r.id + '">Log</button></td></tr>';
  }
  function byId(id) { return ROWS.filter(function (r) { return r.id === id; })[0]; }
  function wireRows() {
    $$("[data-view]", $("#rows")).forEach(function (b) { b.addEventListener("click", function () { openView(byId(b.getAttribute("data-view"))); }); });
    $$("[data-edit]", $("#rows")).forEach(function (b) { b.addEventListener("click", function () { openBook(byId(b.getAttribute("data-edit"))); }); });
    $$("[data-pay]", $("#rows")).forEach(function (b) { b.addEventListener("click", function () { openPay(byId(b.getAttribute("data-pay"))); }); });
    $$("[data-log]", $("#rows")).forEach(function (b) { b.addEventListener("click", function () { var r = byId(b.getAttribute("data-log")); openLog(r); }); });
    $$("select[data-st]", $("#rows")).forEach(function (s) {
      s.addEventListener("change", function () {
        var r = byId(s.getAttribute("data-st")), v = s.value;
        if ((v === "cancelled" || v === "no_show") && !window.confirm("Set " + r.code + " (" + r.guest_name + ") to " + STATUS_L[v] + "? This releases the beds.")) { s.value = r.status; return; }
        s.disabled = true;
        sb.rpc("staff_update_booking", { p_id: r.id, p: { status: v } }).then(must).then(function () { toast(r.code + " → " + STATUS_L[v]); return refresh(); }).catch(function (e) { s.value = r.status; s.disabled = false; fail(e); });
      });
    });
    $$("textarea[data-sn]", $("#rows")).forEach(function (t) {
      t.addEventListener("change", function () {
        var r = byId(t.getAttribute("data-sn"));
        sb.from("bookings").update({ staff_notes: t.value.trim() || null }).eq("id", r.id).then(must).then(function () { r.staff_notes = t.value.trim(); toast("Note saved · " + r.code); }).catch(fail);
      });
    });
  }
  function alerts() {
    var h = "", v = ROWS.filter(function (r) { return r.proofs_to_check > 0; }).length;
    var soon = ROWS.filter(function (r) { return r.status === "pending" && r.hold_until && new Date(r.hold_until) - Date.now() < 30 * 60000; }).length;
    if (v) h += '<div class="sd-alert hot"><b>' + v + " payment" + (v > 1 ? "s" : "") + " to verify.</b> Check them against the bank / e-wallet; the guest is waiting for a confirmation." + '<button class="btn sm" type="button" data-goto="verify">Show</button></div>';
    if (soon) h += '<div class="sd-alert"><b>' + soon + " hold" + (soon > 1 ? "s" : "") + " ending within 30 minutes</b> with no payment uploaded yet." + '<button class="btn sm ghost" type="button" data-goto="holds">Show</button></div>';
    var acc = CAT.settings.pay_accounts || [];
    if (!acc.length || JSON.stringify(acc).indexOf("CONFIRM") > -1) h += '<div class="sd-alert"><b>Bank / e-wallet accounts aren\'t set yet.</b> Guests who pay ahead see them on the booking page and in their email.<button class="btn sm ghost" type="button" data-goto="settings">Set them</button></div>';
    $("#sd-alerts").innerHTML = h;
    $$("[data-goto]", $("#sd-alerts")).forEach(function (b) { b.addEventListener("click", function () { var g = b.getAttribute("data-goto"); if (g === "settings") openSettings(); else { PILL = g; render(); } }); });
  }

  /* ================= modals ================= */
  function openModal(id) { var m = $(id); m.hidden = false; document.body.style.overflow = "hidden"; return m; }
  function closeModal(m) { m.hidden = true; if (!$$(".sd-modal:not([hidden])").length) document.body.style.overflow = ""; }

  /* ---------- booking details ---------- */
  function billHtml(r) {
    var rows = (r.items || []).map(function (i) { var t = typeBy(i.room_type), p = planBy(i.rate_plan); return "<tr><td>" + i.units + "× " + esc(t ? t.name : i.room_type) + (p ? " · " + esc(p.name) : "") + "</td><td>" + (i.amount ? peso(i.amount) : "") + "</td></tr>"; }).join("");
    rows += (r.addons || []).map(function (a) { return "<tr><td>" + (a.qty > 1 ? a.qty + "× " : "") + esc(a.name) + "</td><td>" + (a.amount == null ? "at the desk" : peso(a.amount)) + "</td></tr>"; }).join("");
    if (+r.transfer_discount > 0) rows += '<tr class="disc"><td>5% off · paid ahead by transfer</td><td>−' + peso(r.transfer_discount) + "</td></tr>";
    if (+r.discount_amount > 0) rows += '<tr class="disc"><td>' + esc(r.discount_reason || "Discount") + "</td><td>−" + peso(r.discount_amount) + "</td></tr>";
    rows += '<tr class="tot"><td>Total</td><td>' + peso(r.total) + "</td></tr>";
    if (+r.amount_paid > 0 || +r.amount_pending > 0) rows += "<tr><td>Paid (verified)</td><td>" + peso(r.amount_paid) + "</td></tr>" + (+r.amount_pending > 0 ? "<tr><td>Uploaded, to verify</td><td>" + peso(r.amount_pending) + "</td></tr>" : "") + '<tr class="tot"><td>Balance</td><td>' + peso(balance(r)) + "</td></tr>";
    return '<div class="sd-bill"><table>' + rows + "</table></div>";
  }
  function openView(r) {
    if (!r) return;
    var m = openModal("#m-view");
    $("#mv-title").textContent = r.code + " · " + r.guest_name;
    var dl = [["Status", '<span class="tagx t-' + r.status + '">' + esc(STATUS_L[r.status] || r.status) + "</span>" + (r.status === "pending" && r.hold_until ? ' <span class="hold-left">' + left(r.hold_until) + " (until " + esc(fmtDT(r.hold_until)) + ")</span>" : "")],
      ["Payment", '<span class="tagx t-' + r.payment_status + '">' + esc(r.payment_status) + "</span> " + esc(r.cb_owned ? "Cloudbeds folio" : PAYM[r.pay_method] || "")],
      ["Stay", esc(fmtD(r.checkin)) + " → " + esc(fmtD(r.checkout)) + " · " + r.nights + " night(s) · " + r.guests + " guest(s)"],
      ["Beds / rooms", itemsText(r)],
      ["Mobile", r.guest_phone ? '<a href="tel:' + esc(r.guest_phone) + '">' + esc(r.guest_phone) + "</a>" : "—"],
      ["Email", r.guest_email ? '<a href="mailto:' + esc(r.guest_email) + '">' + esc(r.guest_email) + "</a>" : "—"],
      ["Country", esc(r.country || "—")], ["Arrival", esc(r.arrival_time || "—")],
      ["Source", esc(r.cb_owned ? (r.cb_source || "Cloudbeds") : SOURCE_L[r.source] || r.source) + (r.ota_ref ? " · ref " + esc(r.ota_ref) : "") + (r.cb_reservation_id ? " · Cloudbeds #" + esc(r.cb_reservation_id) : "")],
      ["Booked by", esc(staffName(r.booked_by)) + " · " + esc(fmtDT(r.created_at))],
      ["Guest emails", r.cb_owned ? "Cloudbeds sends its own" : r.email_guest ? "On" : "Off (staff booking)"],
      ["Guest requests", esc(r.notes || "—")], ["Staff notes", esc(r.staff_notes || "—")]];
    $("#mv-body").innerHTML = '<dl class="sd-dl">' + dl.map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("") + "</dl>" + billHtml(r) +
      '<h3 class="sd-h">Emails sent</h3><div id="mv-mail" class="muted small">Loading…</div>';
    var acts = '<button class="btn ghost sm" type="button" data-a="log">Activity</button>';
    if (!r.cb_owned) {
      acts += '<button class="btn ghost sm" type="button" data-a="pay">Payments</button>';
      if (r.guest_email) acts += '<button class="btn ghost sm" type="button" data-a="resend">Resend ' + (r.status === "pending" ? "payment instructions" : "confirmation") + "</button>";
      if (r.status === "confirmed" && r.checkin <= TODAY) acts += '<button class="btn ghost sm" type="button" data-a="in">Check in</button>';
      if (r.status === "checked_in") acts += '<button class="btn ghost sm" type="button" data-a="out">Check out</button>';
      acts += '<button class="btn sm" type="button" data-a="edit">Edit booking</button>';
    } else acts += '<a class="btn ghost sm" href="https://hotels.cloudbeds.com/connect/6309#/reservations" target="_blank" rel="noopener">Open Cloudbeds</a>';
    $("#mv-actions").innerHTML = acts;
    $$("[data-a]", $("#mv-actions")).forEach(function (b) {
      b.addEventListener("click", function () {
        var a = b.getAttribute("data-a");
        if (a === "edit") { closeModal(m); openBook(r); }
        else if (a === "pay") { closeModal(m); openPay(r); }
        else if (a === "log") { closeModal(m); openLog(r); }
        else if (a === "resend") { b.disabled = true; sb.rpc("staff_send_email", { p_id: r.id, p_kind: r.status === "pending" ? "RESEND_BOOKING" : "RESEND_CONFIRMED" }).then(must).then(function () { toast("Email on its way to " + r.guest_email); }).catch(fail); }
        else if (a === "in" || a === "out") { sb.rpc("staff_update_booking", { p_id: r.id, p: { status: a === "in" ? "checked_in" : "checked_out" } }).then(must).then(function () { toast(r.code + (a === "in" ? " checked in" : " checked out")); closeModal(m); refresh(); }).catch(fail); }
      });
    });
    sb.from("booking_email_log").select("kind,to_email,ok,error,created_at").eq("booking_id", r.id).order("created_at").then(function (res) {
      var list = res.data || [];
      $("#mv-mail").innerHTML = list.length ? list.map(function (x) { return "<div>" + (x.ok ? "✓" : x.ok === false ? "✗" : "…") + " " + esc(fmtDT(x.created_at)) + " · " + esc(x.kind.split(":")[0].replace(/_/g, " ")) + " → " + esc(x.to_email) + (x.error ? ' <span style="color:var(--err)">' + esc(x.error) + "</span>" : "") + "</div>"; }).join("") : "None yet.";
    });
  }

  /* ---------- new / edit booking ---------- */
  var B = null; // { row, qty:{plan:units}, aqty:{slug:qty}, av:{type:{available,own}}, nights }
  var mbDatesReady = false;
  function openBook(r) {
    if (r && r.cb_owned) { toast("Cloudbeds bookings are changed in Cloudbeds; they sync here.", true); return; }
    var m = openModal("#m-book");
    B = { row: r || null, qty: {}, aqty: {}, av: null, nights: 0 };
    $("#mb-title").textContent = r ? "Edit " + r.code : "New booking";
    $("#mb-sub").textContent = r ? "Changes are checked against live availability and logged. Tick “Email the guest” to send them a summary." : "For a booking that came in by phone, Messenger, email or walk-in. Uses the same live availability as the website.";
    $("#mb-source").innerHTML = SOURCES.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("");
    $("#mb-status").innerHTML = STATUS.filter(function (s) { return r || ["pending", "confirmed", "checked_in"].indexOf(s[0]) > -1; }).map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("");
    var v = function (id, val) { $(id).value = val == null ? "" : val; };
    v("#mb-source", r ? r.source : "walk-in"); v("#mb-status", r ? r.status : "confirmed"); v("#mb-by", staffName(r ? r.booked_by : ME));
    v("#mb-name", r && r.guest_name); v("#mb-phone", r && r.guest_phone); v("#mb-email", r && r.guest_email); v("#mb-country", r ? r.country : "Philippines");
    v("#mb-arrival", r && r.arrival_time); v("#mb-ref", ""); $("#mb-ref").disabled = !!r;
    v("#mb-pay", r ? r.pay_method : "desk"); v("#mb-dtype", r ? r.discount_type : ""); v("#mb-dval", r ? r.discount_value : ""); v("#mb-dreason", r ? r.discount_reason : "");
    $("#mb-tdisc").checked = !!(r && +r.transfer_discount > 0);
    v("#mb-notes", r && r.notes); v("#mb-snotes", r && r.staff_notes); $("#mb-override").checked = false;
    $("#mb-email-guest").checked = r ? false : true;
    $("#mb-email-label").textContent = r ? "Email the guest a summary of these changes" : "Email the guest (booking details, payment instructions if paying ahead, and the confirmation)";
    $("#mb-msg").textContent = ""; $("#mb-msg").className = "form-msg";
    if (r) { (r.items || []).forEach(function (i) { if (i.rate_plan) B.qty[i.rate_plan] = (B.qty[i.rate_plan] || 0) + i.units; }); (r.addons || []).forEach(function (a) { B.aqty[a.slug] = a.qty; }); }
    $("#mb-in").value = r ? r.checkin : ""; $("#mb-out").value = r ? r.checkout : "";
    if (!mbDatesReady) {
      mbDatesReady = true; window.ZDates.init($("#m-book"));
      $("#mb-in").addEventListener("change", loadAvail); $("#mb-out").addEventListener("change", loadAvail);
      ["#mb-pay", "#mb-dtype", "#mb-dval", "#mb-tdisc", "#mb-status"].forEach(function (s) { $(s).addEventListener("change", function () { syncPay(); bill(); }); });
      $("#mb-dval").addEventListener("input", bill);
      $("#mb-form").addEventListener("submit", function (e) { e.preventDefault(); saveBook(); });
    }
    var z = $("#mb-dates"); if (z._zdr) z._zdr.sync();
    syncPay(); renderAddonsB(); loadAvail();
    setTimeout(function () { $("#mb-name").focus(); }, 50);
  }
  function syncPay() {
    var t = $("#mb-pay").value === "transfer";
    $("#mb-tdisc").disabled = !t; if (!t) $("#mb-tdisc").checked = false;
    $("#mb-tdisc-wrap").style.opacity = t ? 1 : .5;
    if (!B.row && t && $("#mb-status").value === "confirmed" && !syncPay.touched) $("#mb-status").value = "pending";
    if (!B.row && !t && $("#mb-status").value === "pending") $("#mb-status").value = "confirmed";
  }
  function loadAvail() {
    var a = $("#mb-in").value, b = $("#mb-out").value;
    if (!a || !b || b <= a) { B.av = null; B.nights = 0; renderRoomsB(); bill(); return; }
    B.nights = Math.round((parse(b) - parse(a)) / 864e5);
    $("#mb-rooms").innerHTML = '<p class="muted small">Checking availability…</p>';
    var past = a < TODAY;
    (past ? Promise.resolve({ data: null }) : sb.rpc("booking_availability", { p_checkin: a, p_checkout: b })).then(function (res) {
      var d = res.data; B.av = {}; B.plansTotal = {};
      if (d && d.ok !== false && d.room_types) {
        d.room_types.forEach(function (t) { B.av[t.room_type] = { available: t.available, checked: true }; t.plans.forEach(function (p) { B.plansTotal[p.id] = p.stay_total; }); });
      }
      // the booking being edited is counted as sold; add its own units back on the same dates
      if (B.row && B.row.checkin < b && B.row.checkout > a) (B.row.items || []).forEach(function (i) { if (B.av[i.room_type]) B.av[i.room_type].available += i.units; });
      B.past = past || !(d && d.room_types);
      renderRoomsB(); bill();
    }).catch(function (e) { fail(e); B.av = {}; B.past = true; renderRoomsB(); bill(); });
  }
  function usedFor(slug) { return Object.keys(B.qty).reduce(function (n, k) { var p = planBy(k); return n + (p && p.room_type === slug ? B.qty[k] : 0); }, 0); }
  function planTotal(id) { if (B.plansTotal && B.plansTotal[id] != null) return +B.plansTotal[id]; var p = planBy(id); return p ? +p.price * B.nights : 0; }
  function renderRoomsB() {
    if (!B.nights) { $("#mb-rooms").innerHTML = '<p class="muted small">Set the dates to see what\'s free.</p>'; return; }
    var over = $("#mb-override").checked;
    $("#mb-rooms").innerHTML = (B.past ? '<p class="small" style="color:var(--warn)">Past dates: availability isn\'t checked and prices use the standard rate.</p>' : "") + CAT.types.filter(function (t) { return t.active || usedFor(t.slug); }).map(function (t) {
      var av = B.av && B.av[t.slug], free = av ? av.available : null, used = usedFor(t.slug), unit = t.kind === "dorm" ? "bed" : "room";
      var plans = CAT.plans.filter(function (p) { return p.room_type === t.slug && (p.active || B.qty[p.id]); }).map(function (p) {
        var q = B.qty[p.id] || 0, canAdd = over || B.past || free == null || used < free;
        return '<div class="sd-pl"><span>' + esc(p.name) + (p.active ? "" : " <small>(hidden rate)</small>") + '</span><span class="pr">' + peso(planTotal(p.id)) + " / " + unit + '</span><div class="qty"><button type="button" class="minus" data-q="' + p.id + '" data-d="-1"' + (q ? "" : " disabled") + ' aria-label="Fewer">−</button><b>' + q + '</b><button type="button" class="plus" data-q="' + p.id + '" data-d="1"' + (canAdd ? "" : " disabled") + ' aria-label="More">+</button></div></div>';
      }).join("");
      var short = free != null && !B.past && used > free;
      return '<div class="sd-rt' + (used ? " on" : "") + (short ? " short" : "") + '"><div class="nm"><b>' + esc(t.name) + "</b><small>" + (free == null || B.past ? "—" : free + " " + unit + (free === 1 ? "" : "s") + " free on the website") + (short ? " · over by " + (used - free) : "") + "</small></div><div class=\"plns\">" + plans + "</div></div>";
    }).join("");
    $$("[data-q]", $("#mb-rooms")).forEach(function (b) {
      b.addEventListener("click", function () { var id = b.getAttribute("data-q"), n = Math.max(0, (B.qty[id] || 0) + +b.getAttribute("data-d")); if (n) B.qty[id] = n; else delete B.qty[id]; B.itemsTouched = true; renderRoomsB(); bill(); });
    });
  }
  $("#mb-override").addEventListener("change", function () { if (B) renderRoomsB(); });
  function renderAddonsB() {
    $("#mb-addons").innerHTML = CAT.addons.filter(function (a) { return a.active || B.aqty[a.slug]; }).map(function (a) {
      var q = B.aqty[a.slug] || 0;
      return '<div class="sd-ad"><span><b>' + esc(a.name) + "</b> <small class=\"muted\">" + (a.price == null ? "priced at the desk" : peso(a.price) + " " + a.unit.replace(/_/g, " ").replace("per ", "/ ")) + '</small></span><div class="qty"><button type="button" class="minus" data-aq="' + a.slug + '" data-d="-1"' + (q ? "" : " disabled") + ' aria-label="Fewer">−</button><b>' + q + '</b><button type="button" class="plus" data-aq="' + a.slug + '" data-d="1"' + (q >= a.max_qty ? " disabled" : "") + ' aria-label="More">+</button></div></div>';
    }).join("") || '<p class="muted small">No add-ons set up.</p>';
    $$("[data-aq]", $("#mb-addons")).forEach(function (b) { b.addEventListener("click", function () { var s = b.getAttribute("data-aq"), n = Math.max(0, (B.aqty[s] || 0) + +b.getAttribute("data-d")); if (n) B.aqty[s] = n; else delete B.aqty[s]; B.addonsTouched = true; renderAddonsB(); bill(); }); });
  }
  function guestsB() { return Object.keys(B.qty).reduce(function (n, k) { var p = planBy(k), t = p && typeBy(p.room_type); return n + B.qty[k] * (t ? t.guests_per_unit : 1); }, 0); }
  function bill() {
    if (!B) return;
    var rows = "", sub = 0, g = guestsB();
    Object.keys(B.qty).forEach(function (k) { var p = planBy(k), t = p && typeBy(p.room_type), amt = planTotal(k) * B.qty[k]; sub += amt; rows += "<tr><td>" + B.qty[k] + "× " + esc(t ? t.name : "") + " · " + esc(p ? p.name : k) + "</td><td>" + peso(amt) + "</td></tr>"; });
    Object.keys(B.aqty).forEach(function (s) {
      var a = CAT.addons.filter(function (x) { return x.slug === s; })[0]; if (!a) return;
      var mult = { per_night: B.nights, per_guest: g, per_guest_night: g * B.nights }[a.unit] || 1, amt = a.price == null ? null : a.price * B.aqty[s] * mult;
      if (amt != null) sub += amt; rows += "<tr><td>" + (B.aqty[s] > 1 ? B.aqty[s] + "× " : "") + esc(a.name) + "</td><td>" + (amt == null ? "at the desk" : peso(amt)) + "</td></tr>";
    });
    var rate = CAT.settings.transfer_discount_rate != null ? +CAT.settings.transfer_discount_rate : 0.05;
    var td = $("#mb-tdisc").checked && $("#mb-pay").value === "transfer" ? Math.round(sub * rate * 100) / 100 : 0;
    var dt = $("#mb-dtype").value, dv = +$("#mb-dval").value || 0;
    var da = dt === "percent" ? Math.round((sub - td) * Math.min(dv, 100)) / 100 : dt === "amount" ? Math.min(dv, sub - td) : 0;
    if (td) rows += '<tr class="disc"><td>5% convenience discount</td><td>−' + peso(td) + "</td></tr>";
    if (da) rows += '<tr class="disc"><td>' + esc($("#mb-dreason").value || "Discount") + (dt === "percent" ? " (" + dv + "%)" : "") + "</td><td>−" + peso(da) + "</td></tr>";
    rows += '<tr class="tot"><td>Total' + (B.nights ? " · " + B.nights + " night" + (B.nights > 1 ? "s" : "") + " · " + g + " guest" + (g === 1 ? "" : "s") : "") + "</td><td>" + peso(Math.max(sub - td - da, 0)) + "</td></tr>";
    if (B.row && +B.row.amount_paid > 0) rows += "<tr><td>Already paid</td><td>" + peso(B.row.amount_paid) + "</td></tr>";
    $("#mb-bill").innerHTML = "<table>" + (Object.keys(B.qty).length ? rows : '<tr><td class="muted">Choose at least one bed or room.</td><td></td></tr>') + "</table>";
  }
  function saveBook() {
    var msg = $("#mb-msg"), btn = $("#mb-save"), r = B.row;
    msg.className = "form-msg"; msg.textContent = "";
    var name = $("#mb-name").value.trim(), email = $("#mb-email").value.trim(), a = $("#mb-in").value, b = $("#mb-out").value;
    var err = !name ? "Enter the guest's name." : !a || !b ? "Set the check-in and check-out dates." : !Object.keys(B.qty).length ? "Choose at least one bed or room." :
      email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "That email doesn't look right." : $("#mb-email-guest").checked && !email ? "Add the guest's email, or untick “Email the guest”." : "";
    if (err) { msg.className = "form-msg err"; msg.textContent = err; return; }
    var items = Object.keys(B.qty).map(function (k) { return { rate_plan: k, units: B.qty[k] }; });
    var adds = Object.keys(B.aqty).map(function (s) { return { slug: s, qty: B.aqty[s] }; });
    btn.disabled = true; btn.textContent = "Saving…";
    var done = function (code) { btn.disabled = false; btn.textContent = "Save booking"; closeModal($("#m-book")); toast((r ? "Saved " : "Booked ") + code); refresh(); };
    var bad = function (e) { btn.disabled = false; btn.textContent = "Save booking"; msg.className = "form-msg err"; msg.textContent = e.message || String(e); };
    if (!r) {
      sb.rpc("create_booking", {
        p_checkin: a, p_checkout: b, p_items: items, p_addons: adds, p_guest_name: name, p_guest_email: email, p_guest_phone: $("#mb-phone").value, p_country: $("#mb-country").value,
        p_arrival_time: $("#mb-arrival").value, p_notes: $("#mb-notes").value, p_consent: false, p_marketing: false, p_ref: $("#mb-ref").value || null, p_source: $("#mb-source").value,
        p_override: $("#mb-override").checked, p_pay_method: $("#mb-pay").value, p_status: $("#mb-status").value, p_transfer_discount: $("#mb-tdisc").checked,
        p_discount_type: $("#mb-dtype").value || null, p_discount_value: +$("#mb-dval").value || null, p_discount_reason: $("#mb-dreason").value || null,
        p_staff_notes: $("#mb-snotes").value || null, p_email_guest: $("#mb-email-guest").checked
      }).then(function (res) { if (res.error) throw res.error; done(res.data.code); }).catch(bad);
      return;
    }
    var p = {}, set = function (k, val, old) { if ((val || "") !== (old == null ? "" : String(old))) p[k] = val; };
    set("guest_name", name, r.guest_name); set("guest_email", email, r.guest_email); set("guest_phone", $("#mb-phone").value.trim(), r.guest_phone);
    set("country", $("#mb-country").value.trim(), r.country); set("arrival_time", $("#mb-arrival").value.trim(), r.arrival_time);
    set("notes", $("#mb-notes").value.trim(), r.notes); set("staff_notes", $("#mb-snotes").value.trim(), r.staff_notes);
    set("source", $("#mb-source").value, r.source); set("status", $("#mb-status").value, r.status); set("pay_method", $("#mb-pay").value, r.pay_method);
    if (a !== r.checkin) p.checkin = a; if (b !== r.checkout) p.checkout = b;
    if (B.itemsTouched) p.items = items; if (B.addonsTouched) p.addons = adds;
    p.transfer_discount = $("#mb-tdisc").checked;
    p.discount_type = $("#mb-dtype").value || null; p.discount_value = +$("#mb-dval").value || null; p.discount_reason = $("#mb-dreason").value.trim() || null;
    p.override = $("#mb-override").checked; p.notify = $("#mb-email-guest").checked;
    sb.rpc("staff_update_booking", { p_id: r.id, p: p }).then(function (res) {
      if (res.error) throw res.error;
      if (p.notify && !(res.data.changes || []).length) toast("Nothing changed, so no email was sent.");
      done(r.code);
    }).catch(bad);
  }
  $("#mb-status").addEventListener("change", function () { syncPay.touched = true; });

  /* ---------- payments ---------- */
  var PAYROW = null;
  function openPay(r) {
    if (!r) return; PAYROW = r;
    openModal("#m-pay");
    $("#mp-title").textContent = "Payments · " + r.code + " · " + r.guest_name;
    $("#mp-sum").innerHTML = '<div class="sd-paysum"><span>Total <b>' + peso(r.total) + "</b></span><span>Verified <b>" + peso(r.amount_paid) + "</b></span><span>To verify <b>" + peso(r.amount_pending) + "</b></span><span>Balance <b>" + peso(balance(r)) + "</b></span><span>" + esc(PAYM[r.pay_method] || "") + (r.status === "pending" && r.hold_until ? ' · <span class="hold-left">' + left(r.hold_until) + "</span>" : "") + "</span></div>";
    $("#mp-amt").value = balance(r) > 0 ? balance(r) - +r.amount_pending > 0 ? balance(r) - +r.amount_pending : balance(r) : "";
    $("#mp-note").value = ""; $("#mp-file").value = ""; $("#mp-msg").textContent = "";
    $("#mp-list").innerHTML = '<p class="muted small">Loading…</p>';
    sb.from("booking_payments").select("*").eq("booking_id", r.id).order("created_at").then(function (res) {
      var list = must(res) || [];
      if (!list.length) { $("#mp-list").innerHTML = '<p class="muted small" style="margin:12px 0">No payments yet.</p>'; return; }
      $("#mp-list").innerHTML = '<div class="sd-pays">' + list.map(function (p) {
        return '<div class="sd-payrow" data-pid="' + p.id + '">' + (p.proof_path ? '<span class="noimg" data-proof="' + esc(p.proof_path) + '">Loading…</span>' : '<span class="noimg">No proof</span>') +
          "<div><b>" + peso(p.amount) + "</b> · " + esc(METHOD[p.method] || p.method) + ' · <span class="tagx t-' + (p.status === "verified" ? "paid" : p.status === "rejected" ? "cancelled" : "pending") + '">' + esc(p.status) + "</span>" +
          "<small>" + esc(fmtDT(p.created_at)) + " · " + esc(p.created_by ? "recorded by " + staffName(p.created_by) : "uploaded by the guest") + (p.verified_by ? " · " + esc(p.status) + " by " + esc(staffName(p.verified_by)) : "") + "</small>" + (p.note ? "<small>" + esc(p.note) + "</small>" : "") + "</div>" +
          (p.status === "pending" ? '<div class="pa"><input type="number" step="0.01" min="0" value="' + Number(p.amount) + '" aria-label="Amount received"><input type="text" placeholder="Note" aria-label="Note"><button class="btn sm" type="button" data-v="ok">Verify</button><button class="btn sm ghost" type="button" data-v="no">Reject</button></div>' : "<span></span>") + "</div>";
      }).join("") + "</div>";
      $$("[data-proof]", $("#mp-list")).forEach(function (el) {
        var path = el.getAttribute("data-proof");
        sb.storage.from("payment-proofs").createSignedUrl(path, 900).then(function (s) {
          if (s.error || !s.data) { el.textContent = "Can't load"; return; }
          var url = s.data.signedUrl;
          if (/\.pdf$/i.test(path)) { el.outerHTML = '<a class="noimg" href="' + esc(url) + '" target="_blank" rel="noopener">PDF ↗</a>'; return; }
          var img = document.createElement("img"); img.src = url; img.alt = "Payment proof"; img.addEventListener("click", function () { lightbox(url); }); el.replaceWith(img);
        });
      });
      $$("[data-v]", $("#mp-list")).forEach(function (b) {
        b.addEventListener("click", function () {
          var row = b.closest(".sd-payrow"), ins = $$("input", row), rej = b.getAttribute("data-v") === "no";
          if (rej && !ins[1].value.trim() && !window.confirm("Reject this payment? The guest is emailed and gets a fresh 2-hour hold to re-upload.")) return;
          $$("button", row).forEach(function (x) { x.disabled = true; });
          sb.rpc("staff_verify_payment", { p_payment_id: row.getAttribute("data-pid"), p_amount: rej ? null : +ins[0].value || null, p_reject: rej, p_note: ins[1].value || null }).then(must).then(function () {
            toast(rej ? "Payment rejected · guest emailed" : "Payment verified · " + r.code);
            return refresh().then(function () { openPay(byId(r.id)); });
          }).catch(function (e) { $$("button", row).forEach(function (x) { x.disabled = false; }); fail(e); });
        });
      });
    }).catch(fail);
  }
  $("#mp-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var r = PAYROW, amt = +$("#mp-amt").value, m = $("#mp-msg"), f = $("#mp-file").files[0], btn = $("#mp-form button[type=submit]");
    if (!amt || amt <= 0) { m.className = "form-msg err"; m.textContent = "Enter the amount received."; return; }
    btn.disabled = true; m.className = "form-msg"; m.textContent = "Saving…";
    var up = f ? sb.storage.from("payment-proofs").upload(r.code + "/staff-" + Date.now() + "." + (f.name.split(".").pop() || "jpg").toLowerCase(), f, { contentType: f.type }).then(function (x) { if (x.error) throw x.error; return x.data.path; }) : Promise.resolve(null);
    up.then(function (path) { return sb.rpc("staff_record_payment", { p_booking_id: r.id, p_amount: amt, p_method: $("#mp-method").value, p_note: $("#mp-note").value || null, p_proof_path: path }); })
      .then(must).then(function () { btn.disabled = false; m.textContent = ""; toast("Payment recorded · " + r.code); return refresh().then(function () { openPay(byId(r.id)); }); })
      .catch(function (err) { btn.disabled = false; m.className = "form-msg err"; m.textContent = err.message; });
  });
  function lightbox(url) { var d = document.createElement("div"); d.className = "sd-lightbox"; d.innerHTML = '<img alt="Payment proof" src="' + esc(url) + '">'; d.addEventListener("click", function () { d.remove(); }); document.body.appendChild(d); }

  /* ---------- calendar ---------- */
  var calInit = false;
  function openCal() {
    openModal("#m-cal");
    if (!calInit) {
      calInit = true; $("#mc-from").value = TODAY;
      $("#mc-from").addEventListener("change", drawCal); $("#mc-days").addEventListener("change", drawCal);
      $("#mc-prev").addEventListener("click", function () { $("#mc-from").value = addDays($("#mc-from").value, -(+$("#mc-days").value)); drawCal(); });
      $("#mc-next").addEventListener("click", function () { $("#mc-from").value = addDays($("#mc-from").value, +$("#mc-days").value); drawCal(); });
      $("#mc-today").addEventListener("click", function () { $("#mc-from").value = TODAY; drawCal(); });
    }
    drawCal();
  }
  function drawCal() {
    var from = $("#mc-from").value || TODAY, days = +$("#mc-days").value;
    $("#mc-grid").innerHTML = '<tr><td class="muted">Loading…</td></tr>';
    sb.rpc("inventory_grid", { p_from: from, p_days: days }).then(function (res) {
      var grid = must(res) || []; if (!grid.length) { $("#mc-grid").innerHTML = '<tr><td class="muted">No room types.</td></tr>'; return; }
      var nights = grid[0].nights.map(function (n) { return n.night; });
      var head = "<tr><th>Room type</th>" + nights.map(function (d) { var dt = parse(d), we = dt.getDay() === 5 || dt.getDay() === 6; return '<th class="' + (we ? "we " : "") + (d === TODAY ? "today" : "") + '"><button type="button" data-day="' + d + '">' + dt.toLocaleDateString("en-PH", { weekday: "short" }) + "<br>" + dt.getDate() + (dt.getDate() === 1 || d === nights[0] ? " " + dt.toLocaleDateString("en-PH", { month: "short" }) : "") + "</button></th>"; }).join("") + "</tr>";
      var body = grid.map(function (t) {
        return "<tr><td><b>" + esc(t.name) + "</b></td>" + t.nights.map(function (n) {
          var free = n.allot - n.sold, cls = n.allot === 0 ? "closed" : free <= 0 ? "full" : free <= Math.max(1, Math.round(n.allot * .2)) ? "low" : "open";
          return '<td><button type="button" class="' + cls + '" data-new="' + n.night + '" title="' + esc(t.name) + " · " + n.night + ": " + n.sold + " sold of " + n.allot + (n.override ? " (allotment changed for this night)" : "") + '">' + n.sold + "/" + n.allot + "</button></td>";
        }).join("") + "</tr>";
      }).join("");
      $("#mc-grid").innerHTML = head + body;
      $$("[data-new]", $("#mc-grid")).forEach(function (b) { b.addEventListener("click", function () { var d = b.getAttribute("data-new"); closeModal($("#m-cal")); openBook(null); $("#mb-dates")._zdr.set(d, addDays(d, 1)); }); });
      $$("[data-day]", $("#mc-grid")).forEach(function (b) { b.addEventListener("click", function () { dayList(b.getAttribute("data-day")); }); });
    }).catch(fail);
  }
  function dayList(d) {
    var stay = ROWS.filter(function (r) { return ACTIVE[r.status] && r.checkin <= d && r.checkout > d; });
    var arr = stay.filter(function (r) { return r.checkin === d; });
    $("#mc-day").innerHTML = "<b>" + esc(fmtD(d)) + "</b>: " + arr.length + " arriving, " + stay.length + " staying (" + stay.reduce(function (n, r) { return n + (+r.guests || 0); }, 0) + " guests)" +
      '<div class="sd-tablewrap" style="margin-top:8px"><table class="sd-table"><tbody>' + stay.map(function (r) { return "<tr><td class=\"code\">" + esc(r.code) + "</td><td>" + esc(r.guest_name) + (r.checkin === d ? ' <span class="tagx t-confirmed">arrives</span>' : "") + "</td><td>" + itemsText(r) + "</td><td>" + esc(fmtD(r.checkin)) + " → " + esc(fmtD(r.checkout)) + "</td><td>" + esc(STATUS_L[r.status]) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }

  /* ---------- activity log ---------- */
  var LOGFOR = null, logInit = false;
  function openLog(r) {
    LOGFOR = r || null; openModal("#m-log");
    if (!logInit) {
      logInit = true;
      $("#ml-staff").innerHTML = '<option value="">Anyone</option><option value="website">Website</option><option value="guest">Guest</option><option value="system">System</option>' + STAFF.map(function (s) { return '<option value="' + esc(s.email) + '">' + esc(s.name || s.email) + "</option>"; }).join("");
      ["#ml-staff", "#ml-from", "#ml-to"].forEach(function (s) { $(s).addEventListener("change", loadLog); });
      $("#ml-refresh").addEventListener("click", loadLog);
    }
    $("#ml-for").innerHTML = LOGFOR ? "For " + esc(LOGFOR.code) + ' · <a href="#" id="ml-all">show everything</a>' : "";
    var all = $("#ml-all"); if (all) all.addEventListener("click", function (e) { e.preventDefault(); openLog(null); });
    loadLog();
  }
  function describe(e) {
    var d = e.detail || {};
    if (d.changes) return d.changes.map(function (c) { return esc(c.field) + ": " + esc(c.before || "—") + " → <b>" + esc(c.after || "—") + "</b>"; }).join("<br>");
    return Object.keys(d).map(function (k) { return esc(k) + ": " + esc(typeof d[k] === "object" ? JSON.stringify(d[k]) : d[k]); }).join(" · ");
  }
  function loadLog() {
    var q = sb.from("booking_log").select("id,at,actor,action,detail,booking_id,bookings(code,guest_name)").order("at", { ascending: false }).limit(300);
    if (LOGFOR) q = q.eq("booking_id", LOGFOR.id);
    if ($("#ml-staff").value) q = q.eq("actor", $("#ml-staff").value);
    if ($("#ml-from").value) q = q.gte("at", $("#ml-from").value + "T00:00:00+08:00");
    if ($("#ml-to").value) q = q.lte("at", $("#ml-to").value + "T23:59:59+08:00");
    $("#ml-rows").innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
    q.then(function (res) {
      var list = must(res) || [];
      $("#ml-rows").innerHTML = list.length ? list.map(function (e) {
        return '<tr><td style="white-space:nowrap">' + esc(fmtDT(e.at)) + "</td><td>" + esc(staffName(e.actor)) + "</td><td>" + esc(e.action) + '</td><td class="code">' + esc(e.bookings ? e.bookings.code : "") + (e.bookings ? "<small>" + esc(e.bookings.guest_name) + "</small>" : "") + "</td><td>" + describe(e) + "</td></tr>";
      }).join("") : '<tr><td colspan="5" class="muted">Nothing logged for these filters.</td></tr>';
    }).catch(fail);
  }

  /* ---------- team activity ---------- */
  function openTeam() {
    openModal("#m-team");
    $("#mt-rows").innerHTML = '<tr><td colspan="7" class="muted">Loading…</td></tr>';
    sb.rpc("team_activity", { p_days: 30 }).then(must).then(function (list) {
      $("#mt-rows").innerHTML = (list || []).map(function (s) {
        return "<tr><td><b>" + esc(s.name || s.email) + "</b><small>" + esc(s.email) + "</small></td><td>" + esc(s.role) + "</td><td>" + (s.last_active ? esc(ago(s.last_active)) : "—") + "</td><td>" + (s.last_signin ? esc(fmtDT(s.last_signin)) : "—") + "</td><td>" + (s.last_change ? esc(fmtDT(s.last_change)) : "—") + '</td><td class="num">' + s.days_used + '</td><td class="num">' + s.changes + "</td></tr>";
      }).join("") || '<tr><td colspan="7" class="muted">No staff yet.</td></tr>';
    }).catch(fail);
  }

  /* ---------- payment settings ---------- */
  function acctRow(a) {
    return '<div class="sd-acct"><input type="text" placeholder="GCash / BPI / BDO…" value="' + esc(a.label || "") + '" data-k="label" aria-label="Bank or e-wallet"><input type="text" placeholder="Account name" value="' + esc(a.name || "") + '" data-k="name" aria-label="Account name"><input type="text" placeholder="Account / mobile number" value="' + esc(a.number || "") + '" data-k="number" aria-label="Account number"><input type="text" placeholder="Note (optional)" value="' + esc(a.note || "") + '" data-k="note" aria-label="Note"><button type="button" aria-label="Remove account">×</button></div>';
  }
  var setInit = false;
  function openSettings() {
    openModal("#m-settings");
    var s = CAT.settings;
    $("#ms-accts").innerHTML = (s.pay_accounts && s.pay_accounts.length ? s.pay_accounts : [{}]).map(acctRow).join("");
    $("#ms-rate").value = s.transfer_discount_rate != null ? Math.round(s.transfer_discount_rate * 1000) / 10 : 5;
    $("#ms-hold").value = s.hold_minutes || 120; $("#ms-cut").value = s.transfer_cutoff_hours != null ? s.transfer_cutoff_hours : 24; $("#ms-alerts").value = s.staff_alert_emails || "";
    $("#ms-msg").textContent = "";
    if (!setInit) {
      setInit = true;
      $("#ms-add").addEventListener("click", function () { $("#ms-accts").insertAdjacentHTML("beforeend", acctRow({})); });
      $("#ms-accts").addEventListener("click", function (e) { if (e.target.tagName === "BUTTON") e.target.closest(".sd-acct").remove(); });
      $("#ms-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var accts = $$(".sd-acct", $("#ms-accts")).map(function (row) { var o = {}; $$("input", row).forEach(function (i) { if (i.value.trim()) o[i.getAttribute("data-k")] = i.value.trim(); }); return o; }).filter(function (o) { return o.label || o.number; });
        var patch = { pay_accounts: accts, transfer_discount_rate: Math.max(0, Math.min(50, +$("#ms-rate").value || 0)) / 100, hold_minutes: Math.max(15, +$("#ms-hold").value || 120), transfer_cutoff_hours: Math.max(0, +$("#ms-cut").value || 0), staff_alert_emails: $("#ms-alerts").value.trim() || "ai@zhostel.com" };
        sb.from("booking_settings").update(patch).eq("id", 1).select().then(function (res) {
          var d = must(res); if (!d || !d.length) throw new Error("Not saved: only signed-in staff can change settings.");
          CAT.settings = d[0]; $("#ms-msg").className = "form-msg ok"; $("#ms-msg").textContent = "Saved. New bookings use these straight away."; alerts();
        }).catch(function (err) { $("#ms-msg").className = "form-msg err"; $("#ms-msg").textContent = err.message; });
      });
    }
  }

  /* ---------- CSV ---------- */
  function exportCsv() {
    var rows = sortRows(filtered().rows);
    if (!rows.length) { toast("Nothing to export.", true); return; }
    var cols = [["code", "Booking"], ["status", "Status"], ["guest_name", "Guest"], ["guest_email", "Email"], ["guest_phone", "Mobile"], ["country", "Country"], ["checkin", "Check-in"], ["checkout", "Check-out"], ["nights", "Nights"], ["guests", "Guests"],
      ["_items", "Beds / rooms"], ["subtotal", "Subtotal"], ["transfer_discount", "5% pay-ahead"], ["discount_amount", "Discount"], ["total", "Total"], ["amount_paid", "Paid"], ["_bal", "Balance"], ["pay_method", "Way of paying"], ["payment_status", "Payment"],
      ["_src", "Source"], ["_by", "Booked by"], ["ota_ref", "OTA ref"], ["notes", "Guest requests"], ["staff_notes", "Staff notes"], ["created_at", "Booked at"]];
    var cell = function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [cols.map(function (c) { return c[1]; }).join(",")].concat(rows.map(function (r) {
      var x = Object.assign({}, r, { _items: itemsText(r).replace(/<br>/g, "; "), _bal: balance(r), _src: r.cb_owned ? (r.cb_source || "Cloudbeds") : SOURCE_L[r.source] || r.source, _by: staffName(r.booked_by), created_at: fmtDT(r.created_at) });
      return cols.map(function (c) { return cell(x[c[0]]); }).join(",");
    }));
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
    a.download = "z-bookings-" + TODAY + ".csv"; a.click();
  }
})();
