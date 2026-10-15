/* Z Hostel staff dashboard: inquiries, sponsor requests, Z Street list + survey, staff. */
(function () {
  "use strict";
  var CFG = window.Z_CONFIG;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" } });
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DATA = { inquiries: [], partners: [], list: [], staff: [] };
  var ME = null, IS_OWNER = false, TAB = "overview";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(t) { var d = new Date(t); return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }); }
  function csv(rows, name) {
    if (!rows.length) return;
    var cols = Object.keys(rows[0]);
    var out = [cols.join(",")].concat(rows.map(function (r) { return cols.map(function (c) { var v = r[c]; if (v && typeof v === "object") v = JSON.stringify(v); v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }));
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + out.join("\n")], { type: "text/csv" }));
    a.download = name + "-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
  }

  /* ---------- auth ---------- */
  $("#login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("#l-email").value.trim().toLowerCase(), m = $("#login-form .form-msg"), b = $("#login-form button");
    if (!email) return;
    b.disabled = true; m.className = "form-msg"; m.textContent = "Checking…";
    sb.rpc("staff_can_login", { p_email: email }).then(function (r) {
      if (r.error) throw r.error;
      if (!r.data) throw new Error("That email isn't on the staff list. Ask the owner to add you.");
      return sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + "/admin/", shouldCreateUser: true } });
    }).then(function (r) {
      if (r && r.error) throw r.error;
      m.className = "form-msg ok"; m.textContent = "Check your inbox for the sign-in link (it can take a minute).";
    }).catch(function (err) { m.className = "form-msg err"; m.textContent = err.message || String(err); }).then(function () { b.disabled = false; });
  });
  $("#logout").addEventListener("click", function () { sb.auth.signOut().then(function () { location.reload(); }); });

  sb.auth.onAuthStateChange(function (_ev, session) { boot(session); });
  sb.auth.getSession().then(function (r) { boot(r.data.session); });

  var booted = false;
  function boot(session) {
    if (!session) { $("#login").hidden = false; $("#app").hidden = true; $("#logout").hidden = true; $("#who").textContent = ""; return; }
    if (booted) return; booted = true;
    ME = session.user.email;
    $("#login").hidden = true; $("#app").hidden = false; $("#logout").hidden = false; $("#who").textContent = ME;
    if (location.hash.indexOf("access_token") > -1) history.replaceState(null, "", "/admin/");
    load();
  }

  function load() {
    return Promise.all([
      sb.from("inquiries").select("*").order("created_at", { ascending: false }).limit(1000),
      sb.from("partner_requests").select("*").order("created_at", { ascending: false }).limit(1000),
      sb.from("zstreet_signups").select("*").order("created_at", { ascending: false }).limit(5000),
      sb.from("staff").select("*").order("added_at")
    ]).then(function (rs) {
      var err = rs.filter(function (r) { return r.error; })[0];
      if (err) throw err.error;
      DATA.inquiries = rs[0].data; DATA.partners = rs[1].data; DATA.list = rs[2].data; DATA.staff = rs[3].data;
      if (!DATA.staff.length) {
        $("#panel").innerHTML = '<div class="empty">Signed in as ' + esc(ME) + ', but this email is not on the staff list.</div>';
        return;
      }
      IS_OWNER = DATA.staff.some(function (s) { return s.email.toLowerCase() === ME.toLowerCase() && s.role === "owner"; });
      $("#c-inq").textContent = DATA.inquiries.filter(function (x) { return x.status === "new"; }).length || "";
      $("#c-par").textContent = DATA.partners.filter(function (x) { return x.status === "new"; }).length || "";
      $("#c-list").textContent = DATA.list.length || "";
      render();
    }).catch(function (e) { $("#panel").innerHTML = '<div class="empty">Could not load data: ' + esc(e.message) + "</div>"; });
  }

  $$(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () {
      TAB = b.getAttribute("data-tab");
      $$(".tabs button").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      render();
    });
  });

  function render() {
    var p = $("#panel");
    if (TAB === "overview") p.innerHTML = overview();
    else if (TAB === "inquiries") p.innerHTML = itemsView("inquiries");
    else if (TAB === "partners") p.innerHTML = itemsView("partners");
    else if (TAB === "list") p.innerHTML = listView();
    else if (TAB === "events") p.innerHTML = eventsView();
    else if (TAB === "staff") p.innerHTML = staffView();
    wire();
  }

  /* ---------- overview ---------- */
  function overview() {
    var since = Date.now() - 7 * 864e5;
    var wk = function (a) { return a.filter(function (x) { return Date.parse(x.created_at) > since; }).length; };
    var h = '<div class="kpis">' +
      kpi(DATA.inquiries.filter(function (x) { return x.status === "new"; }).length, "New inquiries") +
      kpi(DATA.partners.filter(function (x) { return x.status === "new"; }).length, "New sponsor requests") +
      kpi(DATA.list.length, "On the Z Street list") +
      kpi(DATA.list.filter(function (x) { return x.marketing_opt_in; }).length, "Opted in to emails") +
      kpi(wk(DATA.list) + wk(DATA.inquiries) + wk(DATA.partners), "Submissions, last 7 days") +
      "</div>";
    h += '<h3>Who\'s signing up for Z Street</h3><p class="muted small">From the optional survey on the Z Street pages. Counts are people who answered each question.</p>';
    h += surveySummary(DATA.list);
    return h;
  }
  function kpi(n, l) { return '<div class="kpi"><b>' + n + "</b><span>" + esc(l) + "</span></div>"; }
  var QLABEL = { events_interest: "Events they want", drink: "Drink of choice", staying: "Staying on party night", payment: "Preferred payment", interests: "Coming for", age_bracket: "Age bracket", heard_from: "Heard about us from" };
  function surveySummary(rows) {
    var out = '<div class="sumgrid">';
    var party = {}; rows.forEach(function (r) { if (r.party_size) party[r.party_size] = (party[r.party_size] || 0) + 1; });
    out += sumCard("Group size", party, ["Solo", "1–2", "3–5", "6+"]);
    Object.keys(QLABEL).forEach(function (k) {
      var c = {};
      rows.forEach(function (r) { var v = r.answers && r.answers[k]; if (!v) return; (Array.isArray(v) ? v : [v]).forEach(function (x) { c[x] = (c[x] || 0) + 1; }); });
      out += sumCard(QLABEL[k], c);
    });
    var src = {}; rows.forEach(function (r) { var s = r.source || "direct"; src[s] = (src[s] || 0) + 1; });
    out += sumCard("Came from (link source)", src);
    return out + "</div>";
  }
  function sumCard(title, counts, order) {
    var keys = order ? order.filter(function (k) { return counts[k]; }) : Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var total = keys.reduce(function (s, k) { return s + counts[k]; }, 0);
    var max = keys.reduce(function (m, k) { return Math.max(m, counts[k]); }, 0);
    var h = '<div class="sum"><h4>' + esc(title) + ' <span class="muted small">(' + total + ")</span></h4>";
    if (!keys.length) return h + '<p class="muted small">No answers yet.</p></div>';
    keys.slice(0, 10).forEach(function (k) {
      h += '<div class="hb"><span>' + esc(k) + '</span><span class="track"><span class="fill" style="width:' + (counts[k] / max * 100) + '%"></span></span><span class="n">' + counts[k] + "</span></div>";
    });
    return h + "</div>";
  }

  /* ---------- inquiries / partners ---------- */
  var STATUS = { inquiries: ["new", "in_progress", "done", "spam"], partners: ["new", "deck_sent", "in_talks", "won", "lost", "spam"] };
  var FILTER = { inquiries: "open", partners: "open" };
  function itemsView(kind) {
    var rows = DATA[kind];
    var f = FILTER[kind];
    var shown = rows.filter(function (r) { return f === "all" ? true : f === "open" ? ["done", "spam", "won", "lost"].indexOf(r.status) < 0 : r.status === f; });
    var h = '<div class="toolbar"><label class="small muted" for="flt">Show</label><select id="flt" data-kind="' + kind + '"><option value="open">Open</option><option value="all">All</option>' +
      STATUS[kind].map(function (s) { return '<option value="' + s + '">' + s.replace("_", " ") + "</option>"; }).join("") + '</select>' +
      '<button class="btn sm ghost" data-csv="' + kind + '">Export CSV</button><span class="muted small">' + shown.length + " shown</span></div>";
    if (!shown.length) return h + '<div class="empty">Nothing here yet.</div>';
    h += '<div class="rows">' + shown.map(function (r) {
      var title = kind === "inquiries" ? esc(r.full_name) + ' <span class="tag">' + esc(r.kind) + "</span>" : esc(r.brand) + " · " + esc(r.full_name) + (r.tier_interest ? ' <span class="tag">' + esc(r.tier_interest) + "</span>" : "");
      var extra = kind === "partners" ? '<div class="meta">' + (r.website ? "<span>" + esc(r.website) + "</span>" : "") + (r.categories && r.categories.length ? "<span>" + esc(r.categories.join(", ")) + "</span>" : "") + (r.events && r.events.length ? "<span>Events: " + esc(r.events.join(", ")) + "</span>" : "") + "</div>" : "";
      return '<div class="item' + (r.status === "new" ? " new" : "") + '"><div class="item-h"><b>' + title + '</b><span class="muted small">' + when(r.created_at) + '</span></div>' +
        '<div class="meta"><a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a>" + (r.phone ? '<a href="tel:' + esc(r.phone) + '">' + esc(r.phone) + "</a>" : "") + (r.source ? "<span>via " + esc(r.source) + "</span>" : "") + "</div>" + extra +
        (r.message ? '<div class="msg">' + esc(r.message) + "</div>" : "") +
        '<div class="ctl"><select data-status="' + kind + '" data-id="' + r.id + '">' + STATUS[kind].map(function (s) { return "<option" + (s === r.status ? " selected" : "") + ' value="' + s + '">' + s.replace("_", " ") + "</option>"; }).join("") + "</select>" +
        '<input type="text" placeholder="Staff note" value="' + esc(r.staff_note || "") + '" data-note="' + kind + '" data-id="' + r.id + '"></div></div>';
    }).join("") + "</div>";
    return h;
  }

  /* ---------- Z Street list ---------- */
  var LIST_EVENT = "all";
  function listView() {
    var events = {}; DATA.list.forEach(function (r) { events[r.event_slug] = (events[r.event_slug] || 0) + 1; });
    var rows = DATA.list.filter(function (r) { return LIST_EVENT === "all" || r.event_slug === LIST_EVENT; });
    var h = '<div class="toolbar"><label class="small muted" for="ev">Event</label><select id="ev"><option value="all">All (' + DATA.list.length + ")</option>" +
      Object.keys(events).map(function (e) { return '<option value="' + esc(e) + '"' + (e === LIST_EVENT ? " selected" : "") + ">" + esc(e) + " (" + events[e] + ")</option>"; }).join("") +
      '</select><button class="btn sm ghost" data-csv="list">Export CSV</button><button class="btn sm ghost" data-csv="emails">Export opted-in emails</button></div>';
    h += surveySummary(rows);
    if (!rows.length) return h + '<div class="empty" style="margin-top:16px">No sign-ups yet.</div>';
    h += '<div class="table-scroll" style="margin-top:18px"><table class="data-table"><thead><tr><th>When</th><th>Name</th><th>Email</th><th>Phone</th><th>Group</th><th>Event</th><th>Emails OK</th><th>Answers</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var a = r.answers || {}; var n = Object.keys(a).length;
        return "<tr><td>" + when(r.created_at) + "</td><td>" + esc(r.full_name) + '</td><td><a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a></td><td>" + esc(r.phone || "") + "</td><td>" + esc(r.party_size || "") + "</td><td>" + esc(r.event_slug) + "</td><td>" + (r.marketing_opt_in ? "Yes" : "") + "</td><td>" + (n ? n + " / 8" : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    return h;
  }

  /* ---------- event tools ---------- */
  function eventsView() {
    return '<div class="grid g3">' +
      tool("Tabi Tabi Po · door & guest list", "Salakot opening night, Oct 30–31. RSVPs, QR check-in scanner and guest list. Uses its own passcode.", "/events/tabi-tabi-po/admin.html", "Open Tabi admin") +
      tool("THE ODY-Z · RSVPs & check-in", "Halloween street party, Oct 30. Runs on ody-z.com with its own admin.", "https://ody-z.com/admin.html", "Open ODY-Z admin") +
      tool("Promoter links", "Add ?ref=name to any link (e.g. zhostel.com/z-street/?ref=ig-story). It shows up under “Came from” on the list and inquiries.", "/z-street/?ref=test-link", "Try a tagged link") +
      tool("Supabase project", "Database, auth and logs for this website (project zhostel-website).", "https://supabase.com/dashboard/project/zazmufcnqevovuzzgisy", "Open Supabase") +
      "</div>";
  }
  function tool(t, d, href, cta) { return '<div class="tile"><h3>' + esc(t) + '</h3><p>' + esc(d) + '</p><div class="btns" style="margin-top:14px"><a class="btn sm" href="' + href + '" target="_blank" rel="noopener">' + esc(cta) + "</a></div></div>"; }

  /* ---------- staff ---------- */
  function staffView() {
    var h = '<div class="rows">' + DATA.staff.map(function (s) {
      return '<div class="item"><div class="item-h"><b>' + esc(s.email) + '</b><span class="tag">' + esc(s.role) + "</span>" + (s.name ? '<span class="muted small">' + esc(s.name) + "</span>" : "") +
        (IS_OWNER && s.role !== "owner" ? '<button class="btn sm ghost" style="margin-left:auto" data-rm="' + esc(s.email) + '">Remove</button>' : "") + "</div></div>";
    }).join("") + "</div>";
    if (IS_OWNER) {
      h += '<form class="form form-card" id="add-staff" style="margin-top:18px;max-width:560px"><h3>Add staff</h3><div class="row2"><div class="field"><label for="s-email">Email</label><input id="s-email" type="email" required></div><div class="field"><label for="s-name">Name</label><input id="s-name" type="text"></div></div><button class="btn" type="submit">Add</button><p class="form-msg" role="alert"></p>' +
        '<p class="small muted">New staff sign in here with their email. Note: until custom email (SMTP) is set up in Supabase, sign-in links are only delivered to members of the Supabase organization.</p></form>';
    }
    return h;
  }

  /* ---------- wiring ---------- */
  function wire() {
    var flt = $("#flt"); if (flt) { var k = flt.getAttribute("data-kind"); flt.value = FILTER[k]; flt.addEventListener("change", function () { FILTER[k] = flt.value; render(); }); }
    var ev = $("#ev"); if (ev) ev.addEventListener("change", function () { LIST_EVENT = ev.value; render(); });
    $$("[data-csv]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-csv");
        if (k === "emails") return csv(DATA.list.filter(function (r) { return r.marketing_opt_in; }).map(function (r) { return { email: r.email, full_name: r.full_name, event: r.event_slug, signed_up: r.created_at }; }), "z-street-optins");
        if (k === "list") return csv(DATA.list.filter(function (r) { return LIST_EVENT === "all" || r.event_slug === LIST_EVENT; }).map(function (r) { var o = Object.assign({}, r); var a = o.answers || {}; delete o.answers; Object.keys(a).forEach(function (q) { o["q_" + q] = Array.isArray(a[q]) ? a[q].join("; ") : a[q]; }); return o; }), "z-street-list");
        csv(DATA[k], k);
      });
    });
    $$("[data-status]").forEach(function (s) {
      s.addEventListener("change", function () { update(s.getAttribute("data-status"), s.getAttribute("data-id"), { status: s.value }); });
    });
    $$("[data-note]").forEach(function (i) {
      i.addEventListener("change", function () { update(i.getAttribute("data-note"), i.getAttribute("data-id"), { staff_note: i.value }); });
    });
    $$("[data-rm]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirm("Remove " + b.getAttribute("data-rm") + " from staff?")) return;
        sb.from("staff").delete().eq("email", b.getAttribute("data-rm")).then(function (r) { if (r.error) alert(r.error.message); load(); });
      });
    });
    var add = $("#add-staff");
    if (add) add.addEventListener("submit", function (e) {
      e.preventDefault();
      var em = $("#s-email").value.trim().toLowerCase(); if (!em) return;
      sb.from("staff").insert({ email: em, name: $("#s-name").value.trim() || null, role: "staff" }).then(function (r) {
        var m = $(".form-msg", add);
        if (r.error) { m.className = "form-msg err"; m.textContent = r.error.message; } else load().then(function () { TAB = "staff"; render(); });
      });
    });
  }
  function update(kind, id, patch) {
    var table = kind === "partners" ? "partner_requests" : "inquiries";
    patch.updated_at = new Date().toISOString();
    sb.from(table).update(patch).eq("id", id).then(function (r) {
      if (r.error) { alert("Couldn't save: " + r.error.message); return; }
      var row = DATA[kind].filter(function (x) { return x.id === id; })[0]; if (row) Object.assign(row, patch);
      $("#c-inq").textContent = DATA.inquiries.filter(function (x) { return x.status === "new"; }).length || "";
      $("#c-par").textContent = DATA.partners.filter(function (x) { return x.status === "new"; }).length || "";
    });
  }
})();
