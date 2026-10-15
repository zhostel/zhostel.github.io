/* Z Hostel staff dashboard: bookings, inventory calendar, rates & add-ons.
   Runs inside /admin/ after sign-in (window.ZADMIN is set by admin.js). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var A = function () { return window.ZADMIN; };
  var esc = function (s) { return A().esc(s); };
  var peso = function (n) { return "₱" + Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 }); };
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parse(s) { var p = (s || "").split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function short(s) { return parse(s).toLocaleDateString("en-PH", { month: "short", day: "numeric" }); }
  function todayISO() { var d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })); return iso(d); }

  var S = { rows: [], types: [], plans: [], addons: [], settings: {}, filter: "upcoming", q: "", loaded: false, calFrom: null, calDays: 14 };
  var STATUS = ["confirmed", "checked_in", "checked_out"];
  var STATUS_LABEL = { confirmed: "Confirmed", checked_in: "Checked in", checked_out: "Checked out", cancelled: "Cancelled", no_show: "No-show" };
  var PAY_LABEL = { unpaid: "Unpaid", partial: "Partial", paid: "Paid", refunded: "Refunded" };
  var SOURCES = ["walk-in", "phone", "messenger", "email", "instagram", "ota", "other"];

  function loadAll() {
    var sb = A().sb;
    return Promise.all([
      sb.from("bookings").select("*, booking_items(units, amount, room_type, rate_plan), booking_addons(id, addon, name, qty, amount)").order("checkin", { ascending: true }).limit(3000),
      sb.from("room_types").select("*").order("sort"),
      sb.from("rate_plans").select("*").order("sort"),
      sb.from("addons").select("*").order("sort"),
      sb.from("booking_settings").select("*").limit(1)
    ]).then(function (r) {
      var e = r.filter(function (x) { return x.error; })[0]; if (e) throw e.error;
      S.rows = r[0].data; S.types = r[1].data; S.plans = r[2].data; S.addons = r[3].data; S.settings = r[4].data[0] || {}; S.loaded = true;
      var c = $("#c-bk"); if (c) c.textContent = arrivals().length || "";
    });
  }
  function typeName(slug) { var t = S.types.filter(function (x) { return x.slug === slug; })[0]; return t ? t.name : slug; }
  function planName(id) { var p = S.plans.filter(function (x) { return x.id === id; })[0]; return p ? p.name : id; }
  function live(r) { return r.status === "confirmed" || r.status === "checked_in"; }
  function arrivals() { var t = todayISO(); return S.rows.filter(function (r) { return r.checkin === t && r.status === "confirmed"; }); }

  function filtered() {
    var t = todayISO(), q = S.q.toLowerCase();
    return S.rows.filter(function (r) {
      var ok = {
        arrivals: r.checkin === t && r.status === "confirmed",
        inhouse: r.status === "checked_in" || (r.status === "confirmed" && r.checkin <= t && r.checkout > t),
        departures: r.checkout === t && live(r),
        upcoming: r.checkin >= t && r.status === "confirmed",
        unpaid: live(r) && r.payment_status !== "paid",
        website: r.source === "website",
        cancelled: r.status === "cancelled" || r.status === "no_show",
        all: true
      }[S.filter];
      if (!ok) return false;
      if (!q) return true;
      return [r.code, r.guest_name, r.guest_email, r.guest_phone, r.notes, r.staff_notes, r.source].join(" ").toLowerCase().indexOf(q) > -1;
    }).sort(function (a, b) { return S.filter === "cancelled" || S.filter === "all" ? (b.created_at > a.created_at ? 1 : -1) : (a.checkin > b.checkin ? 1 : a.checkin < b.checkin ? -1 : 0); });
  }

  /* ================= BOOKINGS ================= */
  function viewBookings(panel) {
    if (!S.loaded) { panel.innerHTML = '<div class="empty">Loading bookings…</div>'; loadAll().then(function () { viewBookings(panel); }).catch(function (e) { panel.innerHTML = '<div class="empty">Could not load bookings: ' + esc(e.message) + "</div>"; }); return; }
    var t = todayISO(), tomorrow = iso(addDays(parse(t), 1));
    var inhouse = S.rows.filter(function (r) { return live(r) && r.checkin <= t && r.checkout > t; });
    var guestsTonight = inhouse.reduce(function (n, r) { return n + r.guests; }, 0);
    var week = Date.now() - 7 * 864e5;
    var webWeek = S.rows.filter(function (r) { return r.source === "website" && Date.parse(r.created_at) > week; });
    var due = S.rows.filter(function (r) { return live(r) && r.payment_status !== "paid" && r.checkin >= t && r.checkin <= iso(addDays(parse(t), 7)); })
      .reduce(function (n, r) { return n + (Number(r.total) - Number(r.amount_paid)); }, 0);
    var counts = function (f) { var o = S.filter; S.filter = f; var n = filtered().length; S.filter = o; return n; };
    var h = '<div class="kpis">' +
      kpi(arrivals().length, "Arrivals today") + kpi(guestsTonight, "Guests in-house tonight") +
      kpi(S.rows.filter(function (r) { return r.checkout === t && live(r); }).length, "Departures today") +
      kpi(webWeek.length, "Website bookings, last 7 days") + kpi(peso(due), "To collect, next 7 days") + "</div>";
    h += '<div class="toolbar">' + ["upcoming", "arrivals", "inhouse", "departures", "unpaid", "website", "cancelled", "all"].map(function (f) {
      var lab = { upcoming: "Upcoming", arrivals: "Arrivals today", inhouse: "In-house", departures: "Departures today", unpaid: "Unpaid", website: "From website", cancelled: "Cancelled / no-show", all: "All" }[f];
      return '<button class="btn sm ' + (S.filter === f ? "" : "ghost") + '" data-f="' + f + '">' + lab + " <span style=\"opacity:.7\">" + counts(f) + "</span></button>";
    }).join("") + "</div>";
    h += '<div class="toolbar"><input type="search" id="bk-q" placeholder="Search name, code, phone, email…" value="' + esc(S.q) + '" style="flex:1;min-width:220px">' +
      '<button class="btn sm" id="bk-add">+ Add booking</button><button class="btn sm ghost" id="bk-csv">Export CSV</button><button class="btn sm ghost" id="bk-reload">Refresh</button></div>';
    var rows = filtered();
    if (!rows.length) h += '<div class="empty">No bookings here.</div>';
    else {
      h += '<div class="table-scroll"><table class="data-table bk-table"><thead><tr><th>Code</th><th>Guest</th><th>Stay</th><th>Beds / rooms</th><th>Total</th><th>Payment</th><th>Status</th><th>Source</th><th>Staff notes</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          var items = (r.booking_items || []).map(function (i) { return i.units + "× " + esc(typeName(i.room_type)) + ' <span class="muted">' + esc(planName(i.rate_plan)) + "</span>"; }).join("<br>");
          var adds = (r.booking_addons || []).map(function (a) { return esc(a.name) + (a.qty > 1 ? " ×" + a.qty : ""); }).join(", ");
          return '<tr data-id="' + r.id + '"' + (r.status === "cancelled" ? ' style="opacity:.55"' : "") + "><td><b>" + esc(r.code) + "</b></td>" +
            "<td><b>" + esc(r.guest_name) + '</b><br><span class="muted small">' + esc(r.guest_phone || "") + (r.guest_email ? " · " + esc(r.guest_email) : "") + "</span>" + (r.notes ? '<br><span class="small">“' + esc(r.notes) + "”</span>" : "") + "</td>" +
            "<td>" + short(r.checkin) + " → " + short(r.checkout) + '<br><span class="muted small">' + r.nights + " night" + (r.nights > 1 ? "s" : "") + " · " + r.guests + " guest" + (r.guests > 1 ? "s" : "") + (r.arrival_time ? " · " + esc(r.arrival_time) : "") + "</span></td>" +
            "<td class=\"small\">" + items + (adds ? '<br><span class="muted">+ ' + adds + "</span>" : "") + "</td>" +
            "<td><b>" + peso(r.total) + "</b>" + (Number(r.amount_paid) && r.payment_status !== "paid" ? '<br><span class="muted small">paid ' + peso(r.amount_paid) + "</span>" : "") + "</td>" +
            '<td><button class="badge pay-' + r.payment_status + '" data-pay="' + r.id + '" title="Click: mark paid / unpaid">' + PAY_LABEL[r.payment_status] + "</button></td>" +
            '<td><button class="badge st-' + r.status + '" data-st="' + r.id + '" title="Click to move forward">' + STATUS_LABEL[r.status] + "</button></td>" +
            '<td class="small">' + esc(r.source) + "</td>" +
            '<td><input class="note-in" data-note="' + r.id + '" value="' + esc(r.staff_notes || "") + '" placeholder="Add note"></td>' +
            '<td><button class="btn sm ghost" data-open="' + r.id + '">Open</button></td></tr>';
        }).join("") + "</tbody></table></div>";
    }
    panel.innerHTML = h;
    $$("[data-f]", panel).forEach(function (b) { b.addEventListener("click", function () { S.filter = b.getAttribute("data-f"); viewBookings(panel); }); });
    var q = $("#bk-q", panel); q.addEventListener("input", function () { S.q = q.value; clearTimeout(q._t); q._t = setTimeout(function () { viewBookings(panel); var nq = $("#bk-q", panel); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }, 250); });
    $("#bk-add", panel).addEventListener("click", function () { openNew(panel); });
    $("#bk-reload", panel).addEventListener("click", function () { S.loaded = false; viewBookings(panel); });
    $("#bk-csv", panel).addEventListener("click", function () {
      A().csv(filtered().map(function (r) {
        return { code: r.code, status: r.status, payment: r.payment_status, amount_paid: r.amount_paid, total: r.total, checkin: r.checkin, checkout: r.checkout, nights: r.nights, guests: r.guests,
          guest_name: r.guest_name, email: r.guest_email, phone: r.guest_phone, country: r.country, arrival: r.arrival_time, source: r.source,
          items: (r.booking_items || []).map(function (i) { return i.units + "x " + typeName(i.room_type) + " (" + planName(i.rate_plan) + ")"; }).join("; "),
          addons: (r.booking_addons || []).map(function (a) { return a.qty + "x " + a.name; }).join("; "), notes: r.notes, staff_notes: r.staff_notes, booked_at: r.created_at };
      }), "z-bookings-" + S.filter);
    });
    $$("[data-pay]", panel).forEach(function (b) { b.addEventListener("click", function () {
      var r = byId(b.getAttribute("data-pay")); var paid = r.payment_status !== "paid";
      save(r, paid ? { payment_status: "paid", amount_paid: r.total } : { payment_status: "unpaid", amount_paid: 0 }, panel);
    }); });
    $$("[data-st]", panel).forEach(function (b) { b.addEventListener("click", function () {
      var r = byId(b.getAttribute("data-st"));
      if (r.status === "cancelled" || r.status === "no_show") return openBooking(r, panel);
      var i = STATUS.indexOf(r.status); if (i === STATUS.length - 1) return;
      save(r, { status: STATUS[i + 1] }, panel);
    }); });
    $$("[data-note]", panel).forEach(function (inp) { inp.addEventListener("change", function () { save(byId(inp.getAttribute("data-note")), { staff_notes: inp.value }, null); inp.style.borderColor = "var(--ok)"; }); });
    $$("[data-open]", panel).forEach(function (b) { b.addEventListener("click", function () { openBooking(byId(b.getAttribute("data-open")), panel); }); });
  }
  function kpi(n, l) { return '<div class="kpi"><b>' + n + "</b><span>" + esc(l) + "</span></div>"; }
  function byId(id) { return S.rows.filter(function (r) { return r.id === id; })[0]; }
  function save(r, patch, panel) {
    return A().sb.from("bookings").update(patch).eq("id", r.id).then(function (res) {
      if (res.error) { alert("Couldn't save: " + res.error.message); return; }
      Object.assign(r, patch);
      if (panel) viewBookings(panel);
    });
  }

  /* ---------- modal ---------- */
  function modal(html) {
    var m = document.createElement("div"); m.className = "zmodal";
    m.innerHTML = '<div class="zmodal-card" role="dialog" aria-modal="true"><button class="zmodal-x" aria-label="Close">×</button>' + html + "</div>";
    document.body.appendChild(m); document.body.style.overflow = "hidden";
    function close() { m.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", k); }
    function k(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", k);
    $(".zmodal-x", m).addEventListener("click", close);
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    m.close = close; return m;
  }

  function openBooking(r, panel) {
    var items = (r.booking_items || []).map(function (i) { return "<li><span>" + i.units + " × " + esc(typeName(i.room_type)) + " <small>" + esc(planName(i.rate_plan)) + "</small></span><b>" + peso(i.amount) + "</b></li>"; }).join("");
    items += (r.booking_addons || []).map(function (a) { return "<li><span>" + (a.qty > 1 ? a.qty + " × " : "") + esc(a.name) + "</span><b>" + (a.amount == null ? "at the desk" : peso(a.amount)) + "</b></li>"; }).join("");
    var m = modal('<span class="tag">' + esc(r.source) + '</span><h2 style="margin:10px 0 4px;font-size:34px">' + esc(r.code) + " · " + esc(r.guest_name) + "</h2>" +
      '<p class="muted">' + short(r.checkin) + " → " + short(r.checkout) + " · " + r.nights + " night(s) · " + r.guests + " guest(s) · booked " + A().when(r.created_at) + "</p>" +
      '<dl class="kv" style="margin:12px 0"><dt>Phone</dt><dd>' + (r.guest_phone ? '<a href="tel:' + esc(r.guest_phone) + '">' + esc(r.guest_phone) + "</a>" : "—") + "</dd><dt>Email</dt><dd>" + (r.guest_email ? '<a href="mailto:' + esc(r.guest_email) + '">' + esc(r.guest_email) + "</a>" : "—") + "</dd><dt>Country</dt><dd>" + esc(r.country || "—") + "</dd><dt>Arrival</dt><dd>" + esc(r.arrival_time || "—") + "</dd><dt>Guest notes</dt><dd>" + esc(r.notes || "—") + "</dd><dt>Ref</dt><dd>" + esc(r.ref || "—") + "</dd></dl>" +
      '<ul class="sum-lines">' + items + '</ul><div class="sum-total"><span>Total</span><b>' + peso(r.total) + "</b></div>" +
      '<div class="row2" style="margin-top:14px"><div class="field"><label>Status</label><select id="o-st">' + ["confirmed", "checked_in", "checked_out", "cancelled", "no_show"].map(function (s) { return "<option value=\"" + s + "\"" + (s === r.status ? " selected" : "") + ">" + STATUS_LABEL[s] + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label>Payment</label><select id="o-pay">' + ["unpaid", "partial", "paid", "refunded"].map(function (s) { return "<option value=\"" + s + "\"" + (s === r.payment_status ? " selected" : "") + ">" + PAY_LABEL[s] + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="row2"><div class="field"><label>Amount paid (₱)</label><input id="o-paid" type="text" inputmode="decimal" value="' + Number(r.amount_paid) + '"></div><div class="field"><label>Staff notes</label><input id="o-notes" type="text" value="' + esc(r.staff_notes || "") + '"></div></div>' +
      '<p class="small muted">Cancelling or marking no-show releases the beds back to the website straight away.</p>' +
      '<div class="btns" style="margin-top:12px"><button class="btn" id="o-save">Save</button><a class="btn ghost" href="https://wa.me/' + esc((r.guest_phone || "").replace(/[^0-9]/g, "").replace(/^0/, "63")) + '" target="_blank" rel="noopener">WhatsApp guest</a></div>' +
      '<h4 style="margin-top:22px">Activity</h4><div id="o-log" class="small muted">Loading…</div>');
    A().sb.from("booking_log").select("*").eq("booking_id", r.id).order("at").then(function (res) {
      $("#o-log", m).innerHTML = (res.data || []).map(function (l) { return "<div>" + A().when(l.at) + " · " + esc(l.actor || "") + " · " + esc(l.action) + " " + esc(Object.keys(l.detail || {}).map(function (k) { return k + ": " + l.detail[k]; }).join(", ")) + "</div>"; }).join("") || "No activity yet.";
    });
    $("#o-save", m).addEventListener("click", function () {
      var paid = parseFloat($("#o-paid", m).value) || 0;
      save(r, { status: $("#o-st", m).value, payment_status: $("#o-pay", m).value, amount_paid: paid, staff_notes: $("#o-notes", m).value }, panel).then(function () { m.close(); });
    });
  }

  function openNew(panel) {
    var t = todayISO();
    var m = modal('<h2 style="margin:0 0 6px;font-size:34px">Add booking</h2><p class="muted">For walk-ins, calls and messages. Uses the same inventory as the website.</p>' +
      '<div class="row2"><div class="field"><label>Check-in</label><input type="date" id="n-in" value="' + t + '"></div><div class="field"><label>Check-out</label><input type="date" id="n-out" value="' + iso(addDays(parse(t), 1)) + '"></div></div>' +
      '<div id="n-rooms" style="margin:14px 0"></div>' +
      '<div id="n-adds"></div>' +
      '<div class="row2" style="margin-top:12px"><div class="field"><label>Guest name *</label><input id="n-name" type="text"></div><div class="field"><label>Mobile</label><input id="n-phone" type="tel"></div></div>' +
      '<div class="row2"><div class="field"><label>Email</label><input id="n-email" type="email"></div><div class="field"><label>Source</label><select id="n-src">' + SOURCES.map(function (s) { return "<option>" + s + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="field"><label>Notes</label><input id="n-notes" type="text"></div>' +
      '<label class="check" style="margin-top:10px"><input type="checkbox" id="n-over"><span>Allow even if the website allotment is full (you\'ve checked the beds are free)</span></label>' +
      '<div class="btns" style="margin-top:14px"><button class="btn" id="n-save">Create booking</button></div><p class="form-msg" id="n-msg" role="alert"></p>');
    var qty = {}, aq = {};
    function avail() {
      var a = $("#n-in", m).value, b = $("#n-out", m).value;
      $("#n-rooms", m).innerHTML = '<p class="muted small">Checking…</p>';
      A().sb.rpc("booking_availability", { p_checkin: a, p_checkout: b }).then(function (res) {
        var d = res.data;
        if (!d || !d.ok) { $("#n-rooms", m).innerHTML = '<p class="form-msg err">' + esc((d && d.error) || "Pick valid dates (check-in today or later).") + "</p>"; return; }
        $("#n-rooms", m).innerHTML = '<table class="data-table"><thead><tr><th>Room type</th><th>Free</th><th>Rate</th><th>Qty</th></tr></thead><tbody>' +
          d.room_types.map(function (rt) {
            return rt.plans.map(function (p, i) {
              return "<tr><td>" + (i ? "" : "<b>" + esc(typeName(rt.room_type)) + "</b>") + "</td><td>" + (i ? "" : rt.available) + "</td><td>" + esc(p.name) + ' <span class="muted small">' + peso(p.stay_total) + '</span></td><td><input type="number" min="0" max="12" value="' + (qty[p.id] || 0) + '" data-q="' + p.id + '" style="width:70px;min-height:36px;padding:4px 8px"></td></tr>';
            }).join("");
          }).join("") + "</tbody></table>";
        $$("[data-q]", m).forEach(function (i) { i.addEventListener("change", function () { var v = parseInt(i.value, 10) || 0; if (v) qty[i.getAttribute("data-q")] = v; else delete qty[i.getAttribute("data-q")]; }); });
      });
    }
    $("#n-adds", m).innerHTML = S.addons.filter(function (a) { return a.active; }).length ? '<div class="field"><span class="label">Add-ons</span><div class="chips">' + S.addons.filter(function (a) { return a.active; }).map(function (a) { return '<label class="chip"><input type="checkbox" data-ad="' + a.slug + '"><span>' + esc(a.name) + "</span></label>"; }).join("") + "</div></div>" : "";
    $$("[data-ad]", m).forEach(function (c) { c.addEventListener("change", function () { if (c.checked) aq[c.getAttribute("data-ad")] = 1; else delete aq[c.getAttribute("data-ad")]; }); });
    $("#n-in", m).addEventListener("change", function () { var a = parse($("#n-in", m).value); if (parse($("#n-out", m).value) <= a) $("#n-out", m).value = iso(addDays(a, 1)); avail(); });
    $("#n-out", m).addEventListener("change", avail);
    avail();
    $("#n-save", m).addEventListener("click", function () {
      var msg = $("#n-msg", m); msg.className = "form-msg"; msg.textContent = "";
      var items = Object.keys(qty).map(function (k) { return { rate_plan: k, units: qty[k] }; });
      if (!items.length) { msg.className = "form-msg err"; msg.textContent = "Set a quantity for at least one rate."; return; }
      if (!$("#n-name", m).value.trim()) { msg.className = "form-msg err"; msg.textContent = "Guest name is required."; return; }
      A().sb.rpc("create_booking", {
        p_checkin: $("#n-in", m).value, p_checkout: $("#n-out", m).value, p_items: items, p_addons: Object.keys(aq).map(function (s) { return { slug: s, qty: 1 }; }),
        p_guest_name: $("#n-name", m).value, p_guest_email: $("#n-email", m).value, p_guest_phone: $("#n-phone", m).value, p_country: null,
        p_arrival_time: null, p_notes: $("#n-notes", m).value, p_consent: false, p_marketing: false, p_ref: null, p_source: $("#n-src", m).value, p_override: $("#n-over", m).checked
      }).then(function (res) {
        if (res.error) { msg.className = "form-msg err"; msg.textContent = res.error.message; return; }
        m.close(); S.loaded = false; S.filter = "upcoming"; viewBookings(panel);
      });
    });
  }

  /* ================= CALENDAR ================= */
  function viewCalendar(panel) {
    if (!S.calFrom) S.calFrom = todayISO();
    panel.innerHTML = '<div class="toolbar"><button class="btn sm ghost" id="cal-prev">← Earlier</button><input type="date" id="cal-from" value="' + S.calFrom + '" style="width:auto"><button class="btn sm ghost" id="cal-next">Later →</button>' +
      '<select id="cal-days" style="width:auto"><option value="14">2 weeks</option><option value="28">4 weeks</option></select>' +
      '<span class="muted small">Each cell: sold / website allotment. Click a cell to change that night. Click a date to close or reopen the whole night.</span></div><div id="cal-grid"><div class="empty">Loading…</div></div>';
    $("#cal-days", panel).value = String(S.calDays);
    $("#cal-prev", panel).addEventListener("click", function () { S.calFrom = iso(addDays(parse(S.calFrom), -7)); viewCalendar(panel); });
    $("#cal-next", panel).addEventListener("click", function () { S.calFrom = iso(addDays(parse(S.calFrom), 7)); viewCalendar(panel); });
    $("#cal-from", panel).addEventListener("change", function () { S.calFrom = $("#cal-from", panel).value; viewCalendar(panel); });
    $("#cal-days", panel).addEventListener("change", function () { S.calDays = +$("#cal-days", panel).value; viewCalendar(panel); });
    A().sb.rpc("inventory_grid", { p_from: S.calFrom, p_days: S.calDays }).then(function (res) {
      if (res.error) { $("#cal-grid", panel).innerHTML = '<div class="empty">' + esc(res.error.message) + "</div>"; return; }
      var g = res.data || []; if (!g.length) { $("#cal-grid", panel).innerHTML = '<div class="empty">No room types.</div>'; return; }
      var nights = g[0].nights.map(function (n) { return n.night; });
      var h = '<div class="table-scroll"><table class="data-table cal"><thead><tr><th>Room type</th>' + nights.map(function (d) {
        var dt = parse(d), we = dt.getDay() === 5 || dt.getDay() === 6;
        return '<th class="' + (we ? "we" : "") + '"><button class="cal-day" data-day="' + d + '">' + dt.toLocaleDateString("en-PH", { weekday: "short" }) + "<br>" + dt.getDate() + "</button></th>";
      }).join("") + "</tr></thead><tbody>";
      g.forEach(function (rt) {
        h += "<tr><td><b>" + esc(rt.name) + '</b><br><span class="muted small">' + (rt.kind === "dorm" ? "beds" : "rooms") + "</span></td>" + rt.nights.map(function (n) {
          var free = n.allot - n.sold, cls = n.allot === 0 ? "closed" : free <= 0 ? "full" : free <= Math.max(1, Math.round(n.allot * 0.25)) ? "low" : "open";
          return '<td><button class="cal-cell ' + cls + (n.override ? " ovr" : "") + '" data-rt="' + rt.room_type + '" data-n="' + n.night + '" data-a="' + n.allot + '" title="' + esc(rt.name) + " · " + n.night + '">' + n.sold + "/" + n.allot + "</button></td>";
        }).join("") + "</tr>";
      });
      h += '</tbody></table></div><p class="small muted" style="margin-top:10px"><span class="cal-cell open">open</span> <span class="cal-cell low">few left</span> <span class="cal-cell full">full</span> <span class="cal-cell closed">closed</span> <span class="cal-cell open ovr">changed for that night</span></p>';
      $("#cal-grid", panel).innerHTML = h;
      demand(panel, nights);
      $$(".cal-cell[data-rt]", panel).forEach(function (b) { b.addEventListener("click", function () {
        var rt = b.getAttribute("data-rt"), n = b.getAttribute("data-n"), t = S.types.filter(function (x) { return x.slug === rt; })[0];
        var v = prompt("Website allotment for " + (t ? t.name : rt) + " on " + n + "\n(0 = close. Leave empty to go back to the default of " + (t ? t.web_allotment : "?") + ")", b.getAttribute("data-a"));
        if (v === null) return;
        setAllot([rt], [n], v).then(function () { viewCalendar(panel); });
      }); });
      $$(".cal-day", panel).forEach(function (b) { b.addEventListener("click", function () {
        var n = b.getAttribute("data-day");
        var v = prompt("Whole night of " + n + ":\nType 0 to close every room type to website bookings, or leave empty to reopen with defaults.", "0");
        if (v === null) return;
        setAllot(g.map(function (x) { return x.room_type; }), [n], v).then(function () { viewCalendar(panel); });
      }); });
    });
  }
  function demand(panel, nights) {
    var box = document.createElement("div"); box.className = "tile"; box.style.marginTop = "18px";
    box.innerHTML = '<h3>What guests are searching for</h3><p class="muted small">Website searches by check-in night, last 30 days (no personal data). High bars with low sales = consider opening more beds.</p><div id="dm"></div>';
    $("#cal-grid", panel).appendChild(box);
    A().sb.from("booking_searches").select("checkin, action").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(5000).then(function (r) {
      var c = {}, booked = {}; (r.data || []).forEach(function (x) { if (!x.checkin) return; c[x.checkin] = (c[x.checkin] || 0) + 1; if (x.action === "checkout") booked[x.checkin] = (booked[x.checkin] || 0) + 1; });
      var max = Math.max.apply(null, nights.map(function (n) { return c[n] || 0; }).concat([1]));
      $("#dm", box).innerHTML = '<div class="demand">' + nights.map(function (n) { return '<i title="' + n + ": " + (c[n] || 0) + " searches, " + (booked[n] || 0) + ' booked" style="height:' + ((c[n] || 0) / max * 100) + '%"></i>'; }).join("") + '</div><p class="small muted">' + short(nights[0]) + " → " + short(nights[nights.length - 1]) + " · total " + nights.reduce(function (s, n) { return s + (c[n] || 0); }, 0) + " searches, " + nights.reduce(function (s, n) { return s + (booked[n] || 0); }, 0) + " bookings</p>";
    });
  }
  function setAllot(types, nights, v) {
    var sb = A().sb;
    if (v === "" || v == null) return sb.from("allotment_overrides").delete().in("room_type", types).in("night", nights).then(chk);
    var u = Math.max(0, parseInt(v, 10) || 0), rows = [];
    types.forEach(function (t) { nights.forEach(function (n) { rows.push({ room_type: t, night: n, units: u }); }); });
    return sb.from("allotment_overrides").upsert(rows).then(chk);
  }
  function chk(res) { if (res && res.error) alert(res.error.message); return res; }

  /* ================= RATES & ADD-ONS ================= */
  function viewRates(panel) {
    if (!S.loaded) { panel.innerHTML = '<div class="empty">Loading…</div>'; loadAll().then(function () { viewRates(panel); }); return; }
    var st = S.settings;
    var h = '<div class="tile" style="margin-bottom:18px"><h3>Online booking</h3><div class="row2">' +
      '<label class="check"><input type="checkbox" id="s-open"' + (st.open ? " checked" : "") + '><span><b>Website booking is open</b> (untick to pause all online bookings)</span></label></div>' +
      '<div class="row2"><div class="field"><label>Check-in time</label><input id="s-in" value="' + esc(st.checkin_time) + '"></div><div class="field"><label>Check-out time</label><input id="s-out" value="' + esc(st.checkout_time) + '"></div></div>' +
      '<div class="field"><label>Payment note (shown to guests)</label><input id="s-pay" value="' + esc(st.payment_note) + '"></div>' +
      '<div class="field"><label>Cancellation policy</label><textarea id="s-cancel">' + esc(st.cancellation_policy) + "</textarea></div>" +
      '<div class="btns"><button class="btn sm" id="s-save">Save settings</button></div></div>';
    h += "<h3>Rooms, website allotment and rates</h3><p class=\"muted small\">Allotment = how many beds (dorms) or rooms (privates) the website may sell per night. Keep it to the pool you don't sell on Cloudbeds / OTAs. Prices are per bed or room per night, in pesos.</p>";
    h += '<div class="table-scroll"><table class="data-table"><thead><tr><th>Room type</th><th>Allotment</th><th>On site</th><th>Rate plans (price / night · on site)</th></tr></thead><tbody>' +
      S.types.map(function (t) {
        var plans = S.plans.filter(function (p) { return p.room_type === t.slug; }).map(function (p) {
          return '<div class="rate-line"><span>' + esc(p.name) + '</span><input type="text" inputmode="decimal" value="' + Number(p.price) + '" data-price="' + p.id + '" style="width:100px;min-height:34px;padding:4px 8px"><label class="check"><input type="checkbox" data-pact="' + p.id + '"' + (p.active ? " checked" : "") + "></label></div>";
        }).join("");
        return "<tr><td><b>" + esc(t.name) + '</b><br><span class="muted small">' + (t.kind === "dorm" ? "beds" : "rooms") + '</span></td><td><input type="number" min="0" value="' + t.web_allotment + '" data-allot="' + t.slug + '" style="width:80px;min-height:34px;padding:4px 8px"></td><td><input type="checkbox" data-tact="' + t.slug + '"' + (t.active ? " checked" : "") + "></td><td>" + plans + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    h += '<div class="tile" style="margin:18px 0"><h3>Special prices for dates</h3><p class="muted small">For party weekends and holidays. Applies to every night from → to (inclusive).</p>' +
      '<div class="row2"><div class="field"><label>Rate plan</label><select id="o-plan">' + S.plans.map(function (p) { return '<option value="' + p.id + '">' + esc(typeName(p.room_type)) + " · " + esc(p.name) + "</option>"; }).join("") + '<option value="*bed_only">All dorms · Bed only</option><option value="*breakfast">All · with breakfast</option><option value="*room_only">All privates · Room only</option></select></div>' +
      '<div class="field"><label>Price / night (₱)</label><input id="o-price" type="text" inputmode="decimal"></div></div>' +
      '<div class="row2"><div class="field"><label>From night</label><input id="o-from" type="date"></div><div class="field"><label>To night</label><input id="o-to" type="date"></div></div>' +
      '<div class="btns"><button class="btn sm" id="o-add">Set special price</button><button class="btn sm ghost" id="o-clear">Remove special prices in range</button></div><div id="o-list" class="small muted" style="margin-top:10px"></div></div>';
    h += '<h3>Add-ons</h3><p class="muted small">Leave price empty for “priced at the desk”. Unit: per booking, per night, per guest, per guest per night, or each.</p><div class="table-scroll"><table class="data-table"><thead><tr><th>Name</th><th>Description</th><th>Price (₱)</th><th>Unit</th><th>Max</th><th>On site</th></tr></thead><tbody>' +
      S.addons.map(function (a) {
        return '<tr data-addon="' + a.slug + '"><td><input value="' + esc(a.name) + '" data-k="name"></td><td><input value="' + esc(a.description || "") + '" data-k="description"></td><td><input value="' + (a.price == null ? "" : Number(a.price)) + '" data-k="price" style="width:90px" placeholder="desk"></td><td><select data-k="unit">' +
          ["per_booking", "per_night", "per_guest", "per_guest_night", "per_item"].map(function (u) { return "<option" + (u === a.unit ? " selected" : "") + ">" + u + "</option>"; }).join("") + '</select></td><td><input type="number" min="1" value="' + a.max_qty + '" data-k="max_qty" style="width:64px"></td><td><input type="checkbox" data-k="active"' + (a.active ? " checked" : "") + "></td></tr>";
      }).join("") + '</tbody></table></div><div class="btns" style="margin-top:10px"><button class="btn sm ghost" id="ad-new">+ New add-on</button></div>';
    panel.innerHTML = h;

    $("#s-save", panel).addEventListener("click", function () {
      A().sb.from("booking_settings").update({ open: $("#s-open", panel).checked, checkin_time: $("#s-in", panel).value, checkout_time: $("#s-out", panel).value, payment_note: $("#s-pay", panel).value, cancellation_policy: $("#s-cancel", panel).value }).eq("id", 1)
        .then(function (r) { if (r.error) alert(r.error.message); else { this_ok($("#s-save", panel)); S.loaded = false; } });
    });
    $$("[data-price]", panel).forEach(function (i) { i.addEventListener("change", function () { upd("rate_plans", { id: i.getAttribute("data-price") }, { price: parseFloat(i.value) || 0 }, i); }); });
    $$("[data-pact]", panel).forEach(function (i) { i.addEventListener("change", function () { upd("rate_plans", { id: i.getAttribute("data-pact") }, { active: i.checked }, i); }); });
    $$("[data-allot]", panel).forEach(function (i) { i.addEventListener("change", function () { upd("room_types", { slug: i.getAttribute("data-allot") }, { web_allotment: parseInt(i.value, 10) || 0 }, i); }); });
    $$("[data-tact]", panel).forEach(function (i) { i.addEventListener("change", function () { upd("room_types", { slug: i.getAttribute("data-tact") }, { active: i.checked }, i); }); });
    $$("tr[data-addon]", panel).forEach(function (tr) {
      $$("[data-k]", tr).forEach(function (i) { i.addEventListener("change", function () {
        var k = i.getAttribute("data-k"), v = i.type === "checkbox" ? i.checked : i.value;
        if (k === "price") v = v === "" ? null : parseFloat(v); if (k === "max_qty") v = parseInt(v, 10) || 1;
        var p = {}; p[k] = v; upd("addons", { slug: tr.getAttribute("data-addon") }, p, i);
      }); });
    });
    $("#ad-new", panel).addEventListener("click", function () {
      var name = prompt("Add-on name (e.g. Airport drop-off)"); if (!name) return;
      var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      A().sb.from("addons").insert({ slug: slug, name: name, unit: "per_booking", max_qty: 1, active: false, sort: 200 }).then(function (r) { if (r.error) alert(r.error.message); S.loaded = false; viewRates(panel); });
    });
    function plansFor(sel) {
      if (sel.charAt(0) !== "*") return [sel];
      var code = sel.slice(1); return S.plans.filter(function (p) { return p.code === code; }).map(function (p) { return p.id; });
    }
    function nightsBetween(a, b) { var out = [], d = parse(a), e = parse(b); while (d <= e && out.length < 120) { out.push(iso(d)); d = addDays(d, 1); } return out; }
    $("#o-add", panel).addEventListener("click", function () {
      var a = $("#o-from", panel).value, b = $("#o-to", panel).value || a, price = parseFloat($("#o-price", panel).value);
      if (!a || isNaN(price)) return alert("Pick dates and a price.");
      var rows = []; plansFor($("#o-plan", panel).value).forEach(function (p) { nightsBetween(a, b).forEach(function (n) { rows.push({ rate_plan: p, night: n, price: price }); }); });
      A().sb.from("rate_overrides").upsert(rows).then(function (r) { if (r.error) alert(r.error.message); listOverrides(panel); });
    });
    $("#o-clear", panel).addEventListener("click", function () {
      var a = $("#o-from", panel).value, b = $("#o-to", panel).value || a; if (!a) return alert("Pick the date range.");
      A().sb.from("rate_overrides").delete().in("rate_plan", plansFor($("#o-plan", panel).value)).gte("night", a).lte("night", b).then(function (r) { if (r.error) alert(r.error.message); listOverrides(panel); });
    });
    listOverrides(panel);
  }
  function listOverrides(panel) {
    A().sb.from("rate_overrides").select("*").gte("night", todayISO()).order("night").limit(300).then(function (r) {
      var rows = r.data || [];
      $("#o-list", panel).innerHTML = rows.length ? "Upcoming special prices: " + rows.map(function (o) { return short(o.night) + " " + esc(typeName((S.plans.filter(function (p) { return p.id === o.rate_plan; })[0] || {}).room_type)) + " " + esc(planName(o.rate_plan)) + " " + peso(o.price); }).join(" · ") : "No special prices set.";
    });
  }
  function upd(table, match, patch, el) {
    var q = A().sb.from(table).update(patch);
    Object.keys(match).forEach(function (k) { q = q.eq(k, match[k]); });
    q.then(function (r) { if (r.error) { alert(r.error.message); el.style.borderColor = "var(--err)"; } else { el.style.borderColor = "var(--ok)"; S.loaded = false; } });
  }
  function this_ok(b) { var t = b.textContent; b.textContent = "Saved ✓"; setTimeout(function () { b.textContent = t; }, 1500); }

  window.ZBA = { views: { bookings: viewBookings, calendar: viewCalendar, rates: viewRates }, reload: function () { S.loaded = false; } };
})();
