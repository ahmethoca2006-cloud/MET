-- Teams stage 2: let an active leader invite/remove members too (not just the owner).
-- Run this once in the Supabase SQL editor for this project.

drop policy if exists "team_members_insert_owner_only" on public.team_members;
drop policy if exists "team_members_insert_owner_or_leader" on public.team_members;
create policy "team_members_insert_owner_or_leader" on public.team_members
  for insert to authenticated with check (
    exists (select 1 from public.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id and tm.user_id = auth.uid() and tm.status = 'active' and tm.role = 'leader'
    )
  );

drop policy if exists "team_members_delete" on public.team_members;
create policy "team_members_delete" on public.team_members
  for delete to authenticated using (
    invited_email = auth.jwt()->>'email'
    or exists (select 1 from public.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id and tm.user_id = auth.uid() and tm.status = 'active' and tm.role = 'leader'
    )
  );
