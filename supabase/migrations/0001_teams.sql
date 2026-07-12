-- Teams stage 1: profiles, teams, team_members + RLS.
-- Run this once in the Supabase SQL editor for this project.
-- After running, manually set `is_admin = true` on your own row in `profiles`
-- (there is no in-app way to grant admin).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text default '',
  avatar text default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that already existed before this migration.
insert into public.profiles (id, email, name, avatar)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'name', ''), coalesce(u.raw_user_meta_data->>'avatar', '')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo text default '',
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- team_members (created before any RLS policy references it)
-- ---------------------------------------------------------------------------
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  invited_email text not null,
  role text not null default 'member',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint team_members_status_check check (status in ('pending', 'active')),
  constraint team_members_role_check check (role in ('member', 'leader'))
);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

drop policy if exists "teams_select_member_or_owner" on public.teams;
create policy "teams_select_member_or_owner" on public.teams
  for select to authenticated using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = teams.id and tm.user_id = auth.uid() and tm.status = 'active'
    )
  );

drop policy if exists "teams_insert_admin_only" on public.teams;
create policy "teams_insert_admin_only" on public.teams
  for insert to authenticated with check (
    owner_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "teams_update_owner" on public.teams;
create policy "teams_update_owner" on public.teams
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select" on public.team_members
  for select to authenticated using (
    user_id = auth.uid()
    or invited_email = auth.jwt()->>'email'
    or exists (select 1 from public.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
    or exists (
      select 1 from public.team_members tm2
      where tm2.team_id = team_members.team_id and tm2.user_id = auth.uid() and tm2.status = 'active'
    )
  );

drop policy if exists "team_members_insert_owner_only" on public.team_members;
create policy "team_members_insert_owner_only" on public.team_members
  for insert to authenticated with check (
    exists (select 1 from public.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
  );

drop policy if exists "team_members_update" on public.team_members;
create policy "team_members_update" on public.team_members
  for update to authenticated using (
    (invited_email = auth.jwt()->>'email' and status = 'pending')
    or exists (select 1 from public.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
  ) with check (
    (invited_email = auth.jwt()->>'email' and user_id = auth.uid())
    or exists (select 1 from public.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
  );

drop policy if exists "team_members_delete" on public.team_members;
create policy "team_members_delete" on public.team_members
  for delete to authenticated using (
    invited_email = auth.jwt()->>'email'
    or exists (select 1 from public.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
  );
