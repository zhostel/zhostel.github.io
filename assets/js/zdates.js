/* Z Hostel date-range picker + guest picker, OTA style.
   Markup: <div class="zdr" data-min-nights="1" data-max-nights="30">
             <input type="hidden" name="checkin"> <input type="hidden" name="checkout">
           </div>
   Sets the hidden inputs and fires "change" on them, so other scripts just listen to the inputs. */
(function () {
  "use strict";
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parse(s) { var p = (s || "").split("-"); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function nice(d) { return d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" }); }
  function nightsBetween(a, b) { return Math.round((b - a) / 864e5); }
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var mobile = function () { return window.matchMedia("(max-width: 760px)").matches; };
  var events = function () { return window.Z_EVENTS || []; };
  function eventOn(d) {
    var s = iso(d);
    return events().filter(function (e) { return s >= e.start && s <= (e.end || e.start); })[0];
  }
  var openPicker = null;
  document.addEventListener("click", function (e) { if (openPicker && !openPicker.contains(e.target)) openPicker.close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && openPicker) openPicker.close(true); });

  function DateRange(root) {
    var ci = root.querySelector('input[name="checkin"], [data-role="checkin"]');
    var co = root.querySelector('input[name="checkout"], [data-role="checkout"]');
    var maxN = +root.getAttribute("data-max-nights") || 30;
    var past = root.hasAttribute("data-allow-past");
    var start = parse(ci.value), end = parse(co.value), hover = null, picking = start && !end ? "end" : "start";
    var view = start ? new Date(start.getFullYear(), start.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 1);
    var ids = "zdr" + Math.random().toString(36).slice(2, 7);

    var trig = document.createElement("div");
    trig.className = "zdr-trigger";
    trig.innerHTML = '<button type="button" class="zdr-seg" data-seg="start" aria-haspopup="dialog" aria-controls="' + ids + '"><span class="zdr-lab">Check-in</span><b class="zdr-val">Add date</b></button>' +
      '<span class="zdr-arrow" aria-hidden="true">→</span>' +
      '<button type="button" class="zdr-seg" data-seg="end" aria-haspopup="dialog" aria-controls="' + ids + '"><span class="zdr-lab">Check-out</span><b class="zdr-val">Add date</b></button>';
    root.appendChild(trig);
    var pop = document.createElement("div");
    pop.className = "zdr-pop"; pop.id = ids; pop.hidden = true; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Choose your dates");
    root.appendChild(pop);

    function label() {
      var segs = trig.querySelectorAll(".zdr-val");
      segs[0].textContent = start ? nice(start) : "Add date";
      segs[1].textContent = end ? nice(end) : "Add date";
      trig.classList.toggle("has", !!start);
      var n = start && end ? nightsBetween(start, end) : 0;
      trig.setAttribute("data-nights", n ? n + " night" + (n > 1 ? "s" : "") : "");
      trig.querySelectorAll(".zdr-seg").forEach(function (b) { b.classList.toggle("active", !pop.hidden && b.getAttribute("data-seg") === picking); });
    }
    function commit() {
      var a = start ? iso(start) : "", b = end ? iso(end) : "";
      if (ci.value !== a) { ci.value = a; ci.dispatchEvent(new Event("change", { bubbles: true })); }
      if (co.value !== b) { co.value = b; co.dispatchEvent(new Event("change", { bubbles: true })); }
      label();
    }
    function month(y, m) {
      var first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
      var h = '<div class="zdr-month"><div class="zdr-mtitle">' + MONTHS[m] + " " + y + '</div><div class="zdr-grid" role="grid">' +
        DOW.map(function (d) { return '<span class="zdr-dow">' + d + "</span>"; }).join("");
      for (var i = 0; i < first.getDay(); i++) h += "<span></span>";
      for (var d = 1; d <= days; d++) {
        var dt = new Date(y, m, d), s = iso(dt), cls = ["zdr-day"], dis = !past && dt < today;
        if (start && end) { if (s === iso(start)) cls.push("s"); if (s === iso(end)) cls.push("e"); if (dt > start && dt < end) cls.push("in"); }
        else if (start) {
          if (s === iso(start)) cls.push("s");
          if (hover && hover > start && dt > start && dt <= hover) cls.push(dt.getTime() === hover.getTime() ? "e" : "in");
          if (picking === "end" && (dt <= start || nightsBetween(start, dt) > maxN)) dis = dis || dt < start;
        }
        if (s === iso(today)) cls.push("today");
        var ev = eventOn(dt);
        if (ev) cls.push("ev");
        h += '<button type="button" class="' + cls.join(" ") + '" data-d="' + s + '"' + (dis ? " disabled" : "") +
          ' aria-label="' + dt.toDateString() + (ev ? ", " + ev.name : "") + '"' + (cls.indexOf("s") > -1 || cls.indexOf("e") > -1 ? ' aria-pressed="true"' : "") + ">" + d + (ev ? '<i title="' + ev.name + '"></i>' : "") + "</button>";
      }
      return h + "</div></div>";
    }
    function render() {
      var n = start && end ? nightsBetween(start, end) : 0;
      var head = picking === "start" ? "Select check-in date" : "Select check-out date";
      var months = "";
      if (mobile()) { for (var k = 0; k < 6; k++) { var mm = new Date(view.getFullYear(), view.getMonth() + k, 1); months += month(mm.getFullYear(), mm.getMonth()); } }
      else { var m2 = new Date(view.getFullYear(), view.getMonth() + 1, 1); months = month(view.getFullYear(), view.getMonth()) + month(m2.getFullYear(), m2.getMonth()); }
      var canPrev = past || new Date(view.getFullYear(), view.getMonth(), 1) > new Date(today.getFullYear(), today.getMonth(), 1);
      pop.innerHTML = '<div class="zdr-head"><b>' + head + '</b><button type="button" class="zdr-x" aria-label="Close">×</button></div>' +
        '<div class="zdr-nav"><button type="button" class="zdr-prev" aria-label="Previous month"' + (canPrev ? "" : " disabled") + '>‹</button><button type="button" class="zdr-next" aria-label="Next month">›</button></div>' +
        '<div class="zdr-months">' + months + "</div>" +
        '<div class="zdr-foot"><span>' + (n ? "<b>" + n + " night" + (n > 1 ? "s" : "") + "</b> · " + nice(start) + " → " + nice(end) : start ? "Now pick your check-out date" : "Pick your check-in date") +
        (events().length ? ' <span class="zdr-legend"><i></i> Event night at Z</span>' : "") + '</span><span class="zdr-actions"><button type="button" class="zdr-clear">Clear</button><button type="button" class="btn sm zdr-done"' + (n ? "" : " disabled") + ">Done</button></span></div>";
      pop.querySelectorAll(".zdr-day:not([disabled])").forEach(function (b) {
        b.addEventListener("click", function (e) { e.stopPropagation(); pick(parse(b.getAttribute("data-d"))); });
        b.addEventListener("mouseenter", function () { if (picking === "end" && start && !mobile()) { hover = parse(b.getAttribute("data-d")); paintHover(); } });
      });
      pop.querySelector(".zdr-prev").addEventListener("click", function (e) { e.stopPropagation(); view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
      pop.querySelector(".zdr-next").addEventListener("click", function (e) { e.stopPropagation(); view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
      pop.querySelector(".zdr-x").addEventListener("click", function (e) { e.stopPropagation(); close(true); });
      pop.querySelector(".zdr-clear").addEventListener("click", function (e) { e.stopPropagation(); start = end = hover = null; picking = "start"; commit(); render(); });
      pop.querySelector(".zdr-done").addEventListener("click", function (e) { e.stopPropagation(); close(true); });
      label();
    }
    function paintHover() {
      pop.querySelectorAll(".zdr-day").forEach(function (b) {
        var dt = parse(b.getAttribute("data-d"));
        b.classList.toggle("in", !!(hover && dt > start && dt < hover));
        b.classList.toggle("e", !!(hover && dt.getTime() === hover.getTime() && hover > start));
      });
    }
    function pick(d) {
      if (picking === "start" || !start || d <= start || (end && picking === "start")) {
        start = d; end = null; hover = null; picking = "end";
        if (!mobile() && (d.getMonth() !== view.getMonth() && d.getMonth() !== (view.getMonth() + 1) % 12)) view = new Date(d.getFullYear(), d.getMonth(), 1);
        commit(); render();
        var nxt = pop.querySelector('.zdr-day[data-d="' + iso(addDays(d, 1)) + '"]'); if (nxt && !mobile()) nxt.focus();
      } else {
        if (nightsBetween(start, d) > maxN) { d = addDays(start, maxN); }
        end = d; picking = "start"; commit(); render();
        setTimeout(function () { close(true); }, mobile() ? 350 : 200);
      }
    }
    function open(seg) {
      if (openPicker && openPicker !== api) openPicker.close();
      picking = seg === "end" && start ? "end" : "start";
      if (picking === "start" && start && seg === "start") { /* re-pick from scratch on next click */ }
      if (mobile()) { document.body.appendChild(pop); document.body.style.overflow = "hidden"; }
      pop.hidden = false; root.classList.add("open"); openPicker = api;
      render();
      var f = pop.querySelector(".zdr-day.s") || pop.querySelector(".zdr-day:not([disabled])"); if (f && !mobile()) f.focus();
    }
    function close(focusBack) {
      pop.hidden = true; root.classList.remove("open"); if (openPicker === api) openPicker = null;
      if (pop.parentNode !== root) root.appendChild(pop);
      document.body.style.overflow = ""; hover = null; label();
      if (focusBack) { var b = trig.querySelector(".zdr-seg"); b && b.focus(); }
      root.dispatchEvent(new CustomEvent("zdr:close", { bubbles: true }));
    }
    trig.querySelectorAll(".zdr-seg").forEach(function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); if (!pop.hidden && picking === b.getAttribute("data-seg")) close(); else open(b.getAttribute("data-seg")); }); });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    pop.addEventListener("keydown", function (e) {
      var a = document.activeElement; if (!a || !a.classList.contains("zdr-day")) return;
      var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!step) return;
      e.preventDefault(); var t = addDays(parse(a.getAttribute("data-d")), step);
      var b = pop.querySelector('.zdr-day[data-d="' + iso(t) + '"]');
      if (!b && !mobile()) { view = new Date(t.getFullYear(), t.getMonth() - (step > 0 ? 1 : 0), 1); render(); b = pop.querySelector('.zdr-day[data-d="' + iso(t) + '"]'); }
      if (b) b.focus();
    });
    // external value changes (e.g. ?checkin= in the URL)
    function sync() { start = parse(ci.value); end = parse(co.value); if (start) view = new Date(start.getFullYear(), start.getMonth(), 1); label(); }
    var api = { open: open, close: close, contains: function (n) { return root.contains(n) || pop.contains(n); }, sync: sync, set: function (a, b) { start = parse(a); end = parse(b); commit(); } };
    root._zdr = api;
    label();
    return api;
  }

  function Guests(root) {
    var input = root.querySelector('input[name="guests"]');
    var max = +root.getAttribute("data-max") || 8;
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "zdr-seg zg-trigger";
    btn.innerHTML = '<span class="zdr-lab">Guests</span><b class="zdr-val"></b>';
    var pop = document.createElement("div"); pop.className = "zg-pop"; pop.hidden = true;
    pop.innerHTML = '<div class="zg-row"><div><b>Guests</b><span class="muted small">Ages 18+ for dorms</span></div><div class="qty"><button type="button" class="minus" aria-label="Fewer guests">−</button><b></b><button type="button" class="plus" aria-label="More guests">+</button></div></div>' +
      '<p class="small muted" style="margin:10px 0 0">9 or more? <a href="/contact/?type=group">Ask about group rates</a>.</p>';
    root.appendChild(btn); root.appendChild(pop);
    function paint() { var n = +input.value || 1; btn.querySelector(".zdr-val").textContent = n + " guest" + (n > 1 ? "s" : ""); pop.querySelector(".qty b").textContent = n; pop.querySelector(".minus").disabled = n <= 1; pop.querySelector(".plus").disabled = n >= max; }
    function set(n) { input.value = Math.max(1, Math.min(max, n)); input.dispatchEvent(new Event("change", { bubbles: true })); paint(); }
    var api = { close: function () { pop.hidden = true; if (openPicker === api) openPicker = null; }, contains: function (n) { return root.contains(n); } };
    btn.addEventListener("click", function (e) { e.stopPropagation(); if (pop.hidden) { if (openPicker) openPicker.close(); pop.hidden = false; openPicker = api; } else api.close(); });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    pop.querySelector(".minus").addEventListener("click", function () { set((+input.value || 1) - 1); });
    pop.querySelector(".plus").addEventListener("click", function () { set((+input.value || 1) + 1); });
    paint();
  }

  window.ZDates = { init: function (scope) {
    (scope || document).querySelectorAll(".zdr:not([data-ready])").forEach(function (el) { el.setAttribute("data-ready", "1"); DateRange(el); });
    (scope || document).querySelectorAll(".zguests:not([data-ready])").forEach(function (el) { el.setAttribute("data-ready", "1"); Guests(el); });
  } };
  window.ZDates.init();
})();
