/* Z Hostel direct booking engine.
   Inventory, prices and add-ons live in Supabase (managed from /admin/). Bookings are
   confirmed instantly by the create_booking() database function, which re-checks
   availability under a lock so a bed can never be sold twice. */
(function () {
  "use strict";
  var CFG = window.Z_CONFIG || {};
  var EVENTS = window.Z_EVENTS || [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var peso = function (n) { return "₱" + Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 }); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parse(s) { var p = (s || "").split("-"); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function nice(d) { return d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" }); }
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var H = { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey };

  function rpc(fn, args) {
    return fetch(CFG.supabaseUrl + "/rest/v1/rpc/" + fn, { method: "POST", headers: H, body: JSON.stringify(args) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error((j && (j.message || j.hint)) || "Something went wrong. Please try again."); return j; }); });
  }
  function get(path) { return fetch(CFG.supabaseUrl + "/rest/v1/" + path, { headers: H }).then(function (r) { if (!r.ok) throw new Error("Could not load"); return r.json(); }); }
  function log(p) {
    try {
      fetch(CFG.supabaseUrl + "/rest/v1/rpc/log_booking_search", { method: "POST", keepalive: true, headers: H, body: JSON.stringify({
        p_checkin: p.checkin || null, p_checkout: p.checkout || null, p_guests: p.guests || null, p_rooms: p.rooms || [],
        p_page: location.pathname, p_source: new URLSearchParams(location.search).get("ref") || "", p_action: p.action || "search" }) }).catch(function () {});
    } catch (e) {}
  }
  function setupDates(ci, co) {
    if (ci.type === "hidden") return function () { var z = ci.closest(".zdr"); if (z && z._zdr) z._zdr.sync(); };
    ci.min = iso(today);
    function sync() { var a = parse(ci.value); if (a) { co.min = iso(addDays(a, 1)); var b = parse(co.value); if (!b || b <= a) co.value = iso(addDays(a, 1)); } }
    ci.addEventListener("change", sync);
    return sync;
  }

  /* ---------- compact booking bar (home, stay pages) ---------- */
  $$("form.booker").forEach(function (f) {
    var ci = f.elements.checkin, co = f.elements.checkout, g = f.elements.guests;
    var sync = setupDates(ci, co);
    var pre = f.getAttribute("data-checkin");
    if (pre && parse(pre) >= today) { ci.value = pre; co.value = f.getAttribute("data-checkout") || iso(addDays(parse(pre), 1)); }
    f.addEventListener("zdr:close", function () { if (ci.value && co.value && f.hasAttribute("data-autosubmit")) f.requestSubmit(); });
    sync();
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!ci.value || !co.value) { var z = f.querySelector(".zdr"); if (z && z._zdr) z._zdr.open(ci.value ? "end" : "start"); return; }
      log({ checkin: ci.value, checkout: co.value, guests: +g.value, action: "bar" });
      location.href = "/book/?" + new URLSearchParams({ checkin: ci.value, checkout: co.value, guests: g.value }).toString();
    });
  });

  /* ---------- manage booking ---------- */
  var mf = $("#m-form");
  if (mf) {
    var qs0 = new URLSearchParams(location.search);
    if (qs0.get("code")) $("#m-code").value = qs0.get("code");
    mf.addEventListener("submit", function (e) {
      e.preventDefault(); var m = $(".form-msg", mf); m.textContent = "";
      rpc("my_booking", { p_code: $("#m-code").value, p_email: $("#m-email").value }).then(function (b) {
        if (!b.ok) { m.className = "form-msg err"; m.textContent = "We couldn't find a booking with that code and email."; $("#m-out").innerHTML = ""; return; }
        b.guest_email = $("#m-email").value.trim(); $("#m-out").innerHTML = receipt(b);
      }).catch(function (err) { m.className = "form-msg err"; m.textContent = err.message; });
    });
  }
  function receipt(b) {
    var lines = (b.items || []).map(function (i) { return "<li><span>" + i.units + " × " + esc(i.room) + " <small>" + esc(i.plan) + "</small></span><b>" + peso(i.amount) + "</b></li>"; }).join("");
    lines += (b.addons || []).map(function (a) { return "<li><span>" + (a.qty > 1 ? a.qty + " × " : "") + esc(a.name) + "</span><b>" + (a.amount == null ? "at the desk" : peso(a.amount)) + "</b></li>"; }).join("");
    if (+b.transfer_discount > 0) lines += '<li class="disc"><span>5% off · paid ahead by transfer</span><b>−' + peso(b.transfer_discount) + "</b></li>";
    if (+b.discount_amount > 0) lines += '<li class="disc"><span>' + esc(b.discount_reason || "Discount") + "</span><b>−" + peso(b.discount_amount) + "</b></li>";
    var st = STATUS[b.status] || b.status;
    return '<div class="summary-card"><span class="tag hot">' + esc(st) + '</span><h3 style="margin-top:12px">' + esc(b.code) + " · " + esc(b.guest_name) + "</h3>" +
      '<div class="sum-dates"><div><span>Check-in</span><b>' + nice(parse(b.checkin)) + '</b></div><div><span>Check-out</span><b>' + nice(parse(b.checkout)) + '</b></div><div><span>Nights</span><b>' + b.nights + "</b></div></div>" +
      '<ul class="sum-lines">' + lines + '</ul><div class="sum-total"><span>Total</span><b>' + peso(b.total) + "</b></div>" +
      '<p class="small muted">' + payLine(b) + "</p>" +
      (b.can_upload && b.pay_method === "transfer" && b.status !== "expired" ? '<div class="btns" style="margin-top:12px"><a class="btn" href="' + payUrl(b) + '">' + (b.status === "pending" ? "Upload your payment" : "Upload another payment") + "</a></div>" : "") + "</div>";
  }
  var STATUS = { pending: "Awaiting payment", pending_payment: "Payment being verified", confirmed: "Confirmed", checked_in: "Checked in", checked_out: "Checked out", cancelled: "Cancelled", no_show: "No-show", expired: "Hold ended" };
  function payUrl(b) { return "/pay/?" + new URLSearchParams({ code: b.code, email: b.guest_email || $("#m-email") && $("#m-email").value || "" }).toString(); }
  function holdTime(s) { return new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function payLine(b) {
    if (b.payment_status === "paid" || (+b.total > 0 && +b.amount_paid >= +b.total - 0.5)) return "Payment: paid in full, thank you.";
    if (b.status === "pending") return "Payment: transfer " + peso(b.to_pay) + " and upload the screenshot by <b>" + esc(holdTime(b.hold_until)) + "</b> — after that the hold ends.";
    if (b.status === "pending_payment") return "Payment: we received your screenshot and are verifying it. You'll get an email once it's confirmed.";
    if (b.status === "expired") return "This hold ended because no payment arrived within 2 hours. You're welcome to book again.";
    if (+b.amount_paid > 0) return "Paid " + peso(b.amount_paid) + " · balance " + peso(+b.total - +b.amount_paid) + " at check-in.";
    return "Payment: pay at check-in (cash, card or GCash).";
  }

  /* ---------- pay page: find booking, upload the transfer screenshot ---------- */
  var pf = $("#p-find");
  if (pf) {
    var pq = new URLSearchParams(location.search);
    if (pq.get("code")) $("#p-code").value = pq.get("code");
    if (pq.get("email")) $("#p-email").value = pq.get("email");
    var pout = $("#p-out"), pmsg = $(".form-msg", pf), cur = null;
    var find = function () {
      pmsg.textContent = ""; pmsg.className = "form-msg";
      var code = $("#p-code").value.trim(), email = $("#p-email").value.trim();
      if (!code || !email) { pmsg.className = "form-msg err"; pmsg.textContent = "Enter your booking code and email."; return; }
      pout.innerHTML = '<p class="muted">Looking up your booking…</p>';
      rpc("my_booking", { p_code: code, p_email: email }).then(function (b) {
        if (!b.ok) { pout.innerHTML = ""; pmsg.className = "form-msg err"; pmsg.textContent = "We couldn't find a booking with that code and email."; return; }
        b.guest_email = email; cur = b; payView(b);
      }).catch(function (e) { pout.innerHTML = ""; pmsg.className = "form-msg err"; pmsg.textContent = e.message; });
    };
    pf.addEventListener("submit", function (e) { e.preventDefault(); find(); });
    if (pq.get("code") && pq.get("email")) find();
    var payView = function (b) {
      var head = '<div class="pay-step"><span class="n">2</span><h2>Transfer ' + peso(b.to_pay) + "</h2></div>";
      var body = "";
      if (b.status === "expired") body = '<div class="notice">This hold ended because no payment arrived within 2 hours, and the beds went back on sale. <a href="/book/?' + new URLSearchParams({ checkin: b.checkin, checkout: b.checkout }) + '">Book again</a> or message us if you already paid.</div>';
      else if (!b.can_upload) body = '<div class="notice ok">' + (b.status === "pending_payment" ? "We received your payment screenshot and are verifying it. You'll get an email once it's confirmed." : "Nothing left to pay on this booking. Thank you!") + "</div>";
      else {
        body = (b.status === "pending" ? '<div class="hold-box"><div><span class="small muted">Amount</span><b class="big">' + peso(b.to_pay) + '</b></div><div><span class="small muted">Upload by</span><b>' + esc(holdTimeP(b.hold_until)) + '</b><span class="countdown" data-until="' + esc(b.hold_until) + '"></span></div></div>' : "") +
          '<p>Pay to one of these accounts' + (b.status === "pending" && +b.transfer_discount > 0 ? " (your 5% is already taken off)" : "") + ":</p>" + accountsP(b.pay_accounts) +
          '<div class="pay-step"><span class="n">3</span><h2>Upload your screenshot</h2></div>' +
          '<form id="p-up" class="form" novalidate><label class="upload-drop" for="p-file"><span id="p-file-label">Tap to choose your payment screenshot (JPG, PNG or PDF, under 10 MB)</span><input id="p-file" type="file" accept="image/*,application/pdf" required></label>' +
          '<img id="p-prev" class="upload-preview" alt="" hidden>' +
          '<div class="field" style="margin-top:12px"><label for="p-method">Paid with</label><select id="p-method"><option value="transfer">Bank transfer</option><option value="gcash">GCash</option><option value="maya">Maya</option></select></div>' +
          '<div class="btns"><button class="btn lg" type="submit">Upload payment</button></div><p class="form-msg" role="alert"></p></form>';
      }
      pout.innerHTML = '<div class="form-card">' + head + body + "</div>" + '<div style="margin-top:18px">' + receipt(b).replace(/<div class="btns"[\s\S]*?<\/div><\/div>$/, "</div>") + "</div>";
      var cd = $(".countdown", pout);
      if (cd) { var end = new Date(cd.getAttribute("data-until")).getTime(); (function tick() { var s = Math.max(0, Math.round((end - Date.now()) / 1000)); cd.textContent = s ? Math.floor(s / 3600) + "h " + String(Math.floor(s % 3600 / 60)).padStart(2, "0") + "m " + String(s % 60).padStart(2, "0") + "s left" : "Hold ended"; if (s) setTimeout(tick, 1000); })(); }
      var up = $("#p-up", pout); if (!up) return;
      var fi = $("#p-file", up);
      fi.addEventListener("change", function () {
        var f = fi.files[0], pr = $("#p-prev", up);
        $("#p-file-label", up).textContent = f ? f.name : "Tap to choose your payment screenshot";
        if (f && /^image\//.test(f.type)) { pr.src = URL.createObjectURL(f); pr.hidden = false; } else pr.hidden = true;
      });
      up.addEventListener("submit", function (e) {
        e.preventDefault();
        var m = $(".form-msg", up), f = fi.files[0], btn = $("button", up);
        m.className = "form-msg"; m.textContent = "";
        if (!f) { m.className = "form-msg err"; m.textContent = "Choose the screenshot of your payment first."; return; }
        if (f.size > 10 * 1024 * 1024) { m.className = "form-msg err"; m.textContent = "That file is over 10 MB. Please upload a smaller screenshot."; return; }
        var fd = new FormData(); fd.append("code", b.code); fd.append("email", b.guest_email); fd.append("method", $("#p-method", up).value); fd.append("file", f);
        btn.disabled = true; btn.textContent = "Uploading…";
        fetch(CFG.supabaseUrl + "/functions/v1/upload-payment", { method: "POST", headers: { apikey: CFG.supabaseKey }, body: fd })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || "The upload didn't go through. Please try again."); return j; }); })
          .then(function (j) {
            pout.innerHTML = '<div class="form-card"><span class="eyebrow">Payment received · ' + esc(j.code) + '</span><h2>Thank you!</h2><p class="lede">We got your screenshot for ' + peso(j.amount) + ". Your beds stay on hold while the front desk verifies it; you'll get a confirmation email once it's done.</p>" +
              '<div class="btns"><a class="btn ghost" href="/book/manage/?code=' + encodeURIComponent(j.code) + '">View my booking</a><a class="btn ghost" href="/events/">What\'s on at Z</a></div></div>';
            window.scrollTo({ top: 0, behavior: "smooth" });
          })
          .catch(function (err) { btn.disabled = false; btn.textContent = "Upload payment"; m.className = "form-msg err"; m.textContent = err.message; });
      });
    };
    var holdTimeP = function (s) { return s ? new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""; };
    var accountsP = function (list) {
      if (!list || !list.length) return '<p class="small">Our account details are in your booking email. Questions? Text <a href="tel:+639178898531">(63) 917 889 8531</a>.</p>';
      return '<div class="acct-list">' + list.map(function (a) { return '<div class="acct"><b>' + esc(a.label) + "</b><span>" + esc(a.name || "") + '</span><span class="acct-no">' + esc(a.number || "") + "</span>" + (a.note ? '<small class="muted">' + esc(a.note) + "</small>" : "") + "</div>"; }).join("") + "</div>";
    };
  }

  /* ---------- full booking engine ---------- */
  var page = $("#book-engine");
  if (!page) return;
  var ci = $("#b-in"), co = $("#b-out"), roomsBox = $("#b-rooms"), addBox = $("#b-addons"), sum = $("#b-summary"), go = $("#b-go"), msg = $("#b-msg"), form = $("#b-form");
  var syncDates = setupDates(ci, co);
  var qs = new URLSearchParams(location.search);
  if (qs.get("checkin") && parse(qs.get("checkin")) >= today) { ci.value = qs.get("checkin"); co.value = qs.get("checkout") || ""; }
  syncDates();
  var focusRoom = qs.get("room");
  var CAT = { types: [], plans: [], addons: [], settings: {} };
  var AV = null, qty = {}, aqty = {}, nights = 0, PAY = null, payPick = null;

  Promise.all([
    get("room_types?select=*&active=eq.true&order=sort"),
    get("rate_plans?select=*&active=eq.true&order=sort"),
    get("addons?select=*&active=eq.true&order=sort"),
    get("booking_settings?select=*")
  ]).then(function (r) {
    CAT.types = r[0]; CAT.plans = r[1]; CAT.addons = r[2]; CAT.settings = r[3][0] || {};
    $("#b-terms").innerHTML = "<p>" + esc(CAT.settings.cancellation_policy || "") + "</p><p>Check-in from " + esc(CAT.settings.checkin_time) + ", check-out by " + esc(CAT.settings.checkout_time) +
      ". " + esc(CAT.settings.payment_note || "") + " A valid ID is needed at check-in. Rates are in Philippine pesos.</p>";
    renderAddons();
    if (ci.value && co.value) load(); else { renderRooms(); var z = $(".zdr", page); if (z && z._zdr && !window.matchMedia("(max-width: 760px)").matches) z._zdr.open("start"); }
  }).catch(function () { roomsBox.innerHTML = '<p class="form-msg err">Booking is temporarily unavailable. Please <a href="/contact/?type=room">message us</a>.</p>'; });

  ci.addEventListener("change", load); co.addEventListener("change", load);
  page.addEventListener("zdr:close", function () { if (ci.value && co.value && !Object.keys(qty).length) setTimeout(function () { $("#st-rooms").scrollIntoView({ behavior: "smooth", block: "start" }); }, 150); });

  function load() {
    var a = parse(ci.value), b = parse(co.value);
    if (!a || !b || b <= a) { AV = null; renderRooms(); render(); return; }
    roomsBox.innerHTML = '<p class="muted">Checking availability…</p>';
    rpc("booking_availability", { p_checkin: ci.value, p_checkout: co.value }).then(function (r) {
      if (!r.ok) { AV = null; roomsBox.innerHTML = '<p class="form-msg err">' + esc(r.error || "Online booking is paused right now. Please message us.") + "</p>"; render(); return; }
      AV = {}; nights = r.nights; PAY = r.pay || null;
      r.room_types.forEach(function (t) { AV[t.room_type] = t; });
      Object.keys(qty).forEach(function (k) { var p = planById(k); if (!p || !AV[p.room_type]) delete qty[k]; });
      renderRooms(); render();
      log({ checkin: ci.value, checkout: co.value, guests: +(qs.get("guests") || 0) || null, action: "search" });
    }).catch(function (e) { roomsBox.innerHTML = '<p class="form-msg err">' + esc(e.message) + "</p>"; });
  }
  function planById(id) { return CAT.plans.filter(function (p) { return p.id === id; })[0]; }
  function typeBy(slug) { return CAT.types.filter(function (t) { return t.slug === slug; })[0]; }
  function usedFor(slug) { return Object.keys(qty).reduce(function (n, k) { var p = planById(k); return n + (p && p.room_type === slug ? qty[k] : 0); }, 0); }

  function renderRooms() {
    var types = CAT.types.slice();
    if (focusRoom) types.sort(function (a, b) { return (b.slug === focusRoom) - (a.slug === focusRoom); });
    roomsBox.innerHTML = types.map(function (t) {
      var av = AV && AV[t.slug];
      var left = av ? av.available : null;
      var unit = t.kind === "dorm" ? "bed" : "room";
      var badge = !AV ? "" : left <= 0 ? '<span class="tag">Sold out</span>' : left <= 3 ? '<span class="tag hot">' + left + " " + unit + (left > 1 ? "s" : "") + " left</span>" : "";
      var tags = '<span class="tag">' + (t.kind === "dorm" ? "Dorm" : "Private · sleeps 2") + "</span>" + (t.social_floor ? '<span class="tag">Social Fun Floor</span>' : "") + (t.women_only ? '<span class="tag">Women only</span>' : "");
      var plans = (av ? av.plans : CAT.plans.filter(function (p) { return p.room_type === t.slug; }).map(function (p) { return { id: p.id, name: p.name, breakfast: p.includes_breakfast, nightly: p.price }; }))
        .map(function (p) {
          var price = av ? peso(p.stay_total) + ' <small>/ ' + unit + " · " + nights + " night" + (nights > 1 ? "s" : "") + "</small>" : "from " + peso(p.nightly) + ' <small>/ ' + unit + " / night</small>";
          var q = qty[p.id] || 0;
          var dis = !av || left <= 0;
          return '<div class="plan-row"><div><b>' + esc(p.name) + "</b>" + (p.breakfast ? ' <span class="muted small">· buffet breakfast at the Z Café</span>' : "") + '<div class="plan-price">' + price + "</div></div>" +
            '<div class="qty" role="group" aria-label="' + esc(t.name + ", " + p.name) + '"><button type="button" class="minus" data-plan="' + p.id + '" aria-label="One fewer"' + (q ? "" : " disabled") + '>−</button><b>' + q + '</b><button type="button" class="plus" data-plan="' + p.id + '" aria-label="One more"' + (dis || usedFor(t.slug) >= left ? " disabled" : "") + ">+</button></div></div>";
        }).join("");
      return '<div class="room-pick room-type' + (usedFor(t.slug) ? " on" : "") + (AV && left <= 0 ? " soldout" : "") + '" id="rt-' + t.slug + '">' +
        '<img src="/assets/img/' + esc(t.image) + '.webp" alt="" loading="lazy">' +
        '<div class="rt-body"><div class="btns" style="gap:6px">' + tags + badge + "</div><h3>" + esc(t.name) + "</h3><p>" + esc(t.description || "") + "</p>" +
        '<p class="small muted" style="margin-top:4px">' + (t.features || []).map(esc).join(" · ") + "</p></div>" +
        '<div class="plans">' + plans + (AV ? "" : '<p class="small muted" style="margin:6px 0 0">Pick dates to book.</p>') + "</div></div>";
    }).join("");
    $$(".plus, .minus", roomsBox).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-plan"), p = planById(id), d = btn.classList.contains("plus") ? 1 : -1;
        var left = AV && AV[p.room_type] ? AV[p.room_type].available : 0;
        var next = Math.max(0, (qty[id] || 0) + d);
        if (d > 0 && usedFor(p.room_type) + 1 > left) return;
        if (next) qty[id] = next; else delete qty[id];
        renderRooms(); render();
        var el = $('[data-plan="' + id + '"].' + (d > 0 ? "plus" : "minus"), roomsBox); if (el && !el.disabled) el.focus();
      });
    });
    if (focusRoom && AV) { var el = $("#rt-" + focusRoom); if (el && !renderRooms.scrolled) { renderRooms.scrolled = true; el.scrollIntoView({ behavior: "smooth", block: "center" }); } }
  }

  function renderAddons() {
    if (!CAT.addons.length) { $("#st-addons").hidden = true; return; }
    addBox.innerHTML = CAT.addons.map(function (a) {
      var unitTxt = { per_booking: "", per_night: " / night", per_guest: " / guest", per_guest_night: " / guest / night", per_item: " each" }[a.unit] || "";
      var price = a.price == null ? '<span class="muted">priced at the desk</span>' : peso(a.price) + '<span class="muted">' + unitTxt + "</span>";
      var q = aqty[a.slug] || 0;
      var ctl = a.max_qty > 1
        ? '<div class="qty"><button type="button" class="aminus" data-a="' + a.slug + '"' + (q ? "" : " disabled") + ' aria-label="Fewer">−</button><b>' + q + '</b><button type="button" class="aplus" data-a="' + a.slug + '"' + (q >= a.max_qty ? " disabled" : "") + ' aria-label="More">+</button></div>'
        : '<label class="switch"><input type="checkbox" data-a="' + a.slug + '"' + (q ? " checked" : "") + '><span>Add</span></label>';
      return '<div class="addon' + (q ? " on" : "") + '"><div><b>' + esc(a.name) + '</b><p class="small muted">' + esc(a.description || "") + '</p><p class="small">' + price + "</p></div>" + ctl + "</div>";
    }).join("");
    $$(".aplus,.aminus", addBox).forEach(function (b) { b.addEventListener("click", function () { var s = b.getAttribute("data-a"); var a = CAT.addons.filter(function (x) { return x.slug === s; })[0]; var n = Math.max(0, Math.min(a.max_qty, (aqty[s] || 0) + (b.classList.contains("aplus") ? 1 : -1))); if (n) aqty[s] = n; else delete aqty[s]; renderAddons(); render(); }); });
    $$('input[type=checkbox][data-a]', addBox).forEach(function (c) { c.addEventListener("change", function () { if (c.checked) aqty[c.getAttribute("data-a")] = 1; else delete aqty[c.getAttribute("data-a")]; renderAddons(); render(); }); });
  }

  function guestsCount() { return Object.keys(qty).reduce(function (n, k) { var p = planById(k), t = p && typeBy(p.room_type); return n + qty[k] * (t ? t.guests_per_unit : 1); }, 0); }
  function overlaps(a, b) { return EVENTS.filter(function (ev) { var s = parse(ev.start), e = parse(ev.end || ev.start); return s && s < b && addDays(e, 1) > a; }); }

  function render() {
    var a = parse(ci.value), b = parse(co.value), ok = a && b && b > a;
    var h = "", total = 0, deskItems = 0, subtotal = 0, disc = 0;
    if (!ok) h = '<p class="muted">Pick your dates to start.</p>';
    else {
      h += '<div class="sum-dates"><div><span>Check-in</span><b>' + nice(a) + '</b></div><div><span>Check-out</span><b>' + nice(b) + '</b></div><div><span>Nights</span><b>' + Math.round((b - a) / 864e5) + "</b></div></div>";
      overlaps(a, b).forEach(function (ev) { h += '<div class="sum-event"><span class="tag hot live">' + esc(ev.when) + "</span><br>Your stay lines up with <b>" + esc(ev.name) + "</b>. " + esc(ev.note) + "</div>"; });
      var lines = "";
      Object.keys(qty).forEach(function (k) {
        var p = planById(k), t = typeBy(p.room_type), av = AV && AV[p.room_type];
        var pl = av && av.plans.filter(function (x) { return x.id === k; })[0];
        var amt = pl ? pl.stay_total * qty[k] : 0; total += amt;
        lines += "<li><span>" + qty[k] + " × " + esc(t.name) + " <small>" + esc(p.name) + "</small></span><b>" + peso(amt) + "</b></li>";
      });
      var g = guestsCount();
      Object.keys(aqty).forEach(function (s) {
        var ad = CAT.addons.filter(function (x) { return x.slug === s; })[0]; if (!ad) return;
        var mult = { per_night: nights, per_guest: g, per_guest_night: g * nights }[ad.unit] || 1;
        var amt = ad.price == null ? null : ad.price * aqty[s] * mult;
        if (amt == null) deskItems++; else total += amt;
        lines += "<li><span>" + (aqty[s] > 1 ? aqty[s] + " × " : "") + esc(ad.name) + "</span><b>" + (amt == null ? '<small class="muted">at the desk</small>' : peso(amt)) + "</b></li>";
      });
      subtotal = total;
      var tOk = PAY && PAY.transfer_allowed, rate = PAY ? +PAY.rate : 0.05;
      if (lines && payMethod() === "transfer" && tOk) { disc = Math.round(total * rate * 100) / 100; lines += '<li class="disc"><span>5% off · pay ahead by transfer</span><b>−' + peso(disc) + "</b></li>"; total -= disc; }
      if (lines) h += '<ul class="sum-lines">' + lines + '</ul><div class="sum-total"><span>Total</span><b>' + peso(total) + "</b></div>" +
        '<p class="small muted">' + (payMethod() === "transfer" ? "Transfer within 2 hours of booking and upload the screenshot; we hold your beds meanwhile." : "Pay at check-in: cash, card or GCash.") + (deskItems ? " Extras marked “at the desk” are added when you arrive." : "") + "</p>";
      else h += '<p class="muted small">Choose at least one bed or room.</p>';
    }
    sum.innerHTML = h;
    var hasItems = Object.keys(qty).length > 0;
    go.disabled = !(ok && hasItems);
    go.textContent = !ok ? "Choose your dates" : !hasItems ? "Choose a bed or room" : (payMethod() === "transfer" ? "Book & pay ahead · " : "Confirm booking · ") + peso(total);
    renderPay(subtotal);
    var mb = $("#b-mobile"); if (mb) { $("b", mb).textContent = ok && hasItems ? peso(total) : ok ? "Choose a bed or room" : "Choose dates"; $("#b-mtotal").textContent = ok ? Math.round((b - a) / 864e5) + " night(s) · " + guestsCount() + " guest(s)" : "Z Hostel Poblacion"; $("button", mb).disabled = go.disabled; $("button", mb).textContent = hasItems ? "Book" : "Next"; }
  }

  function submit() {
    msg.textContent = ""; msg.className = "form-msg";
    if (form.elements.website_hp.value) return;
    if (!form.checkValidity()) { $("#st-guest").scrollIntoView({ behavior: "smooth", block: "start" }); form.reportValidity(); return; }
    go.disabled = true; var label = go.textContent; go.textContent = "Booking…";
    var items = Object.keys(qty).map(function (k) { return { rate_plan: k, units: qty[k] }; });
    var adds = Object.keys(aqty).map(function (s) { return { slug: s, qty: aqty[s] }; });
    var f = form.elements;
    rpc("create_booking", {
      p_checkin: ci.value, p_checkout: co.value, p_items: items, p_addons: adds,
      p_guest_name: f.name.value, p_guest_email: f.email.value, p_guest_phone: f.phone.value, p_country: f.country.value,
      p_arrival_time: f.arrival.value, p_notes: f.notes.value, p_consent: f.consent.checked, p_marketing: f.marketing.checked,
      p_ref: f.ref.value || new URLSearchParams(location.search).get("ref") || null,
      p_pay_method: payMethod()
    }).then(function (r) {
      log({ checkin: ci.value, checkout: co.value, guests: r.guests, rooms: items.map(function (i) { return i.units + "x " + i.rate_plan; }), action: "checkout" });
      return rpc("my_booking", { p_code: r.code, p_email: f.email.value }).then(function (b) { done(r, b); });
    }).catch(function (err) {
      go.disabled = false; go.textContent = label;
      msg.className = "form-msg err"; msg.textContent = err.message;
      if (/left in|no longer|closes/.test(err.message)) load();
    });
  }
  go.addEventListener("click", function () {
    if (!form.checkValidity()) { $("#st-guest").scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(function () { form.reportValidity(); }, 400); return; }
    submit();
  });
  var mbtn = $("#b-mobile button");
  if (mbtn) mbtn.addEventListener("click", function () { if (go.disabled) { (Object.keys(qty).length ? $("#st-guest") : $("#st-rooms")).scrollIntoView({ behavior: "smooth" }); } else go.click(); });

  function done(r, b) {
    page.hidden = true; var mb = $("#b-mobile"); if (mb) mb.style.display = "none";
    var ph = $(".page-head"); if (ph) ph.hidden = true;
    var cal = calLink(b);
    var out = $("#b-done"); out.hidden = false;
    b.guest_email = form.elements.email.value;
    if (b.status === "pending") { out.innerHTML = holdScreen(r, b); startCountdown(out, b.hold_until); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    out.innerHTML = '<div style="max-width:760px;margin:0 auto"><span class="eyebrow">Booking confirmed</span><h2>See you at Z, ' + esc((b.guest_name || "").split(" ")[0]) + ".</h2>" +
      '<p class="lede">Your booking code is <b>' + esc(r.code) + "</b>. Screenshot this page or note the code; you'll need it at check-in. Check-in from " + esc(r.checkin_time) + ", check-out by " + esc(r.checkout_time) + ".</p>" +
      receipt(b) +
      '<div class="btns" style="margin-top:20px"><a class="btn" href="' + cal + '" target="_blank" rel="noopener">Add to Google Calendar</a><a class="btn ghost" href="/book/manage/?code=' + encodeURIComponent(r.code) + '">Find my booking later</a><a class="btn ghost" href="/z-street/">What\'s on</a></div>' +
      '<p class="small muted" style="margin-top:18px">Need to change or cancel? Message the front desk with your code: <a href="tel:+639178898531">(63) 917 889 8531</a>.</p></div>';
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function payMethod() { return payPick || (PAY && PAY.transfer_allowed ? "transfer" : "desk"); }
  function renderPay(subtotal) {
    var box = $("#b-pay"); if (!box) return;
    var tOk = PAY && PAY.transfer_allowed, m = payMethod();
    var tOpt = $('[data-pay="transfer"]', box), dOpt = $('[data-pay="desk"]', box);
    $("input", tOpt).disabled = !tOk; tOpt.classList.toggle("off", !tOk);
    $("input", tOpt).checked = m === "transfer" && tOk; $("input", dOpt).checked = m === "desk" || !tOk;
    tOpt.classList.toggle("on", m === "transfer" && !!tOk); dOpt.classList.toggle("on", m === "desk" || !tOk);
    $("#b-pay-tnote").textContent = !PAY ? "Pick your dates first." : tOk
      ? "Transfer within " + Math.round((PAY.hold_minutes || 120) / 60) + " hours of booking and upload your screenshot. We hold your beds meanwhile."
      : "Not available for these dates: paying ahead closes " + (PAY.cutoff_hours || 24) + " hours before check-in. Please pay at check-in.";
    var rate = PAY ? +PAY.rate : 0.05;
    $("#b-pay-tamt").innerHTML = subtotal && tOk ? peso(Math.round(subtotal * (1 - rate) * 100) / 100) + '<small>save ' + peso(Math.round(subtotal * rate * 100) / 100) + "</small>" : "";
    $("#b-pay-damt").innerHTML = subtotal ? peso(subtotal) : "";
  }
  $$('#b-pay input[name="pay"]').forEach(function (i) { i.addEventListener("change", function () { if (i.checked) { payPick = i.value; render(); } }); });

  function accountsHtml(list) {
    if (!list || !list.length) return '<p class="small">Our bank / e-wallet details are on their way in your email. Questions? Text <a href="tel:+639178898531">(63) 917 889 8531</a>.</p>';
    return '<div class="acct-list">' + list.map(function (a) { return '<div class="acct"><b>' + esc(a.label) + "</b><span>" + esc(a.name || "") + '</span><span class="acct-no">' + esc(a.number || "") + "</span>" + (a.note ? '<small class="muted">' + esc(a.note) + "</small>" : "") + "</div>"; }).join("") + "</div>";
  }
  function holdScreen(r, b) {
    return '<div style="max-width:760px;margin:0 auto"><span class="eyebrow">Beds on hold · ' + esc(r.code) + '</span><h2>Almost there, ' + esc((b.guest_name || "").split(" ")[0]) + ".</h2>" +
      '<div class="hold-box"><div><span class="small muted">Transfer</span><b class="big">' + peso(b.to_pay) + '</b></div><div><span class="small muted">Upload the screenshot by</span><b>' + esc(holdTime(b.hold_until)) + '</b><span class="countdown" data-until="' + esc(b.hold_until) + '"></span></div></div>' +
      '<p class="lede">We\'re holding your beds for 2 hours. Pay to one of the accounts below, then upload a screenshot of the payment. We\'ve emailed you these details too.</p>' +
      accountsHtml(r.pay_accounts || b.pay_accounts) +
      '<div class="btns" style="margin:20px 0"><a class="btn lg" href="' + payUrl(b) + '">Upload your payment</a></div>' +
      receipt(b).replace(/<div class="btns"[\s\S]*?<\/div><\/div>$/, "</div>") +
      '<p class="small muted" style="margin-top:18px">No payment within 2 hours? The hold ends and the beds go back on sale; you can book again and pay at check-in. Questions: <a href="tel:+639178898531">(63) 917 889 8531</a>.</p></div>';
  }
  function startCountdown(root, until) {
    var el = $(".countdown", root); if (!el || !until) return;
    var end = new Date(until).getTime();
    (function tick() {
      var s = Math.max(0, Math.round((end - Date.now()) / 1000));
      el.textContent = s ? Math.floor(s / 3600) + "h " + String(Math.floor(s % 3600 / 60)).padStart(2, "0") + "m " + String(s % 60).padStart(2, "0") + "s left" : "Hold ended";
      if (s) setTimeout(tick, 1000);
    })();
  }
  function calLink(b) {
    var d = function (s) { return s.replace(/-/g, ""); };
    return "https://calendar.google.com/calendar/render?" + new URLSearchParams({ action: "TEMPLATE", text: "Z Hostel stay · " + b.code,
      dates: d(b.checkin) + "/" + d(b.checkout), details: "Booking " + b.code + ". Check-in from 2:00 PM. 5660 Don Pedro St., Poblacion, Makati.", location: "Z Hostel, 5660 Don Pedro St., Poblacion, Makati" }).toString();
  }
  render();
})();
