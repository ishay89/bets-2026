-- Mondial Bets 2026 — Collapse pikanteria into the match 1/X/2 model.
--
-- Pikanteria is no longer an N-option side bet. It is now structurally a match
-- without teams: a question with fixed outcomes 1 / X / 2, where X is optional
-- (two-way questions leave label_x / odds_x NULL and hide the X slot). The admin
-- enters a winning `result` exactly like matches.result, and answers are scored
-- on the plain result odds — no stage multiplier (that weighting is baked into
-- the odds when they are set). The futures bonuses are unaffected.
--
-- DESTRUCTIVE: this discards existing pikanteria questions, options, and answers.
-- It is safe pre-tournament; any authored pikanteria must be re-entered.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Schema: drop the options model, switch answers to a 1/X/2 pick, and give
--    pikanteria the match-style outcome columns + result.
-- ────────────────────────────────────────────────────────────────────────────

-- Old option-aware RPCs must go before the table they reference is dropped.
drop function if exists public.insert_pikanteria_with_options(uuid, text, jsonb);
drop function if exists public.update_pikanteria_with_options(uuid, text, jsonb);

-- Answers: option_id → pick. Truncate first so the NOT NULL pick column applies.
truncate table public.pikanteria_answers;
alter table public.pikanteria_answers drop column option_id;
alter table public.pikanteria_answers add column pick text not null check (pick in ('1', 'X', '2'));

drop table if exists public.pikanteria_options;

-- Pikanteria: clear the now-shapeless rows, then add the outcome columns.
delete from public.pikanteria;
alter table public.pikanteria
  add column label_1 text not null,
  add column odds_1  numeric(8,4) not null,
  add column label_2 text not null,
  add column odds_2  numeric(8,4) not null,
  add column label_x text,
  add column odds_x  numeric(8,4),
  add column result  text check (result in ('1', 'X', '2'));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. save_pikanteria_answer — now takes a 1/X/2 pick (mirrors save_match_prediction).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.save_pikanteria_answer(
  p_pikanteria_id uuid,
  p_pick text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item record;
  v_existing record;
  v_record_id uuid;
  v_new_label text;
  v_new_odds numeric;
  v_old_label text;
  v_old_odds numeric;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'status', 'error', 'record_id', null, 'message', 'Unauthorized');
  end if;

  if p_pick not in ('1', 'X', '2') then
    return jsonb_build_object('ok', false, 'status', 'invalid', 'record_id', null, 'message', 'Invalid pikanteria pick');
  end if;

  select
    pk.id, pk.question, pk.match_day_id, md.date, md.stage,
    pk.locked as pikanteria_locked,
    pk.label_1, pk.label_2, pk.label_x, pk.odds_1, pk.odds_2, pk.odds_x
  into v_item
  from public.pikanteria pk
  join public.match_days md on md.id = pk.match_day_id
  where pk.id = p_pikanteria_id
    and pk.published_at is not null
    and md.published_at is not null;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'not_found', 'record_id', null, 'message', 'Pikanteria question not found');
  end if;

  -- X only exists on three-way questions.
  if p_pick = 'X' and v_item.odds_x is null then
    return jsonb_build_object('ok', false, 'status', 'invalid', 'record_id', null, 'message', 'This question has no draw outcome');
  end if;

  v_new_label := case p_pick when '1' then v_item.label_1 when '2' then v_item.label_2 else v_item.label_x end;
  v_new_odds  := case p_pick when '1' then v_item.odds_1  when '2' then v_item.odds_2  else v_item.odds_x  end;

  if v_item.pikanteria_locked then
    return jsonb_build_object('ok', false, 'status', 'locked', 'record_id', null, 'message', 'Pikanteria answers are locked');
  end if;

  select a.id, a.pick
  into v_existing
  from public.pikanteria_answers a
  where a.user_id = v_user_id
    and a.pikanteria_id = p_pikanteria_id
  for update of a;

  if found then
    v_record_id := v_existing.id;

    if v_existing.pick = p_pick then
      return jsonb_build_object('ok', true, 'status', 'unchanged', 'record_id', v_record_id, 'message', null);
    end if;

    v_old_label := case v_existing.pick when '1' then v_item.label_1 when '2' then v_item.label_2 else v_item.label_x end;
    v_old_odds  := case v_existing.pick when '1' then v_item.odds_1  when '2' then v_item.odds_2  else v_item.odds_x  end;

    update public.pikanteria_answers
    set pick = p_pick, points = null
    where id = v_existing.id
    returning id into v_record_id;

    insert into public.user_prediction_audit_events (
      user_id, event_type, action, entity_id, entity_ref, old_value, new_value, metadata
    ) values (
      v_user_id, 'pikanteria_answer', 'update', v_record_id, p_pikanteria_id::text,
      jsonb_build_object('pick', v_existing.pick, 'label', v_old_label, 'odds', v_old_odds),
      jsonb_build_object('pick', p_pick, 'label', v_new_label, 'odds', v_new_odds),
      jsonb_build_object('pikanteria_id', v_item.id, 'question', v_item.question, 'match_day_id', v_item.match_day_id, 'date', v_item.date, 'stage', v_item.stage)
    );

    return jsonb_build_object('ok', true, 'status', 'updated', 'record_id', v_record_id, 'message', null);
  end if;

  insert into public.pikanteria_answers (user_id, pikanteria_id, pick)
  values (v_user_id, p_pikanteria_id, p_pick)
  on conflict (user_id, pikanteria_id) do nothing
  returning id into v_record_id;

  if v_record_id is not null then
    insert into public.user_prediction_audit_events (
      user_id, event_type, action, entity_id, entity_ref, old_value, new_value, metadata
    ) values (
      v_user_id, 'pikanteria_answer', 'create', v_record_id, p_pikanteria_id::text,
      null,
      jsonb_build_object('pick', p_pick, 'label', v_new_label, 'odds', v_new_odds),
      jsonb_build_object('pikanteria_id', v_item.id, 'question', v_item.question, 'match_day_id', v_item.match_day_id, 'date', v_item.date, 'stage', v_item.stage)
    );

    return jsonb_build_object('ok', true, 'status', 'created', 'record_id', v_record_id, 'message', null);
  end if;

  -- A concurrent first save inserted the unique (user_id, pikanteria_id) row.
  select a.id, a.pick
  into v_existing
  from public.pikanteria_answers a
  where a.user_id = v_user_id
    and a.pikanteria_id = p_pikanteria_id
  for update of a;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'error', 'record_id', null, 'message', 'Could not save pikanteria answer');
  end if;

  v_record_id := v_existing.id;

  if v_existing.pick = p_pick then
    return jsonb_build_object('ok', true, 'status', 'unchanged', 'record_id', v_record_id, 'message', null);
  end if;

  v_old_label := case v_existing.pick when '1' then v_item.label_1 when '2' then v_item.label_2 else v_item.label_x end;
  v_old_odds  := case v_existing.pick when '1' then v_item.odds_1  when '2' then v_item.odds_2  else v_item.odds_x  end;

  update public.pikanteria_answers
  set pick = p_pick, points = null
  where id = v_existing.id
  returning id into v_record_id;

  insert into public.user_prediction_audit_events (
    user_id, event_type, action, entity_id, entity_ref, old_value, new_value, metadata
  ) values (
    v_user_id, 'pikanteria_answer', 'update', v_record_id, p_pikanteria_id::text,
    jsonb_build_object('pick', v_existing.pick, 'label', v_old_label, 'odds', v_old_odds),
    jsonb_build_object('pick', p_pick, 'label', v_new_label, 'odds', v_new_odds),
    jsonb_build_object('pikanteria_id', v_item.id, 'question', v_item.question, 'match_day_id', v_item.match_day_id, 'date', v_item.date, 'stage', v_item.stage)
  );

  return jsonb_build_object('ok', true, 'status', 'updated', 'record_id', v_record_id, 'message', null);
end;
$$;

-- The old (uuid, uuid) overload is gone; drop it so only the (uuid, text) form remains.
drop function if exists public.save_pikanteria_answer(uuid, uuid);
revoke all on function public.save_pikanteria_answer(uuid, text) from public;
grant execute on function public.save_pikanteria_answer(uuid, text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. enter_match_day_results — pikanteria now resolves by setting result, the
--    same shape as matches. No stage multiplier; the caller passes plain odds.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.enter_match_day_results(
  p_match_day_id       uuid,
  p_match_results      jsonb,  -- [{"match_id": uuid, "result": "1"|"X"|"2"}]
  p_prediction_points  jsonb,  -- [{"id": uuid, "points": numeric}]
  p_pikanteria_results jsonb,  -- [{"pikanteria_id": uuid, "result": "1"|"X"|"2"}]
  p_answer_points      jsonb   -- [{"id": uuid, "points": numeric}]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.matches m
  set result = r.result
  from jsonb_to_recordset(p_match_results) as r(match_id uuid, result text)
  where m.id = r.match_id
    and m.match_day_id = p_match_day_id;

  update public.predictions p
  set points = pp.points
  from jsonb_to_recordset(p_prediction_points) as pp(id uuid, points numeric)
  where p.id = pp.id;

  update public.pikanteria pk
  set result = r.result
  from jsonb_to_recordset(p_pikanteria_results) as r(pikanteria_id uuid, result text)
  where pk.id = r.pikanteria_id
    and pk.match_day_id = p_match_day_id;

  update public.pikanteria_answers a
  set points = ap.points
  from jsonb_to_recordset(p_answer_points) as ap(id uuid, points numeric)
  where a.id = ap.id;

  if exists (
    select 1
    from public.predictions p
    join public.matches m on m.id = p.match_id
    where m.match_day_id = p_match_day_id
      and m.result is not null
      and p.points is null
  ) then
    raise exception
      'Scoring invariant violated: match day % has predictions with NULL points on scored matches',
      p_match_day_id;
  end if;

  if exists (
    select 1
    from public.pikanteria_answers a
    join public.pikanteria pk on pk.id = a.pikanteria_id
    where pk.match_day_id = p_match_day_id
      and pk.result is not null
      and a.points is null
  ) then
    raise exception
      'Scoring invariant violated: match day % has pikanteria answers with NULL points',
      p_match_day_id;
  end if;
end;
$$;

revoke all on function public.enter_match_day_results(uuid, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.enter_match_day_results(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. reset_pikanteria_result — atomic reset, mirroring reset_match_result.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.reset_pikanteria_result(
  p_pikanteria_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pikanteria
  set result = null
  where id = p_pikanteria_id;

  update public.pikanteria_answers
  set points = null
  where pikanteria_id = p_pikanteria_id;

  if exists (
    select 1 from public.pikanteria_answers
    where pikanteria_id = p_pikanteria_id and points is not null
  ) then
    raise exception
      'reset_pikanteria_result: answers for pikanteria % still have points after reset',
      p_pikanteria_id;
  end if;
end;
$$;

revoke all on function public.reset_pikanteria_result(uuid) from public;
grant execute on function public.reset_pikanteria_result(uuid) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. insert_pikanteria / update_pikanteria — author a question by its outcomes.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.insert_pikanteria(
  p_match_day_id uuid,
  p_question     text,
  p_label_1      text,
  p_odds_1       numeric,
  p_label_2      text,
  p_odds_2       numeric,
  p_label_x      text,
  p_odds_x       numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if (p_label_x is null) <> (p_odds_x is null) then
    raise exception 'The X outcome requires both a label and odds, or neither';
  end if;

  insert into public.pikanteria (match_day_id, question, label_1, odds_1, label_2, odds_2, label_x, odds_x)
  values (p_match_day_id, p_question, p_label_1, p_odds_1, p_label_2, p_odds_2, p_label_x, p_odds_x)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric) from public;
grant execute on function public.insert_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric) to service_role;

create or replace function public.update_pikanteria(
  p_pikanteria_id uuid,
  p_question      text,
  p_label_1       text,
  p_odds_1        numeric,
  p_label_2       text,
  p_odds_2        numeric,
  p_label_x       text,
  p_odds_x        numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (p_label_x is null) <> (p_odds_x is null) then
    raise exception 'The X outcome requires both a label and odds, or neither';
  end if;

  if not exists (select 1 from public.pikanteria where id = p_pikanteria_id) then
    raise exception 'Pikanteria % not found', p_pikanteria_id;
  end if;

  -- Removing the X outcome would orphan any answer that already picked it.
  if p_odds_x is null and exists (
    select 1 from public.pikanteria_answers a
    where a.pikanteria_id = p_pikanteria_id and a.pick = 'X'
  ) then
    raise exception 'Cannot remove the X outcome: it already has answers';
  end if;

  update public.pikanteria
  set question = p_question,
      label_1 = p_label_1, odds_1 = p_odds_1,
      label_2 = p_label_2, odds_2 = p_odds_2,
      label_x = p_label_x, odds_x = p_odds_x
  where id = p_pikanteria_id;
end;
$$;

revoke all on function public.update_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric) from public;
grant execute on function public.update_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. crowd_pikanteria_picks — aggregate by pick (revealed only once locked).
-- ────────────────────────────────────────────────────────────────────────────
drop function if exists public.crowd_pikanteria_picks();
create function public.crowd_pikanteria_picks()
returns table (pikanteria_id uuid, pick text, cnt integer)
language sql
security definer
set search_path = public
as $$
  select a.pikanteria_id, a.pick, count(*)::int
  from pikanteria_answers a
  join pikanteria pk on pk.id = a.pikanteria_id
  where pk.published_at is not null
    and pk.locked
  group by a.pikanteria_id, a.pick;
$$;

revoke all on function public.crowd_pikanteria_picks() from public;
grant execute on function public.crowd_pikanteria_picks() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Defense in depth: pikanteria_answers write policies validate the pick
--    against the question's outcomes instead of an options row.
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists "pik_answers_write_own_unlocked" on public.pikanteria_answers;
drop policy if exists "pik_answers_update_own_unlocked" on public.pikanteria_answers;

create policy "pik_answers_write_own_unlocked"
  on public.pikanteria_answers
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
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
