-- Version 21: personal udhar khata shared with Simple and Admin apps.
-- This migration is additive. It does not change purchase history or the existing store ledger.

create table if not exists public.personal_khata_entries (
  id uuid primary key default gen_random_uuid(),
  person_name text not null check (char_length(trim(person_name)) > 0),
  entry_type text not null check (entry_type in ('borrowed', 'returned')),
  amount numeric(14,2) not null check (amount > 0),
  note text not null default '',
  entry_at timestamptz not null default now(),
  created_by text not null default 'Admin',
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_khata_entries_entry_at_idx on public.personal_khata_entries(entry_at desc);
create index if not exists personal_khata_entries_person_name_idx on public.personal_khata_entries(person_name);

alter table public.personal_khata_entries enable row level security;

drop policy if exists personal_khata_read_session on public.personal_khata_entries;
drop policy if exists personal_khata_admin_write on public.personal_khata_entries;
create policy personal_khata_read_session on public.personal_khata_entries
  for select to anon, authenticated
  using ((select public.store_session_valid()));
create policy personal_khata_admin_write on public.personal_khata_entries
  for all to anon, authenticated
  using ((select public.store_session_admin()))
  with check ((select public.store_session_admin()));

revoke all on public.personal_khata_entries from public, anon, authenticated;
grant select, insert, update, delete on public.personal_khata_entries to anon, authenticated;
