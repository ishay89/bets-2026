-- Align database RLS with the app-level approval contract. A signed-in user
-- must be approved before reading or writing game data through PostgREST.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_approved_user()
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
      and u.status = 'approved'
  );
$$;

revoke all on function private.is_approved_user() from public;
revoke all on function private.is_approved_user() from anon;
revoke all on function private.is_approved_user() from authenticated;
grant execute on function private.is_approved_user() to authenticated, service_role;

-- Profiles: a user can always see/create/update their own row so middleware and
-- onboarding still work. Approved users can see other approved profiles.
drop policy if exists "users_read_all" on public.users;
drop policy if exists "users_read_own_or_approved" on public.users;
create policy "users_read_own_or_approved"
  on public.users
  for select
  to authenticated
  using (
    auth.uid() = id
    or (status = 'approved' and private.is_approved_user())
  );

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
  on public.users
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Published game content is private to approved users.
drop policy if exists "match_days_read" on public.match_days;
create policy "match_days_read"
  on public.match_days
  for select
  to authenticated
  using (published_at is not null and private.is_approved_user());

drop policy if exists "matches_read" on public.matches;
create policy "matches_read"
  on public.matches
  for select
  to authenticated
  using (published_at is not null and private.is_approved_user());

drop policy if exists "pikanteria_read" on public.pikanteria;
create policy "pikanteria_read"
  on public.pikanteria
  for select
  to authenticated
  using (published_at is not null and private.is_approved_user());

-- Picks are private until item lock, and only approved users participate.
drop policy if exists "predictions_read_own_or_locked" on public.predictions;
create policy "predictions_read_own_or_locked"
  on public.predictions
  for select
  to authenticated
  using (
    private.is_approved_user()
    and (
      auth.uid() = user_id
      or exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
      or exists (
        select 1
        from public.matches m
        where m.id = predictions.match_id
          and (m.locked or now() >= m.kickoff_time - interval '5 minutes')
      )
    )
  );

drop policy if exists "predictions_write_own_unlocked" on public.predictions;
create policy "predictions_write_own_unlocked"
  on public.predictions
  for insert
  to authenticated
  with check (
    private.is_approved_user()
    and auth.uid() = user_id
    and exists (
      select 1
      from public.matches m
      join public.match_days md on md.id = m.match_day_id
      where m.id = predictions.match_id
        and m.published_at is not null
        and md.published_at is not null
        and m.result is null
        and not m.locked
        and now() < m.kickoff_time - interval '5 minutes'
    )
  );

drop policy if exists "predictions_update_own_unlocked" on public.predictions;
create policy "predictions_update_own_unlocked"
  on public.predictions
  for update
  to authenticated
  using (
    private.is_approved_user()
    and auth.uid() = user_id
    and exists (
      select 1
      from public.matches m
      join public.match_days md on md.id = m.match_day_id
      where m.id = predictions.match_id
        and m.published_at is not null
        and md.published_at is not null
        and m.result is null
        and not m.locked
        and now() < m.kickoff_time - interval '5 minutes'
    )
  )
  with check (
    private.is_approved_user()
    and auth.uid() = user_id
    and exists (
      select 1
      from public.matches m
      join public.match_days md on md.id = m.match_day_id
      where m.id = predictions.match_id
        and m.published_at is not null
        and md.published_at is not null
        and m.result is null
        and not m.locked
        and now() < m.kickoff_time - interval '5 minutes'
    )
  );

drop policy if exists "pik_answers_read_own_or_locked" on public.pikanteria_answers;
create policy "pik_answers_read_own_or_locked"
  on public.pikanteria_answers
  for select
  to authenticated
  using (
    private.is_approved_user()
    and (
      auth.uid() = user_id
      or exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
      or exists (
        select 1
        from public.pikanteria pk
        where pk.id = pikanteria_answers.pikanteria_id
          and pk.locked
      )
    )
  );

drop policy if exists "pik_answers_write_own_unlocked" on public.pikanteria_answers;
create policy "pik_answers_write_own_unlocked"
  on public.pikanteria_answers
  for insert
  to authenticated
  with check (
    private.is_approved_user()
    and auth.uid() = user_id
    and pikanteria_answers.pick in ('1', 'X', '2')
    and exists (
      select 1
      from public.pikanteria pk
      join public.match_days md on md.id = pk.match_day_id
      where pk.id = pikanteria_answers.pikanteria_id
        and pk.published_at is not null
        and md.published_at is not null
        and not pk.locked
        and (pikanteria_answers.pick <> 'X' or pk.odds_x is not null)
    )
  );

drop policy if exists "pik_answers_update_own_unlocked" on public.pikanteria_answers;
create policy "pik_answers_update_own_unlocked"
  on public.pikanteria_answers
  for update
  to authenticated
  using (
    private.is_approved_user()
    and auth.uid() = user_id
    and exists (
      select 1
      from public.pikanteria pk
      join public.match_days md on md.id = pk.match_day_id
      where pk.id = pikanteria_answers.pikanteria_id
        and pk.published_at is not null
        and md.published_at is not null
        and not pk.locked
    )
  )
  with check (
    private.is_approved_user()
    and auth.uid() = user_id
    and pikanteria_answers.pick in ('1', 'X', '2')
    and exists (
      select 1
      from public.pikanteria pk
      join public.match_days md on md.id = pk.match_day_id
      where pk.id = pikanteria_answers.pikanteria_id
        and pk.published_at is not null
        and md.published_at is not null
        and not pk.locked
        and (pikanteria_answers.pick <> 'X' or pk.odds_x is not null)
    )
  );

-- Futures and score-derived data are also private to approved users.
drop policy if exists "pretournament_read_all" on public.pre_tournament_picks;
create policy "pretournament_read_all"
  on public.pre_tournament_picks
  for select
  to authenticated
  using (private.is_approved_user());

drop policy if exists "pretournament_write_own" on public.pre_tournament_picks;
create policy "pretournament_write_own"
  on public.pre_tournament_picks
  for insert
  to authenticated
  with check (private.is_approved_user() and auth.uid() = user_id);

drop policy if exists "pretournament_update_own" on public.pre_tournament_picks;
create policy "pretournament_update_own"
  on public.pre_tournament_picks
  for update
  to authenticated
  using (private.is_approved_user() and auth.uid() = user_id)
  with check (private.is_approved_user() and auth.uid() = user_id);

drop policy if exists "score_snapshots_read_all" on public.score_snapshots;
create policy "score_snapshots_read_all"
  on public.score_snapshots
  for select
  to authenticated
  using (private.is_approved_user());

drop policy if exists "tournament_settings_read_authenticated" on public.tournament_settings;
create policy "tournament_settings_read_authenticated"
  on public.tournament_settings
  for select
  to authenticated
  using (private.is_approved_user());

-- Board and audit data are available only to approved users.
drop policy if exists "message_board_posts_read_authenticated" on public.message_board_posts;
create policy "message_board_posts_read_authenticated"
  on public.message_board_posts
  for select
  to authenticated
  using (private.is_approved_user());

drop policy if exists "message_board_posts_insert_own" on public.message_board_posts;
create policy "message_board_posts_insert_own"
  on public.message_board_posts
  for insert
  to authenticated
  with check (private.is_approved_user() and auth.uid() = user_id);

drop policy if exists "message_board_posts_delete_own_or_admin" on public.message_board_posts;
create policy "message_board_posts_delete_own_or_admin"
  on public.message_board_posts
  for delete
  to authenticated
  using (
    private.is_approved_user()
    and (
      auth.uid() = user_id
      or exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
    )
  );

drop policy if exists "ai_social_posts_read_authenticated" on public.ai_social_posts;
create policy "ai_social_posts_read_authenticated"
  on public.ai_social_posts
  for select
  to authenticated
  using (private.is_approved_user());

drop policy if exists "user_prediction_audit_events_insert_own" on public.user_prediction_audit_events;
create policy "user_prediction_audit_events_insert_own"
  on public.user_prediction_audit_events
  for insert
  to authenticated
  with check (private.is_approved_user() and auth.uid() = user_id);
