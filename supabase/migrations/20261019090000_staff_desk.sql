-- =============================================================================
-- Staff desk v2 (Cloudbeds-style): housekeeping board + bed/room assignment
-- for website and staff bookings. Safe to run more than once.
-- =============================================================================

-- ---------- housekeeping: one row per physical room/bed (cb_rooms) ----------
create table if not exists public.room_housekeeping (
  room_id     text primary key references public.cb_rooms(room_id) on delete cascade,
  condition   text not null default 'clean' check (condition in ('clean','dirty','inspected')),
  assigned_to text,
  dnd         boolean not null default false,
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
alter table public.room_housekeeping enable row level security;
grant select, insert, update on public.room_housekeeping to authenticated;
drop policy if exists staff_all on public.room_housekeeping;
create policy staff_all on public.room_housekeeping for all to authenticated using (public.is_staff()) with check (public.is_staff());

create or replace function public.touch_housekeeping() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end $$;
drop trigger if exists trg_touch_housekeeping on public.room_housekeeping;
create trigger trg_touch_housekeeping before insert or update on public.room_housekeeping
  for each row execute function public.touch_housekeeping();

-- ---------- bed / room assignment for bookings made here (Cloudbeds ones use cb_rooms) ----------
alter table public.bookings add column if not exists assigned_rooms jsonb;   -- e.g. ["304 Bed A"]

-- staff_bookings: same as before + assigned_rooms
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
           b.cb_owned, b.cb_reservation_id, b.cb_status, b.cb_source, b.ota_ref, b.cb_rooms, b.cb_push_state, b.assigned_rooms,
           (select jsonb_agg(jsonb_build_object('room_type', i.room_type, 'rate_plan', i.rate_plan, 'units', i.units, 'amount', i.amount)) from booking_items i where i.booking_id = b.id) items,
           (select jsonb_agg(jsonb_build_object('slug', a.addon, 'name', a.name, 'qty', a.qty, 'amount', a.amount)) from booking_addons a where a.booking_id = b.id) addons,
           (select count(*) from booking_payments p where p.booking_id = b.id and p.status = 'pending') proofs_to_check
      from bookings b
     where b.checkout >= coalesce(p_from, (now() at time zone 'Asia/Manila')::date - 60) or b.created_at > now() - interval '60 days'
     order by b.created_at desc limit least(greatest(coalesce(p_limit, 3000), 1), 10000)) x), '[]'::jsonb);
end $$;
grant execute on function public.staff_bookings(date, int) to authenticated;

-- assign beds/rooms to a website/staff booking (logged like other changes)
create or replace function public.staff_assign_rooms(p_id uuid, p_rooms jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b bookings; v_old jsonb;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  select * into b from bookings where id = p_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.cb_owned then raise exception 'Cloudbeds bookings are assigned in Cloudbeds'; end if;
  if p_rooms is not null and jsonb_typeof(p_rooms) <> 'array' then raise exception 'Rooms must be a list'; end if;
  v_old := b.assigned_rooms;
  update bookings set assigned_rooms = case when p_rooms is null or jsonb_array_length(p_rooms) = 0 then null else p_rooms end where id = p_id;
  insert into booking_log (booking_id, actor, action, detail)
  values (p_id, coalesce(auth.jwt() ->> 'email', 'staff'), 'assigned',
          jsonb_build_object('changes', jsonb_build_array(jsonb_build_object('field', 'beds / rooms',
            'before', coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(v_old) x), ''),
            'after',  coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(p_rooms) x), '')))));
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.staff_assign_rooms(uuid, jsonb) to authenticated;
