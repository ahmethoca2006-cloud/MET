-- Fix "Cannot read properties of null (reading 'logo')" crash: a pending
-- invitee couldn't read the team row they were invited to, so the
-- team:teams(*) join in getPendingInvitesForMe() came back null.
-- Run this once in the Supabase SQL editor for this project.

create or replace function public.has_pending_invite(_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = _team_id and tm.invited_email = auth.jwt()->>'email' and tm.status = 'pending'
  );
$$;

drop policy if exists "teams_select_member_or_owner" on public.teams;
create policy "teams_select_member_or_owner" on public.teams
  for select to authenticated using (
    owner_id = auth.uid()
    or public.is_team_active_member(id)
    or public.has_pending_invite(id)
  );
