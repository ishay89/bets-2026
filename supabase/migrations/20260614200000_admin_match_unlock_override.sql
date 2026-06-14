-- Admin manual unlock override for matches.
--
-- Matches normally lock 5 minutes before kickoff (the time lock) or when an
-- admin manually locks them. This adds matches.unlock_override so an admin can
-- force a match to stay open for predictions even inside the 5-minute window.
--
-- Precedence: a manual lock always wins (locked = true => locked). Otherwise an
-- unlock override beats the time lock (unlock_override = true => open). With
-- neither flag set, the usual time-based lock applies.

alter table public.matches
  add column if not exists unlock_override boolean not null default false;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Lazy time-lock persistence must skip overridden matches so the deadline
--    sweep never re-locks a match the admin has forced open.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.persist_due_match_locks()
returns integer
language sql
security invoker
set search_path = public
as $$
  with locked_matches as (
    update public.matches
    set locked = true
    where locked = false
      and unlock_override = false
      and result is null
      and now() >= kickoff_time - interval '5 minutes'
    returning id
  )
  select count(*)::integer from locked_matches;
$$;

revoke all on function public.persist_due_match_locks() from public;
revoke all on function public.persist_due_match_locks() from anon;
revoke all on function public.persist_due_match_locks() from authenticated;
grant execute on function public.persist_due_match_locks() to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 1b. Bulk lock/unlock of a day's unscored bets. Matches: locking clears any
--     override; unlocking forces matches already inside the time window open
--     while leaving matches before the window to auto-lock normally. Pikanteria
--     lock purely on the manual flag, so they simply follow p_locked.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.set_unscored_match_locks_for_day(
  p_match_day_id uuid,
  p_locked boolean
)
returns integer
language sql
security invoker
set search_path = public
as $$
  with updated_matches as (
    update public.matches
    set locked = p_locked,
        unlock_override = case
          when p_locked then false
          else now() >= kickoff_time - interval '5 minutes'
        end
    where match_day_id = p_match_day_id
      and result is null
    returning id
  ),
  updated_pikanteria as (
    update public.pikanteria
    set locked = p_locked
    where match_day_id = p_match_day_id
      and result is null
    returning id
  )
  select (select count(*) from updated_matches)::integer
       + (select count(*) from updated_pikanteria)::integer;
$$;

revoke all on function public.set_unscored_match_locks_for_day(uuid, boolean) from public;
revoke all on function public.set_unscored_match_locks_for_day(uuid, boolean) from anon;
revoke all on function public.set_unscored_match_locks_for_day(uuid, boolean) from authenticated;
grant execute on function public.set_unscored_match_locks_for_day(uuid, boolean) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Atomic match prediction save respects the override.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.save_match_prediction(
  p_match_id uuid,
  p_pick text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_match record;
  v_existing record;
  v_record_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'status', 'error', 'record_id', null, 'message', 'Unauthorized');
  end if;

  if p_pick not in ('1', 'X', '2') then
    return jsonb_build_object('ok', false, 'status', 'invalid', 'record_id', null, 'message', 'Invalid match pick');
  end if;

  select
    m.id,
    m.match_day_id,
    m.home_team,
    m.away_team,
    m.kickoff_time,
    m.odds_home,
    m.odds_draw,
    m.odds_away,
    m.result,
    m.locked as match_locked,
    m.unlock_override as unlock_override,
    md.date,
    md.stage
  into v_match
  from public.matches m
  join public.match_days md on md.id = m.match_day_id
  where m.id = p_match_id
    and m.published_at is not null
    and md.published_at is not null;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'not_found', 'record_id', null, 'message', 'Match not found');
  end if;

  if v_match.result is not null
    or v_match.match_locked
    or (v_now >= v_match.kickoff_time - interval '5 minutes' and not v_match.unlock_override)
  then
    if not v_match.match_locked
      and not v_match.unlock_override
      and (v_match.result is not null or v_now >= v_match.kickoff_time - interval '5 minutes')
    then
      update public.matches
      set locked = true
      where id = p_match_id
        and locked = false;
    end if;

    return jsonb_build_object('ok', false, 'status', 'locked', 'record_id', null, 'message', 'Match is locked');
  end if;

  select id, pick
  into v_existing
  from public.predictions
  where user_id = v_user_id
    and match_id = p_match_id
  for update;

  if found then
    v_record_id := v_existing.id;

    if v_existing.pick = p_pick then
      return jsonb_build_object('ok', true, 'status', 'unchanged', 'record_id', v_record_id, 'message', null);
    end if;

    update public.predictions
    set pick = p_pick,
        points = null
    where id = v_existing.id
    returning id into v_record_id;

    insert into public.user_prediction_audit_events (
      user_id, event_type, action, entity_id, entity_ref, old_value, new_value, metadata
    ) values (
      v_user_id,
      'match_prediction',
      'update',
      v_record_id,
      p_match_id::text,
      jsonb_build_object('pick', v_existing.pick),
      jsonb_build_object('pick', p_pick),
      jsonb_build_object(
        'match_id', v_match.id,
        'match_day_id', v_match.match_day_id,
        'date', v_match.date,
        'stage', v_match.stage,
        'home_team', v_match.home_team,
        'away_team', v_match.away_team,
        'kickoff_time', v_match.kickoff_time,
        'odds_home', v_match.odds_home,
        'odds_draw', v_match.odds_draw,
        'odds_away', v_match.odds_away
      )
    );

    return jsonb_build_object('ok', true, 'status', 'updated', 'record_id', v_record_id, 'message', null);
  end if;

  insert into public.predictions (user_id, match_id, pick)
  values (v_user_id, p_match_id, p_pick)
  on conflict (user_id, match_id) do nothing
  returning id into v_record_id;

  if v_record_id is not null then
    insert into public.user_prediction_audit_events (
      user_id, event_type, action, entity_id, entity_ref, old_value, new_value, metadata
    ) values (
      v_user_id,
      'match_prediction',
      'create',
      v_record_id,
      p_match_id::text,
      null,
      jsonb_build_object('pick', p_pick),
      jsonb_build_object(
        'match_id', v_match.id,
        'match_day_id', v_match.match_day_id,
        'date', v_match.date,
        'stage', v_match.stage,
        'home_team', v_match.home_team,
        'away_team', v_match.away_team,
        'kickoff_time', v_match.kickoff_time,
        'odds_home', v_match.odds_home,
        'odds_draw', v_match.odds_draw,
        'odds_away', v_match.odds_away
      )
    );

    return jsonb_build_object('ok', true, 'status', 'created', 'record_id', v_record_id, 'message', null);
  end if;

  -- A concurrent first save inserted the unique (user_id, match_id) row before
  -- this transaction. Lock that row and apply the requested final pick.
  select id, pick
  into v_existing
  from public.predictions
  where user_id = v_user_id
    and match_id = p_match_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'error', 'record_id', null, 'message', 'Could not save prediction');
  end if;

  v_record_id := v_existing.id;

  if v_existing.pick = p_pick then
    return jsonb_build_object('ok', true, 'status', 'unchanged', 'record_id', v_record_id, 'message', null);
  end if;

  update public.predictions
  set pick = p_pick,
      points = null
  where id = v_existing.id
  returning id into v_record_id;

  insert into public.user_prediction_audit_events (
    user_id, event_type, action, entity_id, entity_ref, old_value, new_value, metadata
  ) values (
    v_user_id,
    'match_prediction',
    'update',
    v_record_id,
    p_match_id::text,
    jsonb_build_object('pick', v_existing.pick),
    jsonb_build_object('pick', p_pick),
    jsonb_build_object(
      'match_id', v_match.id,
      'match_day_id', v_match.match_day_id,
      'date', v_match.date,
      'stage', v_match.stage,
      'home_team', v_match.home_team,
      'away_team', v_match.away_team,
      'kickoff_time', v_match.kickoff_time,
      'odds_home', v_match.odds_home,
      'odds_draw', v_match.odds_draw,
      'odds_away', v_match.odds_away
    )
  );

  return jsonb_build_object('ok', true, 'status', 'updated', 'record_id', v_record_id, 'message', null);
end;
$$;

revoke all on function public.save_match_prediction(uuid, text) from public;
grant execute on function public.save_match_prediction(uuid, text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Crowd match picks reveal only after a match is effectively locked. An
--    overridden (force-open) match keeps picks hidden because it is still open.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.crowd_match_picks()
returns table (match_id uuid, pick text, cnt integer)
language sql
security invoker
set search_path = public
as $$
  select p.match_id, p.pick, count(*)::int
  from predictions p
  join matches m on m.id = p.match_id
  join match_days md on md.id = m.match_day_id
  where md.published_at is not null
    and (m.locked or (now() >= m.kickoff_time - interval '5 minutes' and not m.unlock_override))
  group by p.match_id, p.pick;
$$;

revoke all on function public.crowd_match_picks() from public;
grant execute on function public.crowd_match_picks() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Defense-in-depth RLS for direct Data API writes/reads respects the override.
-- ────────────────────────────────────────────────────────────────────────────
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
          and (m.locked or (now() >= m.kickoff_time - interval '5 minutes' and not m.unlock_override))
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
        and (m.unlock_override or now() < m.kickoff_time - interval '5 minutes')
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
        and (m.unlock_override or now() < m.kickoff_time - interval '5 minutes')
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
        and (m.unlock_override or now() < m.kickoff_time - interval '5 minutes')
    )
  );
