# -*- coding: utf-8 -*-
"""Single source of truth for facts used across the site.
Figures come from the owner's brief (zhostel-website-brief.md). Do not invent numbers.
Set SHOW_CONFIRM = False before launch: open items then render as neutral text."""

SHOW_CONFIRM = True

SITE = {
    "name": "Z Hostel",
    "url": "https://zhostel.github.io",          # change to https://zhostel.com at launch
    "book": "https://hotels.cloudbeds.com/reservation/oL7RdR",
    "phone1": "(632) 8856 0851",
    "phone1_tel": "+63288560851",
    "phone2": "(63) 917 889 8531",
    "phone2_tel": "+639178898531",
    "address": "5660 Don Pedro St., Brgy. Poblacion, Makati City, Philippines 1210",
    "email_res": "zhostelreservations@gmail.com",
    "email_mkt": "marketing@zhostel.com",
    "facebook": "https://www.facebook.com/ZHostelph",
    "instagram": "https://www.instagram.com/zhostelph/",
    "youtube": "https://www.youtube.com/@zhostel7847",
    "maps": "https://maps.google.com/?q=Z+Hostel+5660+Don+Pedro+Street+Poblacion+Makati",
    "maps_embed": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3861.618786689355!2d121.02919401431974!3d14.563779281883624!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397c9aaf1f35e4f%3A0x7f6c432bba82e5b3!2sZ+Hostel!5e0!3m2!1sen!2sph!4v1553682211238",
    "odyz": "https://ody-z.com/",
    "company": "Flashpacker Inc.",
}

STATS = [
    ("Since 2017", "Throwing Z Street on the street we live on"),
    ("25", "Z Street parties and counting"),
    ("City-permitted", "Cleared with Makati City Hall and Barangay Poblacion"),
    ("Endorsed", "By the Makati Tourism Office"),
]

YEARS = ["2017", "2018", "2019", "2020–21", "2022", "2023", "2024", "2025", "2026"]

# None = no figure (show "—"), "paused" = pandemic, "confirm" = owner to supply
SERIES = [
    {
        "slug": "summer-kick-off",
        "name": "Summer Kick Off",
        "formerly": "Z Street St. Patrick's Day",
        "when": "Late March",
        "short": "The party that opens summer in Poblacion.",
        "copy": "Started in 2017 as Z Street's St. Patrick's Day block party, with green streets, Irish whiskey and live DJs. It's now the official summer kick-off.",
        "last_2026": "March 27, 2026",
        "next_iso": None,
        "next_label": "Back in 2027: date TBA",
        "confirm_next": "2027 date",
        "record": ("15,000", "2024"),
        "attendance": {"2017": 3914, "2018": 9286, "2019": 11982, "2020–21": "paused", "2022": 10805, "2023": None, "2024": 15000, "2025": 13000, "2026": "confirm"},
        "img": "summer-kick-off-2019-crowd",
        "photos": ["summer-kick-off-2019-street", "summer-kick-off-2019-crowd", "summer-kick-off-2019-aerial", "summer-kick-off-2019-jameson", "summer-kick-off-2019-friends", "summer-kick-off-2019-night"],
        "photo_caption": "Z Street St. Patrick's Day 2019",
        "placeholders": ["summer-kick-off-2024-arch.jpg", "summer-kick-off-2025-crowd.jpg", "summer-kick-off-2025-stage.jpg"],
        "themes": [("2017–2019", "Z Street St. Patrick's Day: green streets, Irish whiskey, live DJs"), ("2024–2026", "Rebranded as Summer Kick Off")],
        "month_num": 3,
    },
    {
        "slug": "rev-up",
        "name": "Rev Up",
        "full": "Rev Up: A Summer Street Party",
        "formerly": "Cinco de Mayo",
        "when": "May",
        "short": "Our mid-summer blowout.",
        "copy": "It began in 2017 as Cinco de Mayo on Z Street (tequila, tacos, and a street packed end to end) and has grown into one of the biggest nights of the year.",
        "last_2026": "May 16, 2026",
        "next_iso": None,
        "next_label": "Back in 2027: date TBA",
        "confirm_next": "2027 date",
        "record": ("20,000", "2024"),
        "attendance": {"2017": 4203, "2018": 12015, "2019": 18004, "2020–21": "paused", "2022": 13074, "2023": 14199, "2024": 20000, "2025": 17000, "2026": "confirm"},
        "img": "rev-up-2019-aerial",
        "photos": ["rev-up-2019-aerial", "rev-up-2018-street", "rev-up-2018-sombreros", "rev-up-2018-cuervo", "rev-up-2019-band", "rev-up-2019-parade"],
        "photo_caption": "Z Street Cinco de Mayo 2018–2019",
        "placeholders": ["rev-up-2024-street.jpg", "rev-up-2025-crowd.jpg", "rev-up-2025-stage.jpg"],
        "themes": [("2017–2019", "Cinco de Mayo on Z Street: tequila, tacos, mariachi and a packed street"), ("2024–2026", "Rev Up: A Summer Street Party")],
        "month_num": 5,
    },
    {
        "slug": "repoblacion",
        "name": "Repoblacion",
        "full": "Repoblacion: Independence Day Street Party",
        "formerly": None,
        "when": "June (around June 12)",
        "short": "Poblacion celebrates the Philippines.",
        "copy": "A patriotic street fiesta with a costume parade, a brass band, folk dance and OPM headliners. Past stages have hosted Rivermaya and Ebe Dancel.",
        "last_2026": "June 11, 2026",
        "next_iso": None,
        "next_label": "Back in 2027: date TBA",
        "confirm_next": "2027 date",
        "record": ("17,000", "2024"),
        "attendance": {"2017": 3055, "2018": 7073, "2019": 11295, "2020–21": "paused", "2022": None, "2023": None, "2024": 17000, "2025": 16000, "2026": "confirm"},
        "img": "repoblacion-2019-brass",
        "photos": ["repoblacion-2019-brass", "repoblacion-2019-folkdance", "repoblacion-2019-stage", "repoblacion-2019-crowd", "repoblacion-2019-street", "repoblacion-2019-band"],
        "photo_caption": "Repoblacion 2019",
        "placeholders": ["repoblacion-2024-parade-flag.jpg", "repoblacion-2025-stage.jpg", "repoblacion-2025-crowd.jpg"],
        "themes": [("Every year", "Costume parade, brass band, folk dance and OPM headliners")],
        "month_num": 6,
    },
    {
        "slug": "halloween",
        "name": "Z Street Halloween",
        "formerly": None,
        "when": "October 31",
        "short": "Manila's biggest Halloween street party, and our flagship.",
        "copy": "Costume contests, themed gates, multiple stages and three streets of venues.",
        "last_2026": None,
        "next_iso": "2026-11-20T18:00:00+08:00",
        "next_label": "Friday, November 20, 2026 · THE ODY-Z (moved from Oct 30)",
        "confirm_next": None,
        "record": ("25,000", "2024"),
        "attendance": {"2017": 3649, "2018": 15420, "2019": 24961, "2020–21": "paused", "2022": 14671, "2023": "15,000+", "2024": 25000, "2025": 22000, "2026": "expected:25000"},
        "img": "halloween-2018-crowd",
        "photos": ["halloween-2018-crowd", "halloween-2018-costumes", "halloween-2018-street", "halloween-2018-catrinas", "halloween-2018-heroes", "halloween-2018-banana"],
        "photo_caption": "Z Street Halloween 2018",
        "placeholders": ["halloween-2025-gate.jpg", "halloween-2024-crowd.jpg", "halloween-2023-sugar-skulls.jpg"],
        "themes": [],  # Halloween uses the HALLOWEEN timeline below
        "month_num": 10,
    },
    {
        "slug": "holiday",
        "name": "Holiday Bazaar & Christmas Street Party",
        "formerly": None,
        "when": "December · in the works",
        "short": "Something new for December.",
        "copy": "We're planning a holiday market and a Christmas street party to close out the year on Z Street. Nothing's set yet: join the list and you'll be first to hear when it's on.",
        "last_2026": None,
        "next_iso": None,
        "next_label": "Coming soon · dates to be announced",
        "confirm_next": None,
        "record": None,
        "attendance": {},
        "img": "nye-2019-crowd",
        "photos": ["nye-2019-crowd", "nye-2019-party", "nye-2018-roof"],
        "photo_caption": "Year-end at Z (New Year's Eve 2018–2019)",
        "placeholders": [],
        "themes": [],
        "future": True,
        "month_num": 12,
    },
]

HALLOWEEN = [
    ("2017", "Z Street Halloween begins", "The first Halloween takeover of Don Pedro.", "", ""),
    ("2018", "The word gets out", "The crowd grows fast, and Halloween becomes the night Poblacion plans its year around.", "", ""),
    ("2019", "Zombie Street at Poblacion", "Venues along Don Pedro included Z Hostel Roofdeck, The Apartment, The Ruins and The Green Door. A cashless RFID wristband system ran across the participating bars. Covered by Primer and The Scoop.", "", ""),
    ("2020–21", "Paused for the pandemic", "Z kept the music going online with the Z Hostel Lockdown Sessions: live DJ and acoustic sets streamed from the Roofdeck.", "", "paused"),
    ("2022", "Ready Poblacion One", "The comeback: a video-game-themed party powered by Budweiser, with two stages and twelve DJs. Covered by Manila Bulletin, VillagePipol and MNL Concert Scene.", "", ""),
    ("2023", "Haunted Hallow Bash", "A Day-of-the-Dead theme with sugar-skull streets, and no major medical incidents.", "", ""),
    ("2024", "Red Nights Halloween / Halloween Invasion", "Our biggest crowd yet. Traveloka listed it as one of the biggest Halloween parties in Makati.", "", ""),
    ("2025", "Halloween Shadow Realm", "A Poblacion street party with a gothic red-curtain gate across Don Pedro, Alfonso and Fermina Streets. Billed by When In Manila as Manila's biggest Halloween street party.", "", ""),
    ("2026", "THE ODY-Z", "A Poblacion homecoming street party, moved to Friday, November 20.", "Nov 20", "next"),
]

PRESS = [
    ("Manila Bulletin", "Budweiser-powered Manila's biggest Halloween street party, after two years", "https://mb.com.ph/2022/11/6/budweiser-powered-manilas-biggest-halloween-street-party-after-two-years"),
    ("When In Manila", "Z Hostel brings back Manila's biggest Halloween street party: Halloween Shadow Realm", "https://www.wheninmanila.com/z-hostel-brings-back-manila-biggest-halloween-street-party-halloween-shadow-realm/"),
    ("Primer", "Zombie Street at Poblacion is the Halloween party you should not miss", "https://primer.com.ph/event/2019/10/18/zombie-street-at-poblacion-is-the-halloween-party-you-should-not-miss/"),
    ("The Scoop", "What went down at this year's Z Street in Poblacion", "https://thescoop.asia/2019/11/07/what-went-down-at-this-years-z-street-in-poblacion/"),
    ("VillagePipol", "Manila's biggest Halloween street party is back with Budweiser", "https://villagepipol.com/manilas-biggest-halloween-street-party-is-back-with-budweiser/"),
    ("MNL Concert Scene", "Budweiser-powered Manila's biggest Halloween street party after 2 years", "https://mnlconcertscene.com/2022/11/09/budweiser-powered-manilas-biggest-halloween-street-party-after-2-years/"),
    ("Traveloka", "Halloween parties in Makati", "https://www.traveloka.com/en-ph/explore/activities/halloween-parties-in-makati-ta/442508"),
]
PRESS_ALSO = ["GMA Network", "ABS-CBN", "Tripzilla", "Magic 89.9 (media partner)"]

BRANDS = ["Budweiser", "Heineken", "San Miguel / San Mig Light", "Ginebra San Miguel", "Jameson", "Absolut", "Johnnie Walker", "Jose Cuervo", "Olmeca", "1834 Gin", "Red Bull", "Pepsi", "Converge", "Del Monte", "Magic 89.9", "When In Manila", "Angkas"]
ARTISTS = ["Rivermaya", "Ebe Dancel", "Jess Connelly", "Jason Dhakal", "Mayonnaise", "Marina Summers", "Nix Damn P!", "DJ Cupcakes", "Butta B", "Francz Glee", "Matthiaos"]
VENUES = ["Kampai", "The Apartment", "The Green Door", "The Ruins", "Ebi 10", "Japonesa", "Alamat", "Buccaneers", "Only Pans", "Mahalo", "Spirits Library", "Keepers", "El Chupacabra", "Nolita Joe's", "Catch 22", "Sulok"]

WEEKLY = [
    ("Roofdeck Sunset Sessions", "Daily from 6 p.m.", "Watch the sun go down over the Makati skyline. One free cocktail for every in-house guest.", "act-sunset"),
    ("Happy Hour", "Mon–Thu, 5–8 p.m.", "Cold beers, fresh cocktails and munchies at the Roofdeck bar.", "roofdeck-tap"),
    ("Weekend rooftop parties", "Fri & Sat nights", "Weekdays are packed; weekends the Roofdeck turns into a party with local and international DJs.", "roofdeck-crowd"),
    ("Live acoustic nights", "On the Roofdeck", "Local artists, unplugged, with the city lights behind them.", "roofdeck-acoustic"),
    ("New Year's Eve at Z Hostel", "Every December 31", "Our own-brand year-end party on the Roofdeck.", "nye-2018-roof"),
]

ROOMS = [
    # (name, image, sleeps, kind, description, ticks)  - names match the Cloudbeds room types
    ("Private Room", "room-private", "Sleeps 2", "Private",
     "On the highest floors, a few steps from the Roofdeck: queen-size bed with two pillows and duvet, en-suite bathroom and two bathrobes. Fully air-conditioned. Heads-up: the music might just get you in the groove, so this isn't the room for an early night.",
     ["Queen bed, en-suite bathroom", "Bathrobes, towels, air-conditioning", "Hairdryer, flat iron and board on request"]),
    ("Private Bunk Bed Room", "room-private-bunk", "Sleeps 2", "Private",
     "Privacy and personal space in one: a whole room for you and your buddy, with one bunk bed so you still get your own down time. Each bed has a quality mattress, a reading light and a power plug, plus an en-suite bathroom.",
     ["1 bunk bed, en-suite bathroom", "Also on the Social Fun Floor, right below the Roofdeck", "Towels and bathrobes"]),
    ("4-Bed Mixed Dorm", "room-4bed", "4 beds", "Dorm",
     "Stylish 4-bed dorms. Perfect for those who want a good mix of privacy and sociability.",
     ["Wide customized bunks with their own socket and reading lamp", "Big lockers with their own socket", "Also on the Social Fun Floor"]),
    ("6-Bed Mixed Dorm", "room-6bed", "6 beds", "Dorm",
     "Just the right number of people to turn your stay into a fun experience.",
     ["Built-in sink in the room for a quick fix-up", "Towel rack and hooks for every bed", "Also on the Social Fun Floor"]),
    ("8-Bed Mixed Dorm", "room-8bed", "8 beds", "Dorm",
     "Up for a party and designed for interaction without compromising comfort. Near the elevators for easy access to the Roofdeck or the lobby.",
     ["Built-in sink in the room", "Steps from the elevator to the Roofdeck", "Big lockers with their own socket"]),
    ("6-Bed Female Dorm", "room-female", "6 beds", "Dorm",
     "Our “Stiletto” room: every woman traveller's ideal home on the road, with a dresser to lounge around, a vanity mirror to get ready for a night out, and bigger-than-usual lockers. Perfect for a group of friends travelling together.",
     ["Women only", "Dresser and vanity mirror", "Hairdryer, flat iron and board on request"]),
]

SOCIAL_FLOOR = "Social Fun Floor rooms sit right below the Roofdeck bar, where something's on almost every night. The bar runs until 3 a.m., so you'll hear the music and the chatter. All good if you're here for the fun."

AMENITIES = ["Free Wi-Fi", "Sanitation kit & toiletries", "Clothing", "Lockers", "24-hour front desk", "Luggage storage", "Hot & cold shower", "Working space", "Temperature check", "24-hour security & CCTV", "PC at the lobby", "Concierge"]

INQUIRY_KINDS = [("room", "Room reservation"), ("group", "Group bookings"), ("events", "Events & marketing / sponsorship"), ("tours", "Tours / activities"), ("careers", "Join our Z Team (hiring)"), ("volunteer", "Volunteer at Z"), ("other", "Other inquiries")]

UPCOMING = [
    {
        "slug": "tabi-tabi-po",
        "name": "Tabi Tabi Po",
        "kicker": "Salakot opening night · Halloween",
        "date_label": "Fri & Sat, Oct 30–31, 2026 · 9PM",
        "start_iso": "2026-10-30T21:00:00+08:00",
        "where": "Salakot at Z Hostel, 5660 Don Pedro St.",
        "blurb": "A night with the spirits of Philippine folklore. DJ sets all night, drinks at the bar, and best in costume for whoever brings the best myth from home.",
        "img_local": "/events/tabi-tabi-po/assets/myths/whitelady-720.webp",
        "href": "/events/tabi-tabi-po/",
        "cta": "RSVP for your QR ticket",
        "external": False,
    },
    {
        "slug": "odyz",
        "name": "THE ODY-Z",
        "kicker": "Z Street 2026 · New date",
        "date_label": "Fri, Nov 20, 2026 (moved from Oct 30)",
        "start_iso": "2026-11-20T18:00:00+08:00",
        "where": "Don Pedro & Alfonso Streets, Poblacion",
        "blurb": "It comes home on November 20. A Poblacion homecoming street party across the whole block: Z Hostel, the Vine Building and the street in between. Costumes encouraged. 18+.",
        "img_ext": "https://ody-z.com/assets/hero-wide.jpg",
        "img": "halloween-2018-crowd",
        "href": "https://ody-z.com/",
        "cta": "See more at ody-z.com",
        "external": True,
    }
]


# Indicative "from" rates per night, read off the Cloudbeds booking engine on Oct 16, 2026.
# Final rates always come from Cloudbeds at checkout. Update or set to None to hide.
ROOM_FROM = {
    "Private Room": 2400, "Private Bunk Bed Room": 2100, "4-Bed Mixed Dorm": 810,
    "6-Bed Mixed Dorm": 780, "8-Bed Mixed Dorm": 750, "6-Bed Female Dorm": 780,
}
CHECKIN_TIMES = "Check-in from 2:00 PM · check-out by 11:00 AM"
SHOW_CHECKIN_TIMES = True

# room card on the marketing pages -> room type slug in the booking database
ROOM_SLUG = {"Private Room": "private", "Private Bunk Bed Room": "private-bunk", "4-Bed Mixed Dorm": "dorm-4",
             "6-Bed Mixed Dorm": "dorm-6", "8-Bed Mixed Dorm": "dorm-8", "6-Bed Female Dorm": "dorm-6f"}

SITE_PAYMENT = "Pay at check-in: cash, card or GCash."
