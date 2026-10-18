-- =====================================================================
-- Cloudbeds <-> website sync (prepared; switched off until the API key is set)
-- Same design as the Virgin Beach sync: Cloudbeds stays the master for
-- inventory. An Edge Function (supabase/functions/cloudbeds-sync) pulls
-- reservations every few minutes + on Cloudbeds webhooks, and (once
-- push_enabled) sends website bookings into Cloudbeds.
--
-- inventory_mode:
--   'allotment' (now)  website sells its own pool (room_types.web_allotment);
--                      Cloudbeds reservations are stored but don't use the pool.
--   'shared'  (later)  website availability = all physical beds/rooms
--                      (room_types.total_units) minus EVERY booking, Cloudbeds
--                      included. Turn on only after the sync has run cleanly.
-- =====================================================================

alter table public.booking_settings add column if not exists inventory_mode text not null default 'allotment'
  check (inventory_mode in ('allotment','shared'));

alter table public.room_types add column if not exists cb_room_type_id text;
alter table public.room_types add column if not exists cb_name text;
alter table public.room_types add column if not exists total_units int;   -- physical beds/rooms, filled by setup from Cloudbeds

update public.room_types set cb_name = v.cb from (values
  ('private','Private Room Standard'), ('social-private','Social Fun Floor - Private Room'),
  ('private-bunk','Private Room Bunk Bed'), ('social-private-bunk','Social Private Bunk Bed'),
  ('dorm-4','4 Bed Mixed Dorm'), ('social-dorm-4','Social Fun Floor Dorm - 4MD'),
  ('dorm-6','6 Bed Mixed Dorm'), ('social-dorm-6','Social Fun Floor Dorm - 6MD'),
  ('dorm-6f','6 Bed Female Dorm'), ('dorm-8','8 Bed Mixed Dorm')) v(slug, cb)
where room_types.slug = v.slug and room_types.cb_name is null;

-- bookings that came from (or were sent to) Cloudbeds
alter table public.bookings add column if not exists cb_reservation_id text unique;
alter table public.bookings add column if not exists cb_owned boolean not null default false;      -- true = made in Cloudbeds / an OTA
alter table public.bookings add column if not exists cb_status text;
alter table public.bookings add column if not exists cb_source text;                                -- Booking.com, Hostelworld, Walk-In…
alter table public.bookings add column if not exists cb_modified text;
alter table public.bookings add column if not exists cb_push_state text check (cb_push_state in ('waiting','sending','done','error'));
alter table public.bookings add column if not exists cb_push_error text;
alter table public.bookings add column if not exists ota_ref text;
alter table public.bookings add column if not exists cb_rooms jsonb;                                -- assigned beds/rooms, e.g. ["304 Bed A"]
alter table public.booking_items alter column rate_plan drop not null;
alter table public.bookings drop constraint if exists bookings_source_check;

-- physical rooms/beds as Cloudbeds knows them
create table if not exists public.cb_rooms (
  room_id        text primary key,
  room_name      text not null,
  cb_room_type_id text not null,
  cb_room_type_name text,
  room_type      text references public.room_types(slug),
  updated_at     timestamptz not null default now()
);

-- Cloudbeds room blocks (out of order, owner use…) — reduce shared inventory
create table if not exists public.cb_blocks (
  block_id   text primary key,
  type       text,
  reason     text,
  start_date date not null,
  end_date   date not null,
  rooms      text[] not null default '{}'
);

-- full history archive: every Cloudbeds reservation since 2015 (list data, no stays logic)
create table if not exists public.cb_history (
  reservation_id text primary key,
  date_created   timestamptz,
  date_modified  text,
  status         text,
  source         text,
  guest_name     text,
  guest_email    citext,
  guest_country  text,
  checkin        date,
  checkout       date,
  nights         int generated always as (checkout - checkin) stored,
  adults         int,
  children       int,
  room_types     text[],
  total          numeric(12,2),
  paid           numeric(12,2),
  balance        numeric(12,2),
  ota_ref        text,
  raw            jsonb,
  imported_at    timestamptz not null default now()
);
create index if not exists cb_history_checkin_idx on public.cb_history (checkin);
create index if not exists cb_history_email_idx on public.cb_history (guest_email);

create table if not exists public.cb_sync_state (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);
insert into public.cb_sync_state (key, value) values ('push_enabled', 'false'::jsonb) on conflict do nothing;

alter table public.cb_rooms enable row level security;
alter table public.cb_blocks enable row level security;
alter table public.cb_history enable row level security;
alter table public.cb_sync_state enable row level security;
grant select on public.cb_rooms, public.cb_blocks, public.cb_history, public.cb_sync_state to authenticated;
grant update on public.cb_sync_state to authenticated;
do $$ declare t text; begin
  foreach t in array array['cb_rooms','cb_blocks','cb_history','cb_sync_state'] loop
    execute format('drop policy if exists staff_read on public.%I', t);
    execute format('create policy staff_read on public.%I for select to authenticated using (public.is_staff())', t);
  end loop;
end $$;
drop policy if exists staff_update on public.cb_sync_state;
create policy staff_update on public.cb_sync_state for update to authenticated using (public.is_staff()) with check (public.is_staff() and key = 'push_enabled');

-- ---------- inventory now depends on the mode ----------
create or replace function public.allotment_for(p_room_type text, p_night date)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(
    (select units from allotment_overrides where room_type = p_room_type and night = p_night),
    case when (select inventory_mode from booking_settings where id = 1) = 'shared'
         then (select coalesce(total_units, web_allotment) from room_types where slug = p_room_type)
              - (select count(*)::int from cb_blocks k join cb_rooms r on r.room_id = any(k.rooms)
                 where r.room_type = p_room_type and p_night >= k.start_date and p_night < greatest(k.end_date, k.start_date + 1))
         else (select web_allotment from room_types where slug = p_room_type) end, 0);
$$;

create or replace function public.sold_for(p_room_type text, p_night date)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(n.units), 0)::int from booking_nights n join bookings b on b.id = n.booking_id
   where n.room_type = p_room_type and n.night = p_night and b.status in ('confirmed','checked_in')
     and (not b.cb_owned or (select inventory_mode from booking_settings where id = 1) = 'shared');
$$;

-- ---------- helpers the Edge Function calls (service role only) ----------
create or replace function public.cb_webhook_secret() returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cloudbeds_webhook_secret' limit 1;
$$;

create or replace function public.cb_state_set(p_key text, p_value jsonb) returns void language sql security definer set search_path = public as $$
  insert into cb_sync_state (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
$$;

create or replace function public.cb_push_enabled() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value::text = 'true' from cb_sync_state where key = 'push_enabled'), false);
$$;

create or replace function public.cb_known(p_ids text[]) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(cb_reservation_id, cb_modified), '{}'::jsonb) from bookings where cb_reservation_id = any(p_ids);
$$;

-- link Cloudbeds rooms/beds to our room types (by Cloudbeds room type name) and count physical units
create or replace function public.cb_set_rooms(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_types int;
begin
  for r in select * from jsonb_array_elements(p) loop
    insert into cb_rooms (room_id, room_name, cb_room_type_id, cb_room_type_name, room_type, updated_at)
    values (r->>'room_id', r->>'room_name', r->>'room_type_id', r->>'room_type_name',
            (select slug from room_types where lower(cb_name) = lower(r->>'room_type_name') or cb_room_type_id = r->>'room_type_id' limit 1), now())
    on conflict (room_id) do update set room_name = excluded.room_name, cb_room_type_id = excluded.cb_room_type_id,
      cb_room_type_name = excluded.cb_room_type_name, room_type = coalesce(excluded.room_type, cb_rooms.room_type), updated_at = now();
  end loop;
  update room_types t set cb_room_type_id = x.id from (
    select room_type, min(cb_room_type_id) id from cb_rooms where room_type is not null group by room_type) x where t.slug = x.room_type;
  update room_types t set total_units = x.n from (select room_type, count(*)::int n from cb_rooms where room_type is not null group by room_type) x where t.slug = x.room_type;
  get diagnostics v_types = row_count;
  return jsonb_build_object('rooms', jsonb_array_length(p), 'room_types_linked', v_types,
    'unmatched', (select coalesce(jsonb_agg(distinct cb_room_type_name), '[]'::jsonb) from cb_rooms where room_type is null));
end $$;

create or replace function public.cb_apply_blocks(p_from date, p_to date, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from cb_blocks where start_date < p_to and end_date >= p_from;
  insert into cb_blocks (block_id, type, reason, start_date, end_date, rooms)
  select b->>'block_id', b->>'type', b->>'reason', (b->>'start')::date, (b->>'end')::date,
         coalesce((select array_agg(x) from jsonb_array_elements_text(b->'rooms') x), '{}')
  from jsonb_array_elements(p) b
  on conflict (block_id) do update set type = excluded.type, reason = excluded.reason, start_date = excluded.start_date, end_date = excluded.end_date, rooms = excluded.rooms;
  return jsonb_build_object('blocks', jsonb_array_length(p));
end $$;

-- One Cloudbeds reservation (normalized by the Edge Function) -> bookings / items / nights
create or replace function public.cb_apply_reservation(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_status text; v_unit jsonb; v_type text; v_counts jsonb := '{}'::jsonb; k text; n int;
  v_in date := (p->>'start')::date; v_out date := (p->>'end')::date;
begin
  select id into v_id from bookings where cb_reservation_id = p->>'id';
  if p->>'status' = 'deleted' then
    if v_id is not null then update bookings set status = 'cancelled', cb_status = 'deleted' where id = v_id and cb_owned; end if;
    return jsonb_build_object('id', p->>'id', 'deleted', true);
  end if;
  v_status := case p->>'status' when 'checked_in' then 'checked_in' when 'checked_out' then 'checked_out'
                when 'canceled' then 'cancelled' when 'cancelled' then 'cancelled' when 'no_show' then 'no_show' else 'confirmed' end;
  if v_in is null or v_out is null or v_out <= v_in then return jsonb_build_object('id', p->>'id', 'skipped', 'no dates'); end if;

  if v_id is null then
    insert into bookings (code, cb_reservation_id, cb_owned, source, status, checkin, checkout, guest_name, guest_email, guest_phone, country,
                          total, rooms_total, amount_paid, payment_status, cb_status, cb_source, cb_modified, ota_ref, created_at)
    values ('CB-' || (p->>'id'), p->>'id', true, 'cloudbeds', v_status, v_in, v_out, coalesce(nullif(p->>'guest_name',''), 'Cloudbeds guest'),
            nullif(lower(p->>'guest_email'),'')::citext, p->>'guest_phone', p->>'country',
            coalesce((p->>'total')::numeric,0), coalesce((p->>'total')::numeric,0), coalesce((p->>'paid')::numeric,0),
            case when coalesce((p->>'balance')::numeric,0) <= 0 and coalesce((p->>'total')::numeric,0) > 0 then 'paid'
                 when coalesce((p->>'paid')::numeric,0) > 0 then 'partial' else 'unpaid' end,
            p->>'status', p->>'source', p->>'modified', p->>'ota_ref', coalesce((p->>'created')::timestamptz, now()))
    returning id into v_id;
  else
    update bookings set
      status = case when cb_owned then v_status else status end,   -- website bookings keep their own status
      checkin = case when cb_owned then v_in else checkin end,
      checkout = case when cb_owned then v_out else checkout end,
      guest_name = case when cb_owned then coalesce(nullif(p->>'guest_name',''), guest_name) else guest_name end,
      guest_email = coalesce(guest_email, nullif(lower(p->>'guest_email'),'')::citext),
      guest_phone = coalesce(guest_phone, p->>'guest_phone'),
      total = case when cb_owned then coalesce((p->>'total')::numeric, total) else total end,
      amount_paid = case when cb_owned then coalesce((p->>'paid')::numeric, amount_paid) else amount_paid end,
      payment_status = case when not cb_owned then payment_status
                            when coalesce((p->>'balance')::numeric,0) <= 0 and coalesce((p->>'total')::numeric,0) > 0 then 'paid'
                            when coalesce((p->>'paid')::numeric,0) > 0 then 'partial' else 'unpaid' end,
      cb_status = p->>'status', cb_source = p->>'source', cb_modified = p->>'modified', ota_ref = coalesce(p->>'ota_ref', ota_ref)
    where id = v_id;
  end if;

  -- beds/rooms: count units per our room type (assigned + unassigned)
  for v_unit in select * from jsonb_array_elements(coalesce(p->'rooms','[]'::jsonb) || coalesce(p->'unassigned','[]'::jsonb)) loop
    select slug into v_type from room_types where cb_room_type_id = v_unit->>'room_type_id' or lower(cb_name) = lower(v_unit->>'room_type_name') limit 1;
    if v_type is not null then v_counts := jsonb_set(v_counts, array[v_type], to_jsonb(coalesce((v_counts->>v_type)::int,0) + 1)); end if;
  end loop;
  update bookings set cb_rooms = (select jsonb_agg(x->>'room_name') from jsonb_array_elements(coalesce(p->'rooms','[]'::jsonb)) x),
                      guests = greatest(coalesce((p->>'adults')::int,0) + coalesce((p->>'children')::int,0), 1)
   where id = v_id and cb_owned;
  if (select cb_owned from bookings where id = v_id) then
    delete from booking_items where booking_id = v_id;
    delete from booking_nights where booking_id = v_id;
    for k, n in select key, value::int from jsonb_each_text(v_counts) loop
      insert into booking_items (booking_id, room_type, rate_plan, units, amount) values (v_id, k, null, n, 0);
      insert into booking_nights (booking_id, room_type, night, units)
        select v_id, k, g::date, n from generate_series(v_in, v_out - 1, interval '1 day') g;
    end loop;
  end if;
  return jsonb_build_object('id', p->>'id', 'booking', v_id, 'types', v_counts);
end $$;

-- history archive rows (list data straight from getReservations)
create or replace function public.cb_apply_history(p jsonb) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into cb_history (reservation_id, date_created, date_modified, status, source, guest_name, guest_email, guest_country,
                          checkin, checkout, adults, children, room_types, total, paid, balance, ota_ref, raw)
  select r->>'reservationID', nullif(r->>'dateCreated','')::timestamptz, r->>'dateModified', r->>'status', coalesce(r->>'sourceName', r->>'source'),
         r->>'guestName', nullif(lower(r->>'guestEmail'),'')::citext, r->>'guestCountry',
         nullif(r->>'startDate','')::date, nullif(r->>'endDate','')::date,
         nullif(r->>'adults','')::int, nullif(r->>'children','')::int,
         (select array_agg(distinct x->>'roomTypeName') from jsonb_array_elements(coalesce(r->'rooms','[]'::jsonb)) x),
         nullif(r->>'total','')::numeric, nullif(r->>'paid','')::numeric, nullif(r->>'balance','')::numeric, r->>'thirdPartyIdentifier', r
  from jsonb_array_elements(p) r
  where r ? 'reservationID'
  on conflict (reservation_id) do update set date_modified = excluded.date_modified, status = excluded.status, total = excluded.total,
    paid = excluded.paid, balance = excluded.balance, raw = excluded.raw, imported_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- website bookings waiting to go to Cloudbeds (only when push is enabled)
create or replace function public.cb_pending_pushes() returns text[] language sql stable security definer set search_path = public as $$
  select case when cb_push_enabled() then coalesce(array_agg(id::text order by created_at), '{}') else '{}' end
  from bookings where not cb_owned and cb_reservation_id is null and status = 'confirmed' and checkout >= current_date
    and coalesce(cb_push_state, 'waiting') in ('waiting','error') and created_at > now() - interval '30 days';
$$;

create or replace function public.cb_claim_push(p_booking_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if not cb_push_enabled() then return null; end if;
  update bookings set cb_push_state = 'sending' where id = p_booking_id and not cb_owned and cb_reservation_id is null
    and coalesce(cb_push_state,'waiting') in ('waiting','error') returning * into b;
  if not found then return null; end if;
  return to_jsonb(b) || jsonb_build_object('items', (select jsonb_agg(jsonb_build_object('units', i.units, 'room_type', i.room_type,
            'cb_room_type_id', t.cb_room_type_id, 'kind', t.kind, 'name', t.name)) from booking_items i join room_types t on t.slug = i.room_type where i.booking_id = b.id));
end $$;

create or replace function public.cb_push_result(p_booking_id uuid, p_reservation_id text, p_error text) returns void language sql security definer set search_path = public as $$
  update bookings set cb_reservation_id = coalesce(p_reservation_id, cb_reservation_id),
    cb_push_state = case when p_reservation_id is not null then 'done' else 'error' end, cb_push_error = p_error
  where id = p_booking_id;
$$;

revoke all on function public.cb_webhook_secret(), public.cb_state_set(text,jsonb), public.cb_push_enabled(), public.cb_known(text[]),
  public.cb_set_rooms(jsonb), public.cb_apply_blocks(date,date,jsonb), public.cb_apply_reservation(jsonb), public.cb_apply_history(jsonb),
  public.cb_pending_pushes(), public.cb_claim_push(uuid), public.cb_push_result(uuid,text,text) from public, anon, authenticated;

-- a random shared secret for webhooks / scheduled calls, generated inside the database
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'cloudbeds_webhook_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'cloudbeds_webhook_secret');
  end if;
end $$;

-- ---------- schedule (pg_cron + pg_net). Safe now: without the API key the function just records an error. ----------
create extension if not exists pg_net;
create or replace function public.cb_call(p_body jsonb) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(url := 'https://zazmufcnqevovuzzgisy.supabase.co/functions/v1/cloudbeds-sync',
    body := p_body, headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret', public.cb_webhook_secret()),
    timeout_milliseconds := 120000);
end $$;
revoke all on function public.cb_call(jsonb) from public, anon, authenticated;

-- website booking created / cancelled -> tell Cloudbeds (the function ignores it while push is off)
create or replace function public.cb_booking_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cb_owned then return new; end if;
  if tg_op = 'INSERT' then perform cb_call(jsonb_build_object('action','push','booking_id',new.id));
  elsif new.status is distinct from old.status and new.cb_reservation_id is not null then perform cb_call(jsonb_build_object('action','status','booking_id',new.id));
  end if;
  return new;
exception when others then return new;   -- never block a booking because of the sync
end $$;
drop trigger if exists trg_cb_booking_changed on public.bookings;
create trigger trg_cb_booking_changed after insert or update of status on public.bookings for each row execute function public.cb_booking_changed();

-- Run AFTER the Edge Function is deployed and CLOUDBEDS_API_KEY is set (see README → Cloudbeds sync):
-- select cron.schedule('cloudbeds-pull', '*/5 * * * *', $$select public.cb_call('{"action":"pull"}'::jsonb)$$);
-- select cron.schedule('cloudbeds-full', '17 19 * * *', $$select public.cb_call('{"action":"full"}'::jsonb)$$);  -- 3:17 AM Manila
