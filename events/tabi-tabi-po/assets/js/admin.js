/* TABI TABI PO — admin dashboard */
(function () {
  "use strict";
  var CFG = window.TTP_CONFIG || {};
  var SLUG = CFG.eventSlug;
  var SESSION_KEY = "ttp_admin_pass";
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var configured = CFG.supabaseUrl && CFG.supabaseAnonKey &&
    CFG.supabaseUrl.indexOf("YOUR-") === -1 && CFG.supabaseAnonKey.indexOf("YOUR-") === -1;
  var db = (configured && window.supabase)
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: false } })
    : null;

  var pass = null;
  var rows = [];
  var inquiries = [];
  var TYPES = { guest: "Guest", sponsor: "Sponsor guest", media: "Media", artist: "Artist", vip: "VIP" };
  var NIGHTS = CFG.eventNights || [];
  var tonight = null, eventNights = [];
  function nightShort(d) { var n = NIGHTS.find(function (x) { return x.date === d; }); return n ? n.label.split(",")[0] : d; }
  function nightsText(r) { return !r.nights ? "Any (early RSVP)" : r.nights.length === NIGHTS.length && NIGHTS.length > 1 ? "Both" : r.nights.map(nightShort).join(" + "); }
  var autoTimer = null;

  function rpc(name, args) {
    if (!db) return Promise.reject(new Error("Not connected. Add the Supabase URL and anon key to config.js."));
    return db.rpc(name, args).then(function (res) {
      if (res.error) throw new Error(res.error.message);
      return res.data;
    });
  }
  function getPass() { try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return pass; } }
  function setPass(p) { pass = p; try { p ? sessionStorage.setItem(SESSION_KEY, p) : sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }

  function showDash(mustChange) {
    $("#lock").hidden = true; $("#dash").hidden = false;
    load();
    clearInterval(autoTimer);
    autoTimer = setInterval(function () { if (!document.hidden) load(true); }, 60000);
    if (mustChange) openPass(true);
  }
  function logout(msg) {
    setPass(null); clearInterval(autoTimer); stopScanner();
    $("#dash").hidden = true; $("#lock").hidden = false;
    $("#lock-error").textContent = msg || "";
    $("#lock-form").passcode.value = ""; $("#lock-form").passcode.focus();
  }

  $("#lock-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var p = this.passcode.value; var err = $("#lock-error"); err.textContent = "";
    if (!p) { err.textContent = "Enter the passcode."; return; }
    var btn = $("#lock-submit"); btn.disabled = true;
    rpc("admin_login", { p_passcode: p }).then(function (r) {
      if (!r.ok) { err.textContent = r.error; return; }
      setPass(p); showDash(r.must_change);
    }).catch(function (ex) { err.textContent = ex.message; })
      .then(function () { btn.disabled = false; });
  });
  $("#logout").addEventListener("click", function () { logout(); });

  function load(silent) {
    var p = pass || getPass(); if (!p) return logout();
    if (!silent) $("#last-updated").textContent = "Loading…";
    return rpc("admin_list_rsvps", { p_passcode: p, p_event_slug: SLUG }).then(function (r) {
      if (!r.ok) return logout(r.error);
      rows = r.rows || []; tonight = r.tonight; eventNights = r.event_nights || [];
      $("#dash-error").textContent = "";
      render();
      loadInquiries();
      $("#last-updated").textContent = "Updated " + new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) + " · " + SLUG;
    }).catch(function (ex) { $("#dash-error").textContent = "Couldn't load guests: " + ex.message; });
  }
  $("#refresh").addEventListener("click", function () { load(); });

  function loadInquiries() {
    rpc("admin_list_sponsor_inquiries", { p_passcode: pass || getPass(), p_event_slug: SLUG }).then(function (r) {
      if (!r.ok) return;
      inquiries = r.rows || []; renderInquiries();
    }).catch(function () {});
  }
  function renderInquiries() {
    var body = $("#sp-rows"); body.textContent = "";
    $("#s-sp").textContent = inquiries.length;
    $("#sp-count").textContent = "(" + inquiries.length + ")";
    $("#sp-empty").hidden = inquiries.length > 0;
    inquiries.forEach(function (q) {
      var tr = document.createElement("tr");
      tr.appendChild(td(q.company, "name"));
      tr.appendChild(td(q.contact_name));
      var em = td(""); var a = document.createElement("a"); a.href = "mailto:" + q.email; a.textContent = q.email; em.appendChild(a); tr.appendChild(em);
      tr.appendChild(td(q.phone));
      tr.appendChild(td(q.interest));
      tr.appendChild(td(q.message, "wrap"));
      tr.appendChild(td(fmtDate(q.created_at)));
      var st = td(""); var sel = document.createElement("select");
      ["new", "contacted", "confirmed", "declined"].forEach(function (v) {
        var o = document.createElement("option"); o.value = v; o.textContent = v.charAt(0).toUpperCase() + v.slice(1); if (q.status === v) o.selected = true; sel.appendChild(o);
      });
      sel.setAttribute("aria-label", "Status for " + q.company);
      sel.addEventListener("change", function () {
        rpc("admin_set_inquiry_status", { p_passcode: pass || getPass(), p_id: q.id, p_status: sel.value }).then(function (res) {
          if (!res.ok) $("#dash-error").textContent = res.error; else q.status = sel.value;
        });
      });
      st.appendChild(sel); tr.appendChild(st);
      body.appendChild(tr);
    });
  }

  /* ---------- Promoter link builder ---------- */
  function buildLink() {
    var ref = $("#lb-ref").value.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 60);
    var type = $("#lb-type").value;
    var base = CFG.siteUrl || location.href.replace(/admin\.html.*$/, "");
    var q = [];
    if (ref) q.push("ref=" + encodeURIComponent(ref));
    if (type) q.push("as=" + type);
    $("#lb-out").value = base + (q.length ? "?" + q.join("&") : "");
  }
  $("#lb-ref").addEventListener("input", buildLink);
  $("#lb-type").addEventListener("change", buildLink);
  $("#lb-copy").addEventListener("click", function () {
    var out = $("#lb-out"), btn = this;
    (navigator.clipboard ? navigator.clipboard.writeText(out.value) : Promise.reject()).catch(function () { out.select(); document.execCommand("copy"); })
      .then(function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy link"; }, 1500); });
  });
  buildLink();


  var HEADS = { "solo": 1, "1-2": 2.5, "3-5": 5, "6+": 7 };
  function render() {
    var active = rows.filter(function (r) { return r.status !== "cancelled"; });
    $("#s-total").textContent = active.length;
    var isEventNight = eventNights.indexOf(tonight) > -1;
    $("#s-in").textContent = isEventNight ? rows.filter(function (r) { return (r.checkins || []).indexOf(tonight) > -1; }).length
      : rows.filter(function (r) { return r.status === "checked_in"; }).length;
    $("#s-in-label").textContent = isEventNight ? "Checked in tonight (" + nightShort(tonight) + ")" : "Checked in (all nights)";
    [0, 1].forEach(function (i) {
      var n = NIGHTS[i]; var el = $("#s-n" + (i + 1)); if (!el) return;
      if (!n) { el.parentNode.hidden = true; return; }
      el.textContent = active.filter(function (r) { return !r.nights || r.nights.indexOf(n.date) > -1; }).length;
      $("#s-n" + (i + 1) + "-label").textContent = n.label + " RSVPs";
    });
    $("#s-heads").textContent = Math.round(active.reduce(function (n, r) { return n + (HEADS[r.party_size] || 1); }, 0));
    $("#s-survey").textContent = active.length ? Math.round(active.filter(function (r) { return r.answers_count >= 3; }).length / active.length * 100) + "%" : "0%";
    $("#s-z").textContent = active.filter(function (r) { return r.staying === "Staying at Z Hostel"; }).length;
    $("#s-opt").textContent = active.filter(function (r) { return r.marketing_opt_in; }).length;
    renderBreakdowns(active);
    renderTable();
  }

  function count(list, key, multi) {
    var m = {};
    list.forEach(function (r) {
      var v = key === "_nights" ? nightsText(r) : r[key];
      if (multi) (v || []).forEach(function (x) { m[x] = (m[x] || 0) + 1; });
      else if (v) m[v] = (m[v] || 0) + 1;
    });
    return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }

  function renderBreakdowns(list) {
    var groups = [
      ["Coming as", "costume"], ["Bringing", "party_size"], ["Drink", "drink"], ["Staying", "staying"],
      ["Payment", "payment"], ["Here for", "interests", true], ["Age", "age_bracket"],
      ["Came from", "source"], ["Guest type", "guest_type"], ["Nights", "_nights"]
    ];
    var box = $("#breakdowns"); box.textContent = "";
    groups.forEach(function (g) {
      var data = count(list, g[1], g[2]);
      var card = document.createElement("div"); card.className = "bd";
      var h = document.createElement("h3"); h.textContent = g[0]; card.appendChild(h);
      if (!data.length) { var p = document.createElement("p"); p.className = "none"; p.textContent = "No answers yet."; card.appendChild(p); }
      var max = data.length ? data[0][1] : 1;
      data.slice(0, 8).forEach(function (d) {
        var bar = document.createElement("div"); bar.className = "bar";
        var l = document.createElement("span"); l.textContent = g[1] === "party_size" ? partyLabel(d[0]) : g[1] === "guest_type" ? (TYPES[d[0]] || d[0]) : d[0];
        var n = document.createElement("span"); n.className = "n"; n.textContent = d[1];
        var t = document.createElement("div"); t.className = "track";
        var f = document.createElement("div"); f.className = "fill"; f.style.width = (d[1] / max * 100) + "%";
        t.appendChild(f); bar.appendChild(l); bar.appendChild(n); bar.appendChild(t); card.appendChild(bar);
      });
      box.appendChild(card);
    });
  }

  function partyLabel(v) { return v === "solo" ? "Just them" : v ? "+" + v : ""; }
  function fmtDate(s) {
    if (!s) return "";
    return new Date(s).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
  }
  var STATUS_LABEL = { registered: "Registered", checked_in: "Checked in", cancelled: "Cancelled" };

  function filtered() {
    var q = $("#search").value.trim().toLowerCase(), st = $("#status-filter").value;
    return rows.filter(function (r) {
      if (st && r.status !== st) return false;
      if (!q) return true;
      return [r.full_name, r.email, r.phone, r.ticket_code, r.costume, r.notes, r.source, r.guest_type].join(" ").toLowerCase().indexOf(q) > -1;
    });
  }

  function td(text, cls) { var c = document.createElement("td"); if (cls) c.className = cls; c.textContent = text == null ? "" : text; return c; }

  function renderTable() {
    var list = filtered(), body = $("#rows"); body.textContent = "";
    $("#list-count").textContent = "(" + list.length + " of " + rows.length + ")";
    $("#empty").hidden = list.length > 0;
    $("#empty").textContent = rows.length ? "No guests match your search." : "No RSVPs yet. Share the site link to start filling the list.";
    list.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.appendChild(td(r.full_name, "name"));
      tr.appendChild(td(r.email));
      tr.appendChild(td(r.phone));
      tr.appendChild(td(partyLabel(r.party_size)));
      tr.appendChild(td(r.age_bracket));
      tr.appendChild(td(r.costume));
      tr.appendChild(td(r.staying));
      tr.appendChild(td(r.drink));
      tr.appendChild(td(r.payment));
      tr.appendChild(td((r.interests || []).join(", "), "wrap"));
      tr.appendChild(td(r.notes, "wrap"));
      tr.appendChild(td(r.ticket_code, "code"));
      tr.appendChild(td(nightsText(r)));
      var ty = td(""); var tg = document.createElement("span"); tg.className = "tag" + (r.guest_type && r.guest_type !== "guest" ? " gold" : ""); tg.textContent = TYPES[r.guest_type] || "Guest"; ty.appendChild(tg); tr.appendChild(ty);
      tr.appendChild(td(r.source || "direct"));
      tr.appendChild(td(r.marketing_opt_in ? "Yes" : "No"));
      var s = td(""); var pill = document.createElement("span"); pill.className = "status " + r.status; pill.textContent = STATUS_LABEL[r.status] || r.status;
      s.appendChild(pill);
      if ((r.checkins || []).length) { s.appendChild(document.createElement("br")); var sm = document.createElement("small"); sm.className = "muted"; sm.textContent = "In: " + r.checkins.map(nightShort).join(", "); s.appendChild(sm); }
      tr.appendChild(s);
      tr.appendChild(td(fmtDate(r.created_at)));
      var a = td(""); var wrap = document.createElement("div"); wrap.className = "row-actions";
      function act(label, status) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = label;
        b.addEventListener("click", function () { setStatus(r, status, b); });
        wrap.appendChild(b);
      }
      var inTonight = (r.checkins || []).indexOf(tonight) > -1;
      if (r.status === "cancelled") act("Restore", "registered");
      else {
        if (eventNights.indexOf(tonight) > -1 && !inTonight) act("Check in tonight", "checked_in");
        if ((r.checkins || []).length) act("Undo check-in", "registered");
        if (!(r.checkins || []).length) act("Cancel", "cancelled");
      }
      a.appendChild(wrap); tr.appendChild(a);
      body.appendChild(tr);
    });
  }
  $("#search").addEventListener("input", renderTable);
  $("#status-filter").addEventListener("change", renderTable);

  function setStatus(r, status, btn) {
    if (status === "cancelled" && !confirm("Cancel " + r.full_name + "'s RSVP? Their QR will be refused at the door.")) return;
    btn.disabled = true;
    rpc("admin_set_status", { p_passcode: pass || getPass(), p_id: r.id, p_status: status }).then(function (res) {
      if (!res.ok) { $("#dash-error").textContent = res.error; return; }
      load(true);
    }).catch(function (ex) { $("#dash-error").textContent = ex.message; btn.disabled = false; });
  }

  $("#export").addEventListener("click", function () {
    var cols = ["full_name", "email", "phone", "party_size", "age_bracket", "costume", "staying", "drink", "payment", "interests", "notes", "ticket_code", "nights", "checkins", "guest_type", "source", "marketing_opt_in", "status", "checked_in_at", "created_at"];
    function esc(v) {
      if (Array.isArray(v)) v = v.join("; ");
      v = v == null ? "" : String(v);
      if (/^[=+\-@]/.test(v)) v = "'" + v; // stop spreadsheet formula injection
      return '"' + v.replace(/"/g, '""') + '"';
    }
    var lines = [cols.join(",")].concat(filtered().map(function (r) { return cols.map(function (c) { return esc(r[c]); }).join(","); }));
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = SLUG + "-guests-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  });

  var scanner = null, lastCode = null, lastAt = 0, busy = false;
  var scanModal = $("#scan-modal");

  function showResult(kind, title, detail) {
    var box = $("#scan-result"); box.hidden = false; box.className = "scan-result " + kind; box.textContent = "";
    var b = document.createElement("b"); b.textContent = title; box.appendChild(b);
    if (detail) { var p = document.createElement("p"); p.textContent = detail; box.appendChild(p); }
    if (navigator.vibrate) navigator.vibrate(kind === "ok" ? 80 : [60, 60, 60]);
  }

  function checkIn(code) {
    code = (code || "").trim().toUpperCase();
    if (!code || busy) return;
    var now = Date.now();
    if (code === lastCode && now - lastAt < 3000) return;
    lastCode = code; lastAt = now; busy = true;
    rpc("admin_check_in", { p_passcode: pass || getPass(), p_event_slug: SLUG, p_ticket_code: code }).then(function (r) {
      if (!r.ok) { showResult("bad", "Session expired", "Close this and log in again."); return; }
      var g = r.rsvp || {};
      var party = g.party_size ? " · bringing " + partyLabel(g.party_size) : "";
      if (r.result === "checked_in") showResult("ok", (g.guest_type && g.guest_type !== "guest" ? "★ " + (TYPES[g.guest_type] || "") + ": " : "") + g.full_name, "✓ Valid ticket. Check their ID shows this name. " + code + party + (g.costume ? " · as " + g.costume : ""));
      else if (r.result === "wrong_night") showResult("bad", "Wrong night: " + g.full_name, "This ticket is for " + nightsText(g) + ", not tonight (" + nightShort(r.night) + "). Check with the event lead.");
      else if (r.result === "test_ok") showResult("ok", "Test scan OK: " + g.full_name, "Valid ticket for " + nightsText(g) + ". Not an event night, so nothing was recorded.");
      else if (r.result === "already") showResult("warn", "Already used tonight", "This ticket (" + g.full_name + ") was scanned at " + fmtDate(g.checked_in_at) + ". If this isn't " + g.full_name + ", it's a copied QR.");
      else if (r.result === "cancelled") showResult("bad", "RSVP cancelled", g.full_name + "'s RSVP was cancelled. Check with the event lead.");
      else showResult("bad", "Ticket not found", code + " isn't on this event's list. Check the code or look them up by name.");
      if (g.id && r.result === "checked_in") { load(true); }
    }).catch(function (ex) { showResult("bad", "Couldn't check in", ex.message); })
      .then(function () { busy = false; });
  }

  function startScanner() {
    var Lib = window.Html5Qrcode || (window.__Html5QrcodeLibrary__ && window.__Html5QrcodeLibrary__.Html5Qrcode);
    if (!Lib) { $("#cam-msg").textContent = "Camera scanner didn't load. Type the code below."; return; }
    scanner = new Lib("reader");
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: function (w, h) { var s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; } },
      function (text) { checkIn(text); }, function () {})
      .then(function () { $("#cam-msg").textContent = "Point the camera at the guest's QR code."; })
      .catch(function () { $("#cam-msg").textContent = "Camera unavailable. Allow camera access (site must be on https), or type the code below."; });
  }
  function stopScanner() {
    if (scanner) { var s = scanner; scanner = null; s.stop().catch(function () {}).then(function () { try { s.clear(); } catch (e) {} }); }
  }

  $("#open-scan").addEventListener("click", function () {
    $("#scan-result").hidden = true; scanModal.showModal(); startScanner();
  });
  $("#close-scan").addEventListener("click", function () { scanModal.close(); });
  scanModal.addEventListener("close", stopScanner);
  $("#manual-form").addEventListener("submit", function (e) {
    e.preventDefault(); lastCode = null; checkIn($("#manual-code").value); $("#manual-code").value = "";
  });

  var passModal = $("#pass-modal"), forced = false;
  function openPass(isForced) {
    forced = !!isForced;
    $("#pass-why").textContent = forced
      ? "This is the first login with the starter passcode. Set your own before using the dashboard."
      : "Choose a new admin passcode. Share it only with staff who need the guest list.";
    $("#pass-cancel").hidden = forced;
    $("#pass-error").textContent = ""; $("#pass-form").reset();
    passModal.showModal();
  }
  passModal.addEventListener("cancel", function (e) { if (forced) e.preventDefault(); });
  $("#open-pass").addEventListener("click", function () { openPass(false); });
  $("#pass-cancel").addEventListener("click", function () { passModal.close(); });
  $("#pass-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var a = this.newpass.value, b = this.newpass2.value, err = $("#pass-error");
    if (a.length < 12) { err.textContent = "Use at least 12 characters."; return; }
    if (a !== b) { err.textContent = "The two passcodes don't match."; return; }
    rpc("admin_change_passcode", { p_passcode: pass || getPass(), p_new_passcode: a }).then(function (r) {
      if (!r.ok) { err.textContent = r.error; return; }
      setPass(a); forced = false; passModal.close();
    }).catch(function (ex) { err.textContent = ex.message; });
  });

  if (!configured) $("#lock-error").textContent = "Not connected yet. Add the Supabase URL and anon key to config.js.";
  var saved = getPass();
  if (saved && db) {
    rpc("admin_login", { p_passcode: saved }).then(function (r) {
      if (r.ok) { setPass(saved); showDash(r.must_change); } else logout();
    }).catch(function () { logout(); });
  } else {
    $("#lock-form").passcode.focus();
  }
})();
