-- =====================================================================
-- Z Hostel website — core schema (project: zhostel-website)
-- Public visitors never read tables directly. They submit through
-- SECURITY DEFINER functions that validate input. Staff (allowlisted
-- emails, signed in with Supabase Auth magic link) read and update
-- through RLS policies.
-- =====================================================================

create extension if not exists citext;

-- ---------- staff allowlist ----------
create table if not exists public.staff (
  email      citext primary key,
  name       text,
  role       text not null default 'staff' check (role in ('owner','staff')),
  added_at   timestamptz not null default now()
);
alter table public.staff enable row level security;
insert into public.staff (email, name, role) values ('ai@zhostel.com', 'Z Hostel', 'owner')
  on conflict (email) do nothing;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
    where email = (auth.jwt() ->> 'email')::citext
  ) and coalesce((auth.jwt() ->> 'role') = 'authenticated', false);
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where email = (auth.jwt() ->> 'email')::citext and role = 'owner');
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

-- lets the login screen say "this email isn't on the staff list" before sending a link
create or replace function public.staff_can_login(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where email = lower(btrim(p_email))::citext);
$$;
grant execute on function public.staff_can_login(text) to anon, authenticated;

-- ---------- general inquiries (contact form) ----------
create table if not exists public.inquiries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('room','group','events','tours','careers','volunteer','other')),
  full_name   text not null,
  email       citext not null,
  phone       text,
  message     text not null,
  page        text,
  source      text,
  consent_at  timestamptz not null,
  status      text not null default 'new' check (status in ('new','in_progress','done','spam')),
  staff_note  text,
  updated_at  timestamptz not null default now()
);
alter table public.inquiries enable row level security;

-- ---------- partner / sponsor requests ----------
create table if not exists public.partner_requests (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  brand         text not null,
  full_name     text not null,
  email         citext not null,
  phone         text,
  website       text,
  categories    text[] not null default '{}',
  tier_interest text,
  events        text[] not null default '{}',
  message       text,
  source        text,
  consent_at    timestamptz not null,
  status        text not null default 'new' check (status in ('new','deck_sent','in_talks','won','lost','spam')),
  staff_note    text,
  updated_at    timestamptz not null default now()
);
alter table public.partner_requests enable row level security;

-- ---------- Z Street list + crowd survey ----------
-- One row per person per event. Name + email puts them on the list;
-- survey answers are optional and added in a second call.
create table if not exists public.zstreet_signups (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  event_slug       text not null,
  full_name        text not null,
  email            citext not null,
  phone            text,
  party_size       text check (party_size in ('Solo','1–2','3–5','6+')),
  answers          jsonb not null default '{}'::jsonb,
  source           text,
  consent_at       timestamptz not null,
  marketing_opt_in boolean not null default false,
  unique (event_slug, email)
);
alter table public.zstreet_signups enable row level security;

-- ---------- simple abuse throttle ----------
create table if not exists public.submit_log (
  at     timestamptz not null default now(),
  kind   text not null,
  email  citext not null
);
alter table public.submit_log enable row level security;
create index if not exists submit_log_idx on public.submit_log (email, at);

create or replace function public._throttle(p_kind text, p_email citext)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from submit_log where at < now() - interval '1 day';
  if (select count(*) from submit_log where email = p_email and at > now() - interval '1 hour') >= 8 then
    raise exception 'Too many submissions. Please try again later.' using errcode = '22023';
  end if;
  insert into submit_log (kind, email) values (p_kind, p_email);
end $$;
revoke all on function public._throttle(text, citext) from public, anon, authenticated;

create or replace function public._clean_email(p text)
returns citext language plpgsql immutable as $$
declare v text := lower(btrim(coalesce(p,'')));
begin
  if v !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v) > 200 then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  return v::citext;
end $$;

create or replace function public._clean_src(p text)
returns text language sql immutable as $$
  select nullif(left(lower(regexp_replace(coalesce(p,''), '[^a-zA-Z0-9_.-]', '', 'g')), 60), '')
$$;

-- ---------- public submit functions ----------
create or replace function public.submit_inquiry(
  p_kind text, p_full_name text, p_email text, p_phone text, p_message text,
  p_consent boolean, p_page text default null, p_source text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_email citext := _clean_email(p_email); v_id uuid;
begin
  if not coalesce(p_consent,false) then raise exception 'Please agree to the privacy notice' using errcode='22023'; end if;
  if coalesce(btrim(p_full_name),'') = '' then raise exception 'Name is required' using errcode='22023'; end if;
  if coalesce(btrim(p_message),'') = '' then raise exception 'Please add a message' using errcode='22023'; end if;
  perform _throttle('inquiry', v_email);
  insert into inquiries (kind, full_name, email, phone, message, page, source, consent_at)
  values (case when p_kind in ('room','group','events','tours','careers','volunteer','other') then p_kind else 'other' end,
          left(btrim(p_full_name),120), v_email, left(nullif(btrim(p_phone),''),40),
          left(btrim(p_message),4000), left(p_page,200), _clean_src(p_source), now())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.submit_partner_request(
  p_brand text, p_full_name text, p_email text, p_phone text, p_website text,
  p_categories text[], p_tier text, p_events text[], p_message text,
  p_consent boolean, p_source text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_email citext := _clean_email(p_email); v_id uuid;
begin
  if not coalesce(p_consent,false) then raise exception 'Please agree to the privacy notice' using errcode='22023'; end if;
  if coalesce(btrim(p_brand),'') = '' then raise exception 'Brand / company is required' using errcode='22023'; end if;
  if coalesce(btrim(p_full_name),'') = '' then raise exception 'Name is required' using errcode='22023'; end if;
  perform _throttle('partner', v_email);
  insert into partner_requests (brand, full_name, email, phone, website, categories, tier_interest, events, message, source, consent_at)
  values (left(btrim(p_brand),120), left(btrim(p_full_name),120), v_email, left(nullif(btrim(p_phone),''),40),
          left(nullif(btrim(p_website),''),200),
          coalesce((select array_agg(left(c,40)) from (select unnest(p_categories) c limit 10) t),'{}'),
          left(nullif(btrim(p_tier),''),40),
          coalesce((select array_agg(left(e,60)) from (select unnest(p_events) e limit 10) t),'{}'),
          left(nullif(btrim(p_message),''),4000), _clean_src(p_source), now())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.zstreet_join(
  p_event_slug text, p_full_name text, p_email text, p_phone text, p_party_size text,
  p_consent boolean, p_marketing boolean default false, p_source text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_email citext := _clean_email(p_email); v_row zstreet_signups; v_returning boolean := false;
begin
  if not coalesce(p_consent,false) then raise exception 'Please agree to the privacy notice' using errcode='22023'; end if;
  if coalesce(btrim(p_full_name),'') = '' then raise exception 'Name is required' using errcode='22023'; end if;
  if p_event_slug !~ '^[a-z0-9-]{3,60}$' then raise exception 'Unknown event' using errcode='22023'; end if;
  perform _throttle('zstreet', v_email);
  select * into v_row from zstreet_signups where event_slug = p_event_slug and email = v_email;
  if found then
    v_returning := true;
    update zstreet_signups set
      full_name = left(btrim(p_full_name),120),
      phone = coalesce(left(nullif(btrim(p_phone),''),40), phone),
      party_size = coalesce(case when p_party_size in ('Solo','1–2','3–5','6+') then p_party_size end, party_size),
      marketing_opt_in = coalesce(p_marketing,false),
      updated_at = now()
    where id = v_row.id returning * into v_row;
  else
    insert into zstreet_signups (event_slug, full_name, email, phone, party_size, source, consent_at, marketing_opt_in)
    values (p_event_slug, left(btrim(p_full_name),120), v_email, left(nullif(btrim(p_phone),''),40),
            case when p_party_size in ('Solo','1–2','3–5','6+') then p_party_size end,
            _clean_src(p_source), now(), coalesce(p_marketing,false))
    returning * into v_row;
  end if;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'returning', v_returning, 'full_name', v_row.full_name);
end $$;

-- Survey answers: the id is an unguessable uuid returned only to the person who signed up.
create or replace function public.zstreet_answer(p_id uuid, p_answers jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_clean jsonb := '{}'::jsonb; k text; v jsonb;
begin
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'Bad answers' using errcode='22023'; end if;
  for k, v in select * from jsonb_each(p_answers) loop
    if k in ('drink','staying','payment','interests','age_bracket','heard_from','notes','events_interest') then
      if jsonb_typeof(v) = 'string' then v_clean := v_clean || jsonb_build_object(k, left(v #>> '{}', 1000));
      elsif jsonb_typeof(v) = 'array' then
        v_clean := v_clean || jsonb_build_object(k, (select coalesce(jsonb_agg(left(x,60)),'[]'::jsonb) from (select jsonb_array_elements_text(v) x limit 12) s));
      end if;
    end if;
  end loop;
  update zstreet_signups set answers = answers || v_clean, updated_at = now()
   where id = p_id and created_at > now() - interval '7 days';
  return jsonb_build_object('ok', found);
end $$;

revoke all on function public.submit_inquiry(text,text,text,text,text,boolean,text,text) from public;
revoke all on function public.submit_partner_request(text,text,text,text,text,text[],text,text[],text,boolean,text) from public;
revoke all on function public.zstreet_join(text,text,text,text,text,boolean,boolean,text) from public;
revoke all on function public.zstreet_answer(uuid,jsonb) from public;
grant execute on function public.submit_inquiry(text,text,text,text,text,boolean,text,text) to anon, authenticated;
grant execute on function public.submit_partner_request(text,text,text,text,text,text[],text,text[],text,boolean,text) to anon, authenticated;
grant execute on function public.zstreet_join(text,text,text,text,text,boolean,boolean,text) to anon, authenticated;
grant execute on function public.zstreet_answer(uuid,jsonb) to anon, authenticated;

-- ---------- staff access (RLS) ----------
grant usage on schema public to anon, authenticated;
grant select, update on public.inquiries, public.partner_requests, public.zstreet_signups to authenticated;
grant select on public.staff to authenticated;
grant insert, delete on public.staff to authenticated;

drop policy if exists staff_read on public.inquiries;
create policy staff_read on public.inquiries for select to authenticated using (public.is_staff());
drop policy if exists staff_update on public.inquiries;
create policy staff_update on public.inquiries for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists staff_read on public.partner_requests;
create policy staff_read on public.partner_requests for select to authenticated using (public.is_staff());
drop policy if exists staff_update on public.partner_requests;
create policy staff_update on public.partner_requests for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists staff_read on public.zstreet_signups;
create policy staff_read on public.zstreet_signups for select to authenticated using (public.is_staff());
drop policy if exists staff_update on public.zstreet_signups;
create policy staff_update on public.zstreet_signups for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select to authenticated using (public.is_staff());
drop policy if exists owner_insert on public.staff;
create policy owner_insert on public.staff for insert to authenticated
  with check (public.is_owner());
drop policy if exists owner_delete on public.staff;
create policy owner_delete on public.staff for delete to authenticated
  using (role <> 'owner' and public.is_owner());

-- ---------- data retention: survey rows older than 400 days lose personal data ----------
create or replace function public.purge_old_personal_data()
returns void language sql security definer set search_path = public as $$
  delete from zstreet_signups where created_at < now() - interval '400 days' and not marketing_opt_in;
  delete from inquiries where created_at < now() - interval '400 days';
$$;
revoke all on function public.purge_old_personal_data() from public, anon, authenticated;
