-- Mondial Bets 2026 - Independent bet lock controls
--
-- Match predictions lock per match. Pikanteria questions lock independently.
-- The legacy match_days.locked column remains for compatibility but is no
-- longer part of active locking behavior.

alter table public.pikanteria
  add column if not exists locked boolean not null default false;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Match predictions
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.save_match_prediction(
  p_match_id uuid,
  p_pick text
) returns jsonb
language plpgsql
security definer
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
    or v_now >= v_match.kickoff_time - interval '5 minutes'
  then
    if not v_match.match_locked
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
-- 2. Pikanteria answers
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.save_pikanteria_answer(
  p_pikanteria_id uuid,
  p_option_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_item record;
  v_option record;
  v_existing record;
  v_record_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'status', 'error', 'record_id', null, 'message', 'Unauthorized');
  end if;

  select
    pk.id,
    pk.question,
    pk.match_day_id,
    md.date,
    md.stage,
    pk.locked as pikanteria_locked
  into v_item
  from public.pikanteria pk
  join public.match_days md on md.id = pk.match_day_id
  where pk.id = p_pikanteria_id
    and pk.published_at is not null
    and md.published_at is not null;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'not_found', 'record_id', null, 'message', 'Pikanteria question not found');
  end if;

  select id, label, odds
  into v_option
  from public.pikanteria_options
  where id = p_option_id
    and pikanteria_id = p_pikanteria_id;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'invalid', 'record_id', null, 'message', 'Pikanteria option not found');
  end if;

  if v_item.pikanteria_locked then
    return jsonb_build_object('ok', false, 'status', 'locked', 'record_id', null, 'message', 'Pikanteria answers are locked');
  end if;

  select a.id, a.option_id, po.label, po.odds
  into v_existing
  from public.pikanteria_answers a
  left join public.pikanteria_options po on po.id = a.option_id
  where a.user_id = v_user_id
    and a.pikanteria_id = p_pikanteria_id
  for update of a;

  if found then
    v_record_id := v_existing.id;

    if v_existing.option_id = p_option_id then
      return jsonb_build_object('ok', true, 'status', 'unchanged', 'record_id', v_record_id, 'message', null);
    end if;

    update public.pikanteria_answers
    set option_id = p_option_id,
        points = null
    where id = v_existing.id
    returning id into v_record_id;

    insert into public.user_prediction_audit_events (
      user_id, event_type, action, entity_id, entity_ref, old_value, new_value, metadata
    ) values (
      v_user_id,
      'pikanteria_answer',
      'update',
      v_record_id,
      p_pikanteria_id::text,
      jsonb_build_object('option_id', v_existing.option_id, 'label', v_existing.label, 'odds', v_existing.odds),
      jsonb_build_object('option_id', v_option.id, 'label', v_option.label, 'odds', v_option.odds),
      jsonb_build_object(
        'pikanteria_id', v_item.id,
        'question', v_item.question,
        'match_day_id', v_item.match_day_id,
        'date', v_item.date,
        'stage', v_item.stage
      )
    );

    return jsonb_build_object('ok', true, 'status', 'updated', 'record_id', v_record_id, 'message', null);
  end if;

  insert into public.pikanteria_answers (user_id, pikanteria_id, option_id)
  values (v_user_id, p_pikanteria_id, p_option_id)
  on conflict (user_id, pikanteria_id) do nothing
  returning id into v_record_id;

  if v_record_id is not null then
    insert into public.user_prediction_audit_events (
      user_id, event_type, action, entity_id, entity_ref, old_value, new_value, metadata
    ) values (
      v_user_id,
      'pikanteria_answer',
      'create',
      v_record_id,
      p_pikanteria_id::text,
      null,
      jsonb_build_object('option_id', v_option.id, 'label', v_option.label, 'odds', v_option.odds),
      jsonb_build_object(
        'pikanteria_id', v_item.id,
        'question', v_item.question,
        'match_day_id', v_item.match_day_id,
        'date', v_item.date,
        'stage', v_item.stage
      )
    );

    return jsonb_build_object('ok', true, 'status', 'created', 'record_id', v_record_id, 'message', null);
  end if;

  select a.id, a.option_id, po.label, po.odds
  into v_existing
  from public.pikanteria_answers a
  left join public.pikanteria_options po on po.id = a.option_id
  where a.user_id = v_user_id
    and a.pikanteria_id = p_pikanteria_id
  for update of a;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'error', 'record_id', null, 'message', 'Could not save pikanteria answer');
  end if;

  v_record_id := v_existing.id;

  if v_existing.option_id = p_option_id then
    return jsonb_build_object('ok', true, 'status', 'unchanged', 'record_id', v_record_id, 'message', null);
  end if;

  update public.pikanteria_answers
  set option_id = p_option_id,
      points = null
  where id = v_existing.id
  returning id into v_record_id;

  insert into public.user_prediction_audit_events (
    user_id, event_type, action, entity_id, entity_ref, old_value, new_value, metadata
  ) values (
    v_user_id,
    'pikanteria_answer',
    'update',
    v_record_id,
    p_pikanteria_id::text,
    jsonb_build_object('option_id', v_existing.option_id, 'label', v_existing.label, 'odds', v_existing.odds),
    jsonb_build_object('option_id', v_option.id, 'label', v_option.label, 'odds', v_option.odds),
    jsonb_build_object(
      'pikanteria_id', v_item.id,
      'question', v_item.question,
      'match_day_id', v_item.match_day_id,
      'date', v_item.date,
      'stage', v_item.stage
    )
  );

  return jsonb_build_object('ok', true, 'status', 'updated', 'record_id', v_record_id, 'message', null);
end;
$$;

revoke all on function public.save_pikanteria_answer(uuid, uuid) from public;
grant execute on function public.save_pikanteria_answer(uuid, uuid) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Defense in depth for direct table writes through the Data API
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists "predictions_write_own_unlocked" on public.predictions;
drop policy if exists "predictions_update_own_unlocked" on public.predictions;

create policy "predictions_write_own_unlocked"
  on public.predictions
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
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

create policy "predictions_update_own_unlocked"
  on public.predictions
  for update
  to authenticated
  using (
    auth.uid() = user_id
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
    auth.uid() = user_id
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

drop policy if exists "pik_answers_write_own_unlocked" on public.pikanteria_answers;
drop policy if exists "pik_answers_update_own_unlocked" on public.pikanteria_answers;

create policy "pik_answers_write_own_unlocked"
  on public.pikanteria_answers
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.pikanteria pk
      join public.match_days md on md.id = pk.match_day_id
      where pk.id = pikanteria_answers.pikanteria_id
        and pk.published_at is not null
        and md.published_at is not null
        and not pk.locked
    )
    and exists (
      select 1
      from public.pikanteria_options po
      where po.id = pikanteria_answers.option_id
        and po.pikanteria_id = pikanteria_answers.pikanteria_id
    )
  );

create policy "pik_answers_update_own_unlocked"
  on public.pikanteria_answers
  for update
  to authenticated
  using (
    auth.uid() = user_id
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
    auth.uid() = user_id
    and exists (
      select 1
      from public.pikanteria pk
      join public.match_days md on md.id = pk.match_day_id
      where pk.id = pikanteria_answers.pikanteria_id
        and pk.published_at is not null
        and md.published_at is not null
        and not pk.locked
    )
    and exists (
      select 1
      from public.pikanteria_options po
      where po.id = pikanteria_answers.option_id
        and po.pikanteria_id = pikanteria_answers.pikanteria_id
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Aggregate crowd picks and raw-row read visibility
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.crowd_match_picks()
returns table (match_id uuid, pick text, cnt integer)
language sql
security definer
set search_path = public
as $$
  select p.match_id, p.pick, count(*)::int
  from predictions p
  join matches m on m.id = p.match_id
  join match_days md on md.id = m.match_day_id
  where md.published_at is not null
    and (m.locked or now() >= m.kickoff_time - interval '5 minutes')
  group by p.match_id, p.pick;
$$;

revoke all on function public.crowd_match_picks() from public;
grant execute on function public.crowd_match_picks() to authenticated;

create or replace function public.crowd_pikanteria_picks()
returns table (pikanteria_id uuid, option_id uuid, cnt integer)
language sql
security definer
set search_path = public
as $$
  select a.pikanteria_id, a.option_id, count(*)::int
  from pikanteria_answers a
  join pikanteria pk on pk.id = a.pikanteria_id
  where pk.published_at is not null
    and pk.locked
  group by a.pikanteria_id, a.option_id;
$$;

revoke all on function public.crowd_pikanteria_picks() from public;
grant execute on function public.crowd_pikanteria_picks() to authenticated;

drop policy if exists "predictions_read_own_or_locked" on public.predictions;
create policy "predictions_read_own_or_locked" on public.predictions for select using (
  auth.uid() = user_id
  or exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
  or exists (
    select 1 from public.matches m
    where m.id = predictions.match_id
      and (m.locked or now() >= m.kickoff_time - interval '5 minutes')
  )
);

drop policy if exists "pik_answers_read_own_or_locked" on public.pikanteria_answers;
create policy "pik_answers_read_own_or_locked" on public.pikanteria_answers for select using (
  auth.uid() = user_id
  or exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
  or exists (
    select 1 from public.pikanteria pk
    where pk.id = pikanteria_answers.pikanteria_id
      and pk.locked
  )
);
