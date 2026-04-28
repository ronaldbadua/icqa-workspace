-- Database workspace records for document snippets, notes, and metadata.
-- Keeps the schema focused on the Database tab only.

create table if not exists public.database_entries (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',
  notes text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null default auth.uid() references auth.users(id) on delete set null
);

create index if not exists database_entries_updated_at_idx
  on public.database_entries (updated_at desc);

create index if not exists database_entries_data_gin_idx
  on public.database_entries
  using gin (data jsonb_path_ops);

alter table public.database_entries enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'database_entries'
      and policyname = 'database_entries_select_authenticated'
  ) then
    create policy database_entries_select_authenticated
      on public.database_entries
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'database_entries'
      and policyname = 'database_entries_insert_authenticated'
  ) then
    create policy database_entries_insert_authenticated
      on public.database_entries
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'database_entries'
      and policyname = 'database_entries_update_authenticated'
  ) then
    create policy database_entries_update_authenticated
      on public.database_entries
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'database_entries'
      and policyname = 'database_entries_delete_authenticated'
  ) then
    create policy database_entries_delete_authenticated
      on public.database_entries
      for delete
      to authenticated
      using (true);
  end if;
end $$;

drop trigger if exists set_database_entries_updated_at on public.database_entries;

create or replace function public.database_entries_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_database_entries_updated_at
before update on public.database_entries
for each row
execute function public.database_entries_set_updated_at();
