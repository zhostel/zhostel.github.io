/* TABI TABI PO — click a myth card to watch it large (uncropped, with optional sound). */
(function () {
  "use strict";
  var cards = Array.prototype.slice.call(document.querySelectorAll(".myths li"));
  if (!cards.length || !window.HTMLDialogElement) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var items = cards.map(function (li) {
    var img = li.querySelector(".myth-photo img");
    var slug = img && (img.getAttribute("src").match(/myths\/([a-z]+)-/) || [])[1];
    return { li: li, slug: slug, name: li.querySelector("h3").textContent, text: li.querySelector("p").textContent,
      poster: img ? img.currentSrc || img.src : "" };
  }).filter(function (x) { return x.slug; });

  var dlg = document.createElement("dialog");
  dlg.className = "lb"; dlg.setAttribute("aria-label", "Filipino myth viewer");
  dlg.innerHTML =
    '<div class="lb-stage">' +
      '<button class="lb-close" type="button" aria-label="Close">✕</button>' +
      '<button class="lb-nav lb-prev" type="button" aria-label="Previous myth">‹</button>' +
      '<figure class="lb-fig">' +
        '<div class="lb-frame"><video class="lb-video" playsinline loop muted preload="auto"></video>' +
          '<button class="lb-sound" type="button" aria-pressed="false"><span class="lb-ico" aria-hidden="true">🔇</span> <span class="lb-lbl">Sound off</span></button>' +
          '<div class="lb-spin" aria-hidden="true"></div></div>' +
        '<figcaption><span class="lb-count"></span><h3 class="lb-name"></h3><p class="lb-text"></p>' +
          '<a class="btn small lb-cta" href="#rsvp">Come as this myth · RSVP</a></figcaption>' +
      '</figure>' +
      '<button class="lb-nav lb-next" type="button" aria-label="Next myth">›</button>' +
    '</div>';
  document.body.appendChild(dlg);

  var v = dlg.querySelector(".lb-video"), frame = dlg.querySelector(".lb-frame");
  var soundBtn = dlg.querySelector(".lb-sound");
  var idx = 0, soundOn = false, lastFocus = null;

  function setSound(on) {
    soundOn = on; v.muted = !on;
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    soundBtn.querySelector(".lb-ico").textContent = on ? "🔊" : "🔇";
    soundBtn.querySelector(".lb-lbl").textContent = on ? "Sound on" : "Sound off";
  }
  function show(i) {
    idx = (i + items.length) % items.length;
    var it = items[idx];
    frame.classList.add("loading");
    v.poster = it.poster;
    v.src = "assets/myths/full/" + it.slug + ".mp4?v=1";
    v.muted = !soundOn;
    if (reduce) { v.controls = true; } else { var p = v.play(); if (p && p.catch) p.catch(function () { v.controls = true; }); }
    dlg.querySelector(".lb-name").textContent = it.name;
    dlg.querySelector(".lb-text").textContent = it.text;
    dlg.querySelector(".lb-count").textContent = (idx + 1) + " / " + items.length;
    v.setAttribute("aria-label", it.name + ": " + it.text);
  }
  v.addEventListener("playing", function () { frame.classList.remove("loading"); });
  v.addEventListener("canplay", function () { frame.classList.remove("loading"); });

  function open(i) {
    lastFocus = document.activeElement;
    // pause the small card videos while the viewer is open
    document.querySelectorAll(".myth-video").forEach(function (cv) { if (!cv.paused) { cv.pause(); cv._lbPaused = true; } });
    dlg.showModal(); document.documentElement.classList.add("lb-open");
    show(i);
    dlg.querySelector(".lb-close").focus();
  }
  function close() { dlg.close(); }
  dlg.addEventListener("close", function () {
    v.pause(); v.removeAttribute("src"); v.load();
    document.documentElement.classList.remove("lb-open");
    document.querySelectorAll(".myth-video").forEach(function (cv) { if (cv._lbPaused) { cv._lbPaused = false; var p = cv.play(); if (p && p.catch) p.catch(function () {}); } });
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  });

  items.forEach(function (it, i) {
    var li = it.li;
    li.tabIndex = 0; li.setAttribute("role", "button"); li.setAttribute("aria-label", "Watch the " + it.name);
    li.addEventListener("click", function () { open(i); });
    li.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(i); } });
    var hint = document.createElement("span"); hint.className = "myth-play"; hint.setAttribute("aria-hidden", "true"); hint.textContent = "▶ Watch";
    var ph = li.querySelector(".myth-photo"); if (ph) ph.appendChild(hint);
  });

  dlg.querySelector(".lb-close").addEventListener("click", close);
  dlg.querySelector(".lb-prev").addEventListener("click", function () { show(idx - 1); });
  dlg.querySelector(".lb-next").addEventListener("click", function () { show(idx + 1); });
  soundBtn.addEventListener("click", function () { setSound(!soundOn); if (v.paused) v.play(); });
  dlg.querySelector(".lb-cta").addEventListener("click", function () { close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.classList.contains("lb-stage")) close(); });  // click outside
  dlg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") show(idx - 1);
    if (e.key === "ArrowRight") show(idx + 1);
  });
  // swipe on phones
  var x0 = null, y0 = null;
  dlg.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  dlg.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(idx + (dx < 0 ? 1 : -1));
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
  });
})();
