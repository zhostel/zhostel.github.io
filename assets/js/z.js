/* Z Hostel — site behaviour: nav, reveal, countdowns, chart tooltips, lightbox, forms + survey. */
(function () {
  "use strict";
  var CFG = window.Z_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- nav ---------- */
  var toggle = $(".nav-toggle"), links = $(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ---------- reveal ---------- */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach(function (el) { io.observe(el); });
  } else { $$(".reveal").forEach(function (el) { el.classList.add("in"); }); }

  /* ---------- countdowns ---------- */
  var cds = $$("[data-countdown]");
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function tick() {
    var now = Date.now();
    cds.forEach(function (el) {
      var t = Date.parse(el.getAttribute("data-countdown"));
      if (isNaN(t)) return;
      var d = Math.max(0, t - now);
      if (d === 0) { el.innerHTML = '<span class="tag hot live">Happening now</span>'; return; }
      var days = Math.floor(d / 864e5), h = Math.floor(d / 36e5) % 24, m = Math.floor(d / 6e4) % 60, s = Math.floor(d / 1e3) % 60;
      el.innerHTML = "<div><b>" + days + "</b><span>Days</span></div><div><b>" + pad(h) + "</b><span>Hrs</span></div><div><b>" + pad(m) + "</b><span>Min</span></div><div><b>" + pad(s) + "</b><span>Sec</span></div>";
    });
  }
  if (cds.length) { tick(); setInterval(tick, 1000); }

  /* ---------- chart tooltips ---------- */
  var tip;
  $$(".chart [data-tip]").forEach(function (g) {
    function show(ev) {
      if (!tip) { tip = document.createElement("div"); tip.className = "chart-tip"; tip.setAttribute("role", "status"); document.body.appendChild(tip); }
      var parts = g.getAttribute("data-tip").split("|");
      tip.innerHTML = "<b>" + parts[0] + "</b>" + (parts[1] ? "<small>" + parts[1] + "</small>" : "");
      var x = ev.clientX || (g.getBoundingClientRect().left + 10), y = ev.clientY || g.getBoundingClientRect().top;
      tip.style.left = Math.min(window.innerWidth - 200, x + 12) + "px";
      tip.style.top = (y - 48) + "px";
      tip.classList.add("on");
    }
    g.addEventListener("mousemove", show);
    g.addEventListener("focus", show);
    g.addEventListener("mouseleave", function () { tip && tip.classList.remove("on"); });
    g.addEventListener("blur", function () { tip && tip.classList.remove("on"); });
  });

  /* ---------- lightbox ---------- */
  var gal = $$("[data-lightbox]");
  if (gal.length) {
    var lb = document.createElement("div");
    lb.className = "lightbox"; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true"); lb.setAttribute("aria-label", "Photo viewer");
    lb.innerHTML = '<button class="x" aria-label="Close">×</button><button class="prev" aria-label="Previous">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="next" aria-label="Next">›</button>';
    document.body.appendChild(lb);
    var idx = 0, img = $("img", lb), cap = $("figcaption", lb);
    function show(i) { idx = (i + gal.length) % gal.length; var a = gal[idx]; img.src = a.getAttribute("href"); img.alt = a.getAttribute("data-caption") || ""; cap.textContent = a.getAttribute("data-caption") || ""; }
    function close() { lb.classList.remove("open"); document.body.style.overflow = ""; }
    gal.forEach(function (a, i) { a.addEventListener("click", function (e) { e.preventDefault(); show(i); lb.classList.add("open"); document.body.style.overflow = "hidden"; $(".x", lb).focus(); }); });
    $(".x", lb).addEventListener("click", close);
    $(".prev", lb).addEventListener("click", function () { show(idx - 1); });
    $(".next", lb).addEventListener("click", function () { show(idx + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") show(idx - 1); else if (e.key === "ArrowRight") show(idx + 1);
    });
  }

  /* ---------- Supabase RPC (no SDK needed on public pages) ---------- */
  function rpc(fn, args) {
    return fetch(CFG.supabaseUrl + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey },
      body: JSON.stringify(args)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var m = (j && (j.message || j.hint)) || "Something went wrong. Please try again."; throw new Error(m); }
        return j;
      });
    });
  }
  var params = new URLSearchParams(location.search);
  var SOURCE = params.get("ref") || params.get("utm_source") || (document.referrer ? (function () { try { return new URL(document.referrer).hostname.replace(/^www\./, ""); } catch (e) { return ""; } })() : "");
  function val(form, name) { var el = form.elements[name]; return el ? (el.value || "").trim() : ""; }
  function checked(form, name) { return $$('input[name="' + name + '"]:checked', form).map(function (i) { return i.value; }); }
  function msg(form, text, ok) { var m = $(".form-msg", form); if (m) { m.textContent = text || ""; m.className = "form-msg " + (ok ? "ok" : "err"); } }
  function busy(form, on) { var b = $("button[type=submit]", form); if (b) { b.disabled = on; if (on) { b.dataset.label = b.textContent; b.textContent = "Sending…"; } else if (b.dataset.label) b.textContent = b.dataset.label; } }
  function honeypot(form) { var h = form.elements["website_hp"]; return h && h.value; }

  /* contact form */
  $$("form[data-form=inquiry]").forEach(function (form) {
    var pre = params.get("type"); if (pre && form.elements.kind) form.elements.kind.value = pre;
    form.addEventListener("submit", function (e) {
      e.preventDefault(); if (honeypot(form)) return;
      if (!form.reportValidity()) return;
      busy(form, true); msg(form, "");
      rpc("submit_inquiry", {
        p_kind: val(form, "kind"), p_full_name: val(form, "full_name"), p_email: val(form, "email"), p_phone: val(form, "phone"),
        p_message: val(form, "message"), p_consent: form.elements.consent.checked, p_page: location.pathname, p_source: SOURCE
      }).then(function () {
        form.innerHTML = '<div class="done"><div class="big">Message sent.</div><p class="muted">Thanks! The Z team will get back to you by email, usually within a day.</p></div>';
      }).catch(function (err) { busy(form, false); msg(form, err.message); });
    });
  });

  /* partner form */
  $$("form[data-form=partner]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault(); if (honeypot(form)) return;
      if (!form.reportValidity()) return;
      busy(form, true); msg(form, "");
      rpc("submit_partner_request", {
        p_brand: val(form, "brand"), p_full_name: val(form, "full_name"), p_email: val(form, "email"), p_phone: val(form, "phone"),
        p_website: val(form, "website"), p_categories: checked(form, "categories"), p_tier: val(form, "tier"),
        p_events: checked(form, "events"), p_message: val(form, "message"), p_consent: form.elements.consent.checked, p_source: SOURCE
      }).then(function () {
        form.innerHTML = '<div class="done"><div class="big">Request received.</div><p class="muted">We\'ll send the sponsorship deck and follow up directly. Questions in the meantime: <a href="mailto:marketing@zhostel.com">marketing@zhostel.com</a></p></div>';
      }).catch(function (err) { busy(form, false); msg(form, err.message); });
    });
  });

  /* ---------- Z Street list + crowd survey ---------- */
  var QUESTIONS = [
    { key: "events_interest", title: "Which Z Street parties are you in for?", hint: "Pick as many as you like.", type: "multi", onlyGeneral: true,
      options: ["Summer Kick Off (March)", "Rev Up (May)", "Repoblacion (June)", "Halloween (October)", "Holiday Street Party (December)"] },
    { key: "drink", title: "What's usually in your hand on a night out?", type: "single",
      options: ["Beer", "Cocktails", "Wine", "Matcha / tea-based", "Mocktails / non-alc", "I don't drink"] },
    { key: "staying", title: "Where are you staying on party night?", type: "single",
      options: ["Staying at Z Hostel", "Elsewhere in Poblacion", "Heading home after", "Still deciding"] },
    { key: "payment", title: "How do you usually pay at street parties?", type: "single",
      options: ["E-wallet (GCash / Maya)", "Cash", "Credit / debit card", "RFID band"] },
    { key: "interests", title: "What are you coming for?", hint: "Pick as many as you like.", type: "multi",
      options: ["Live music", "DJ sets", "Dancing", "Costumes & photo ops", "Food & drinks", "Games / contests", "Meeting new people"] },
    { key: "age_bracket", title: "Age bracket", hint: "Helps us plan the night.", type: "single", options: ["18–24", "25–34", "35–44", "45+"] },
    { key: "heard_from", title: "How did you hear about Z Street?", type: "single",
      options: ["Facebook", "Instagram", "TikTok", "Friend / group chat", "News / media", "Staying at Z", "Other"] },
    { key: "notes", title: "Anything else we should know?", hint: "Group plans, accessibility needs, questions for the team.", type: "text" }
  ];

  $$("[data-zlist]").forEach(function (box) {
    var form = $("form", box);
    var event = box.getAttribute("data-zlist");
    var general = event === "z-street-list";
    var qs = QUESTIONS.filter(function (q) { return general || !q.onlyGeneral; });
    var state = { id: null, answers: {}, i: 0, name: "" };
    var survey = $(".survey", box);

    form.addEventListener("submit", function (e) {
      e.preventDefault(); if (honeypot(form)) return;
      if (!form.reportValidity()) return;
      busy(form, true); msg(form, "");
      var party = checked(form, "party_size")[0] || null;
      rpc("zstreet_join", {
        p_event_slug: event, p_full_name: val(form, "full_name"), p_email: val(form, "email"), p_phone: val(form, "phone"),
        p_party_size: party, p_consent: form.elements.consent.checked, p_marketing: form.elements.marketing.checked, p_source: SOURCE
      }).then(function (r) {
        state.id = r.id; state.name = (r.full_name || "").split(" ")[0];
        form.hidden = true; survey.hidden = false;
        render(0);
      }).catch(function (err) { busy(form, false); msg(form, err.message); });
    });

    function save() {
      if (!state.id) return Promise.resolve();
      return rpc("zstreet_answer", { p_id: state.id, p_answers: state.answers }).catch(function () {});
    }

    function render(i) {
      state.i = i;
      if (i >= qs.length) return finish();
      var q = qs[i];
      var pct = Math.round((i / qs.length) * 100);
      var html = '<div class="steps-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>';
      if (i === 0) html += '<p class="form-msg ok" style="margin:0 0 6px">You\'re on the list' + (state.name ? ", " + esc(state.name) : "") + '. A few optional taps help us plan the night.</p>';
      html += '<p class="q-count">Optional · ' + (i + 1) + ' of ' + qs.length + '</p><h3 class="q-title" id="q-' + q.key + '">' + esc(q.title) + '</h3>';
      if (q.hint) html += '<p class="muted small" style="margin-top:-6px">' + esc(q.hint) + '</p>';
      if (q.type === "text") {
        html += '<textarea aria-labelledby="q-' + q.key + '" maxlength="1000"></textarea>';
      } else {
        html += '<div class="chips" role="group" aria-labelledby="q-' + q.key + '">';
        q.options.forEach(function (o, k) {
          var on = q.type === "multi" ? (state.answers[q.key] || []).indexOf(o) > -1 : state.answers[q.key] === o;
          html += '<label class="chip"><input type="' + (q.type === "multi" ? "checkbox" : "radio") + '" name="q_' + q.key + '" value="' + esc(o) + '"' + (on ? " checked" : "") + '><span>' + esc(o) + '</span></label>';
        });
        html += "</div>";
      }
      var last = i === qs.length - 1;
      html += '<div class="btns" style="margin-top:18px">';
      if (q.type !== "single") html += '<button type="button" class="btn next">' + (last ? "Finish" : "Continue") + "</button>";
      html += '<button type="button" class="btn ghost skip">' + (q.type === "single" ? "Skip" : "Skip") + '</button>';
      html += '<button type="button" class="btn ghost sm done-now" style="margin-left:auto">I\'m done</button></div>';
      survey.innerHTML = html;
      var h = $(".q-title", survey); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }

      if (q.type === "single") {
        $$("input", survey).forEach(function (inp) {
          inp.addEventListener("change", function () { state.answers[q.key] = inp.value; save(); setTimeout(function () { render(i + 1); }, 160); });
        });
      }
      var next = $(".next", survey);
      if (next) next.addEventListener("click", function () {
        if (q.type === "multi") { var v = checked(survey, "q_" + q.key); if (v.length) state.answers[q.key] = v; }
        else { var t = $("textarea", survey).value.trim(); if (t) state.answers[q.key] = t; }
        save(); render(i + 1);
      });
      $(".skip", survey).addEventListener("click", function () { render(i + 1); });
      $(".done-now", survey).addEventListener("click", function () { finish(); });
    }

    function finish() {
      save();
      var stay = CFG.bookUrl || "#";
      survey.innerHTML = '<div class="done"><div class="big">See you on the street' + (state.name ? ", " + esc(state.name) : "") + '.</div>' +
        '<p class="muted">We\'ll email you dates, line-ups and early perks before each party. Party weekends sell out fast at Z, so if you want a bed on the street, book early.</p>' +
        '<div class="btns" style="justify-content:center"><a class="btn" href="' + stay + '" target="_blank" rel="noopener">Stay on the street</a><a class="btn ghost" href="/z-street/">Z Street calendar</a></div></div>';
    }
  });

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
})();
