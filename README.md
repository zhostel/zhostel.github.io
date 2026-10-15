# zhostel.com — Z Hostel website

Static site (HTML/CSS/JS) on GitHub Pages + Supabase (project **zhostel-website**, ref `zazmufcnqevovuzzgisy`, org **Z Hostel**, account ai@zhostel.com).

## Structure
```
_build/data.py        Facts: stats, attendance, events, rooms, press, brands  ← edit facts here
_build/build.py       Page templates. Run:  python3 _build/build.py
index.html, stay/, eat-drink/, z-street/ (+5 event pages), events/, partner/, about/, gallery/, contact/, privacy/
events/tabi-tabi-po/  Tabi Tabi Po (Salakot opening night) — housed event, own RSVP + door admin
admin/                Staff dashboard (Supabase magic-link login)
assets/               css, js (config.js holds the publishable key), img (WebP), docs (menu + directions PDFs)
supabase/migrations/  Database schema
```
Generated pages are committed. After editing `_build/*`, run the build and commit.

## Open items
`SHOW_CONFIRM = True` in `_build/data.py` shows yellow "To confirm" chips wherever the owner still has to supply a fact.
Set it to `False` before launch: they turn into neutral text.

## Data
| Form | Table | Who can read |
|---|---|---|
| Contact | `inquiries` | staff |
| Partner / sponsorship deck | `partner_requests` | staff |
| Z Street list + survey (all Z Street pages) | `zstreet_signups` | staff |

Visitors write only through validated database functions (`submit_inquiry`, `submit_partner_request`, `zstreet_join`, `zstreet_answer`).
Staff = emails in the `staff` table (owner: ai@zhostel.com). Sign in at `/admin/`.

Tabi Tabi Po RSVPs still live in the earlier Supabase project (`bsgyfctspsecimphiljp`) until after Oct 31, 2026, so issued QR tickets and the door scanner keep working. THE ODY-Z stays on ody-z.com.

## Going live on zhostel.com
1. Settings → Pages → Custom domain: `zhostel.com`, then point DNS (A records to GitHub Pages, `www` CNAME to `zhostel.github.io`).
2. In `_build/data.py` set `SITE["url"] = "https://zhostel.com"`, `SHOW_CONFIRM = False`; rebuild.
3. In Supabase → Auth → URL configuration, add `https://zhostel.com/admin/` as a redirect URL.
4. In `events/tabi-tabi-po/config.js` update `siteUrl`.
