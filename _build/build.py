# -*- coding: utf-8 -*-
"""Builds the static Z Hostel site into the repo root.
Run:  python3 _build/build.py
Edit facts in _build/data.py, page copy in this file."""
import html, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from data import *  # noqa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = html.escape
VER = "20261017a"

# ------------------------------------------------------------------ helpers
def confirm(note, fallback=""):
    """Owner still has to confirm this. Visible while SHOW_CONFIRM, neutral text after."""
    if SHOW_CONFIRM:
        return f'<span class="confirm" title="Owner to confirm">To confirm: {E(note)}</span>'
    return E(fallback)

def img(name, alt, cls="", eager=False, sizes="(max-width: 800px) 100vw, 50vw"):
    load = 'fetchpriority="high"' if eager else 'loading="lazy" decoding="async"'
    c = f' class="{cls}"' if cls else ""
    return (f'<img{c} src="/assets/img/{name}.webp" alt="{E(alt)}" {load}>')

def fmt(n):
    return f"{n:,}" if isinstance(n, int) else str(n)

ICONS = {
    "flag": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>',
    "check": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    "safety": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v10M7 12h10"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>',
    "hood": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M10 21v-5h4v5"/></svg>',
}

NAV = [("/stay/", "Stay"), ("/eat-drink/", "Eat & Drink"), ("/z-street/", "Z Street"), ("/events/", "What's On"),
       ("/partner/", "Partner"), ("/about/", "About"), ("/gallery/", "Gallery"), ("/contact/", "Contact")]

def head(title, desc, path, og="/assets/img/hero-street-halloween-2018.webp", extra=""):
    full = title if title.startswith("Z Hostel") else f"{title} · Z Hostel Poblacion"
    url = SITE["url"] + path
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(full)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Z Hostel">
<meta property="og:title" content="{E(full)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE['url']}{og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0e0d0c">
<link rel="icon" type="image/png" href="/assets/img/z-logo-180.png">
<link rel="apple-touch-icon" href="/assets/img/z-logo-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=DM+Sans:opsz,wght@9..40,400..800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/z.css?v={VER}">
{extra}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
"""

def header(active, ribbon=True):
    items = "".join(
        f'<li><a href="{h}"{" aria-current=\"page\"" if h == active else ""}{" class=\"hot\"" if h == "/z-street/" and h != active else ""}>{E(t)}</a></li>'
        for h, t in NAV)
    rb = ""
    if ribbon:
        rb = ('<div class="ribbon">Halloween at Z: <a href="/events/tabi-tabi-po/">Tabi Tabi Po at Salakot, Oct 30–31</a> · '
              '<a href="https://ody-z.com/">THE ODY-Z street party moves to Nov 20</a></div>')
    return f"""{rb}
<header class="site-header">
  <nav class="wrap nav" aria-label="Main">
    <a class="brand" href="/"><img src="/assets/img/z-logo-180.png" alt="" width="40" height="40"><span>Z Hostel</span></a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="nav-links">Menu</button>
    <ul class="nav-links" id="nav-links">{items}</ul>
    <a class="btn sm book" href="/book/">Book a bed</a>
  </nav>
</header>
<main id="main">
"""

def footer(scripts="", mbook=True):
    mb = ('<div class="mbook" role="region" aria-label="Book"><div><b>Stay on the party street</b><span>Dorm beds &amp; private rooms</span></div>'
          '<a class="btn" href="/book/">Book a bed</a></div><script>document.body.classList.add("has-mbook")</script>') if mbook else ""
    return f"""</main>
{mb}
<footer class="site-footer">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <div class="tagline">Good Vibes Only</div>
        <p class="muted small">Home of Z Street, the street party that put Poblacion on the map. Z has always been about bringing people together: locals, travelers, and creatives alike.</p>
      </div>
      <div>
        <h4>Visit</h4>
        <ul>
          <li><a href="{SITE['maps']}" target="_blank" rel="noopener">5660 Don Pedro St., Brgy. Poblacion,<br>Makati City 1210</a></li>
          <li><a href="tel:{SITE['phone1_tel']}">{SITE['phone1']}</a></li>
          <li><a href="tel:{SITE['phone2_tel']}">{SITE['phone2']}</a></li>
          <li><a href="mailto:{SITE['email_res']}">{SITE['email_res']}</a></li>
        </ul>
      </div>
      <div>
        <h4>Explore</h4>
        <ul>
          <li><a href="/stay/">Rooms</a></li>
          <li><a href="/eat-drink/">Café & Roofdeck</a></li>
          <li><a href="/z-street/">Z Street parties</a></li>
          <li><a href="/events/">What's on</a></li>
          <li><a href="/gallery/">Gallery</a></li>
        </ul>
      </div>
      <div>
        <h4>Work with Z</h4>
        <ul>
          <li><a href="/partner/">Partner with us</a></li>
          <li><a href="/contact/?type=group">Group bookings</a></li>
          <li><a href="/contact/?type=careers">Join our Z Team</a></li>
          <li><a href="/contact/?type=volunteer">Volunteer at Z</a></li>
          <li><a href="mailto:{SITE['email_mkt']}">{SITE['email_mkt']}</a></li>
        </ul>
      </div>
      <div>
        <h4>Follow</h4>
        <ul>
          <li><a href="{SITE['facebook']}" target="_blank" rel="noopener">Facebook · ZHostelph</a></li>
          <li><a href="{SITE['instagram']}" target="_blank" rel="noopener">Instagram · @zhostelph</a></li>
          <li><a href="{SITE['youtube']}" target="_blank" rel="noopener">YouTube · @zhostel7847</a></li>
          <li><a href="{SITE['odyz']}" target="_blank" rel="noopener">ody-z.com</a></li>
        </ul>
      </div>
    </div>
    <div class="foot-bottom">
      <span>© 2026 {SITE['company']} · Z Hostel, Poblacion, Makati</span>
      <span><a href="/privacy/">Privacy</a> · <a href="/staff/">Staff</a></span>
    </div>
  </div>
</footer>
<script src="/assets/js/config.js?v={VER}"></script>
<script src="/assets/js/z.js?v={VER}" defer></script>
{events_json()}
<script src="/assets/js/zdates.js?v={VER}" defer></script>
<script src="/assets/js/book.js?v={VER}" defer></script>
{scripts}
</body>
</html>
"""

def write(path, content):
    out = os.path.join(ROOT, path.strip("/"), "index.html") if not path.endswith(".html") else os.path.join(ROOT, path.strip("/"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(content)
    PAGES.append(path)

PAGES = []

def stats_bar(items=STATS):
    return '<div class="stats">' + "".join(f'<div class="stat"><b>{E(v)}</b><span>{E(l)}</span></div>' for v, l in items) + "</div>"

def room_card(r):
    n, i, sleeps, kind, d, _ = r
    fr = ROOM_FROM.get(n)
    rate = f'<b>from ₱{fr:,}</b><span>/ {"bed" if kind == "Dorm" else "room"} / night</span>' if fr else f'<b>{E(sleeps)}</b>'
    slug = ROOM_SLUG.get(n, "")
    return f'''<article class="card reveal"><a class="card-media" href="/book/?room={slug}" tabindex="-1" aria-hidden="true">{img(i, n + " at Z Hostel")}</a>
<div class="card-body"><span class="tag">{E(kind)} · {E(sleeps)}</span><h3>{E(n)}</h3><p>{E(d[:120].rsplit(" ",1)[0])}…</p><div class="meta">{rate}</div>
<div class="card-foot btns"><a class="btn sm" href="/book/?room={slug}">Book this</a></div></div></article>'''

def booker_bar(checkin="", checkout="", note="Instant booking. Pay at check-in, or pay ahead by transfer for 5% off.", cls=""):
    di = f' data-checkin="{checkin}" data-checkout="{checkout}"' if checkin else ""
    return f'''<form class="booker {cls}"{di} aria-label="Check availability">
  <div class="zdr"><input type="hidden" name="checkin"><input type="hidden" name="checkout"></div>
  <div class="zguests" data-max="8"><input type="hidden" name="guests" value="2"></div>
  <button class="btn" type="submit">Search</button>
  <p class="note">{E(note)} Group of 9+? <a href="/contact/?type=group">Ask for group rates</a>.</p>
</form>'''

def events_json():
    ev = [{"name": "Tabi Tabi Po at Salakot", "start": "2026-10-30", "end": "2026-10-31", "when": "Oct 30–31",
           "note": "Salakot opening night, steps from your bed. RSVP free at zhostel.com/events/tabi-tabi-po."},
          {"name": "THE ODY-Z street party", "start": "2026-11-20", "end": "2026-11-20", "when": "Nov 20",
           "note": "Z Hostel is home base for the whole block party. Party weekends sell out first."}]
    return f'<script>window.Z_EVENTS={json.dumps(ev)};</script>'

def book_link(date_iso, nights=1):
    import datetime as _d
    d = _d.date.fromisoformat(date_iso[:10]); o = d + _d.timedelta(days=nights)
    return f"/book/?checkin={d.isoformat()}&checkout={o.isoformat()}"

def stay_cta(text="Stay on the street"):
    return f'<a class="btn" href="/book/">{E(text)}</a>'

# ------------------------------------------------------------------ chart
def bar_chart(values, title, unit="people", w=640, h=260, label_every=True):
    """values: list of (year, value) where value is int | 'paused' | None | 'confirm' | 'expected:N' | '15,000+'"""
    pad_l, pad_r, pad_t, pad_b = 8, 8, 28, 30
    nums = []
    for _, v in values:
        if isinstance(v, int): nums.append(v)
        elif isinstance(v, str) and v.startswith("expected:"): nums.append(int(v.split(":")[1]))
        elif isinstance(v, str) and v.replace(",", "").rstrip("+").isdigit(): nums.append(int(v.replace(",", "").rstrip("+")))
    vmax = max(nums) if nums else 1
    top = 30000 if vmax > 20000 else (20000 if vmax > 10000 else 10000)
    n = len(values)
    cw = (w - pad_l - pad_r) / n
    bw = min(44, cw * 0.62)
    ih = h - pad_t - pad_b
    out = [f'<svg class="chart" viewBox="0 0 {w} {h}" role="img" aria-label="{E(title)}">']
    out.append('<g class="grid">')
    for t in (0, top / 2, top):
        y = pad_t + ih - (t / top) * ih
        out.append(f'<line x1="{pad_l}" x2="{w - pad_r}" y1="{y:.1f}" y2="{y:.1f}"/>')
    out.append("</g>")
    for i, (yr, v) in enumerate(values):
        cx = pad_l + cw * i + cw / 2
        x = cx - bw / 2
        base = pad_t + ih
        out.append(f'<text x="{cx:.1f}" y="{h - 8}" text-anchor="middle">{E(yr)}</text>')
        if v == "paused":
            out.append(f'<text class="gap-label" x="{cx:.1f}" y="{base - 8}" text-anchor="middle">paused</text>')
            continue
        if v is None:
            out.append(f'<text class="gap-label" x="{cx:.1f}" y="{base - 8}" text-anchor="middle">—</text>')
            continue
        if v == "confirm":
            out.append(f'<text class="gap-label" x="{cx:.1f}" y="{base - 8}" text-anchor="middle">TBC</text>')
            continue
        est = isinstance(v, str) and v.startswith("expected:")
        if est: num = int(v.split(":")[1]); label = f"{num:,}"; tipnote = "Expected"
        elif isinstance(v, int): num = v; label = f"{v:,}"; tipnote = unit
        else: num = int(v.replace(",", "").rstrip("+")); label = v; tipnote = unit
        bh = max(2, (num / top) * ih)
        y = base - bh
        r = min(4, bw / 2)
        # bar with rounded top only
        path = (f"M{x:.1f},{base:.1f} V{y + r:.1f} Q{x:.1f},{y:.1f} {x + r:.1f},{y:.1f} H{x + bw - r:.1f} "
                f"Q{x + bw:.1f},{y:.1f} {x + bw:.1f},{y + r:.1f} V{base:.1f} Z")
        cls = "bar est" if est else "bar"
        short = f"{num/1000:.1f}k".replace(".0k", "k")
        if isinstance(v, str) and v.endswith("+"): short += "+"
        out.append(f'<g class="col" tabindex="0" data-tip="{E(label)} {E(tipnote)}|{E(title.split(":")[0])}, {E(yr)}">'
                   f'<rect class="hit" x="{cx - cw/2:.1f}" y="{pad_t}" width="{cw:.1f}" height="{ih}"/>'
                   f'<path class="{cls}" d="{path}"/>'
                   + (f'<text class="val" x="{cx:.1f}" y="{y - 7:.1f}" text-anchor="middle">{short}</text>' if label_every else "")
                   + "</g>")
    out.append("</svg>")
    return "".join(out)

def data_table(rows, cols):
    th = "".join(f"<th>{E(c)}</th>" for c in cols)
    trs = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="table-scroll"><table class="data-table"><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table></div>'

def cell(v):
    if v == "paused": return "Paused (pandemic)"
    if v is None: return "—"
    if v == "confirm": return confirm("actual attendance", "—")
    if isinstance(v, str) and v.startswith("expected:"): return f"Expected {int(v.split(':')[1]):,}"
    return fmt(v)

def growth_block():
    hall = SERIES[3]
    vals = [(y, hall["attendance"].get(y)) for y in YEARS]
    big = bar_chart(vals, "Z Street Halloween attendance by year", w=760, h=300)
    smalls = ""
    for s in SERIES[:3]:
        v = [(y.replace("2020–21", "’20–21"), s["attendance"].get(y)) for y in YEARS]
        smalls += f'''<div class="chart-card"><h3>{E(s["name"])}</h3><p class="sub">Record: {s["record"][0]} ({s["record"][1]})</p>{bar_chart(v, s["name"] + ": attendance by year", w=420, h=220)}</div>'''
    rows = []
    for y in YEARS:
        rows.append([y] + [cell(s["attendance"].get(y)) for s in SERIES[:4]])
    table = data_table(rows, ["Year", "Summer Kick Off", "Rev Up", "Repoblacion", "Halloween"])
    return f'''
<div class="chart-card reveal"><h3>Halloween, year by year</h3>
<p class="sub">Official Z Hostel attendance figures. 2026 is the expected turnout (dashed).</p>
{big}
<p class="small muted" style="margin:10px 0 0">Independent checks: the crowd-management contractor (Red Knights) counted 24,870 at Halloween 2019; the press reported “over 14,000” for Halloween 2022.</p>
</div>
<div class="grid g3" style="margin-top:20px">{smalls}</div>
<details class="table-view"><summary>Show all figures as a table</summary>{table}</details>'''

# ------------------------------------------------------------------ shared blocks
def series_card(s, compact=False):
    nxt = s["next_label"]
    if s.get("confirm_next") and SHOW_CONFIRM:
        nxt = E(nxt) + " " + confirm(s["confirm_next"])
    else:
        nxt = E(nxt)
    rec = ""
    was = f'<span class="tag">Formerly {E(s["formerly"])}</span>' if s.get("formerly") else ""
    past = f'<p class="small muted">2026 edition: {E(s["last_2026"])}</p>' if s.get("last_2026") else ""
    hot = '<span class="tag hot live">Next up</span>' if s["slug"] == "halloween" else (f'<span class="tag">In the works</span>' if s.get("future") else f'<span class="tag">{E(s["when"])}</span>')
    return f'''<article class="card reveal">
  <a class="card-media" href="/z-street/{s["slug"]}/" tabindex="-1" aria-hidden="true">{img(s["img"], "", sizes="(max-width: 700px) 100vw, 33vw")}</a>
  <div class="card-body">
    <div class="btns" style="gap:6px">{hot}{was}</div>
    <h3><a href="/z-street/{s["slug"]}/" style="text-decoration:none">{E(s.get("full", s["name"]))}</a></h3>
    <p><strong>{E(s["short"])}</strong> {E(s["copy"])}</p>
    {rec}
    {past}
    <p class="small"><b>Next:</b> {nxt}</p>
    <div class="card-foot btns"><a class="btn sm" href="/z-street/{s["slug"]}/">Details</a><a class="btn sm ghost" href="/book/">Stay for the party</a></div>
  </div>
</article>'''

def why_tiles():
    t = [
        ("flag", "The original.", "We've thrown Poblacion street parties since 2017, longer than anyone, and from the street we live on."),
        ("check", "Fully permitted.", "Every event is cleared with Makati City Hall, Barangay Poblacion, the Bureau of Fire Protection, PNP, the Public Safety Department, MDRRMO, the Makati Health Department and PDEA. The calendar is endorsed by the Makati Tourism Office."),
        ("safety", "Safety first.", "Professional crowd management (Red Knights, our partner since 2019), K-9 units, CCTV across both streets, EMT stations, ambulances, a fire truck on standby, a command center, and hospital coordination with Makati Med, St. Luke's and Ospital ng Makati. Strict house rules and no alcohol for minors."),
        ("hood", "Good for the neighborhood.", "Z Street fills Poblacion's bars, restaurants and small businesses, and puts the district on Manila's tourism map. Dozens of local venues take part every year."),
    ]
    return '<div class="grid g4">' + "".join(
        f'<div class="tile reveal"><div class="ico">{ICONS[i]}</div><h3>{E(a)}</h3><p>{E(b)}</p></div>' for i, a, b in t) + "</div>"

def press_wall():
    items = "".join(f'<a href="{u}" target="_blank" rel="noopener"><b>{E(n)}</b><span>{E(t)}</span></a>' for n, t, u in PRESS)
    also = " · ".join(PRESS_ALSO)
    return f'<div class="press">{items}</div><p class="small muted" style="margin-top:14px">Also featured in Halloween round-ups by {E(also)}.</p>'

def words(lst):
    return '<ul class="wordwall">' + "".join(f"<li><span>{E(x)}</span></li>" for x in lst) + "</ul>"

def faq_items(series=None):
    hours = confirm("hours per event", "Usually 5–6 p.m. until 1–3 a.m.")
    fee = confirm("free or ticketed, per event", "Check each event page for entry details.")
    age = confirm("age limit (18+?)", "18+.")
    if series and series["slug"] == "halloween":
        age = "THE ODY-Z (Nov 20, 2026) is an 18+ event."
    qa = [
        ("Where is it?", "On Don Pedro St. and Alfonso St., Poblacion, Makati. The gates are at Kalayaan Ave./Jacobo St. and Fermina St. Z Hostel is at 5660 Don Pedro St., right on the party street."),
        ("What time does it start and end?", f"Usually 5–6 p.m. until 1–3 a.m. {hours if SHOW_CONFIRM else ''}"),
        ("Is it free or ticketed?", fee),
        ("Is there an age limit?", age),
        ("What can't I bring?", "No weapons, no dangerous items and no drugs. Organizers may refuse entry. There's no alcohol for minors."),
    ]
    if series is None or series["slug"] == "halloween":
        qa.append(("Is there a costume contest?", "Yes. Halloween on Z Street always has costume contests and themed gates. Go full character."))
    qa += [
        ("Can I stay nearby?", f'Yes. Z Hostel is on the street. Event weekends sell out, so <a href="/book/">book early</a>.'),
        ("I lost something. Who do I contact?", f'Message the Z Hostel front desk on <a href="tel:{SITE["phone2_tel"]}">{SITE["phone2"]}</a> or <a href="/contact/">send us a note</a> with what you lost and where.'),
        ("How do I get there, and where do I park?", 'Poblacion is walkable from the Makati CBD; take a ride-hail drop-off at Kalayaan Ave. or Fermina St. Streets around the party are closed on the night, so parking is very limited. <a href="/assets/docs/directions-to-z.pdf">Directions to Z (PDF)</a>.'),
    ]
    body = "".join(f'<details><summary>{E(q)}</summary><div class="a"><p>{a}</p></div></details>' for q, a in qa)
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": re.sub("<[^>]+>", "", a)}} for q, a in qa if "confirm" not in a]}
    return f'<div class="faq">{body}</div><script type="application/ld+json">{json.dumps(ld)}</script>'

def signup_block(event_slug, heading, sub):
    return f'''<div class="form-card" data-zlist="{event_slug}" id="list">
  <span class="eyebrow">Get on the list</span>
  <h2 style="font-size:clamp(30px,4vw,48px)">{heading}</h2>
  <p class="muted">{sub}</p>
  <form class="form" novalidate>
    <div class="row2">
      <div class="field"><label for="zl-name-{event_slug}">Full name *</label><input id="zl-name-{event_slug}" name="full_name" type="text" autocomplete="name" required maxlength="120"></div>
      <div class="field"><label for="zl-email-{event_slug}">Email *</label><input id="zl-email-{event_slug}" name="email" type="email" autocomplete="email" required maxlength="200"></div>
    </div>
    <div class="field"><label for="zl-phone-{event_slug}">Phone <span class="muted">(optional, for last-minute updates)</span></label><input id="zl-phone-{event_slug}" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>
    <div class="field"><span class="label" id="zl-party-{event_slug}">How many friends are you bringing? <span class="muted">(optional)</span></span>
      <div class="chips" role="group" aria-labelledby="zl-party-{event_slug}">
        {"".join(f'<label class="chip"><input type="radio" name="party_size" value="{p}"><span>{p}</span></label>' for p in ["Solo", "1–2", "3–5", "6+"])}
      </div></div>
    <input class="hp" type="text" name="website_hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="check"><input type="checkbox" name="consent" required><span>I agree to the <a href="/privacy/">privacy notice</a>. Z Hostel uses these details to plan the event and contact me about it. *</span></label>
    <label class="check"><input type="checkbox" name="marketing"><span>Email me about future Z Street parties and Z Hostel offers. Unsubscribe anytime.</span></label>
    <div class="btns"><button class="btn lg" type="submit">Put me on the list</button></div>
    <p class="form-msg" role="alert"></p>
  </form>
  <div class="survey" hidden aria-live="polite"></div>
</div>'''

def event_ld(name, start_iso, desc, url, image, end_iso=None, location_name="Z Street, Don Pedro St., Poblacion, Makati", status="EventScheduled"):
    d = {"@context": "https://schema.org", "@type": "Event", "name": name, "startDate": start_iso,
         "eventStatus": f"https://schema.org/{status}", "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
         "location": {"@type": "Place", "name": location_name,
                      "address": {"@type": "PostalAddress", "streetAddress": "Don Pedro St.", "addressLocality": "Makati", "addressRegion": "Metro Manila", "postalCode": "1210", "addressCountry": "PH"}},
         "organizer": [{"@type": "Organization", "name": "Z Hostel", "url": SITE["url"]}, {"@type": "Organization", "name": "PLUD (Poblacion Land & Urban Development Corp.)"}],
         "description": desc, "url": url, "image": [image]}
    if end_iso: d["endDate"] = end_iso
    return f'<script type="application/ld+json">{json.dumps(d)}</script>'

def upcoming_cards():
    out = []
    for u in UPCOMING:
        media = (f'<img src="{u["img_ext"]}" alt="THE ODY-Z street party poster art" loading="lazy" onerror="this.onerror=null;this.src=\'/assets/img/{u["img"]}.webp\'">'
                 if u.get("img_ext") else f'<img src="{u["img_local"]}" alt="The White Lady, one of the Filipino myths of Tabi Tabi Po" loading="lazy">')
        target = ' target="_blank" rel="noopener"' if u["external"] else ""
        out.append(f'''<article class="feature reveal">
  {media}
  <div class="feature-body">
    <span class="tag hot live">{E(u["kicker"])}</span>
    <h2 style="margin-top:14px">{E(u["name"])}</h2>
    <div class="meta"><span><b>{E(u["date_label"])}</b></span><span>{E(u["where"])}</span></div>
    <div class="countdown" data-countdown="{u["start_iso"]}" aria-label="Countdown to {E(u["name"])}"></div>
    <p>{E(u["blurb"])}</p>
    <div class="btns"><a class="btn" href="{u["href"]}"{target}>{E(u["cta"])}</a><a class="btn ghost" href="{book_link(u["start_iso"], 2 if u["slug"] == "tabi-tabi-po" else 1)}">Stay for the party</a></div>
  </div>
</article>''')
    return '<div class="grid g2">' + "".join(out) + "</div>"

# ================================================================== PAGES
def page_home():
    h = head("Z Hostel · Poblacion, Makati · Home of Z Street",
             "Z Hostel in Poblacion, Makati: big comfy dorms and private rooms, the Z Café, the world-renowned Roofdeck, and Z Street, Poblacion's biggest street party since 2017.", "/")
    rooms = "".join(room_card(r) for r in [ROOMS[2], ROOMS[5], ROOMS[0]])
    body = f'''
<section class="hero">
  <div class="hero-bg">{img("hero-street-halloween-2018", "Thousands of people in costume fill Don Pedro Street at Z Street Halloween", eager=True, sizes="100vw")}</div>
  <div class="wrap hero-inner">
    <span class="eyebrow">Z Hostel · Poblacion, Makati</span>
    <h1>Good vibes only. <em>Home of Z Street.</em></h1>
    <p class="lede">On Don Pedro Street since 2015: a hostel with a higher standard of stay, a café with restaurant-quality food, a rooftop the whole city knows, and, since 2017, the street party that put Poblacion on the map.</p>
    {booker_bar(cls="home")}
  </div>
</section>
<section class="wrap" aria-label="Z Street in numbers">{stats_bar()}</section>

<section class="section">
  <div class="wrap">
    <div class="section-head"><span class="eyebrow">Up next at Z</span><h2>Halloween at Salakot. Then the street.</h2>
    <p class="lede">Salakot opens its doors at Z with Tabi Tabi Po on Oct 30 and 31. Then THE ODY-Z takes over the whole block on Friday, November 20.</p></div>
    {upcoming_cards()}
  </div>
</section>

<section class="section alt">
  <div class="wrap split">
    <div class="reveal">
      <span class="eyebrow">Z Street · Since 2017</span>
      <h2>Poblacion's biggest street party.</h2>
      <p class="lede">Four times a year we close Don Pedro and Alfonso Streets and turn Poblacion into one giant block party, permitted, secured and endorsed by the City of Makati.</p>
      <ul class="pill-list" style="margin:18px 0 22px">{"".join(f'<li>{E(s["name"])} · {E(s["when"])}</li>' for s in SERIES)}</ul>
      <div class="btns"><a class="btn" href="/z-street/">See the 2026 calendar</a><a class="btn ghost" href="/partner/">Partner with us</a></div>
    </div>
    <div class="reveal">{img("street-aerial-revup-2019", "Aerial view of a packed Z Street at Rev Up", "", sizes="(max-width: 900px) 100vw, 50vw")}</div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head"><span class="eyebrow">Feel-good and comfy</span><h2>Rooms</h2>
    <p class="lede">Spacious rooms with customized big beds, each with its own electric socket and reading lamp. Air-conditioning, counters with a sink, and en-suite bathrooms. Modern, minimal, and regularly sanitized.</p></div>
    <div class="grid g3">{rooms}</div>
    <div class="btns" style="margin-top:24px"><a class="btn" href="/book/">Book a bed or room</a><a class="btn ghost" href="/stay/">All rooms</a></div>
  </div>
</section>

<section class="section alt">
  <div class="wrap grid g2">
    <article class="feature reveal" style="min-height:520px">{img("roofdeck-crowd", "A packed Z Roofdeck party at night")}
      <div class="feature-body"><span class="eyebrow">Party all night</span><h2>The Z Roofdeck</h2>
      <p>The Manila skyline from every angle, a bar with cold beers, fresh cocktails and cracking munchies, and a DJ deck that has become home to local and international artists. Sunset Sessions daily from 6 p.m.; Happy Hour Mon–Thu, 5–8 p.m.</p>
      <a class="btn" href="/eat-drink/#roofdeck">The Roofdeck</a></div></article>
    <article class="feature reveal" style="min-height:520px">{img("cafe-ramen", "Street Ramen from the Z Café")}
      <div class="feature-body"><span class="eyebrow">Taste the flavor</span><h2>The Z Café</h2>
      <p>Hostel vibe, restaurant-quality food: the Original Z blend coffee, a buffet breakfast, Adobo Flakes, Sisig, Beef Sinigang, Yakitori and Street Ramen.</p>
      <a class="btn" href="/eat-drink/">The Café</a></div></article>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head"><span class="eyebrow">As featured in</span><h2>The press has been on the street.</h2></div>
    {press_wall()}
  </div>
</section>

<section class="section tight"><div class="wrap"><div class="cta-band">
  <div><h2>Stay on the street.</h2><p>Z Hostel sits right on the party street. Party weekends sell out first.</p></div>
  <div class="btns"><a class="btn lg" href="/book/">Book now</a><a class="btn lg ghost" href="/contact/">Contact us</a></div>
</div></div></section>
'''
    ld = {"@context": "https://schema.org", "@type": "Hostel", "name": "Z Hostel", "url": SITE["url"],
          "telephone": "+63 2 8856 0851", "image": SITE["url"] + "/assets/img/facade.webp",
          "address": {"@type": "PostalAddress", "streetAddress": "5660 Don Pedro St., Brgy. Poblacion", "addressLocality": "Makati City", "postalCode": "1210", "addressCountry": "PH"},
          "sameAs": [SITE["facebook"], SITE["instagram"], SITE["youtube"]]}
    write("/", h + header("/") + body + f'<script type="application/ld+json">{json.dumps(ld)}</script>' + footer())

def page_stay():
    h = head("Rooms & Rates", "Mixed dorms (4, 6 and 8 beds), a women-only dorm and private rooms at Z Hostel, Poblacion, Makati. Book direct with live availability.", "/stay/")
    rooms = []
    for k, (n, i, sleeps, kind, d, ticks) in enumerate(ROOMS):
        fr = ROOM_FROM.get(n)
        slug = ROOM_SLUG.get(n, "")
        price = f'<div class="price">from ₱{fr:,} <small>/ {"bed" if kind == "Dorm" else "room"} / night</small></div><p class="small muted" style="margin:0">Bed-only rate. Breakfast rates available when you book.</p>' if fr else ""
        rooms.append(f'''<article class="room reveal{" flip" if k % 2 else ""}">
  <div class="room-media">{img(i, n + " at Z Hostel")}</div>
  <div class="room-body"><span class="tag">{E(kind)} · {E(sleeps)}</span><h3>{E(n)}</h3><p class="muted">{E(d)}</p>
    <ul class="ticks">{"".join(f"<li>{E(t)}</li>" for t in ticks)}</ul>
    {price}
    <div class="btns"><a class="btn" href="/book/?room={slug}">Book this</a></div></div>
</article>''')
    body = f'''
<section class="hero short">
  <div class="hero-bg">{img("room-guests", "Guests hanging out in a Z Hostel dorm", eager=True, sizes="100vw")}</div>
  <div class="wrap hero-inner"><span class="eyebrow">Stay</span><h1>Big beds. Good vibes.</h1>
  <p class="lede">Our mixed dorms are probably the biggest and most comfortable you will ever stay in. Wide customized bunks, each with its own socket and reading lamp, a towel rack, and lockers big enough for your valuables (with a socket to charge that GoPro).</p>
  {booker_bar(cls="stay")}</div>
</section>
<section class="section"><div class="wrap stack" style="display:grid;gap:22px">{"".join(rooms)}
<p class="muted small">{E(SOCIAL_FLOOR)}</p></div></section>
<section class="section alt"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Included</span><h2>Amenities & services</h2></div>
  <ul class="amenities">{"".join(f"<li>{E(a)}</li>" for a in AMENITIES)}</ul>
</div></section>
<section class="section"><div class="wrap split">
  <div class="reveal"><span class="eyebrow">Stay for the party</span><h2>Your bed is on the party street.</h2>
  <p class="lede">Z Hostel sits on Don Pedro Street, the heart of every Z Street party. Event weekends sell out first, so book early.</p>
  <div class="btns"><a class="btn" href="/z-street/">Z Street calendar</a><a class="btn ghost" href="/contact/?type=group">Group bookings</a></div></div>
  <div class="reveal">{img("facade", "The Z Hostel entrance on Don Pedro Street")}</div>
</div></section>'''
    write("/stay/", h + header("/stay/") + body + footer())

def page_eat():
    h = head("Café & Roofdeck", "The Z Café (Original Z blend coffee, buffet breakfast, Adobo Flakes, Sisig, Beef Sinigang, Yakitori, Street Ramen) and the world-renowned Z Roofdeck with Sunset Sessions and Happy Hour.", "/eat-drink/")
    body = f'''
<section class="hero short">
  <div class="hero-bg">{img("roofdeck-skyline", "Friends on the Z Roofdeck with the Makati skyline behind them", eager=True, sizes="100vw")}</div>
  <div class="wrap hero-inner"><span class="eyebrow">Eat & Drink</span><h1>Taste the flavor. Then go up.</h1></div>
</section>
<section class="section" id="cafe"><div class="wrap split">
  <div class="reveal"><span class="eyebrow">The Z Café</span><h2>Hostel vibe. Restaurant-quality food.</h2>
  <p class="lede">The Z Café houses the Original Z blend coffee, a buffet breakfast, and sumptuous bestsellers such as Adobo Flakes, Sisig and Beef Sinigang. New additions like Yakitori and Street Ramen take hostel dining to a whole new level. Alcoholic beverages and refreshments are always available during café hours.</p>
  <ul class="pill-list" style="margin:16px 0 22px"><li>Original Z blend coffee</li><li>Buffet breakfast</li><li>Adobo Flakes</li><li>Sisig</li><li>Beef Sinigang</li><li>Yakitori</li><li>Street Ramen</li></ul>
  <div class="btns"><a class="btn" href="/assets/docs/z-cafe-menu.pdf" target="_blank" rel="noopener">Download the menu (PDF)</a></div></div>
  <div class="grid g2 reveal" style="gap:10px">{img("cafe-breakfast","Z Café breakfast spread")}{img("cafe-counter","The Z Café counter")}{img("cafe-selfservice","Self-service at the Z Café")}{img("cafe-kitchen","The Z Café kitchen")}</div>
</div></section>
<section class="section alt" id="roofdeck"><div class="wrap split flip">
  <div class="reveal"><span class="eyebrow">Party all night</span><h2>The Z Roofdeck</h2>
  <p class="lede">Now world-renowned, the Z Roofdeck has put the hostel on a sweet, top spot in the traveling industry. A fantastic view of the Manila skyline from every angle, a bar serving cold beers, fresh cocktails and cracking munchies, and a DJ deck that has become home to local and international artists.</p>
  <dl class="kv" style="margin:18px 0 22px"><dt>Sunset Sessions</dt><dd>Daily from 6 p.m. · one free cocktail for in-house guests</dd><dt>Happy Hour</dt><dd>Monday–Thursday, 5–8 p.m.</dd><dt>Weekends</dt><dd>It's a rooftop party</dd></dl>
  <div class="btns"><a class="btn" href="/events/">What's on this week</a></div></div>
  <div class="grid g2 reveal" style="gap:10px">{img("roofdeck-crowd","Crowd on the Roofdeck")}{img("roofdeck-acoustic","Acoustic set on the Roofdeck")}{img("roofdeck-tap","Beer on tap at the Roofdeck bar")}{img("roofdeck-day","The Roofdeck by day")}</div>
</div></section>
<section class="section tight"><div class="wrap"><div class="cta-band"><div><h2>One free cocktail at sunset.</h2><p>For every in-house guest, every day from 6 p.m.</p></div><div class="btns">{stay_cta("Book your stay")}</div></div></div></section>'''
    write("/eat-drink/", h + header("/eat-drink/") + body + footer())

def page_zstreet():
    h = head("Z Street: Poblacion's Biggest Street Party",
             "Z Street: Poblacion's biggest street party since 2017. Summer Kick Off, Rev Up, Repoblacion and Halloween on Don Pedro & Alfonso Streets, Makati, with a holiday street party in the works.", "/z-street/")
    cards = "".join(series_card(s) for s in SERIES)
    weekly = "".join(f'''<article class="card reveal"><div class="card-media">{img(i, n, sizes="(max-width: 700px) 100vw, 20vw")}</div><div class="card-body"><span class="tag">{E(w)}</span><h3>{E(n)}</h3><p>{E(d)}</p></div></article>''' for n, w, d, i in WEEKLY)
    tl = "".join(f'''<div class="tl {cls}"><div class="yr">{E(y)}</div><h4>{E(t)}</h4><p>{E(d)}</p>{f'<span class="tag{" hot" if cls=="next" else ""}">{E(n)}</span>' if n else ""}</div>''' for y, t, d, n, cls in HALLOWEEN)
    quote_attr = confirm("brand name and permission to quote", "A Z Street sponsor")
    body = f'''
<section class="hero">
  <div class="hero-bg">{img("street-aerial-revup-2019", "Aerial view of thousands of people on Z Street", eager=True, sizes="100vw")}</div>
  <div class="wrap hero-inner">
    <span class="eyebrow">Z Street · Since 2017</span>
    <h1>Poblacion's biggest street party.</h1>
    <p class="lede">25 parties since 2017. Four times a year we close Don Pedro and Alfonso Streets and turn Poblacion into one giant block party, permitted, secured and endorsed by the City of Makati.</p>
    <div class="btns"><a class="btn lg" href="#calendar">See the 2026 calendar</a><a class="btn lg ghost" href="/book/">Stay on the street</a><a class="btn lg ghost" href="/partner/">Partner with us</a></div>
  </div>
</section>
<section class="wrap" aria-label="Z Street in numbers">{stats_bar()}</section>

<section class="section" id="calendar"><div class="wrap">
  <div class="section-head"><span class="eyebrow">The year in Z Street</span><h2>Four parties a year. One more on the way.</h2>
  <p class="lede">Z Hostel co-organizes every Z Street with PLUD (Poblacion Land & Urban Development Corp.). Each event is fully permitted by the City of Makati and Barangay Poblacion, and in 2023 the Makati Tourism Office formally endorsed the calendar.</p></div>
  <div class="grid g3">{cards}
    <article class="card reveal" style="justify-content:center"><div class="card-body" style="justify-content:center">
      <span class="eyebrow">Never miss one</span><h3>Get on the Z Street list</h3><p>Dates, line-ups and early perks, before anyone else.</p>
      <div class="card-foot btns"><a class="btn" href="#list">Join the list</a></div></div></article>
  </div>
</div></section>

<section class="section alt"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Halloween history</span><h2>The night keeps growing.</h2>
  <p class="lede">From the first takeover of Don Pedro in 2017 to the biggest Halloween street party in Manila. Year by year.</p></div>
  <div class="timeline" tabindex="0" aria-label="Halloween timeline, scroll sideways">{tl}</div>
  <p class="scroll-hint">Scroll sideways for every year →</p>
  
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Why Z Street is different</span><h2>The biggest party in the city, run by people who know what they're doing.</h2></div>
  {why_tiles()}
</div></section>

<section class="section alt"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Proof wall</span><h2>As featured in</h2></div>
  {press_wall()}
  <div class="grid g3" style="margin-top:48px">
    <div class="reveal"><h3>Brands that have partnered with Z Street</h3>{words(BRANDS)}<p class="small muted" style="margin-top:10px">{confirm("logo-use permission before showing logos", "")}</p></div>
    <div class="reveal"><h3>Artists who've played Z Street</h3>{words(ARTISTS)}</div>
    <div class="reveal"><h3>Partner venues</h3>{words(VENUES + ["and more"])}</div>
  </div>
  <div class="split" style="margin-top:48px">
    <blockquote class="quote reveal">“The Z Team's experience of doing these street parties truly showed.”<cite>{quote_attr}</cite></blockquote>
    <div class="reveal"><h3>Watch the street</h3><p class="muted">Halloween 2025 and every Z Street before it, on our YouTube channel.</p>
    <div class="btns"><a class="btn" href="{SITE["youtube"]}" target="_blank" rel="noopener">Z Hostel on YouTube</a></div>
    <p class="small" style="margin-top:12px">{confirm("embed “Z Hostel Halloween 2025” here (need the video link), and ask Tour From Home TV about embedding “Halloween Invasion Tour”", "")}</p></div>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Every week at Z</span><h2>No street closure needed.</h2><p class="lede">Between Z Street parties, the Roofdeck keeps the music going.</p></div>
  <div class="grid g3">{weekly}</div>
</div></section>

<section class="section alt"><div class="wrap split" style="align-items:start">
  <div><div class="section-head"><span class="eyebrow">Party guide</span><h2>Before you go</h2></div>{faq_items()}</div>
  <div>{signup_block("z-street-list", "Never miss a Z Street.", "Name and email puts you on the list. The optional questions after that help us plan the bar, the stages and the street.")}</div>
</div></section>

<section class="section tight"><div class="wrap"><div class="cta-band">
  <div><h2>Put your brand on the street.</h2><p>Poblacion's biggest street crowds. Request the sponsorship deck.</p></div>
  <div class="btns"><a class="btn lg" href="/partner/">Partner with us</a></div>
</div></div></section>'''
    ld = event_ld("THE ODY-Z: Z Street 2026", "2026-11-20T18:00:00+08:00",
                  "Z Street Halloween 2026: a Poblacion homecoming street party on Don Pedro & Alfonso Streets, Makati.",
                  SITE["url"] + "/z-street/halloween/", SITE["url"] + "/assets/img/halloween-2018-crowd.webp")
    write("/z-street/", h + header("/z-street/") + body + ld + footer())

def page_series(s):
    name = s.get("full", s["name"])
    h = head(f"{name} · Z Street", f"{name}: {s['short']} {s['copy']} Don Pedro & Alfonso Streets, Poblacion, Makati.", f"/z-street/{s['slug']}/",
             og=f"/assets/img/{s['img']}.webp")
    # next date block
    if s["next_iso"]:
        nxt = f'<div class="countdown" data-countdown="{s["next_iso"]}" aria-label="Countdown"></div>'
    else:
        nxt = ""
    nxt_label = E(s["next_label"]) + ((" " + confirm(s["confirm_next"])) if s.get("confirm_next") and SHOW_CONFIRM else "")
    # themes
    if s["slug"] == "halloween":
        themes = "".join(f'<div class="tl {cls}"><div class="yr">{E(y)}</div><h4>{E(t)}</h4><p>{E(d)}</p></div>' for y, t, d, n, cls in HALLOWEEN)
        themes = f'<div class="timeline" tabindex="0" aria-label="Halloween themes by year">{themes}</div><p class="scroll-hint">Scroll sideways →</p>'
    elif s["themes"]:
        themes = '<div class="grid g2">' + "".join(f'<div class="tile"><h4 class="accent">{E(y)}</h4><p>{E(t)}</p></div>' for y, t in s["themes"]) + "</div>"
    else:
        themes = f'<p class="muted">{confirm("past editions and themes for the Holiday street party", "More soon.")}</p>'
    # chart
    if False:
        vals = [(y, s["attendance"].get(y)) for y in YEARS]
        chart = f'''<div class="chart-card reveal"><h3>Attendance by year</h3><p class="sub">Official Z Hostel figures. Record: {s["record"][0]} ({s["record"][1]}).</p>{bar_chart(vals, name + ": attendance by year", w=760, h=280)}
<details class="table-view"><summary>Show as a table</summary>{data_table([[y, cell(s["attendance"].get(y))] for y in YEARS], ["Year", "Attendance"])}</details></div>'''
    else:
        chart = ""
    photos = "".join(
        f'<a href="/assets/img/{p}.webp" data-lightbox data-caption="{E(s["photo_caption"])}"{" class=\"w2 h2\"" if k == 0 else ""}>{img(p, s["photo_caption"], sizes="(max-width: 700px) 100vw, 33vw")}</a>'
        for k, p in enumerate(s["photos"]))
    phs = "".join(f'<figure class="ph"><div><b>{E(p)}</b>Photo slot: drop the file in assets/img/</div></figure>' for p in s["placeholders"]) if SHOW_CONFIRM else ""
    odyz = ""
    if s["slug"] == "halloween":
        odyz = f'''<section class="section"><div class="wrap">
<article class="feature reveal" style="min-height:560px"><img src="https://ody-z.com/assets/hero-wide.jpg" alt="THE ODY-Z key art" loading="lazy" onerror="this.onerror=null;this.src='/assets/img/halloween-2018-street.webp'">
<div class="feature-body"><span class="tag hot live">New date: Fri, Nov 20, 2026</span><h2 style="margin-top:14px">THE ODY-Z</h2>
<p>A Poblacion homecoming street party, moved from October 30 to Friday, November 20. All roads lead back to Poblacion. THE ODY-Z runs across the whole block, with Z Hostel as home base and the Vine Building across the corner joining the takeover. Dress code: elevated, dramatic, a little dangerous. Or go full character. 18+.</p>
<div class="countdown" data-countdown="2026-11-20T18:00:00+08:00"></div>
<div class="btns"><a class="btn" href="https://ody-z.com/" target="_blank" rel="noopener">See more & RSVP at ody-z.com</a><a class="btn ghost" href="/events/tabi-tabi-po/">Also at Z: Tabi Tabi Po</a></div></div></article>
</div></section>'''
    ld = ""
    if s["next_iso"]:
        ld = event_ld(f"{name} {s['next_iso'][:4]}" if s["slug"] != "halloween" else "THE ODY-Z: Z Street 2026",
                      s["next_iso"], f"{s['short']} {s['copy']}", SITE["url"] + f"/z-street/{s['slug']}/", SITE["url"] + f"/assets/img/{s['img']}.webp")
    was = f'<p class="muted" style="margin-top:-6px">Formerly {E(s["formerly"])}</p>' if s.get("formerly") else ""
    body = f'''
<section class="hero short">
  <div class="hero-bg">{img(s["img"], s["photo_caption"], eager=True, sizes="100vw")}</div>
  <div class="wrap hero-inner"><span class="eyebrow"><a href="/z-street/" style="color:inherit">Z Street</a> · {E(s["when"])}</span>
  <h1>{E(name)}</h1>{was}
  <p class="lede"><strong>{E(s["short"])}</strong> {E(s["copy"])}</p>
  <p class="small"><b>Next:</b> {nxt_label}</p>{nxt}
  <div class="btns"><a class="btn lg" href="#list">Get on the list</a><a class="btn lg ghost" href="/book/">Stay on the street</a></div></div>
</section>
{odyz}
{"" if s.get("future") else f'''<section class="section alt"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Past themes</span><h2>Year by year</h2></div>
  {themes}
  <div style="margin-top:28px">{chart}</div>
</div></section>'''}
<section class="section"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Gallery</span><h2>{"Year-end at Z so far" if s.get("future") else "Scenes from the street"}</h2></div>
  <div class="mosaic">{photos}{phs}</div>
</div></section>
<section class="section alt"><div class="wrap grid g2">
  <div class="cta-band" style="grid-template-columns:1fr"><div><h2>Stay on the street.</h2><p>Z Hostel is on Don Pedro, right where the party happens. Party weekends sell out.</p></div><div class="btns"><a class="btn lg" href="{book_link(s["next_iso"]) if s["next_iso"] else "/book/"}">Book for that weekend</a></div></div>
  <div class="tile" style="display:flex;flex-direction:column;justify-content:center"><span class="eyebrow">Sponsors</span><h2 style="font-size:clamp(28px,3.4vw,44px)">Put your brand on the street.</h2><p>Entrance arches, stages, pop-up bars and brand ambassadors in front of Poblacion's biggest street crowds.</p><div class="btns" style="margin-top:16px"><a class="btn" href="/partner/?event={s["slug"]}">Request the sponsorship deck</a></div></div>
</div></section>
<section class="section"><div class="wrap split" style="align-items:start">
  <div><div class="section-head"><span class="eyebrow">Party guide</span><h2>FAQ</h2></div>{faq_items(s)}</div>
  <div>{signup_block(s["slug"], f"Be first to know.", f"We'll email you the date, line-up and early perks for {E(s['name'])}.")}</div>
</div></section>'''
    write(f"/z-street/{s['slug']}/", h + header("/z-street/") + body + ld + footer())

def page_events():
    h = head("What's On", "What's on at Z Hostel, Poblacion: THE ODY-Z Halloween street party, Tabi Tabi Po at Salakot, the Z Street calendar, Roofdeck Sunset Sessions and Happy Hour.", "/events/")
    weekly = "".join(f'''<article class="card reveal"><div class="card-media">{img(i, n, sizes="(max-width: 700px) 100vw, 20vw")}</div><div class="card-body"><span class="tag">{E(w)}</span><h3>{E(n)}</h3><p>{E(d)}</p></div></article>''' for n, w, d, i in WEEKLY)
    cal = "".join(f'<li><a href="/z-street/{s["slug"]}/"><b>{E(s["name"])}</b><span>{E(s["when"])}</span></a></li>' for s in SERIES)
    body = f'''
<section class="page-head"><div class="wrap"><span class="eyebrow">What's on</span><h1>Events at Z</h1>
<p class="lede">Z Hostel is home to Z Street, Poblacion's biggest street party, plus nightly sessions on the Roofdeck and special nights at Salakot. Here's what's coming up.</p></div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Coming up</span><h2>Halloween at Z</h2></div>
  {upcoming_cards()}
</div></section>
<section class="section alt"><div class="wrap split">
  <div><span class="eyebrow">Z Street calendar</span><h2>Four street parties a year.</h2><p class="lede">Every one of them on Don Pedro & Alfonso Streets, with Z Hostel as home base. A holiday street party is in the works.</p>
  <div class="btns" style="margin-top:20px"><a class="btn" href="/z-street/">The full Z Street story</a><a class="btn ghost" href="/z-street/#list">Get on the list</a></div></div>
  <ul class="press" style="list-style:none;padding:0;margin:0">{cal}</ul>
</div></section>
<section class="section"><div class="wrap">
  <div class="section-head"><span class="eyebrow">Every week at Z</span><h2>On the Roofdeck</h2></div>
  <div class="grid g3">{weekly}</div>
</div></section>
<section class="section tight"><div class="wrap"><div class="cta-band"><div><h2>Planning an event at Z?</h2><p>Launches, takeovers, group nights and brand activations.</p></div><div class="btns"><a class="btn lg" href="/contact/?type=events">Talk to the events team</a></div></div></div></section>'''
    lds = "".join(event_ld(u["name"], u["start_iso"], u["blurb"], (u["href"] if u["external"] else SITE["url"] + u["href"]),
                           SITE["url"] + "/assets/img/halloween-2018-crowd.webp",
                           end_iso=("2026-10-31T23:59:00+08:00" if u["slug"] == "tabi-tabi-po" else None),
                           location_name=u["where"]) for u in UPCOMING)
    write("/events/", h + header("/events/") + body + lds + footer())

def page_partner():
    h = head("Partner With Us · Z Street Sponsorship", "Put your brand on the street at Poblacion's biggest street party. Z Street sponsorship tiers and the sponsorship deck.", "/partner/")
    tiers = ["Platinum", "Gold", "Silver", "Bronze", "Standard"]
    tier_cards = "".join(f'<div class="tile reveal"><h3>{t}</h3><p class="muted">Package details in the deck.</p></div>' for t in tiers)
    pre = ""
    benefits = [
        ("On-ground visibility", "Entrance arches, stages, pop-up bars and brand ambassadors on the street."),
        ("Product lockout", "Your product poured at Z's Roofdeck and bars on the night."),
        ("Promotion", "Posters, radio and digital promotion across Z's channels."),
        ("Content", "Official event photos and video."),
    ]
    ben = "".join(f'<div class="tile reveal"><h3>{E(a)}</h3><p>{E(b)}</p></div>' for a, b in benefits)
    cats = ["Brand / sponsor", "Collaborator", "Influencer / creator", "Vendor", "Media", "Other"]
    evs = [(s["slug"], s["name"]) for s in SERIES]
    body = f'''
<section class="hero short">
  <div class="hero-bg">{img("summer-kick-off-2019-jameson", "A Jameson-branded stage at Z Street", eager=True, sizes="100vw")}</div>
  <div class="wrap hero-inner"><span class="eyebrow">Partner with us</span><h1>Put your brand on the street.</h1>
  <p class="lede">Poblacion's biggest street crowds, four times a year, on the street that put Poblacion on the map.</p>
  <div class="btns"><a class="btn lg" href="#deck">Request the sponsorship deck</a></div></div>
</section>
<section class="wrap" aria-label="Z Street in numbers">{stats_bar()}</section>
<section class="section"><div class="wrap">
  <div class="section-head"><span class="eyebrow">What you get</span><h2>Benefits</h2></div>
  <div class="grid g4">{ben}</div>
  <div class="split" style="margin-top:48px">
    <div><span class="eyebrow">The audience</span><h2>Young, local, and out every night.</h2>
    <p class="lede">Young Metro Manila locals out for the night, plus international travelers staying at the hostel.</p></div>
    <div>{img("rev-up-2018-cuervo", "A Jose Cuervo-branded bar packed with guests at Z Street")}</div>
  </div>
</div></section>
<section class="section alt"><div class="wrap">
  <div class="section-head"><span class="eyebrow">2026 tiers</span><h2>Five ways in.</h2><p class="lede">Every package is tailored to the event and your goals. Request the deck for inclusions and rates.</p>
  <p class="small">{confirm("tier list differs from ody-z.com (Platinum, Gold, Silver, Bronze, In-Kind) — align both sites", "")}</p></div>
  <div class="grid g4">{tier_cards}</div>
  <div style="margin-top:44px"><h3>Brands that have partnered with Z Street</h3>{words(BRANDS)}</div>
</div></section>
<section class="section" id="deck"><div class="wrap split" style="align-items:start">
  <div><span class="eyebrow">Let's team up</span><h2>Request the sponsorship deck.</h2>
  <p class="lede">Tell us who you are and what you're thinking. We'll send the deck and follow up directly with a package that fits.</p>
  <p class="muted">Prefer email? <a href="mailto:{SITE["email_mkt"]}">{SITE["email_mkt"]}</a></p>
  <blockquote class="quote" style="margin-top:30px">“The Z Team's experience of doing these street parties truly showed.”<cite>{confirm("brand name and permission to quote", "A Z Street sponsor")}</cite></blockquote></div>
  <form class="form form-card" data-form="partner" novalidate>
    <div class="row2">
      <div class="field"><label for="p-brand">Brand / company *</label><input id="p-brand" name="brand" type="text" required maxlength="120" autocomplete="organization"></div>
      <div class="field"><label for="p-name">Your name *</label><input id="p-name" name="full_name" type="text" required maxlength="120" autocomplete="name"></div>
    </div>
    <div class="row2">
      <div class="field"><label for="p-email">Email *</label><input id="p-email" name="email" type="email" required maxlength="200" autocomplete="email"></div>
      <div class="field"><label for="p-phone">Phone</label><input id="p-phone" name="phone" type="tel" maxlength="40" autocomplete="tel"></div>
    </div>
    <div class="field"><label for="p-web">Website / Instagram</label><input id="p-web" name="website" type="text" maxlength="200"></div>
    <div class="field"><span class="label" id="p-cat">What best describes you?</span><div class="chips" role="group" aria-labelledby="p-cat">{"".join(f'<label class="chip"><input type="checkbox" name="categories" value="{E(c)}"><span>{E(c)}</span></label>' for c in cats)}</div></div>
    <div class="field"><span class="label" id="p-ev">Which events?</span><div class="chips" role="group" aria-labelledby="p-ev">{"".join(f'<label class="chip"><input type="checkbox" name="events" value="{k}"><span>{E(n)}</span></label>' for k, n in evs)}</div></div>
    <div class="field"><label for="p-tier">Tier you're considering</label><select id="p-tier" name="tier"><option value="">Not sure yet / let's discuss</option>{"".join(f"<option>{t}</option>" for t in tiers)}<option>In-kind / product</option></select></div>
    <div class="field"><label for="p-msg">Tell us more</label><textarea id="p-msg" name="message" maxlength="4000"></textarea></div>
    <input class="hp" type="text" name="website_hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="check"><input type="checkbox" name="consent" required><span>I agree to the <a href="/privacy/">privacy notice</a>. *</span></label>
    <div class="btns"><button class="btn lg" type="submit">Send me the deck</button></div>
    <p class="form-msg" role="alert"></p>
  </form>
</div></section>
<script>(function(){{var e=new URLSearchParams(location.search).get("event");if(e){{var i=document.querySelector('input[name=events][value="'+e+'"]');if(i)i.checked=true;}}}})();</script>'''
    write("/partner/", h + header("/partner/") + body + footer())

def page_about():
    h = head("About Z", "The Z Hostel story: from Sunday Slowdown sessions at La Luz to Poblacion's home of Z Street. Our purpose, our PLUD partnership and our neighborhood.", "/about/")
    hood = ["Fook Yah (Hong Kong roast)", "Ebi 10 (Japanese tempura)", "Mahalo (vegan frozen yogurt & acai)", "Alamat (Filipino pub cuisine)", "Only Pans Taqueria (Mexican)", "Yalla Yalla (Lebanese)", "Wantusawa (oyster bar)", "Kampai (izakaya)", "OTO (cocktail bar, Asia's 100 Best Bars 2021)"]
    body = f'''
<section class="hero short">
  <div class="hero-bg">{img("crew", "The Z Hostel crew", eager=True, sizes="100vw")}</div>
  <div class="wrap hero-inner"><span class="eyebrow">About Z</span><h1>Bringing people together since 2015.</h1></div>
</section>
<section class="section"><div class="wrap split">
  <div class="reveal"><span class="eyebrow">The basics</span><h2>A new breed of hostel.</h2>
  <p class="lede">Z Hostel combines a higher standard of accommodation with a fun, social atmosphere. Every detail in each room was thought through for the guest. The Café gives you a taste of authentic Filipino cuisine, while the Roofdeck offers great entertainment nightly from local and international artists and DJs.</p>
  <p>The managing owners are a group of friends who took their time to conceptualize and build the hostel from an inspiration: their Sunday Slowdown sessions at a beach resort called La Luz. A certain vibe was born there from music, like-minded people, strangers becoming lifelong friends, and good conversation. That was the foundation of Z Hostel.</p>
  <p>The same foundation kept Z going through the pandemic. Z opened in 2015 at 5660 Don Pedro St., and is back in full swing, stronger than ever, with the same brand of good vibes and top-notch service.</p></div>
  <div class="reveal">{img("facade", "Z Hostel on Don Pedro Street, Poblacion")}</div>
</div></section>
<section class="section alt"><div class="wrap">
  <div class="section-head center"><span class="eyebrow">Our purpose</span>
  <p class="quote" style="font-size:clamp(26px,3.4vw,42px)">Z Street is a place of belonging for everyone. It keeps Poblacion's streets alive and safe so people can be themselves.</p></div>
</div></section>
<section class="section"><div class="wrap grid g3">
  <div class="tile reveal"><span class="eyebrow">2017</span><h3>Z Street begins</h3><p>Two years after opening, Z Hostel's founders closed Don Pedro and Alfonso Streets for the first Z Street block party. Since then: 25 parties and counting.</p></div>
  <div class="tile reveal"><span class="eyebrow">Partners</span><h3>Co-organized with PLUD</h3><p>Every Z Street is co-organized with Poblacion Land & Urban Development Corp. and fully permitted by the City of Makati and Barangay Poblacion. In 2023 the Makati Tourism Office formally endorsed the event calendar.</p></div>
  <div class="tile reveal"><span class="eyebrow">A first</span><h3>RFID payments</h3><p>Z introduced the first RFID payment system in a hostel in the Philippines: cashless tabs at the bar, faster service, no waiting for change. It later powered the cashless wristbands at Zombie Street 2019.</p></div>
</div></section>
<section class="section alt" id="hood"><div class="wrap split flip">
  <div class="reveal"><span class="eyebrow">Explore the hood</span><h2>Right in the center of a business and cultural district.</h2>
  <p class="lede">Dotted with hole-in-the-wall restaurants, quaint coffee shops and art spaces, Z Hostel's neighborhood is a throbbing heartbeat in the middle of a bustling city. Join our Sunset Sessions from 6 p.m. at the Roofdeck (one free cocktail for in-house guests), then get walking and sample local and international food all around.</p>
  <h3 style="margin-top:24px">Our Z Street neighbors</h3>
  <ul class="pill-list">{"".join(f"<li>{E(x)}</li>" for x in hood)}</ul>
  <p style="margin-top:20px"><a class="link-arrow" href="/assets/docs/directions-to-z.pdf">Directions to Z (PDF)</a></p></div>
  <div class="reveal">{img("lobby-map", "Guests at the Z Hostel lobby with a big map of Manila")}</div>
</div></section>
<section class="section tight"><div class="wrap"><div class="cta-band"><div><h2>Come say hi.</h2><p>Stay with us, drink with us, party on our street.</p></div><div class="btns">{stay_cta("Book now")}<a class="btn lg ghost" href="/contact/?type=careers">Join our Z Team</a></div></div></div></section>'''
    write("/about/", h + header("/about/") + body + footer())

def page_gallery():
    h = head("Gallery", "Photos from Z Street parties, the Roofdeck and Z Hostel: Halloween, Summer Kick Off, Rev Up, Repoblacion and more.", "/gallery/")
    groups = []
    for s in SERIES:
        ph = "".join(f'<a href="/assets/img/{p}.webp" data-lightbox data-caption="{E(s["photo_caption"])}">{img(p, s["photo_caption"], sizes="(max-width: 700px) 100vw, 25vw")}</a>' for p in s["photos"])
        slots = "".join(f'<figure class="ph"><div><b>{E(p)}</b>Photo slot</div></figure>' for p in s["placeholders"]) if SHOW_CONFIRM else ""
        groups.append(f'<section class="section tight"><div class="wrap"><div class="section-head" style="margin-bottom:18px"><h2 style="font-size:clamp(28px,3.4vw,44px)">{E(s.get("full", s["name"]))}</h2><p class="muted">{E(s["photo_caption"])} · <a href="/z-street/{s["slug"]}/">Event page</a></p></div><div class="mosaic">{ph}{slots}</div></div></section>')
    hostel = ["facade", "lobby", "room-4bed", "room-private", "roofdeck-day", "roofdeck-skyline", "cafe-breakfast", "rfid-bands"]
    hph = "".join(f'<a href="/assets/img/{p}.webp" data-lightbox data-caption="Z Hostel">{img(p, "Z Hostel", sizes="(max-width: 700px) 100vw, 25vw")}</a>' for p in hostel)
    body = f'''
<section class="page-head"><div class="wrap"><span class="eyebrow">Gallery</span><h1>Scenes from Z</h1>
<p class="lede">Photos and videos by event and year. For the latest, follow <a href="{SITE["instagram"]}" target="_blank" rel="noopener">@zhostelph</a> and watch on <a href="{SITE["youtube"]}" target="_blank" rel="noopener">YouTube</a>.</p>
<p class="small">{confirm("the ~150 pro photos from 2023–2025 go in the dashed photo slots (file names shown)", "")}</p></div></section>
{"".join(groups)}
<section class="section tight"><div class="wrap"><div class="section-head" style="margin-bottom:18px"><h2 style="font-size:clamp(28px,3.4vw,44px)">The hostel</h2></div><div class="mosaic">{hph}</div></div></section>'''
    write("/gallery/", h + header("/gallery/") + body + footer())

def page_contact():
    h = head("Contact & Getting There", "Contact Z Hostel: (632) 8856 0851 · (63) 917 889 8531 · 5660 Don Pedro St., Brgy. Poblacion, Makati City 1210. Room reservations, group bookings, events, careers.", "/contact/")
    opts = "".join(f'<option value="{k}">{E(v)}</option>' for k, v in INQUIRY_KINDS)
    body = f'''
<section class="page-head"><div class="wrap"><span class="eyebrow">Contact us</span><h1>Talk to Z.</h1></div></section>
<section class="section"><div class="wrap split" style="align-items:start">
  <div class="stack">
    <dl class="kv" style="font-size:17px">
      <dt>Call</dt><dd><a href="tel:{SITE["phone1_tel"]}">{SITE["phone1"]}</a> or <a href="tel:{SITE["phone2_tel"]}">{SITE["phone2"]}</a></dd>
      <dt>Visit</dt><dd><a href="{SITE["maps"]}" target="_blank" rel="noopener">{E(SITE["address"])}</a></dd>
      <dt>Reservations</dt><dd><a href="mailto:{SITE["email_res"]}">{SITE["email_res"]}</a></dd>
      <dt>Events & sponsors</dt><dd><a href="mailto:{SITE["email_mkt"]}">{SITE["email_mkt"]}</a></dd>
    </dl>
    <div class="btns" style="margin-top:22px">{stay_cta("Book a room")}<a class="btn ghost" href="/assets/docs/directions-to-z.pdf" target="_blank" rel="noopener">Getting there (PDF)</a></div>
    <iframe class="map" style="margin-top:26px" src="{SITE["maps_embed"]}" title="Map: Z Hostel, 5660 Don Pedro St., Poblacion, Makati" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
  </div>
  <form class="form form-card" data-form="inquiry" novalidate>
    <h2 style="font-size:clamp(28px,3.2vw,40px)">Send us a message</h2>
    <div class="field"><label for="c-kind">What's it about? *</label><select id="c-kind" name="kind" required>{opts}</select></div>
    <div class="row2">
      <div class="field"><label for="c-name">Full name *</label><input id="c-name" name="full_name" type="text" required maxlength="120" autocomplete="name"></div>
      <div class="field"><label for="c-email">Email *</label><input id="c-email" name="email" type="email" required maxlength="200" autocomplete="email"></div>
    </div>
    <div class="field"><label for="c-phone">Phone</label><input id="c-phone" name="phone" type="tel" maxlength="40" autocomplete="tel"></div>
    <div class="field"><label for="c-msg">Message *</label><textarea id="c-msg" name="message" required maxlength="4000" placeholder="Dates, group size, questions…"></textarea></div>
    <input class="hp" type="text" name="website_hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="check"><input type="checkbox" name="consent" required><span>I agree to the <a href="/privacy/">privacy notice</a>. *</span></label>
    <div class="btns"><button class="btn lg" type="submit">Send</button></div>
    <p class="form-msg" role="alert"></p>
    <p class="small muted">To book a bed instantly, use <a href="/book/">online booking</a>.</p>
  </form>
</div></section>'''
    write("/contact/", h + header("/contact/") + body + footer())

def page_privacy():
    h = head("Privacy Notice", "How Z Hostel handles the personal data you share on this website.", "/privacy/")
    body = f'''
<section class="page-head"><div class="wrap"><span class="eyebrow">Privacy</span><h1>Privacy notice</h1><p class="muted">Last updated October 15, 2026</p></div></section>
<section class="section"><div class="wrap" style="max-width:780px">
<p>{SITE["company"]} (Z Hostel), 5660 Don Pedro St., Brgy. Poblacion, Makati City, is the personal information controller for data collected on this website, in line with the Philippine Data Privacy Act of 2012 (RA 10173).</p>
<h3>What we collect</h3>
<p>Only what you type into our forms: your name, email, and optionally your phone number, company, and answers to optional event questions (for example how many friends you're bringing, how you like to pay, your age bracket). We also record which link brought you here (for example an Instagram story) so we know which channels work.</p>
<h3>Why</h3>
<p>To answer your inquiry, put you on an event list, plan events (bar, stages, staffing, safety), send you the sponsorship deck if you asked for it, and, only if you ticked the box, email you about future Z events and offers.</p>
<h3>Who sees it</h3>
<p>Z Hostel staff only. The data is stored with our database provider (Supabase) and is never sold. The public website cannot read it.</p>
<h3>How long</h3>
<p>Event and inquiry records are deleted after about 13 months unless you opted in to marketing emails. You can unsubscribe at any time.</p>
<h3>Your rights</h3>
<p>You can ask to see, correct or delete your data, or withdraw consent, by emailing <a href="mailto:{SITE["email_mkt"]}">{SITE["email_mkt"]}</a>.</p>
<p class="muted small">Tabi Tabi Po RSVPs follow the <a href="/events/tabi-tabi-po/privacy.html">Tabi Tabi Po privacy notice</a>. THE ODY-Z RSVPs follow the notice on ody-z.com.</p>
</div></section>'''
    write("/privacy/", h + header("/privacy/", ribbon=False) + body + footer())

def page_book():
    h = head("Book a Bed or Room", "Book Z Hostel direct: dorm beds and private rooms in Poblacion, Makati, right on the Z Street party street. Live availability, instant confirmation.", "/book/", og="/assets/img/room-guests.webp")
    countries = ["Philippines","Australia","Canada","China","France","Germany","Hong Kong","India","Indonesia","Israel","Italy","Japan","Malaysia","Netherlands","New Zealand","Singapore","South Korea","Spain","Sweden","Switzerland","Taiwan","Thailand","United Arab Emirates","United Kingdom","United States","Vietnam","Other"]
    copts = "".join(f"<option>{E(c)}</option>" for c in countries)
    body = f'''
<section class="page-head" style="padding-bottom:24px"><div class="wrap"><span class="eyebrow">Book direct · Z Hostel Poblacion</span><h1 style="font-size:clamp(40px,6vw,72px)">Book your stay</h1>
<p class="lede">Pick your dates, your bed or room, and any extras, and book instantly. {E(SITE_PAYMENT)}</p></div></section>
<section class="section tight"><div class="wrap book-wrap" id="book-engine">
  <div>
    <div class="book-step" id="st-dates">
      <div class="step-h"><span class="n">1</span><div><h2>Your dates</h2><p>{E(CHECKIN_TIMES)}</p></div></div>
      <div class="zdr zdr-lg"><input type="hidden" id="b-in" name="checkin"><input type="hidden" id="b-out" name="checkout"></div>
    </div>
    <div class="book-step" id="st-rooms">
      <div class="step-h"><span class="n">2</span><div><h2>Choose your beds or rooms</h2><p>Dorms are priced per bed, private rooms per room (sleeps 2). Prices shown are for your whole stay.</p></div></div>
      <div class="room-picks" id="b-rooms"><p class="muted">Pick your dates to see what's free.</p></div>
      <p class="small muted" style="margin-top:12px">{E(SOCIAL_FLOOR)}</p>
    </div>
    <div class="book-step" id="st-addons">
      <div class="step-h"><span class="n">3</span><div><h2>Add-ons</h2><p>Optional extras. Anything marked “at the desk” is priced and paid when you arrive.</p></div></div>
      <div class="addon-list" id="b-addons"></div>
    </div>
    <div class="book-step" id="st-guest">
      <div class="step-h"><span class="n">4</span><div><h2>Your details</h2><p>For the person checking in. We'll show your booking code on the next screen.</p></div></div>
      <form id="b-form" class="form" novalidate>
        <div class="row2">
          <div class="field"><label for="g-name">Full name *</label><input id="g-name" name="name" type="text" autocomplete="name" required maxlength="120"></div>
          <div class="field"><label for="g-email">Email *</label><input id="g-email" name="email" type="email" autocomplete="email" required maxlength="200"></div>
        </div>
        <div class="row2">
          <div class="field"><label for="g-phone">Mobile number *</label><input id="g-phone" name="phone" type="tel" autocomplete="tel" required maxlength="40" placeholder="+63 9xx xxx xxxx"></div>
          <div class="field"><label for="g-country">Country</label><select id="g-country" name="country"><option value="">Select…</option>{copts}</select></div>
        </div>
        <div class="row2">
          <div class="field"><label for="g-arrival">Estimated arrival time</label><select id="g-arrival" name="arrival"><option value="">Not sure yet</option><option>Before 2 PM (early)</option><option>2–6 PM</option><option>6–10 PM</option><option>After 10 PM</option></select></div>
          <div class="field"><label for="g-ref">Promo or referral code</label><input id="g-ref" name="ref" type="text" maxlength="40"></div>
        </div>
        <div class="field"><label for="g-notes">Anything we should know?</label><textarea id="g-notes" name="notes" maxlength="2000" placeholder="Flight number for pickup, group names, special requests…"></textarea></div>
        <input class="hp" type="text" name="website_hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="check"><input type="checkbox" name="consent" required><span>I agree to the booking terms below and the <a href="/privacy/">privacy notice</a>. *</span></label>
        <label class="check"><input type="checkbox" name="marketing"><span>Email me Z Street dates and Z Hostel offers.</span></label>
        <details class="table-view"><summary>Booking terms & cancellation policy</summary><div class="small muted" id="b-terms" style="margin-top:8px"></div></details>
      </form>
    </div>
    <div class="book-step" id="st-pay">
      <div class="step-h"><span class="n">5</span><div><h2>How would you like to pay?</h2><p>Pay ahead online and save 5%, or simply pay when you arrive.</p></div></div>
      <div class="pay-opts" id="b-pay" role="radiogroup" aria-label="Payment">
        <label class="pay-opt" data-pay="transfer"><input type="radio" name="pay" value="transfer"><span class="pay-body"><b>Pay ahead by bank / e-wallet transfer <span class="tag hot">5% off</span></b>
          <span class="small" id="b-pay-tnote">Transfer within 2 hours of booking and upload your screenshot. We hold your beds for you meanwhile.</span></span><span class="pay-amt" id="b-pay-tamt"></span></label>
        <label class="pay-opt" data-pay="desk"><input type="radio" name="pay" value="desk"><span class="pay-body"><b>Pay at check-in</b>
          <span class="small">Cash, card or GCash at the front desk. Booking confirmed straight away.</span></span><span class="pay-amt" id="b-pay-damt"></span></label>
      </div>
    </div>
  </div>
  <aside class="book-aside"><div class="summary-card">
    <h3>Your stay</h3>
    <div id="b-summary" aria-live="polite"><p class="muted">Pick your dates to start.</p></div>
    <p class="form-msg" id="b-msg" role="alert"></p>
    <button class="btn lg" id="b-go" type="button" disabled>Choose your dates</button>
    <ul class="trust"><li>Instant booking · 5% off when you pay ahead</li><li>Live availability, no double bookings</li><li>Right on Don Pedro St., Poblacion</li></ul>
    <p class="small muted" style="margin-top:12px">Already booked? <a href="/book/manage/">Find your booking</a></p>
  </div></aside>
</div>
<div class="wrap" id="b-done" hidden></div>
</section>
<div class="mbook" id="b-mobile" style="display:none"><div><b>Choose dates</b><span id="b-mtotal">Z Hostel Poblacion</span></div><button class="btn" type="button" disabled>Book</button></div>
<script>if(matchMedia("(max-width: 760px)").matches){{var m=document.getElementById("b-mobile");m.style.display="";document.body.classList.add("has-mbook");}}</script>'''
    write("/book/", h + header("/book/") + body + footer(mbook=False))

def page_manage():
    h = head("Find Your Booking", "Look up your Z Hostel booking with your booking code and email.", "/book/manage/")
    body = '''
<section class="page-head"><div class="wrap" style="max-width:720px"><span class="eyebrow">Your booking</span><h1>Find your booking</h1>
<p class="lede">Enter the booking code (like Z-1024) and the email you booked with.</p>
<form class="form form-card" id="m-form" style="margin-top:22px" novalidate>
  <div class="row2"><div class="field"><label for="m-code">Booking code</label><input id="m-code" type="text" required placeholder="Z-1024" autocapitalize="characters"></div>
  <div class="field"><label for="m-email">Email</label><input id="m-email" type="email" required></div></div>
  <div class="btns"><button class="btn" type="submit">Find booking</button></div><p class="form-msg" role="alert"></p>
</form>
<div id="m-out" style="margin-top:22px"></div>
<p class="small muted" style="margin-top:22px">Need to change or cancel? Contact the front desk: <a href="tel:+639178898531">(63) 917 889 8531</a> or <a href="/contact/?type=room">send us a message</a> with your booking code.</p>
</div></section>'''
    write("/book/manage/", h + header("/book/") + body + footer(mbook=False))

def page_pay():
    h = head("Upload Your Payment", "Upload the screenshot of your bank or e-wallet transfer for your Z Hostel booking.", "/pay/")
    body = f'''
<section class="page-head"><div class="wrap" style="max-width:760px"><span class="eyebrow">Pay ahead · 5% off</span><h1>Upload your payment</h1>
<p class="lede">Find your booking, transfer the amount shown, then upload a screenshot of the payment. We verify it and email your confirmation.</p>
<form class="form form-card" id="p-find" style="margin-top:22px" novalidate>
  <div class="pay-step"><span class="n">1</span><h2>Find your booking</h2></div>
  <div class="row2"><div class="field"><label for="p-code">Booking code</label><input id="p-code" type="text" required placeholder="Z-1042" autocapitalize="characters" autocomplete="off"></div>
  <div class="field"><label for="p-email">Email on the booking</label><input id="p-email" type="email" required autocomplete="email"></div></div>
  <div class="btns"><button class="btn" type="submit">Find my booking</button></div><p class="form-msg" role="alert"></p>
</form>
<div id="p-out" style="margin-top:22px"></div>
<p class="small muted" style="margin-top:22px">Trouble uploading? Send the screenshot with your booking code to <a href="mailto:ai@zhostel.com">ai@zhostel.com</a> or text <a href="tel:{SITE["phone2_tel"]}">{SITE["phone2"]}</a>.</p>
</div></section>'''
    write("/pay/", h + header("/book/") + body + footer(mbook=False))

def page_404():
    h = head("Page not found", "This page doesn't exist.", "/404.html")
    body = f'''<section class="page-head" style="min-height:60vh"><div class="wrap"><span class="eyebrow">404</span><h1>Wrong street.</h1>
<p class="lede">That page doesn't exist (or it moved when we rebuilt the site).</p>
<div class="btns" style="margin-top:20px"><a class="btn" href="/">Home</a><a class="btn ghost" href="/z-street/">Z Street</a><a class="btn ghost" href="/stay/">Rooms</a></div></div></section>'''
    write("/404.html", h + header("") + body + footer())

def sitemap():
    urls = [p for p in PAGES if p not in ("/404.html", "/pay/")] + ["/events/tabi-tabi-po/"]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + \
        "".join(f"  <url><loc>{SITE['url']}{u}</loc></url>\n" for u in urls) + "</urlset>\n"
    open(os.path.join(ROOT, "sitemap.xml"), "w").write(xml)
    open(os.path.join(ROOT, "robots.txt"), "w").write(f"User-agent: *\nDisallow: /admin/\nDisallow: /staff/\nDisallow: /pay/\nDisallow: /events/tabi-tabi-po/admin.html\nSitemap: {SITE['url']}/sitemap.xml\n")

if __name__ == "__main__":
    page_home(); page_stay(); page_eat(); page_zstreet()
    for s in SERIES: page_series(s)
    page_events(); page_book(); page_manage(); page_pay(); page_partner(); page_about(); page_gallery(); page_contact(); page_privacy(); page_404()
    sitemap()
    print("built", len(PAGES), "pages")
