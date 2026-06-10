-- Restore admin visibility into all player profiles (active, pending, blocked).
--
-- 20260610052133_enforce_approved_user_rls.sql replaced "users_read_all" with
-- "users_read_own_or_approved", which only lets a signed-in user see their own
-- row plus *other* rows where status = 'approved'. Sibling policies added in
-- that same migration (predictions_read_own_or_locked,
-- pik_answers_read_own_or_locked, message_board_posts_delete_own_or_admin) all
-- carve out admins via an is_admin check, but the users policy itself was
-- missed. As a result /admin/players and /admin/players/[userId] could no
-- longer see pending or blocked accounts.

create or replace function private.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_admin
  );
$$;

revoke all on function private.is_admin_user() from public;
revoke all on function private.is_admin_user() from anon;
revoke all on function private.is_admin_user() from authenticated;
grant execute on function private.is_admin_user() to authenticated, service_role;

drop policy if exists "users_read_own_or_approved" on public.users;
create policy "users_read_own_or_approved"
  on public.users
  for select
  to authenticated
  using (
    auth.uid() = id
    or (status = 'approved' and private.is_approved_user())
    or private.is_admin_user()
  );
