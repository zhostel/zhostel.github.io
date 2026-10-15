-- Anonymous booking-engine searches: which dates and room types people look for.
-- No personal data. Visitors can only add rows (through the function); staff read them.
create table if not exists public.booking_searches (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  checkin    date,
  checkout   date,
  guests     int,
  rooms      text[] not null default '{}',
  action     text not null default 'search' check (action in ('bar','search','checkout')),
  page       text,
  source     text
);
alter table public.booking_searches enable row level security;
create index if not exists booking_searches_created_idx on public.booking_searches (created_at desc);

create or replace function public.log_booking_search(
  p_checkin date, p_checkout date, p_guests int, p_rooms text[],
  p_page text default null, p_source text default null, p_action text default 'search')
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if p_checkin is not null and (p_checkin < current_date - 1 or p_checkin > current_date + 730) then return; end if;
  if p_checkout is not null and p_checkin is not null and (p_checkout <= p_checkin or p_checkout > p_checkin + 60) then return; end if;
  insert into booking_searches (checkin, checkout, guests, rooms, action, page, source)
  values (p_checkin, p_checkout, least(greatest(coalesce(p_guests,1),1),50),
          coalesce((select array_agg(left(r,60)) from (select unnest(p_rooms) r limit 10) t),'{}'),
          case when p_action in ('bar','search','checkout') then p_action else 'search' end,
          left(p_page,120), _clean_src(p_source));
end $$;
revoke all on function public.log_booking_search(date,date,int,text[],text,text,text) from public;
grant execute on function public.log_booking_search(date,date,int,text[],text,text,text) to anon, authenticated;

grant select on public.booking_searches to authenticated;
drop policy if exists staff_read on public.booking_searches;
create policy staff_read on public.booking_searches for select to authenticated using (public.is_staff());
