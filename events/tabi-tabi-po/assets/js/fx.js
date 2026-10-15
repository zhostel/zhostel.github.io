/* TABI TABI PO — ambient motion: living eyes, fireflies (alitaptap), scroll reveals.
   Everything here is decorative and switches off for visitors who prefer reduced motion. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var visible = !document.hidden;
  document.addEventListener("visibilitychange", function () { visible = !document.hidden; });

  /* ---------- 1. The eyes look around on their own ---------- */
  function livingEyes() {
    var eyes = $$(".hero .eye");
    if (!eyes.length || reduce) return;
    // [x, y] in "fraction of max travel"; a mix of glances, a long stare ahead, and peeks at the page
    var spots = [[0, 0], [0, 0], [-1, 0], [1, 0], [-0.8, 0.6], [0.8, 0.6], [-0.6, -0.5], [0.6, -0.5], [0, 0.8], [-1, 0.3], [1, 0.3]];
    var lastSpot = 0;

    function look(x, y, speed) {
      eyes.forEach(function (eye) {
        var r = eye.getBoundingClientRect();
        var pupil = eye.firstElementChild;
        if (pupil) pupil.style.transitionDuration = speed + "s";
        eye.style.setProperty("--px", (x * r.width * 0.3).toFixed(1) + "px");
        eye.style.setProperty("--py", (y * r.height * 0.12).toFixed(1) + "px");
      });
    }
    function blink(times) {
      eyes.forEach(function (e) { e.classList.remove("blink"); void e.offsetWidth; e.classList.add("blink"); });
      if (times > 1) setTimeout(function () { blink(times - 1); }, 230);
    }
    function nextLook() {
      if (visible) {
        var i; do { i = Math.floor(Math.random() * spots.length); } while (i === lastSpot);
        lastSpot = i;
        var slow = Math.random() < 0.25;                 // sometimes a slow, suspicious drift
        look(spots[i][0], spots[i][1], slow ? rand(0.8, 1.4) : rand(0.12, 0.22));
        if (Math.random() < 0.18) setTimeout(function () { blink(Math.random() < 0.3 ? 2 : 1); }, rand(80, 260));
      }
      setTimeout(nextLook, rand(900, 3200));
    }
    function nextBlink() {
      if (visible) blink(Math.random() < 0.2 ? 2 : 1);
      setTimeout(nextBlink, rand(2600, 6500));
    }
    setTimeout(function () { nextLook(); nextBlink(); }, 2200);  // start after the eyes open
  }

  /* ---------- 2. Fireflies drifting through the hero ---------- */
  function fireflies() {
    var hero = document.querySelector(".hero");
    if (!hero || reduce || !window.requestAnimationFrame) return;
    var cv = document.createElement("canvas"); cv.className = "fireflies"; cv.setAttribute("aria-hidden", "true");
    hero.insertBefore(cv, hero.firstChild);
    var ctx = cv.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2), W = 0, H = 0, flies = [], onScreen = true;

    function size() {
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = W < 700 ? 14 : 26;
      while (flies.length < n) flies.push(spawn(true));
      flies.length = n;
    }
    function spawn(anywhere) {
      return { x: rand(0, W), y: anywhere ? rand(H * 0.25, H) : H + 10, r: rand(1.2, 2.6),
        vx: rand(-0.15, 0.15), vy: rand(-0.35, -0.08), ph: rand(0, 6.28), sp: rand(0.012, 0.03), wob: rand(0.3, 0.9) };
    }
    function frame() {
      if (onScreen && visible) {
        ctx.clearRect(0, 0, W, H);
        for (var i = 0; i < flies.length; i++) {
          var f = flies[i];
          f.ph += f.sp; f.x += f.vx + Math.sin(f.ph * 0.7) * f.wob * 0.25; f.y += f.vy;
          if (f.y < -12 || f.x < -12 || f.x > W + 12) flies[i] = f = spawn(false);
          var a = Math.max(0, Math.sin(f.ph)) * 0.85;          // fireflies pulse on and off
          if (a < 0.02) continue;
          var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 6);
          g.addColorStop(0, "rgba(255,226,120," + a + ")");
          g.addColorStop(0.25, "rgba(245,197,24," + (a * 0.45) + ")");
          g.addColorStop(1, "rgba(245,197,24,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 6, 0, 6.283); ctx.fill();
        }
      }
      requestAnimationFrame(frame);
    }
    size(); window.addEventListener("resize", size);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; }).observe(hero);
    requestAnimationFrame(frame);
  }

  /* ---------- 3. Sections ease in as you scroll ---------- */
  function reveals() {
    if (reduce || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("fx");
    var targets = $$(".night h2, .night-copy > *, .come-head > *, .rsvp-head > *, #rsvp-panel, .venue > *, .partner-grid > *, .sponsor-strip");
    targets.forEach(function (el) { el.classList.add("reveal"); });
    $$(".myths li").forEach(function (li, i) {
      li.classList.add("reveal");
      li.style.transitionDelay = (i % 4) * 40 + "ms";
      li.style.setProperty("--d", ((i % 4) * 0.04) + "s");
      $$(".myth-art path", li).forEach(function (p) { p.setAttribute("pathLength", "1"); });
      targets.push(li);
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    // myth cards start a little before they enter the screen, so they're already lit when you arrive
    var ioCards = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); ioCards.unobserve(e.target); } });
    }, { threshold: 0, rootMargin: "0px 0px 30% 0px" });
    targets.forEach(function (el) { (el.tagName === "LI" ? ioCards : io).observe(el); });
  }

  /* ---------- 4. Myth photos come alive ---------- */
  // Positions (percent of the image) of each creature's eyes, the moon, and other light sources.
  var SPOTS = {"aswang":{"eyes":[[53.8,28.4],[64.1,28.3]],"moon":[89.0,9.5,26.4],"eyeSize":7.5,"band":30,"stars":[[64.6,5.1],[42.4,2.9],[76.1,13.4],[75.0,1.2],[96,3]]},"diwata":{"eyes":[],"moon":[89.5,18.1,29.2],"twinkles":[[45,6],[57,8],[50,9],[53,38],[47,52],[58,64]],"band":34,"stars":[[63.6,7.7],[67.2,23.0],[75.0,27.2],[96,30],[72,14]]},"kapre":{"eyes":[[59.0,10.2],[61.5,11.5]],"moon":[85.5,19.2,30.6],"ember":[70.1,13.8],"eyeSize":4.5,"band":28,"stars":[[90.1,7.1],[80.8,4.2],[97,12]]},"manananggal":{"eyes":[[62.9,20.2],[68.1,22.3]],"moon":[79.5,11.2,34.8],"band":48,"stars":[[49.6,1.5],[62,4],[93,30],[85,40]],"lightning":true},"nuno":{"eyes":[[49.9,44.6],[52.6,45.3]],"moon":[92.0,10.5,35.5],"eyeSize":4.5,"band":34,"stars":[[69.9,14.1],[61.4,4.0],[82.1,29.4],[97,22]]},"tikbalang":{"eyes":[[61.1,12.9],[68.1,14.9]],"moon":[78.7,9.6,25.1],"band":24,"stars":[[66,3],[90,3]]},"tiyanak":{"eyes":[[47.4,37.1],[57.3,40.2]],"moon":[88.5,10.0,18.8],"eyeSize":7.5,"band":30,"stars":[[84.4,20.8],[53.5,5.6],[73.9,2.5],[97.2,20.0],[63.5,11.7]]},"whitelady":{"eyes":[],"moon":[85.8,12.9,23.7],"ghost":true,"band":30,"stars":[[67.6,12.8],[76.8,19.7],[97,8]]}};
  var KB = [["-3%","-2%",22],["3%","-2%",26],["-2%","2%",24],["2%","2.5%",28],["-3%","1.5%",25],["2.5%","-2.5%",23],["-2%","-3%",27],["3%","2%",24]];
  var conn = navigator.connection || {};
  var useVideo = !conn.saveData && !/(^|-)2g$/.test(conn.effectiveType || "");
  function pickSize(photo) {   // 360px video for phones and normal screens, 480px for sharp large screens
    var need = (photo.clientWidth || 280) * Math.min(window.devicePixelRatio || 1, 2);
    return need > 400 ? 480 : 360;
  }
  function livingMyths() {
    if (reduce) return;
    var cards = $$(".myths li");
    cards.forEach(function (li, i) {
      var photo = li.querySelector(".myth-photo"), img = photo && photo.querySelector("img");
      if (!img) return;
      var slug = (img.getAttribute("src").match(/myths\/([a-z]+)-/) || [])[1], s = SPOTS[slug];
      var anim = document.createElement("div"); anim.className = "myth-anim";
      img.parentNode.insertBefore(anim, img); anim.appendChild(img);
      var k = KB[i % KB.length];
      anim.style.setProperty("--kx", k[0]); anim.style.setProperty("--ky", k[1]); anim.style.setProperty("--kd", k[2] + "s");
      function spot(cls, x, y, size, extra) {
        var e = document.createElement("span"); e.className = "m-spot " + cls; e.setAttribute("aria-hidden", "true");
        e.style.setProperty("--x", x + "%"); e.style.setProperty("--y", y + "%"); if (size) e.style.setProperty("--s", size + "%");
        if (extra) for (var p in extra) e.style.setProperty(p, extra[p]);
        anim.appendChild(e);
      }
      if (s) {
        var cycle = rand(3.8, 5.6).toFixed(1) + "s", delay = rand(0.1, 0.7).toFixed(1) + "s";
        (s.eyes || []).forEach(function (p) { spot("m-eye", p[0], p[1], s.eyeSize || 6, { "--ed": cycle, "--edl": delay }); });
        if (s.band) {   // the sky: slow clouds, twinkling stars, a shooting star now and then
          var sky = document.createElement("span"); sky.className = "m-sky"; sky.setAttribute("aria-hidden", "true");
          sky.style.setProperty("--band", s.band + "%");
          var cd = rand(26, 52);
          sky.style.setProperty("--cd", cd.toFixed(1) + "s");
          sky.style.setProperty("--cdl", (-rand(0, cd)).toFixed(1) + "s");            // already mid-drift on arrival
          sky.style.setProperty("--cdir", Math.random() < 0.5 ? "normal" : "reverse"); // some drift left, some right
          var blobs = [], nb = 3 + Math.floor(Math.random() * 3);
          for (var b = 0; b < nb; b++) {
            blobs.push("radial-gradient(ellipse " + rand(10, 24).toFixed(0) + "% " + rand(18, 36).toFixed(0) + "% at " +
              rand(5, 95).toFixed(0) + "% " + rand(25, 75).toFixed(0) + "%, rgba(200,210,230," + rand(0.09, 0.17).toFixed(2) + "), transparent 70%)");
          }
          sky.style.backgroundImage = blobs.join(",");
          anim.appendChild(sky);
          (s.stars || []).forEach(function (p, j) { spot("m-star", p[0], p[1], 1.6, { "--sd": rand(1.6, 3.2).toFixed(1) + "s", "--sdl": rand(0, 2).toFixed(1) + "s" }); });
        }
        if (s.lightning) { var lt = document.createElement("span"); lt.className = "m-lightning"; lt.setAttribute("aria-hidden", "true"); anim.appendChild(lt); }
        if (s.moon) {   // the moon: halo breathing, slowly turning rays, clouds drifting across it
          spot("m-rays", s.moon[0], s.moon[1], s.moon[2] * 1.5, { "--rd": rand(50, 70).toFixed(0) + "s" });
          spot("m-moon", s.moon[0], s.moon[1], s.moon[2], { "--md": rand(3, 4.2).toFixed(1) + "s" });
          var mcd = rand(7, 12);
          spot("m-mooncloud", s.moon[0], s.moon[1], s.moon[2] * rand(0.8, 1.05), { "--mcd": mcd.toFixed(1) + "s", "--mcdl": (-rand(0, mcd)).toFixed(1) + "s",
            "--mcdir": Math.random() < 0.5 ? "normal" : "reverse" });
        }
        if (s.ember) spot("m-ember", s.ember[0], s.ember[1], 6);
        (s.twinkles || []).forEach(function (p, j) { spot("m-twinkle", p[0], p[1], 3.2, { "--td": rand(1.4, 2.2).toFixed(1) + "s", "--tdl": (j * 0.3).toFixed(1) + "s" }); });
        if (s.ghost) { var g = document.createElement("span"); g.className = "m-ghost"; g.setAttribute("aria-hidden", "true"); anim.appendChild(g); }
      }
      if (useVideo && slug) {
        var v = document.createElement("video");
        v.className = "myth-video"; v.muted = true; v.loop = true; v.playsInline = true; v.preload = "none";
        v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("aria-hidden", "true");
        v.dataset.src = "assets/myths/video/" + slug + "-" + pickSize(photo) + ".mp4?v=2";
        v.addEventListener("playing", function () { li.classList.add("has-video"); });
        anim.appendChild(v); li._video = v;
      }
      var fog = document.createElement("span"); fog.className = "m-fog"; fog.setAttribute("aria-hidden", "true");
      var fd = rand(16, 30);
      fog.style.setProperty("--fd", fd.toFixed(1) + "s"); fog.style.setProperty("--fdl", (-rand(0, fd)).toFixed(1) + "s");
      fog.style.setProperty("--fdir", Math.random() < 0.5 ? "normal" : "reverse");
      photo.insertBefore(fog, anim.nextSibling);
    });
    // Only animate cards that are on screen (saves battery on phones).
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var li = e.target, v = li._video;
          li.classList.toggle("playing", e.isIntersecting);
          if (!v) return;
          if (e.isIntersecting) {
            if (!v.src) { v.src = v.dataset.src; v.load(); }
            var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});   // autoplay blocked: the still stays
          } else if (!v.paused) v.pause();
        });
      }, { rootMargin: "200px 0px" });
      cards.forEach(function (c) { io.observe(c); });
    } else cards.forEach(function (c) { c.classList.add("playing"); });
  }

  function preloadMyths() {
    var go = function () { $$(".myth-photo img").forEach(function (img) { img.loading = "eager"; if (img.decode) img.decode().catch(function () {}); }); };
    if (document.readyState === "complete") setTimeout(go, 300);
    else window.addEventListener("load", function () { setTimeout(go, 300); });
  }

  preloadMyths();
  livingEyes();
  fireflies();
  reveals();
  livingMyths();
})();
