create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.store_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default 'Owner',
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists private.store_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references public.store_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists store_items_name_unique on public.store_items (lower(name));

create table if not exists public.store_entries (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null default current_date,
  item_id uuid references public.store_items(id) on delete set null,
  item_name text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit text not null default 'Piece',
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0 and paid_amount <= total_amount),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.store_request_token()
returns text language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb ->> 'x-store-session', ''),
    ''
  );
$$;

create or replace function public.store_session_valid()
returns boolean language sql stable security definer
set search_path = private, public, pg_temp
as $$
  select exists (
    select 1 from private.store_sessions s
    join public.store_users u on u.id = s.user_id
    where s.token_hash = encode(extensions.digest(public.store_request_token(), 'sha256'), 'hex')
      and s.expires_at > now() and u.active
  );
$$;

create or replace function public.store_login(input_password text)
returns jsonb language plpgsql security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  owner public.store_users%rowtype;
  raw_token text;
begin
  select * into owner from public.store_users where active order by created_at limit 1;
  if owner.id is null or owner.password_hash <> extensions.crypt(input_password, owner.password_hash) then
    return jsonb_build_object('authenticated', false);
  end if;
  delete from private.store_sessions where expires_at <= now();
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.store_sessions(token_hash, user_id, expires_at)
  values (encode(extensions.digest(raw_token, 'sha256'), 'hex'), owner.id, now() + interval '7 days');
  return jsonb_build_object('authenticated', true, 'session_token', raw_token, 'expires_in_seconds', 604800);
end;
$$;

create or replace function public.store_restore_session()
returns jsonb language sql security definer
set search_path = private, public, pg_temp
as $$
  select jsonb_build_object('authenticated', public.store_session_valid(), 'expires_in_seconds', 604800);
$$;

create or replace function public.store_logout()
returns boolean language plpgsql security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  delete from private.store_sessions
  where token_hash = encode(extensions.digest(public.store_request_token(), 'sha256'), 'hex');
  return true;
end;
$$;

alter table public.store_users enable row level security;
alter table private.store_sessions enable row level security;
alter table public.store_items enable row level security;
alter table public.store_entries enable row level security;

drop policy if exists store_items_session_all on public.store_items;
create policy store_items_session_all on public.store_items for all to anon, authenticated
using ((select public.store_session_valid()))
with check ((select public.store_session_valid()));

drop policy if exists store_entries_session_all on public.store_entries;
create policy store_entries_session_all on public.store_entries for all to anon, authenticated
using ((select public.store_session_valid()))
with check ((select public.store_session_valid()));

revoke all on public.store_users from public, anon, authenticated;
revoke all on private.store_sessions from public, anon, authenticated;
revoke all on function public.store_login(text), public.store_restore_session(), public.store_logout(), public.store_session_valid() from public;
grant select, insert, update, delete on public.store_items, public.store_entries to anon, authenticated;
grant execute on function public.store_login(text), public.store_restore_session(), public.store_logout(), public.store_session_valid() to anon, authenticated;

-- Initial owner login. Change the password below before running this file.
insert into public.store_users(display_name, password_hash)
select 'Owner', extensions.crypt('Maqsood123@', extensions.gen_salt('bf'))
where not exists (select 1 from public.store_users);
