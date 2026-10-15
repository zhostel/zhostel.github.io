-- =====================================================================
-- Z Hostel direct booking engine (self-managed, instant, no quotation)
-- Inventory model: each room type has a WEBSITE ALLOTMENT = how many beds
-- (dorms) or rooms (privates) the website may sell per night. Staff can
-- change it per date (close out / open up) from the dashboard calendar, so
-- the website pool never collides with what Cloudbeds sells to OTAs.
-- =====================================================================

create table if not exists public.room_types (
  slug          text primary key,
  name          text not null,
  kind          text not null check (kind in ('dorm','private')),
  social_floor  boolean not null default false,
  women_only    boolean not null default false,
  guests_per_unit int not null default 1,          -- dorm bed = 1, private room = 2
  web_allotment int not null default 0,            -- default units the website can sell per night
  description   text,
  features      text[] not null default '{}',
  image         text,
  sort          int not null default 100,
  active        boolean not null default true
);

create table if not exists public.rate_plans (
  id            text primary key,                  -- e.g. dorm-4:bed_only
  room_type     text not null references public.room_types(slug) on delete cascade,
  code          text not null,                     -- bed_only | breakfast | standard
  name          text not null,
  includes_breakfast boolean not null default false,
  price         numeric(10,2) not null check (price >= 0),  -- per unit per night, PHP
  sort          int not null default 100,
  active        boolean not null default true,
  unique (room_type, code)
);

-- special prices for specific nights (party weekends, holidays)
create table if not exists public.rate_overrides (
  rate_plan  text not null references public.rate_plans(id) on delete cascade,
  night      date not null,
  price      numeric(10,2) not null check (price >= 0),
  primary key (rate_plan, night)
);

-- per-night allotment changes (0 = closed out)
create table if not exists public.allotment_overrides (
  room_type  text not null references public.room_types(slug) on delete cascade,
  night      date not null,
  units      int not null check (units >= 0),
  note       text,
  primary key (room_type, night)
);

create table if not exists public.addons (
  slug        text primary key,
  name        text not null,
  description text,
  price       numeric(10,2),                      -- null = priced at the front desk
  unit        text not null default 'per_booking' check (unit in ('per_booking','per_night','per_guest','per_guest_night','per_item')),
  max_qty     int not null default 1,
  sort        int not null default 100,
  active      boolean not null default true
);

create table if not exists public.booking_settings (
  id                  int primary key default 1 check (id = 1),
  max_nights          int not null default 30,
  max_units_per_type  int not null default 12,
  checkin_time        text not null default '2:00 PM',
  checkout_time       text not null default '11:00 AM',
  payment_note        text not null default 'Pay at check-in: cash, card or GCash.',
  cancellation_policy text not null default 'Cancellation policy: 3 days before arrival – 50% of total room charge for the entire stay; less than 3 days – 100% of total room charge for the entire stay; no-show – full charge.',
  open                boolean not null default true
);
insert into public.booking_settings (id) values (1) on conflict do nothing;

create sequence if not exists public.booking_code_seq start 1001;

create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null default ('Z-' || nextval('public.booking_code_seq')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  status        text not null default 'confirmed' check (status in ('confirmed','checked_in','checked_out','cancelled','no_show')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid','refunded')),
  amount_paid   numeric(10,2) not null default 0,
  source        text not null default 'website',   -- website | walk-in | phone | messenger | email | ota | other
  checkin       date not null,
  checkout      date not null,
  nights        int generated always as (checkout - checkin) stored,
  guests        int not null default 1,
  guest_name    text not null,
  guest_email   citext,
  guest_phone   text,
  country       text,
  arrival_time  text,
  notes         text,
  staff_notes   text,
  rooms_total   numeric(10,2) not null default 0,
  addons_total  numeric(10,2) not null default 0,
  total         numeric(10,2) not null default 0,
  consent_at    timestamptz,
  marketing_opt_in boolean not null default false,
  ref           text,
  check (checkout > checkin)
);
create index if not exists bookings_dates_idx on public.bookings (checkin, checkout);

create table if not exists public.booking_items (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  room_type   text not null references public.room_types(slug),
  rate_plan   text not null references public.rate_plans(id),
  units       int not null check (units > 0),
  amount      numeric(10,2) not null default 0
);

-- one row per item per night: what the availability check counts
create table if not exists public.booking_nights (
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  room_type   text not null references public.room_types(slug),
  night       date not null,
  units       int not null check (units > 0)
);
create index if not exists booking_nights_idx on public.booking_nights (room_type, night);

create table if not exists public.booking_addons (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  addon       text not null references public.addons(slug),
  name        text not null,
  qty         int not null default 1,
  amount      numeric(10,2)                       -- null = priced at the desk
);

create table if not exists public.booking_log (
  id          bigint generated always as identity primary key,
  booking_id  uuid references public.bookings(id) on delete cascade,
  at          timestamptz not null default now(),
  actor       text,
  action      text not null,
  detail      jsonb
);

alter table public.room_types enable row level security;
alter table public.rate_plans enable row level security;
alter table public.rate_overrides enable row level security;
alter table public.allotment_overrides enable row level security;
alter table public.addons enable row level security;
alter table public.booking_settings enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.booking_nights enable row level security;
alter table public.booking_addons enable row level security;
alter table public.booking_log enable row level security;

grant execute on function public.is_staff() to anon;
-- public catalogue (no personal data)
grant select on public.room_types, public.rate_plans, public.addons, public.booking_settings to anon, authenticated;
drop policy if exists public_read on public.room_types;   create policy public_read on public.room_types   for select to anon, authenticated using (active or public.is_staff());
drop policy if exists public_read on public.rate_plans;   create policy public_read on public.rate_plans   for select to anon, authenticated using (active or public.is_staff());
drop policy if exists public_read on public.addons;       create policy public_read on public.addons       for select to anon, authenticated using (active or public.is_staff());
drop policy if exists public_read on public.booking_settings; create policy public_read on public.booking_settings for select to anon, authenticated using (true);

-- staff full access
grant select, insert, update, delete on public.room_types, public.rate_plans, public.rate_overrides, public.allotment_overrides,
  public.addons, public.bookings, public.booking_items, public.booking_nights, public.booking_addons, public.booking_log to authenticated;
grant update on public.booking_settings to authenticated;
do $$ declare t text; begin
  foreach t in array array['room_types','rate_plans','rate_overrides','allotment_overrides','addons','bookings','booking_items','booking_nights','booking_addons','booking_log'] loop
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;
drop policy if exists staff_update on public.booking_settings;
create policy staff_update on public.booking_settings for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------- helpers ----------
create or replace function public.allotment_for(p_room_type text, p_night date)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select units from allotment_overrides where room_type = p_room_type and night = p_night),
                  (select web_allotment from room_types where slug = p_room_type), 0);
$$;

create or replace function public.sold_for(p_room_type text, p_night date)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(n.units), 0)::int from booking_nights n join bookings b on b.id = n.booking_id
   where n.room_type = p_room_type and n.night = p_night and b.status in ('confirmed','checked_in');
$$;

create or replace function public.price_for(p_rate_plan text, p_night date)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select price from rate_overrides where rate_plan = p_rate_plan and night = p_night),
                  (select price from rate_plans where id = p_rate_plan));
$$;

-- Availability + nightly totals for a stay. Public, no personal data.
create or replace function public.booking_availability(p_checkin date, p_checkout date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb := '[]'::jsonb; r record; v_min int; v_nights int := p_checkout - p_checkin;
begin
  if p_checkin is null or p_checkout is null or v_nights < 1 or v_nights > 30 or p_checkin < (now() at time zone 'Asia/Manila')::date then
    return jsonb_build_object('ok', false, 'error', 'Pick valid dates (up to 30 nights).');
  end if;
  for r in select * from room_types where active order by sort loop
    select min(allotment_for(r.slug, d::date) - sold_for(r.slug, d::date)) into v_min
      from generate_series(p_checkin, p_checkout - 1, interval '1 day') d;
    v_out := v_out || jsonb_build_object('room_type', r.slug, 'available', greatest(coalesce(v_min,0),0),
      'plans', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'breakfast', p.includes_breakfast,
                  'stay_total', (select sum(price_for(p.id, d::date)) from generate_series(p_checkin, p_checkout - 1, interval '1 day') d)) order by p.sort), '[]'::jsonb)
                from rate_plans p where p.room_type = r.slug and p.active));
  end loop;
  return jsonb_build_object('ok', (select open from booking_settings where id = 1), 'nights', v_nights, 'room_types', v_out);
end $$;
grant execute on function public.booking_availability(date, date) to anon, authenticated;

-- Create a booking. Used by the website (instant confirmation) and by staff.
-- p_items: [{"rate_plan":"dorm-4:bed_only","units":2}], p_addons: [{"slug":"late-checkout","qty":1}]
create or replace function public.create_booking(
  p_checkin date, p_checkout date, p_items jsonb, p_addons jsonb,
  p_guest_name text, p_guest_email text, p_guest_phone text, p_country text,
  p_arrival_time text, p_notes text, p_consent boolean, p_marketing boolean default false,
  p_ref text default null, p_source text default 'website', p_override boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff boolean := public.is_staff();
  v_email citext;
  v_nights int := p_checkout - p_checkin;
  v_b bookings; it jsonb; ad jsonb; v_plan rate_plans; v_rt room_types; v_units int; v_amt numeric; v_rooms numeric := 0; v_add numeric := 0;
  v_guests int := 0; v_a addons; v_qty int; v_aamt numeric; v_free int; d date; v_set booking_settings;
begin
  select * into v_set from booking_settings where id = 1;
  if not v_staff then
    if not v_set.open then raise exception 'Online booking is paused. Please contact us.' using errcode='22023'; end if;
    if not coalesce(p_consent,false) then raise exception 'Please agree to the booking terms and privacy notice' using errcode='22023'; end if;
    if p_checkin < (now() at time zone 'Asia/Manila')::date then raise exception 'Check-in date is in the past' using errcode='22023'; end if;
    v_email := _clean_email(p_guest_email);
    if coalesce(btrim(p_guest_phone),'') = '' then raise exception 'Mobile number is required' using errcode='22023'; end if;
    perform _throttle('booking', v_email);
  else
    v_email := nullif(lower(btrim(coalesce(p_guest_email,''))),'')::citext;
  end if;
  if coalesce(btrim(p_guest_name),'') = '' then raise exception 'Guest name is required' using errcode='22023'; end if;
  if v_nights < 1 or v_nights > v_set.max_nights then raise exception 'Stays are 1 to % nights', v_set.max_nights using errcode='22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Choose at least one bed or room' using errcode='22023'; end if;

  -- one booking at a time: makes overselling impossible
  perform pg_advisory_xact_lock(hashtext('zhostel-booking'));

  insert into bookings (checkin, checkout, guest_name, guest_email, guest_phone, country, arrival_time, notes,
                        consent_at, marketing_opt_in, ref, source)
  values (p_checkin, p_checkout, left(btrim(p_guest_name),120), v_email, left(nullif(btrim(p_guest_phone),''),40),
          left(nullif(btrim(p_country),''),60), left(nullif(btrim(p_arrival_time),''),40), left(nullif(btrim(p_notes),''),2000),
          case when p_consent then now() end, coalesce(p_marketing,false), _clean_src(p_ref),
          case when v_staff then coalesce(nullif(p_source,''),'walk-in') else 'website' end)
  returning * into v_b;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_plan from rate_plans where id = it->>'rate_plan' and (active or v_staff);
    if not found then raise exception 'That rate is no longer available' using errcode='22023'; end if;
    select * into v_rt from room_types where slug = v_plan.room_type;
    v_units := (it->>'units')::int;
    if v_units is null or v_units < 1 or v_units > v_set.max_units_per_type then raise exception 'Invalid quantity for %', v_rt.name using errcode='22023'; end if;
    if not (v_staff and coalesce(p_override,false)) then
      for d in select g::date from generate_series(p_checkin, p_checkout - 1, interval '1 day') g loop
        v_free := allotment_for(v_rt.slug, d) - sold_for(v_rt.slug, d);
        if v_free < v_units then
          raise exception 'Sorry, only % % left in % on %', greatest(v_free,0), case when v_rt.kind='dorm' then 'bed(s)' else 'room(s)' end, v_rt.name, to_char(d,'Mon DD') using errcode='22023';
        end if;
      end loop;
    end if;
    select sum(price_for(v_plan.id, g::date)) * v_units into v_amt from generate_series(p_checkin, p_checkout - 1, interval '1 day') g;
    insert into booking_items (booking_id, room_type, rate_plan, units, amount) values (v_b.id, v_rt.slug, v_plan.id, v_units, v_amt);
    insert into booking_nights (booking_id, room_type, night, units)
      select v_b.id, v_rt.slug, g::date, v_units from generate_series(p_checkin, p_checkout - 1, interval '1 day') g;
    v_rooms := v_rooms + v_amt;
    v_guests := v_guests + v_units * v_rt.guests_per_unit;
  end loop;

  if jsonb_typeof(p_addons) = 'array' then
    for ad in select * from jsonb_array_elements(p_addons) loop
      select * into v_a from addons where slug = ad->>'slug' and (active or v_staff);
      if not found then continue; end if;
      v_qty := least(greatest(coalesce((ad->>'qty')::int,1),1), v_a.max_qty);
      v_aamt := case when v_a.price is null then null else v_a.price * v_qty *
        case v_a.unit when 'per_night' then v_nights when 'per_guest' then v_guests when 'per_guest_night' then v_guests * v_nights else 1 end end;
      insert into booking_addons (booking_id, addon, name, qty, amount) values (v_b.id, v_a.slug, v_a.name, v_qty, v_aamt);
      v_add := v_add + coalesce(v_aamt,0);
    end loop;
  end if;

  update bookings set guests = greatest(v_guests,1), rooms_total = v_rooms, addons_total = v_add, total = v_rooms + v_add
   where id = v_b.id returning * into v_b;
  insert into booking_log (booking_id, actor, action, detail)
    values (v_b.id, coalesce(auth.jwt()->>'email','website'), 'created', jsonb_build_object('total', v_b.total, 'source', v_b.source));

  return jsonb_build_object('ok', true, 'code', v_b.code, 'id', v_b.id, 'total', v_b.total, 'rooms_total', v_rooms,
                            'addons_total', v_add, 'nights', v_nights, 'guests', v_b.guests,
                            'checkin_time', v_set.checkin_time, 'checkout_time', v_set.checkout_time, 'payment_note', v_set.payment_note);
end $$;
revoke all on function public.create_booking(date,date,jsonb,jsonb,text,text,text,text,text,text,boolean,boolean,text,text,boolean) from public;
grant execute on function public.create_booking(date,date,jsonb,jsonb,text,text,text,text,text,text,boolean,boolean,text,text,boolean) to anon, authenticated;

-- Guest looks up their own booking with code + email
create or replace function public.my_booking(p_code text, p_email text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_b bookings;
begin
  select * into v_b from bookings where code = upper(btrim(p_code)) and guest_email = lower(btrim(p_email))::citext;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'code', v_b.code, 'status', v_b.status, 'payment_status', v_b.payment_status,
    'checkin', v_b.checkin, 'checkout', v_b.checkout, 'nights', v_b.nights, 'guests', v_b.guests, 'guest_name', v_b.guest_name,
    'total', v_b.total, 'amount_paid', v_b.amount_paid,
    'items', (select jsonb_agg(jsonb_build_object('room', rt.name, 'plan', rp.name, 'units', i.units, 'unit', case when rt.kind='dorm' then 'bed' else 'room' end, 'amount', i.amount))
              from booking_items i join room_types rt on rt.slug = i.room_type join rate_plans rp on rp.id = i.rate_plan where i.booking_id = v_b.id),
    'addons', (select jsonb_agg(jsonb_build_object('name', a.name, 'qty', a.qty, 'amount', a.amount)) from booking_addons a where a.booking_id = v_b.id));
end $$;
grant execute on function public.my_booking(text, text) to anon, authenticated;

-- Staff: cancel/restore releases or re-takes inventory automatically (nights only count confirmed/checked_in)
create or replace function public.touch_booking() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and (new.status is distinct from old.status or new.payment_status is distinct from old.payment_status
                           or new.amount_paid is distinct from old.amount_paid or new.staff_notes is distinct from old.staff_notes) then
    insert into booking_log (booking_id, actor, action, detail)
    values (new.id, coalesce(auth.jwt()->>'email','system'), 'updated',
            jsonb_strip_nulls(jsonb_build_object(
              'status', case when new.status is distinct from old.status then old.status || ' → ' || new.status end,
              'payment', case when new.payment_status is distinct from old.payment_status then old.payment_status || ' → ' || new.payment_status end,
              'paid', case when new.amount_paid is distinct from old.amount_paid then new.amount_paid end,
              'note', case when new.staff_notes is distinct from old.staff_notes then 'staff note edited' end)));
  end if;
  return new;
end $$;
drop trigger if exists trg_touch_booking on public.bookings;
create trigger trg_touch_booking before update on public.bookings for each row execute function public.touch_booking();

-- Staff calendar: allotment / sold per room type per night
create or replace function public.inventory_grid(p_from date, p_days int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  return (select jsonb_agg(jsonb_build_object('room_type', rt.slug, 'name', rt.name, 'kind', rt.kind,
            'nights', (select jsonb_agg(jsonb_build_object('night', d::date, 'allot', allotment_for(rt.slug, d::date),
                        'sold', sold_for(rt.slug, d::date),
                        'override', exists (select 1 from allotment_overrides o where o.room_type = rt.slug and o.night = d::date)) order by d)
                       from generate_series(p_from, p_from + least(greatest(p_days,1),42) - 1, interval '1 day') d)) order by rt.sort)
          from room_types rt where rt.active);
end $$;
grant execute on function public.inventory_grid(date, int) to authenticated;

-- ---------- seed: Z Hostel room types, read from the Cloudbeds booking engine on Oct 16, 2026 ----------
-- web_allotment = units Cloudbeds showed as bookable on a quiet weekday; staff should set the real website pool.
insert into public.room_types (slug, name, kind, social_floor, women_only, guests_per_unit, web_allotment, description, features, image, sort) values
 ('private','Private Room','private',false,false,2,7,'On the highest floors, a few steps from the Roofdeck: queen-size bed with two pillows and duvet, en-suite bathroom and two bathrobes. Fully air-conditioned.', array['Queen bed','En-suite bathroom','Bathrobes & towels','Air-conditioning'],'room-private',10),
 ('social-private','Social Fun Floor Private Room','private',true,false,2,2,'A private queen room on the Social Fun Floor, right below the Roofdeck bar.', array['Queen bed','En-suite bathroom','Right below the Roofdeck'],'room-private',20),
 ('private-bunk','Private Bunk Bed Room','private',false,false,2,2,'A whole room for you and your buddy, with one bunk bed so you still get your own down time. Each bed has a quality mattress, a reading light and a power plug.', array['1 bunk bed','En-suite bathroom','Towels & bathrobes'],'room-private-bunk',30),
 ('social-private-bunk','Social Fun Floor Private Bunk Room','private',true,false,2,2,'Private bunk room on the Social Fun Floor, right below the Roofdeck bar.', array['1 bunk bed','En-suite bathroom','Right below the Roofdeck'],'room-private-bunk',40),
 ('dorm-4','4-Bed Mixed Dorm','dorm',false,false,1,20,'Stylish 4-bed dorms: a good mix of privacy and sociability. Wide customized bunks, each with its own socket and reading lamp.', array['Wide custom bunks','Socket & reading lamp per bed','Big lockers with sockets'],'room-4bed',50),
 ('social-dorm-4','Social Fun Floor 4-Bed Dorm','dorm',true,false,1,2,'4-bed dorm on the Social Fun Floor, right below the Roofdeck bar where something is on almost every night.', array['Right below the Roofdeck','Wide custom bunks','Big lockers'],'room-4bed',60),
 ('dorm-6','6-Bed Mixed Dorm','dorm',false,false,1,10,'Just the right number of people to turn your stay into a fun experience. Built-in sink in the room.', array['Built-in sink','Socket & reading lamp per bed','Big lockers'],'room-6bed',70),
 ('social-dorm-6','Social Fun Floor 6-Bed Dorm','dorm',true,false,1,12,'6-bed dorm on the Social Fun Floor, right below the Roofdeck bar.', array['Right below the Roofdeck','Built-in sink','Big lockers'],'room-6bed',80),
 ('dorm-6f','6-Bed Female Dorm','dorm',false,true,1,12,'Our "Stiletto" room for women travellers: a dresser, a vanity mirror and bigger-than-usual lockers.', array['Women only','Dresser & vanity mirror','Bigger lockers'],'room-female',90),
 ('dorm-8','8-Bed Mixed Dorm','dorm',false,false,1,5,'Up for a party and designed for interaction without compromising comfort. Near the elevators to the Roofdeck.', array['Built-in sink','Near the Roofdeck elevator','Big lockers'],'room-8bed',100)
on conflict (slug) do nothing;

insert into public.rate_plans (id, room_type, code, name, includes_breakfast, price, sort, active) values
 ('private:room_only','private','room_only','Room only',false,2400,1,true),
 ('private:breakfast','private','breakfast','With breakfast',true,2600,2,true),
 ('private:standard','private','standard','Standard rate',false,3000,3,false),
 ('social-private:room_only','social-private','room_only','Room only',false,2400,1,true),
 ('social-private:breakfast','social-private','breakfast','With breakfast',true,2600,2,true),
 ('social-private:standard','social-private','standard','Standard rate',false,3000,3,false),
 ('private-bunk:room_only','private-bunk','room_only','Room only',false,2100,1,true),
 ('private-bunk:breakfast','private-bunk','breakfast','With breakfast',true,2400,2,true),
 ('private-bunk:standard','private-bunk','standard','Standard rate',false,3000,3,false),
 ('social-private-bunk:room_only','social-private-bunk','room_only','Room only',false,2100,1,true),
 ('social-private-bunk:breakfast','social-private-bunk','breakfast','With breakfast',true,2400,2,true),
 ('dorm-4:bed_only','dorm-4','bed_only','Bed only',false,810,1,true),
 ('dorm-4:breakfast','dorm-4','breakfast','Bed + breakfast',true,945,2,true),
 ('dorm-4:standard','dorm-4','standard','Standard rate',false,1350,3,false),
 ('social-dorm-4:bed_only','social-dorm-4','bed_only','Bed only',false,810,1,true),
 ('social-dorm-4:breakfast','social-dorm-4','breakfast','Bed + breakfast',true,945,2,true),
 ('social-dorm-4:standard','social-dorm-4','standard','Standard rate',false,1350,3,false),
 ('dorm-6:bed_only','dorm-6','bed_only','Bed only',false,780,1,true),
 ('dorm-6:breakfast','dorm-6','breakfast','Bed + breakfast',true,910,2,true),
 ('dorm-6:standard','dorm-6','standard','Standard rate',false,1300,3,false),
 ('social-dorm-6:bed_only','social-dorm-6','bed_only','Bed only',false,780,1,true),
 ('social-dorm-6:breakfast','social-dorm-6','breakfast','Bed + breakfast',true,910,2,true),
 ('social-dorm-6:standard','social-dorm-6','standard','Standard rate',false,1300,3,false),
 ('dorm-6f:bed_only','dorm-6f','bed_only','Bed only',false,780,1,true),
 ('dorm-6f:breakfast','dorm-6f','breakfast','Bed + breakfast',true,910,2,true),
 ('dorm-6f:standard','dorm-6f','standard','Standard rate',false,1300,3,false),
 ('dorm-8:bed_only','dorm-8','bed_only','Bed only',false,750,1,true),
 ('dorm-8:breakfast','dorm-8','breakfast','Bed + breakfast',true,875,2,true)
on conflict (id) do nothing;

-- add-ons: price null = "priced at the front desk" until staff set a price in the dashboard
insert into public.addons (slug, name, description, price, unit, max_qty, sort, active) values
 ('airport-pickup','Airport pickup (NAIA)','A driver meets you at the airport and brings you to Z. Tell us your flight in the notes.',null,'per_booking',1,10,true),
 ('early-checkin','Early check-in','Get into your bed or room before the usual check-in time, subject to availability.',null,'per_booking',1,20,true),
 ('late-checkout','Late check-out','Keep your bed or room longer on your last day, subject to availability.',null,'per_booking',1,30,true),
 ('breakfast-extra','Extra breakfast','Buffet breakfast at the Z Café for a guest not on a breakfast rate. Per breakfast.',null,'per_item',10,40,true),
 ('locker-padlock','Padlock for your locker','Yours to keep.',null,'per_item',4,50,true),
 ('laundry','Laundry service','Wash, dry and fold, back the same day if dropped off in the morning. Per bag.',null,'per_item',4,60,true),
 ('towel','Extra towel','',null,'per_item',4,70,false)
on conflict (slug) do nothing;
