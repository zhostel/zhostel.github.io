/* =========================================================
   TABI TABI PO — site settings
   This is the ONLY file you normally need to edit.
   ========================================================= */
window.TTP_CONFIG = {
  // Supabase project "Zhostel Salakot Halloween". Publishable key = safe to be public.
  // Never paste the service_role / sb_secret_ key here — this file is public.
  supabaseUrl: "https://bsgyfctspsecimphiljp.supabase.co",
  supabaseAnonKey: "sb_publishable_sT-eLp6uVY8DpLe6G0ilsQ_faDe_TS_",

  // Keeps this event's guest list separate if you reuse the site later.
  eventSlug: "tabi-tabi-po-2026",

  // Public URL of this site (used for share links and promoter links).
  siteUrl: "https://zhostel.github.io/events/tabi-tabi-po/",

  // Leave eventStartISO as null while the date is TBA.
  // When confirmed, e.g. "2026-10-31T21:00:00+08:00" — this turns on the countdown
  // and fills in dateLabel automatically if dateLabel is left as "Date TBA".
  eventStartISO: "2026-10-30T21:00:00+08:00",   // first night; drives the countdown
  eventDurationHours: 6,   // used for the "Add to calendar" end time
  dateLabel: "Oct 30 & 31",

  // Event nights. Guests pick one or both when they RSVP.
  // (The database has the same dates in tabi_event_nights(); change both together.)
  eventNights: [
    { date: "2026-10-30", label: "Fri, Oct 30", startISO: "2026-10-30T21:00:00+08:00" },
    { date: "2026-10-31", label: "Sat, Oct 31", startISO: "2026-10-31T21:00:00+08:00" }
  ],
  timeLabel: "9PM",

  djs: ["DJ Name", "DJ Name"],

  venue: "Salakot at Z Hostel",
  address: "5660 Don Pedro Street, Poblacion, Makati",
  mapsUrl: "https://maps.google.com/?q=Z+Hostel+5660+Don+Pedro+Street+Poblacion+Makati",

  contactEmail: "marketing@zhostel.com",
  instagram: "https://www.instagram.com/zhostelph/",
  facebook: "https://www.facebook.com/ZHostelph",
  website: "/",

  // "Staying the night?" button on the ticket and venue section.
  bookingUrl: "https://hotels.cloudbeds.com/reservation/oL7RdR",

  // Sponsor / partner logo strip. Empty [] hides it.
  // Logo files go in assets/sponsors/. Example:
  // { name: "Globe", logo: "assets/sponsors/globe.png", url: "https://www.globe.com.ph/" }
  sponsors: [],
  // Show the "Partner with us" sponsor inquiry form.
  sponsorInquiries: true,

  // Privacy notice details (shown on privacy.html)
  dataController: "Flash Packer Inc. (Z Hostel)",
  privacyEmail: "marketing@zhostel.com",
  retentionDays: 90,

  // Shown above the RSVP form. Leave empty [] to hide the block.
  // Example: { icon: "🏨", title: "₱100 off your next Z Hostel stay", text: "Valid until Dec 31, 2026." }
  perks: [],

  // Ask guests to confirm they are 18+ (Salakot is a bar).
  requireAdult: true
};
