-- Syncs Telegram cloud-storage credentials (api id/hash, phone, session,
-- chat id) across a user's devices via Supabase instead of only localStorage.
-- Protected at rest by Postgres/Supabase and in transit via TLS, and gated by
-- RLS so only the owning user's session can ever read their own row.
-- Run this once in the Supabase SQL editor for this project.

create table if not exists public.telegram_credentials (
  id uuid primary key references public.profiles(id) on delete cascade,
  api_id text default '',
  api_hash text default '',
  phone text default '',
  session text default '',
  chat_id text default '',
  updated_at timestamptz not null default now()
);

alter table public.telegram_credentials enable row level security;

drop policy if exists "telegram_credentials_select_own" on public.telegram_credentials;
create policy "telegram_credentials_select_own" on public.telegram_credentials
  for select to authenticated using (id = auth.uid());

drop policy if exists "telegram_credentials_insert_own" on public.telegram_credentials;
create policy "telegram_credentials_insert_own" on public.telegram_credentials
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "telegram_credentials_update_own" on public.telegram_credentials;
create policy "telegram_credentials_update_own" on public.telegram_credentials
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "telegram_credentials_delete_own" on public.telegram_credentials;
create policy "telegram_credentials_delete_own" on public.telegram_credentials
  for delete to authenticated using (id = auth.uid());
