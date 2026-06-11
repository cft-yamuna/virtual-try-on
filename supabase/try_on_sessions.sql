create extension if not exists pgcrypto;

create table if not exists public.try_on_sessions (
  id uuid primary key default gen_random_uuid(),
  user_name text not null,
  gender text check (gender in ('male', 'female')),
  selected_jersey text check (selected_jersey in ('j1', 'j2')),
  captured_image_url text,
  result_image_url text not null,
  shared_result_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_try_on_sessions_updated_at on public.try_on_sessions;

create trigger set_try_on_sessions_updated_at
before update on public.try_on_sessions
for each row
execute function public.set_updated_at();

alter table public.try_on_sessions enable row level security;

drop policy if exists "Allow public try-on session inserts" on public.try_on_sessions;
drop policy if exists "Allow public try-on session shared result updates" on public.try_on_sessions;

create policy "Allow public try-on session inserts"
on public.try_on_sessions
for insert
to anon
with check (true);

create policy "Allow public try-on session shared result updates"
on public.try_on_sessions
for update
to anon
using (true)
with check (true);
