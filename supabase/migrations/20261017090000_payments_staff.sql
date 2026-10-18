-- =====================================================================
-- Z Hostel: pay-ahead by transfer (5% off), 2-hour holds, payment proofs,
-- guest emails and the staff reservations desk (/staff/).
-- Ported from the Virgin Beach Resort build (booking v12–v17), adapted to
-- a hostel: beds and rooms instead of villas/cabanas, one full payment.
--
-- How a website booking now works
--   * Pay at check-in  → confirmed straight away, standard price (as before).
--   * Pay ahead by bank / e-wallet transfer → 5% off the whole booking.
--     Only offered while check-in is more than (hold + 24 hours) away, so the
--     proof always lands at least 24 hours before check-in. The beds/room are
--     HELD for 2 hours (status 'pending'). Upload the proof in time → status
--     'pending_payment' (still held) → staff verify it → 'confirmed'.
--     No proof within 2 hours → 'expired' and the inventory is released.
--   * Every status step sends the guest an email (send-booking-email).
-- Staff can book from /staff/ with the same engine (any source, override,
-- manual discount, optional emails). Re-runnable.
-- =====================================================================

-- ---------- settings ----------
alter table public.booking_settings add column if not exists transfer_discount_rate numeric not null default 0.05;
alter table public.booking_settings add column if not exists hold_minutes int not null default 120;
alter table public.booking_settings add column if not exists transfer_cutoff_hours int not null default 24;
alter table public.booking_settings add column if not exists checkin_hour int not null default 14;
-- where guests send money: [{"label":"GCash","name":"Z Hostel Inc.","number":"0917 …","note":""}] — edit in /staff/ → Settings
alter table public.booking_settings add column if not exists pay_accounts jsonb not null default '[]'::jsonb;
alter table public.booking_settings add column if not exists staff_alert_emails text not null default 'ai@zhostel.com';
update public.booking_settings set payment_note = 'Pay at check-in (cash, card or GCash), or pay ahead by bank / e-wallet transfer and get 5% off.'
 where payment_note = 'Pay at check-in: cash, card or GCash.';

-- ---------- bookings ----------
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending','pending_payment','confirmed','checked_in','checked_out','cancelled','no_show','expired'));
alter table public.bookings add column if not exists pay_method text not null default 'desk';
alter table public.bookings drop constraint if exists bookings_pay_method_check;
alter table public.bookings add constraint bookings_pay_method_check check (pay_method in ('desk','transfer'));
alter table public.bookings add column if not exists subtotal numeric(10,2) not null default 0;           -- rooms + priced add-ons
alter table public.bookings add column if not exists transfer_discount numeric(10,2) not null default 0;  -- the 5%
alter table public.bookings add column if not exists discount_type text;                                  -- staff: 'percent' | 'amount'
alter table public.bookings add column if not exists discount_value numeric(10,2);
alter table public.bookings add column if not exists discount_reason text;
alter table public.bookings add column if not exists discount_amount numeric(10,2) not null default 0;
alter table public.bookings add column if not exists hold_until timestamptz;
alter table public.bookings add column if not exists payment_uploaded_at timestamptz;
alter table public.bookings add column if not exists amount_pending numeric(10,2) not null default 0;
alter table public.bookings add column if not exists expired_at timestamptz;
alter table public.bookings add column if not exists booked_by text;
alter table public.bookings add column if not exists email_guest boolean not null default false;
update public.bookings set subtotal = rooms_total + addons_total where subtotal = 0 and total > 0;
update public.bookings set booked_by = case when cb_owned then 'cloudbeds' when source = 'website' then 'website' else booked_by end where booked_by is null;
create index if not exists bookings_hold_idx on public.bookings (hold_until) where status = 'pending';
create index if not exists bookings_created_idx on public.bookings (created_at desc);

-- a pending hold only counts while it is running; proof uploaded = held until staff decide
create or replace function public.sold_for(p_room_type text, p_night date)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(n.units), 0)::int from booking_nights n join bookings b on b.id = n.booking_id
   where n.room_type = p_room_type and n.night = p_night
     and (b.status in ('confirmed','checked_in','pending_payment') or (b.status = 'pending' and (b.hold_until is null or b.hold_until > now())))
     and (not b.cb_owned or (select inventory_mode from booking_settings where id = 1) = 'shared');
$$;

-- ---------- payments ----------
create table if not exists public.booking_payments (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  kind        text not null default 'full' check (kind in ('full','deposit','balance','other')),
  amount      numeric(10,2) not null check (amount >= 0),
  method      text not null default 'transfer',     -- transfer | gcash | cash | card | other
  proof_path  text,
  note        text,
  status      text not null default 'pending' check (status in ('pending','verified','rejected')),
  created_at  timestamptz not null default now(),
  created_by  text,                                  -- null = the guest on /pay/
  verified_at timestamptz,
  verified_by text
);
create index if not exists booking_payments_booking_idx on public.booking_payments (booking_id, created_at);
alter table public.booking_payments enable row level security;
grant select on public.booking_payments to authenticated;
drop policy if exists staff_read on public.booking_payments;
create policy staff_read on public.booking_payments for select to authenticated using (public.is_staff());

-- ---------- email log (also stops the same email going out twice) ----------
create table if not exists public.booking_email_log (
  id          bigint generated always as identity primary key,
  booking_id  uuid references public.bookings(id) on delete cascade,
  kind        text not null,
  to_email    text,
  subject     text,
  ok          boolean,
  error       text,
  message_id  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create unique index if not exists booking_email_once on public.booking_email_log (booking_id, kind) where ok is not false;
alter table public.booking_email_log enable row level security;
grant select on public.booking_email_log to authenticated;
drop policy if exists staff_read on public.booking_email_log;
create policy staff_read on public.booking_email_log for select to authenticated using (public.is_staff());

-- ---------- staff activity (Team Activity) ----------
create table if not exists public.staff_activity (
  id     bigint generated always as identity primary key,
  email  citext not null,
  at     timestamptz not null default now(),
  kind   text not null check (kind in ('use','signin')),
  detail text
);
create index if not exists staff_activity_idx on public.staff_activity (email, at desc);
alter table public.staff_activity enable row level security;
grant select on public.staff_activity to authenticated;
drop policy if exists staff_read on public.staff_activity;
create policy staff_read on public.staff_activity for select to authenticated using (public.is_staff());

create or replace function public.staff_ping(p_kind text default 'use', p_detail text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_email citext := (auth.jwt() ->> 'email')::citext;
begin
  if not public.is_staff() then return; end if;
  if p_kind = 'use' and exists (select 1 from staff_activity where email = v_email and kind = 'use' and at > now() - interval '5 minutes') then return; end if;
  insert into staff_activity (email, kind, detail) values (v_email, case when p_kind = 'signin' then 'signin' else 'use' end, left(p_detail, 200));
end $$;
revoke all on function public.staff_ping(text, text) from public, anon;
grant execute on function public.staff_ping(text, text) to authenticated;

create or replace function public.team_activity(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  return coalesce((select jsonb_agg(x order by x->>'last_active' desc nulls last) from (
    select jsonb_build_object('email', s.email, 'name', s.name, 'role', s.role,
      'last_active', (select max(at) from staff_activity a where a.email = s.email and a.kind = 'use'),
      'last_signin', (select max(at) from staff_activity a where a.email = s.email and a.kind = 'signin'),
      'last_change', (select max(at) from booking_log l where l.actor = s.email::text),
      'days_used', (select count(distinct (at at time zone 'Asia/Manila')::date) from staff_activity a where a.email = s.email and a.at > now() - make_interval(days => p_days)),
      'changes', (select count(*) from booking_log l where l.actor = s.email::text and l.at > now() - make_interval(days => p_days))) x
    from staff s) t), '[]'::jsonb);
end $$;
grant execute on function public.team_activity(int) to authenticated;

-- ---------- rules ----------
-- Check-in moment in Manila for a date
create or replace function public.checkin_at(p_checkin date)
returns timestamptz language sql stable security definer set search_path = public as $$
  select (p_checkin + make_interval(hours => (select checkin_hour from booking_settings where id = 1))) at time zone 'Asia/Manila';
$$;

-- Can a new booking pay ahead by transfer? (proof must be in 24 hours before check-in)
create or replace function public.transfer_allowed(p_checkin date)
returns boolean language sql stable security definer set search_path = public as $$
  select p_checkin is not null and now() + make_interval(mins => s.hold_minutes) <= checkin_at(p_checkin) - make_interval(hours => s.transfer_cutoff_hours)
  from booking_settings s where s.id = 1;
$$;
grant execute on function public.transfer_allowed(date) to anon, authenticated;

-- Totals from the subtotal + the way of paying + a staff discount
create or replace function public._totals(p_subtotal numeric, p_transfer_disc boolean, p_dtype text, p_dvalue numeric, out transfer_discount numeric, out discount_amount numeric, out total numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_rate numeric := coalesce((select transfer_discount_rate from booking_settings where id = 1), 0.05);
begin
  transfer_discount := case when p_transfer_disc then round(coalesce(p_subtotal,0) * v_rate, 2) else 0 end;
  discount_amount := case p_dtype
      when 'percent' then round((coalesce(p_subtotal,0) - transfer_discount) * least(greatest(coalesce(p_dvalue,0),0),100) / 100, 2)
      when 'amount' then least(greatest(coalesce(p_dvalue,0),0), coalesce(p_subtotal,0) - transfer_discount)
      else 0 end;
  total := greatest(coalesce(p_subtotal,0) - transfer_discount - discount_amount, 0);
end $$;
revoke all on function public._totals(numeric, boolean, text, numeric) from public, anon, authenticated;

-- Release holds that ran out. Called by the booking engine, the pay page,
-- the staff desk and (optionally) a pg_cron job every 5 minutes.
create or replace function public.expire_holds()
returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  update bookings set status = 'expired', expired_at = now()
   where status = 'pending' and not cb_owned and hold_until is not null and hold_until <= now() and payment_uploaded_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.expire_holds() to anon, authenticated;

-- ---------- availability now also says whether pay-ahead is possible ----------
create or replace function public.booking_availability(p_checkin date, p_checkout date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb := '[]'::jsonb; r record; v_min int; v_nights int := p_checkout - p_checkin; v_set booking_settings;
begin
  select * into v_set from booking_settings where id = 1;
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
  return jsonb_build_object('ok', v_set.open, 'nights', v_nights, 'room_types', v_out,
    'pay', jsonb_build_object('transfer_allowed', transfer_allowed(p_checkin), 'rate', v_set.transfer_discount_rate,
                              'hold_minutes', v_set.hold_minutes, 'cutoff_hours', v_set.transfer_cutoff_hours));
end $$;
grant execute on function public.booking_availability(date, date) to anon, authenticated;

-- ---------- create_booking: + way of paying, holds, staff options ----------
drop function if exists public.create_booking(date,date,jsonb,jsonb,text,text,text,text,text,text,boolean,boolean,text,text,boolean);
create or replace function public.create_booking(
  p_checkin date, p_checkout date, p_items jsonb, p_addons jsonb,
  p_guest_name text, p_guest_email text, p_guest_phone text, p_country text,
  p_arrival_time text, p_notes text, p_consent boolean, p_marketing boolean default false,
  p_ref text default null, p_source text default 'website', p_override boolean default false,
  p_pay_method text default 'desk',
  -- staff only (ignored for the public):
  p_status text default null, p_transfer_discount boolean default null,
  p_discount_type text default null, p_discount_value numeric default null, p_discount_reason text default null,
  p_staff_notes text default null, p_email_guest boolean default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_staff boolean := public.is_staff();
  v_email citext;
  v_nights int := p_checkout - p_checkin;
  v_b bookings; it jsonb; ad jsonb; v_plan rate_plans; v_rt room_types; v_units int; v_amt numeric; v_rooms numeric := 0; v_add numeric := 0;
  v_guests int := 0; v_a addons; v_qty int; v_aamt numeric; v_free int; d date; v_set booking_settings;
  v_pay text := case when p_pay_method = 'transfer' then 'transfer' else 'desk' end;
  v_status text; v_tdisc boolean; v_dtype text; v_tot record;
begin
  select * into v_set from booking_settings where id = 1;
  perform expire_holds();
  if not v_staff then
    if not v_set.open then raise exception 'Online booking is paused. Please contact us.' using errcode='22023'; end if;
    if not coalesce(p_consent,false) then raise exception 'Please agree to the booking terms and privacy notice' using errcode='22023'; end if;
    if p_checkin < (now() at time zone 'Asia/Manila')::date then raise exception 'Check-in date is in the past' using errcode='22023'; end if;
    v_email := _clean_email(p_guest_email);
    if coalesce(btrim(p_guest_phone),'') = '' then raise exception 'Mobile number is required' using errcode='22023'; end if;
    if v_pay = 'transfer' and not transfer_allowed(p_checkin) then
      raise exception 'Paying ahead by transfer closes % hours before check-in. Please choose pay at check-in.', v_set.transfer_cutoff_hours using errcode='22023';
    end if;
    perform _throttle('booking', v_email);
    v_status := case when v_pay = 'transfer' then 'pending' else 'confirmed' end;
    v_tdisc := v_pay = 'transfer';
    v_dtype := null;
  else
    v_email := nullif(lower(btrim(coalesce(p_guest_email,''))),'')::citext;
    v_status := coalesce(nullif(p_status,''), case when v_pay = 'transfer' then 'pending' else 'confirmed' end);
    if v_status not in ('pending','pending_payment','confirmed','checked_in','checked_out','cancelled','no_show') then
      raise exception 'Unknown status %', v_status using errcode='22023';
    end if;
    v_tdisc := coalesce(p_transfer_discount, false) and v_pay = 'transfer';
    v_dtype := case when p_discount_type in ('percent','amount') and coalesce(p_discount_value,0) > 0 then p_discount_type end;
  end if;
  if coalesce(btrim(p_guest_name),'') = '' then raise exception 'Guest name is required' using errcode='22023'; end if;
  if v_nights < 1 or v_nights > v_set.max_nights then raise exception 'Stays are 1 to % nights', v_set.max_nights using errcode='22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Choose at least one bed or room' using errcode='22023'; end if;

  -- one booking at a time: makes overselling impossible
  perform pg_advisory_xact_lock(hashtext('zhostel-booking'));

  insert into bookings (checkin, checkout, guest_name, guest_email, guest_phone, country, arrival_time, notes,
                        consent_at, marketing_opt_in, ref, source, status, pay_method, hold_until, booked_by, email_guest, staff_notes,
                        discount_type, discount_value, discount_reason)
  values (p_checkin, p_checkout, left(btrim(p_guest_name),120), v_email, left(nullif(btrim(p_guest_phone),''),40),
          left(nullif(btrim(p_country),''),60), left(nullif(btrim(p_arrival_time),''),40), left(nullif(btrim(p_notes),''),2000),
          case when p_consent then now() end, coalesce(p_marketing,false), _clean_src(p_ref),
          case when v_staff then coalesce(nullif(p_source,''),'walk-in') else 'website' end,
          v_status, v_pay,
          case when v_status = 'pending' then now() + make_interval(mins => v_set.hold_minutes) end,
          case when v_staff then auth.jwt()->>'email' else 'website' end,
          case when v_staff then coalesce(p_email_guest, false) else true end,
          case when v_staff then nullif(btrim(coalesce(p_staff_notes,'')),'') end,
          v_dtype, case when v_dtype is not null then p_discount_value end,
          case when v_dtype is not null then left(nullif(btrim(coalesce(p_discount_reason,'')),''),200) end)
  returning * into v_b;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_plan from rate_plans where id = it->>'rate_plan' and (active or v_staff);
    if not found then raise exception 'That rate is no longer available' using errcode='22023'; end if;
    select * into v_rt from room_types where slug = v_plan.room_type;
    v_units := (it->>'units')::int;
    if v_units is null or v_units < 1 or v_units > v_set.max_units_per_type then raise exception 'Invalid quantity for %', v_rt.name using errcode='22023'; end if;
    insert into booking_nights (booking_id, room_type, night, units)
      select v_b.id, v_rt.slug, g::date, v_units from generate_series(p_checkin, p_checkout - 1, interval '1 day') g;
    if not (v_staff and coalesce(p_override,false)) and v_status not in ('cancelled','no_show','checked_out') then
      for d in select g::date from generate_series(p_checkin, p_checkout - 1, interval '1 day') g loop
        v_free := allotment_for(v_rt.slug, d) - sold_for(v_rt.slug, d);   -- this booking is already counted
        if v_free < 0 then
          raise exception 'Sorry, only % % left in % on %', greatest(v_free + v_units,0), case when v_rt.kind='dorm' then 'bed(s)' else 'room(s)' end, v_rt.name, to_char(d,'Mon DD') using errcode='22023';
        end if;
      end loop;
    end if;
    select sum(price_for(v_plan.id, g::date)) * v_units into v_amt from generate_series(p_checkin, p_checkout - 1, interval '1 day') g;
    insert into booking_items (booking_id, room_type, rate_plan, units, amount) values (v_b.id, v_rt.slug, v_plan.id, v_units, v_amt);
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

  select * into v_tot from _totals(v_rooms + v_add, v_tdisc, v_dtype, p_discount_value);
  update bookings set guests = greatest(v_guests,1), rooms_total = v_rooms, addons_total = v_add, subtotal = v_rooms + v_add,
                      transfer_discount = v_tot.transfer_discount, discount_amount = v_tot.discount_amount, total = v_tot.total
   where id = v_b.id returning * into v_b;
  insert into booking_log (booking_id, actor, action, detail)
    values (v_b.id, coalesce(auth.jwt()->>'email','website'), 'created',
            jsonb_build_object('total', v_b.total, 'source', v_b.source, 'pay', v_b.pay_method, 'status', v_b.status));

  return jsonb_build_object('ok', true, 'code', v_b.code, 'id', v_b.id, 'status', v_b.status, 'pay_method', v_b.pay_method,
                            'subtotal', v_b.subtotal, 'transfer_discount', v_b.transfer_discount, 'discount_amount', v_b.discount_amount,
                            'total', v_b.total, 'rooms_total', v_rooms, 'addons_total', v_add, 'nights', v_nights, 'guests', v_b.guests,
                            'hold_until', v_b.hold_until, 'pay_accounts', case when v_b.pay_method = 'transfer' then v_set.pay_accounts end,
                            'checkin_time', v_set.checkin_time, 'checkout_time', v_set.checkout_time, 'payment_note', v_set.payment_note);
end $$;
revoke all on function public.create_booking(date,date,jsonb,jsonb,text,text,text,text,text,text,boolean,boolean,text,text,boolean,text,text,boolean,text,numeric,text,text,boolean) from public;
grant execute on function public.create_booking(date,date,jsonb,jsonb,text,text,text,text,text,text,boolean,boolean,text,text,boolean,text,text,boolean,text,numeric,text,text,boolean) to anon, authenticated;

-- ---------- payment summary (pay page, emails, staff) ----------
create or replace function public.booking_payment_summary(p_booking_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'subtotal', b.subtotal, 'transfer_discount', b.transfer_discount, 'discount_amount', b.discount_amount, 'discount_reason', b.discount_reason,
    'total', b.total, 'paid', b.amount_paid, 'pending', b.amount_pending,
    'balance', greatest(b.total - b.amount_paid, 0),
    'to_pay', greatest(b.total - b.amount_paid - b.amount_pending, 0),
    'fully_paid', b.total > 0 and b.amount_paid >= b.total - 0.5,
    'last', (select jsonb_build_object('amount', p.amount, 'method', p.method, 'status', p.status, 'at', p.created_at)
               from booking_payments p where p.booking_id = b.id order by p.created_at desc limit 1))
  from bookings b where b.id = p_booking_id;
$$;
revoke all on function public.booking_payment_summary(uuid) from public, anon;
grant execute on function public.booking_payment_summary(uuid) to authenticated;

-- ---------- guest: my booking / pay page ----------
create or replace function public.my_booking(p_code text, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_b bookings; v_set booking_settings;
begin
  perform expire_holds();
  select * into v_b from bookings where code = upper(btrim(p_code)) and guest_email = lower(btrim(p_email))::citext and not cb_owned;
  if not found then return jsonb_build_object('ok', false); end if;
  select * into v_set from booking_settings where id = 1;
  return jsonb_build_object('ok', true, 'code', v_b.code, 'status', v_b.status, 'payment_status', v_b.payment_status,
    'checkin', v_b.checkin, 'checkout', v_b.checkout, 'nights', v_b.nights, 'guests', v_b.guests, 'guest_name', v_b.guest_name,
    'first_name', split_part(btrim(v_b.guest_name), ' ', 1),
    'pay_method', v_b.pay_method, 'hold_until', case when v_b.status = 'pending' then v_b.hold_until end,
    'proof_uploaded', v_b.payment_uploaded_at is not null,
    'subtotal', v_b.subtotal, 'transfer_discount', v_b.transfer_discount, 'discount_amount', v_b.discount_amount, 'discount_reason', v_b.discount_reason,
    'total', v_b.total, 'amount_paid', v_b.amount_paid, 'amount_pending', v_b.amount_pending,
    'to_pay', greatest(v_b.total - v_b.amount_paid - v_b.amount_pending, 0),
    'pay_accounts', case when v_b.status in ('pending','pending_payment','confirmed') and v_b.total > v_b.amount_paid then v_set.pay_accounts end,
    'can_upload', v_b.status in ('pending','pending_payment','confirmed') and v_b.total - v_b.amount_paid - v_b.amount_pending > 0.5,
    'checkin_time', v_set.checkin_time, 'checkout_time', v_set.checkout_time,
    'items', (select jsonb_agg(jsonb_build_object('room', rt.name, 'plan', coalesce(rp.name, ''), 'units', i.units, 'unit', case when rt.kind='dorm' then 'bed' else 'room' end, 'amount', i.amount))
              from booking_items i join room_types rt on rt.slug = i.room_type left join rate_plans rp on rp.id = i.rate_plan where i.booking_id = v_b.id),
    'addons', (select jsonb_agg(jsonb_build_object('name', a.name, 'qty', a.qty, 'amount', a.amount)) from booking_addons a where a.booking_id = v_b.id));
end $$;
grant execute on function public.my_booking(text, text) to anon, authenticated;

-- The upload-payment Edge Function (service role) records a guest's proof.
-- The amount is worked out here from the booking, never trusted from the page.
create or replace function public.submit_payment_proof(p_code text, p_email text, p_path text, p_method text default 'transfer')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_b bookings; v_amount numeric;
begin
  perform expire_holds();
  select * into v_b from bookings where code = upper(btrim(p_code)) and guest_email = lower(btrim(p_email))::citext and not cb_owned for update;
  if not found then raise exception 'We could not find a booking with that code and email' using errcode='22023'; end if;
  perform _throttle('payment', v_b.guest_email);
  if v_b.status = 'expired' then raise exception 'This booking expired before a payment was uploaded. Please book again or message us.' using errcode='22023'; end if;
  if v_b.status not in ('pending','pending_payment','confirmed') then raise exception 'This booking is no longer open for payment. Please message us.' using errcode='22023'; end if;
  v_amount := greatest(v_b.total - v_b.amount_paid - v_b.amount_pending, 0);
  if v_amount <= 0.5 then raise exception 'Nothing left to pay on this booking. Thank you!' using errcode='22023'; end if;
  insert into booking_payments (booking_id, kind, amount, method, proof_path)
  values (v_b.id, case when v_b.amount_paid > 0 then 'balance' else 'full' end, v_amount,
          case when p_method in ('transfer','gcash','maya','bank') then p_method else 'transfer' end, p_path);
  update bookings set payment_uploaded_at = now(), amount_pending = amount_pending + v_amount,
         status = case when status = 'pending' then 'pending_payment' else status end
   where id = v_b.id returning * into v_b;
  insert into booking_log (booking_id, actor, action, detail) values (v_b.id, 'guest', 'payment uploaded', jsonb_build_object('amount', v_amount));
  return jsonb_build_object('ok', true, 'code', v_b.code, 'status', v_b.status, 'amount', v_amount);
end $$;
revoke all on function public.submit_payment_proof(text, text, text, text) from public, anon, authenticated;

-- ---------- staff: payments ----------
create or replace function public._recalc_paid(p_booking_id uuid)
returns bookings language plpgsql security definer set search_path = public as $$
declare v_b bookings;
begin
  update bookings b set
    amount_paid = coalesce((select sum(amount) from booking_payments p where p.booking_id = b.id and p.status = 'verified'), 0),
    amount_pending = coalesce((select sum(amount) from booking_payments p where p.booking_id = b.id and p.status = 'pending'), 0)
   where b.id = p_booking_id returning * into v_b;
  update bookings set payment_status = case when amount_paid >= total - 0.5 and total > 0 then 'paid' when amount_paid > 0 then 'partial' else 'unpaid' end
   where id = p_booking_id and payment_status <> 'refunded' returning * into v_b;
  return v_b;
end $$;
revoke all on function public._recalc_paid(uuid) from public, anon, authenticated;

-- Verify (optionally correcting the amount) or reject a payment.
-- The first verified payment confirms a pending booking (→ "confirmed" email).
-- Rejecting the only proof puts the booking back on a fresh hold so the guest can re-upload.
create or replace function public.staff_verify_payment(p_payment_id uuid, p_amount numeric default null, p_reject boolean default false, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p booking_payments; v_b bookings;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  select * into v_p from booking_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  update booking_payments set status = case when p_reject then 'rejected' else 'verified' end,
         amount = coalesce(p_amount, amount), note = coalesce(nullif(btrim(coalesce(p_note,'')),''), note),
         verified_at = now(), verified_by = auth.jwt()->>'email'
   where id = p_payment_id;
  v_b := _recalc_paid(v_p.booking_id);
  if not p_reject and v_b.amount_paid > 0 and v_b.status in ('pending','pending_payment','expired') then
    update bookings set status = 'confirmed', hold_until = null where id = v_b.id returning * into v_b;
  elsif p_reject and v_b.status = 'pending_payment' and v_b.amount_pending = 0 and v_b.amount_paid = 0 then
    update bookings set status = 'pending', payment_uploaded_at = null,
           hold_until = now() + make_interval(mins => (select hold_minutes from booking_settings where id = 1))
     where id = v_b.id returning * into v_b;
  end if;
  insert into booking_log (booking_id, actor, action, detail)
    values (v_b.id, auth.jwt()->>'email', case when p_reject then 'payment rejected' else 'payment verified' end,
            jsonb_build_object('amount', coalesce(p_amount, v_p.amount), 'note', p_note));
  return booking_payment_summary(v_b.id) || jsonb_build_object('status', v_b.status);
end $$;
revoke all on function public.staff_verify_payment(uuid, numeric, boolean, text) from public, anon;
grant execute on function public.staff_verify_payment(uuid, numeric, boolean, text) to authenticated;

-- A payment received another way (cash at the desk, card, a transfer seen in the bank). Counts as verified.
create or replace function public.staff_record_payment(p_booking_id uuid, p_amount numeric, p_method text, p_note text default null, p_proof_path text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_b bookings;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount received'; end if;
  select * into v_b from bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  insert into booking_payments (booking_id, kind, amount, method, note, proof_path, created_by)
  values (p_booking_id, case when v_b.amount_paid > 0 then 'balance' else 'full' end, p_amount,
          coalesce(nullif(p_method,''),'cash'), nullif(btrim(coalesce(p_note,'')),''), p_proof_path, auth.jwt()->>'email')
  returning id into v_id;
  return staff_verify_payment(v_id, p_amount, false, p_note);
end $$;
revoke all on function public.staff_record_payment(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.staff_record_payment(uuid, numeric, text, text, text) to authenticated;

-- ---------- staff: edit a booking (details, status, dates, beds, discount) ----------
-- p: {"guest_name","guest_email","guest_phone","country","arrival_time","notes","staff_notes","source","status",
--     "pay_method","transfer_discount":bool,"discount_type","discount_value","discount_reason","email_guest":bool,
--     "checkin","checkout","items":[{rate_plan,units}],"addons":[{slug,qty}],"override":bool,"notify":bool}
create or replace function public.staff_update_booking(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_old bookings; v_b bookings; v_set booking_settings; it jsonb; ad jsonb; v_plan rate_plans; v_rt room_types; v_units int; v_amt numeric;
  v_rooms numeric; v_add numeric; v_guests int; v_a addons; v_qty int; v_aamt numeric; v_free int; d date; v_tot record;
  v_in date; v_out date; v_rebuild boolean; v_changes jsonb := '[]'::jsonb; v_status text; v_tdisc boolean; v_dtype text; v_dval numeric;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  select * into v_set from booking_settings where id = 1;
  perform pg_advisory_xact_lock(hashtext('zhostel-booking'));
  select * into v_old from bookings where id = p_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_old.cb_owned then raise exception 'This booking belongs to Cloudbeds. Change it in Cloudbeds; it syncs here.'; end if;

  v_in := coalesce((p->>'checkin')::date, v_old.checkin);
  v_out := coalesce((p->>'checkout')::date, v_old.checkout);
  if v_out <= v_in or v_out - v_in > v_set.max_nights then raise exception 'Check the dates'; end if;
  v_rebuild := p ? 'items' or v_in <> v_old.checkin or v_out <> v_old.checkout;
  v_status := coalesce(nullif(p->>'status',''), v_old.status);
  if v_status not in ('pending','pending_payment','confirmed','checked_in','checked_out','cancelled','no_show','expired') then raise exception 'Unknown status'; end if;

  update bookings set
    guest_name = coalesce(nullif(btrim(p->>'guest_name'),''), guest_name),
    guest_email = case when p ? 'guest_email' then nullif(lower(btrim(p->>'guest_email')),'')::citext else guest_email end,
    guest_phone = case when p ? 'guest_phone' then nullif(btrim(p->>'guest_phone'),'') else guest_phone end,
    country = case when p ? 'country' then nullif(btrim(p->>'country'),'') else country end,
    arrival_time = case when p ? 'arrival_time' then nullif(btrim(p->>'arrival_time'),'') else arrival_time end,
    notes = case when p ? 'notes' then nullif(btrim(p->>'notes'),'') else notes end,
    staff_notes = case when p ? 'staff_notes' then nullif(btrim(p->>'staff_notes'),'') else staff_notes end,
    source = coalesce(nullif(p->>'source',''), source),
    email_guest = coalesce((p->>'email_guest')::boolean, email_guest),
    pay_method = case when p->>'pay_method' in ('desk','transfer') then p->>'pay_method' else pay_method end,
    discount_type = case when p ? 'discount_type' then case when p->>'discount_type' in ('percent','amount') and coalesce((p->>'discount_value')::numeric,0) > 0 then p->>'discount_type' end else discount_type end,
    discount_value = case when p ? 'discount_type' then case when p->>'discount_type' in ('percent','amount') then (p->>'discount_value')::numeric end else discount_value end,
    discount_reason = case when p ? 'discount_reason' then nullif(btrim(p->>'discount_reason'),'') else discount_reason end,
    checkin = v_in, checkout = v_out,
    status = v_status,
    hold_until = case when v_status = 'pending' and v_old.status <> 'pending' then now() + make_interval(mins => v_set.hold_minutes)
                      when v_status = 'pending' then hold_until else null end,
    expired_at = case when v_status = 'expired' then coalesce(expired_at, now()) else null end
  where id = p_id returning * into v_b;

  if v_rebuild then
    delete from booking_nights where booking_id = p_id;
    if p ? 'items' then
      delete from booking_items where booking_id = p_id;
      v_rooms := 0; v_guests := 0;
      for it in select * from jsonb_array_elements(p->'items') loop
        select * into v_plan from rate_plans where id = it->>'rate_plan';
        if not found then raise exception 'Unknown rate %', it->>'rate_plan'; end if;
        select * into v_rt from room_types where slug = v_plan.room_type;
        v_units := (it->>'units')::int;
        if v_units is null or v_units < 1 then continue; end if;
        select sum(price_for(v_plan.id, g::date)) * v_units into v_amt from generate_series(v_in, v_out - 1, interval '1 day') g;
        insert into booking_items (booking_id, room_type, rate_plan, units, amount) values (p_id, v_rt.slug, v_plan.id, v_units, v_amt);
        v_rooms := v_rooms + v_amt; v_guests := v_guests + v_units * v_rt.guests_per_unit;
      end loop;
      if v_rooms = 0 and not exists (select 1 from booking_items where booking_id = p_id) then raise exception 'Choose at least one bed or room'; end if;
    else
      -- same beds, new dates: re-price each line
      update booking_items i set amount = (select sum(price_for(i.rate_plan, g::date)) from generate_series(v_in, v_out - 1, interval '1 day') g) * i.units
       where i.booking_id = p_id and i.rate_plan is not null;
      select coalesce(sum(amount),0), coalesce(sum(i.units * rt.guests_per_unit),0) into v_rooms, v_guests
        from booking_items i join room_types rt on rt.slug = i.room_type where i.booking_id = p_id;
    end if;
    insert into booking_nights (booking_id, room_type, night, units)
      select p_id, i.room_type, g::date, i.units from booking_items i, generate_series(v_in, v_out - 1, interval '1 day') g where i.booking_id = p_id;
    if not coalesce((p->>'override')::boolean, false) and v_status in ('pending','pending_payment','confirmed','checked_in') then
      for v_rt in select distinct rt.* from booking_items i join room_types rt on rt.slug = i.room_type where i.booking_id = p_id loop
        for d in select g::date from generate_series(v_in, v_out - 1, interval '1 day') g loop
          v_free := allotment_for(v_rt.slug, d) - sold_for(v_rt.slug, d);
          if v_free < 0 then raise exception 'Not enough % left on % (tick "Allow over allotment" to book anyway)', v_rt.name, to_char(d,'Mon DD'); end if;
        end loop;
      end loop;
    end if;
  else
    v_rooms := v_old.rooms_total;
    select coalesce(sum(i.units * rt.guests_per_unit),0) into v_guests from booking_items i join room_types rt on rt.slug = i.room_type where i.booking_id = p_id;
  end if;

  if p ? 'addons' then
    delete from booking_addons where booking_id = p_id;
    v_add := 0;
    for ad in select * from jsonb_array_elements(p->'addons') loop
      select * into v_a from addons where slug = ad->>'slug';
      if not found then continue; end if;
      v_qty := least(greatest(coalesce((ad->>'qty')::int,1),1), v_a.max_qty);
      v_aamt := case when v_a.price is null then null else v_a.price * v_qty *
        case v_a.unit when 'per_night' then (v_out - v_in) when 'per_guest' then v_guests when 'per_guest_night' then v_guests * (v_out - v_in) else 1 end end;
      insert into booking_addons (booking_id, addon, name, qty, amount) values (p_id, v_a.slug, v_a.name, v_qty, v_aamt);
      v_add := v_add + coalesce(v_aamt,0);
    end loop;
  else
    v_add := v_old.addons_total;
  end if;

  v_tdisc := case when p ? 'transfer_discount' then coalesce((p->>'transfer_discount')::boolean,false) else v_old.transfer_discount > 0 end and v_b.pay_method = 'transfer';
  select * into v_tot from _totals(v_rooms + v_add, v_tdisc, v_b.discount_type, v_b.discount_value);
  update bookings set rooms_total = v_rooms, addons_total = v_add, subtotal = v_rooms + v_add, guests = greatest(v_guests, 1),
         transfer_discount = v_tot.transfer_discount, discount_amount = v_tot.discount_amount, total = v_tot.total
   where id = p_id returning * into v_b;
  v_b := _recalc_paid(p_id);

  -- what changed (for the log and the guest email)
  select coalesce(jsonb_agg(jsonb_build_object('field', k, 'before', o, 'after', n)), '[]'::jsonb) into v_changes from (
    select 'Guest name' k, v_old.guest_name o, v_b.guest_name n union all
    select 'Email', v_old.guest_email::text, v_b.guest_email::text union all
    select 'Mobile', v_old.guest_phone, v_b.guest_phone union all
    select 'Check-in', v_old.checkin::text, v_b.checkin::text union all
    select 'Check-out', v_old.checkout::text, v_b.checkout::text union all
    select 'Status', v_old.status, v_b.status union all
    select 'Payment', v_old.pay_method, v_b.pay_method union all
    select 'Total', v_old.total::text, v_b.total::text union all
    select 'Arrival time', v_old.arrival_time, v_b.arrival_time union all
    select 'Guest requests', v_old.notes, v_b.notes union all
    select 'Source', v_old.source, v_b.source) c where o is distinct from n;
  if v_rebuild and p ? 'items' then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field','Beds / rooms','before','','after','updated')); end if;
  if jsonb_array_length(v_changes) > 0 then
    insert into booking_log (booking_id, actor, action, detail) values (p_id, auth.jwt()->>'email', 'edited', jsonb_build_object('changes', v_changes));
  end if;
  if coalesce((p->>'notify')::boolean, false) and v_b.guest_email is not null and jsonb_array_length(v_changes) > 0 then
    perform _email_event('CHANGE', v_b.id, jsonb_build_object('changes', v_changes));
  end if;
  return jsonb_build_object('ok', true, 'id', v_b.id, 'code', v_b.code, 'total', v_b.total, 'status', v_b.status, 'changes', v_changes);
end $$;
revoke all on function public.staff_update_booking(uuid, jsonb) from public, anon;
grant execute on function public.staff_update_booking(uuid, jsonb) to authenticated;

-- Staff: resend an email by hand (from the booking window)
create or replace function public.staff_send_email(p_id uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  if p_kind not in ('RESEND_BOOKING','RESEND_CONFIRMED') then raise exception 'Unknown email'; end if;
  perform _email_event(p_kind, p_id, jsonb_build_object('by', auth.jwt()->>'email'));
  insert into booking_log (booking_id, actor, action, detail) values (p_id, auth.jwt()->>'email', 'email sent', jsonb_build_object('kind', p_kind));
  return true;
end $$;
revoke all on function public.staff_send_email(uuid, text) from public, anon;
grant execute on function public.staff_send_email(uuid, text) to authenticated;

-- Staff: the list the desk works from (one call, newest first; Cloudbeds rows included)
create or replace function public.staff_bookings(p_from date default null, p_limit int default 3000)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  perform expire_holds();
  return coalesce((select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
    select b.id, b.code, b.created_at, b.updated_at, b.status, b.payment_status, b.pay_method, b.source, b.booked_by, b.email_guest,
           b.checkin, b.checkout, b.nights, b.guests, b.guest_name, b.guest_email, b.guest_phone, b.country, b.arrival_time, b.notes, b.staff_notes,
           b.rooms_total, b.addons_total, b.subtotal, b.transfer_discount, b.discount_type, b.discount_value, b.discount_reason, b.discount_amount,
           b.total, b.amount_paid, b.amount_pending, b.hold_until, b.payment_uploaded_at, b.expired_at,
           b.cb_owned, b.cb_reservation_id, b.cb_status, b.cb_source, b.ota_ref, b.cb_rooms, b.cb_push_state,
           (select jsonb_agg(jsonb_build_object('room_type', i.room_type, 'rate_plan', i.rate_plan, 'units', i.units, 'amount', i.amount)) from booking_items i where i.booking_id = b.id) items,
           (select jsonb_agg(jsonb_build_object('slug', a.addon, 'name', a.name, 'qty', a.qty, 'amount', a.amount)) from booking_addons a where a.booking_id = b.id) addons,
           (select count(*) from booking_payments p where p.booking_id = b.id and p.status = 'pending') proofs_to_check
      from bookings b
     where b.checkout >= coalesce(p_from, (now() at time zone 'Asia/Manila')::date - 60) or b.created_at > now() - interval '60 days'
     order by b.created_at desc limit least(greatest(coalesce(p_limit, 3000), 1), 10000)) x), '[]'::jsonb);
end $$;
grant execute on function public.staff_bookings(date, int) to authenticated;

-- ---------- Cloudbeds push: only bookings that are actually confirmed ----------
create or replace function public.cb_claim_push(p_booking_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if not cb_push_enabled() then return null; end if;
  update bookings set cb_push_state = 'sending' where id = p_booking_id and not cb_owned and cb_reservation_id is null
    and status in ('confirmed','pending_payment','checked_in')
    and coalesce(cb_push_state,'waiting') in ('waiting','error') returning * into b;
  if not found then return null; end if;
  return to_jsonb(b) || jsonb_build_object('items', (select jsonb_agg(jsonb_build_object('units', i.units, 'room_type', i.room_type,
            'cb_room_type_id', t.cb_room_type_id, 'kind', t.kind, 'name', t.name)) from booking_items i join room_types t on t.slug = i.room_type where i.booking_id = b.id));
end $$;
revoke all on function public.cb_claim_push(uuid) from public, anon, authenticated;
grant execute on function public.cb_claim_push(uuid) to service_role;

create or replace function public.cb_pending_pushes() returns text[] language sql stable security definer set search_path = public as $$
  select case when cb_push_enabled() then coalesce(array_agg(id::text order by created_at), '{}') else '{}' end
  from bookings where not cb_owned and cb_reservation_id is null and status in ('confirmed','pending_payment','checked_in') and checkout >= current_date
    and coalesce(cb_push_state, 'waiting') in ('waiting','error') and created_at > now() - interval '30 days';
$$;
revoke all on function public.cb_pending_pushes() from public, anon, authenticated;
grant execute on function public.cb_pending_pushes() to service_role;

create or replace function public.cb_booking_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cb_owned then return new; end if;
  if (tg_op = 'INSERT' and new.status in ('confirmed','pending_payment'))
     or (tg_op = 'UPDATE' and new.cb_reservation_id is null and new.status in ('confirmed','pending_payment') and old.status in ('pending','expired')) then
    perform cb_call(jsonb_build_object('action','push','booking_id',new.id));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.cb_reservation_id is not null then
    perform cb_call(jsonb_build_object('action','status','booking_id',new.id));
  end if;
  return new;
exception when others then return new;   -- never block a booking because of the sync
end $$;

-- ---------- emails: database → send-booking-email Edge Function ----------
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'booking_email_webhook_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'booking_email_webhook_secret');
  end if;
end $$;
create extension if not exists pg_net;

create or replace function public.booking_email_secret() returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'booking_email_webhook_secret' limit 1;
$$;
revoke all on function public.booking_email_secret() from public, anon, authenticated;

create or replace function public._email_event(p_type text, p_id uuid, p_extra jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(url := 'https://zazmufcnqevovuzzgisy.supabase.co/functions/v1/send-booking-email',
    body := jsonb_build_object('type', p_type, 'id', p_id) || coalesce(p_extra, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret', public.booking_email_secret()),
    timeout_milliseconds := 30000);
exception when others then null;   -- an email problem never blocks a booking
end $$;
revoke all on function public._email_event(text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.booking_email_trigger() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cb_owned then return new; end if;
  if tg_op = 'INSERT' then
    perform _email_event('INSERT', new.id);
  elsif new.payment_uploaded_at is distinct from old.payment_uploaded_at and new.payment_uploaded_at is not null then
    perform _email_event('PROOF', new.id);
  elsif new.status is distinct from old.status then
    perform _email_event('STATUS', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
drop trigger if exists trg_booking_email on public.bookings;
create trigger trg_booking_email after insert or update of status, payment_uploaded_at on public.bookings
  for each row execute function public.booking_email_trigger();

-- Everything one email needs, in one call (service role only)
create or replace function public.email_booking_data(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(b) || jsonb_build_object(
    'items', (select coalesce(jsonb_agg(jsonb_build_object('room', rt.name, 'kind', rt.kind, 'plan', coalesce(rp.name,''), 'breakfast', coalesce(rp.includes_breakfast,false), 'units', i.units, 'amount', i.amount)), '[]'::jsonb)
              from booking_items i join room_types rt on rt.slug = i.room_type left join rate_plans rp on rp.id = i.rate_plan where i.booking_id = b.id),
    'addons', (select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'qty', a.qty, 'amount', a.amount)), '[]'::jsonb) from booking_addons a where a.booking_id = b.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'method', p.method, 'status', p.status, 'proof_path', p.proof_path, 'note', p.note, 'at', p.created_at) order by p.created_at), '[]'::jsonb)
              from booking_payments p where p.booking_id = b.id),
    'settings', (select to_jsonb(s) from booking_settings s where s.id = 1))
  from bookings b where b.id = p_id;
$$;
revoke all on function public.email_booking_data(uuid) from public, anon, authenticated;

-- the email function claims a send (returns null if that email already went out)
create or replace function public.email_claim(p_booking uuid, p_kind text, p_to text, p_subject text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into booking_email_log (booking_id, kind, to_email, subject) values (p_booking, p_kind, p_to, p_subject)
  on conflict do nothing returning id into v_id;
  return v_id;
end $$;
create or replace function public.email_finish(p_id bigint, p_ok boolean, p_message_id text, p_error text default null)
returns void language sql security definer set search_path = public as $$
  update booking_email_log set ok = p_ok, message_id = p_message_id, error = p_error, sent_at = now() where id = p_id;
$$;
revoke all on function public.email_claim(uuid, text, text, text), public.email_finish(bigint, boolean, text, text) from public, anon, authenticated;

-- ---------- proof storage (private; guests upload through the upload-payment function) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;
drop policy if exists "staff read payment proofs" on storage.objects;
create policy "staff read payment proofs" on storage.objects for select to authenticated using (bucket_id = 'payment-proofs' and public.is_staff());
drop policy if exists "staff add payment proofs" on storage.objects;
create policy "staff add payment proofs" on storage.objects for insert to authenticated with check (bucket_id = 'payment-proofs' and public.is_staff());

-- ---------- what the Edge Functions (service role) may use ----------
grant execute on function public.submit_payment_proof(text, text, text, text), public.my_booking(text, text), public.booking_email_secret(),
  public.email_booking_data(uuid), public.email_claim(uuid, text, text, text), public.email_finish(bigint, boolean, text, text),
  public.expire_holds(), public.booking_payment_summary(uuid) to service_role;

-- Optional: expire holds even when nobody is on the site (run once, by hand):
-- select cron.schedule('zhostel-expire-holds', '*/5 * * * *', $$select public.expire_holds()$$);
