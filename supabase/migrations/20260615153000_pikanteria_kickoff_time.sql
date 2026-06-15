-- Mondial Bets 2026 — Pikanteria kickoff time & time-based locking
--
-- A pikanteria question is a bet on one of the day's games, so it should lock at
-- the same time that game does: 5 minutes before kickoff. This migration gives
-- pikanteria its own `kickoff_time` (inherited from a chosen match of the day),
-- locks it by time exactly like matches (lazy-persisted), and blocks publishing
-- a question that has no kickoff time.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Schema: nullable kickoff_time, backfill, and a publish guard.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.pikanteria
  add column if not exists kickoff_time timestamptz;

-- Backfill any existing rows from the earliest match of their match day so
-- already-published questions keep a sensible lock instead of never locking.
update public.pikanteria pk
set kickoff_time = sub.kickoff_time
from (
  select m.match_day_id, min(m.kickoff_time) as kickoff_time
  from public.matches m
  group by m.match_day_id
) sub
where pk.kickoff_time is null
  and pk.match_day_id = sub.match_day_id;

-- A published question must have a kickoff time (so it can lock). NOT VALID keeps
-- any legacy row that could not be backfilled from breaking the migration while
-- still enforcing the rule on every future insert/update.
alter table public.pikanteria
  drop constraint if exists pikanteria_published_requires_kickoff;
alter table public.pikanteria
  add constraint pikanteria_published_requires_kickoff
  check (published_at is null or kickoff_time is not null) not valid;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Lazy lock persistence, mirroring persist_due_match_locks.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.persist_due_pikanteria_locks()
returns integer
language sql
security invoker
set search_path = public
as $$
  with locked_pikanteria as (
    update public.pikanteria
    set locked = true
    where locked = false
      and result is null
      and kickoff_time is not null
      and now() >= kickoff_time - interval '5 minutes'
    returning id
  )
  select count(*)::integer from locked_pikanteria;
$$;

revoke all on function public.persist_due_pikanteria_locks() from public;
revoke all on function public.persist_due_pikanteria_locks() from anon;
revoke all on function public.persist_due_pikanteria_locks() from authenticated;
grant execute on function public.persist_due_pikanteria_locks() to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. insert_pikanteria / update_pikanteria — author the question with a kickoff.
--    The argument list changes, so drop the old 8-arg overloads first.
-- ────────────────────────────────────────────────────────────────────────────
drop function if exists public.insert_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric);
drop function if exists public.update_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric);

create function public.insert_pikanteria(
  p_match_day_id uuid,
  p_question     text,
  p_label_1      text,
  p_odds_1       numeric,
  p_label_2      text,
  p_odds_2       numeric,
  p_label_x      text,
  p_odds_x       numeric,
  p_kickoff_time timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_requested_date date;
  v_canonical_match_day_id uuid;
begin
  if (p_label_x is null) <> (p_odds_x is null) then
    raise exception 'The X outcome requires both a label and odds, or neither';
  end if;

  select md.date into v_requested_date
  from public.match_days md
  where md.id = p_match_day_id;

  if v_requested_date is null then
    raise exception 'Match day % not found', p_match_day_id;
  end if;

  -- Attach to the canonical match group for that calendar date (matches may have
  -- been regrouped to a different match_days row than the one submitted).
  select m.match_day_id into v_canonical_match_day_id
  from public.matches m
  join public.match_days md on md.id = m.match_day_id
  where md.date = v_requested_date
  order by m.kickoff_time, m.id
  limit 1;

  v_canonical_match_day_id := coalesce(v_canonical_match_day_id, p_match_day_id);

  insert into public.pikanteria (match_day_id, question, label_1, odds_1, label_2, odds_2, label_x, odds_x, kickoff_time)
  values (v_canonical_match_day_id, p_question, p_label_1, p_odds_1, p_label_2, p_odds_2, p_label_x, p_odds_x, p_kickoff_time)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric, timestamptz) from public;
grant execute on function public.insert_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric, timestamptz) to service_role;

create function public.update_pikanteria(
  p_pikanteria_id uuid,
  p_question      text,
  p_label_1       text,
  p_odds_1        numeric,
  p_label_2       text,
  p_odds_2        numeric,
  p_label_x       text,
  p_odds_x        numeric,
  p_kickoff_time  timestamptz
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
      label_x = p_label_x, odds_x = p_odds_x,
      kickoff_time = p_kickoff_time
  where id = p_pikanteria_id;
end;
$$;

revoke all on function public.update_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric, timestamptz) from public;
grant execute on function public.update_pikanteria(uuid, text, text, numeric, text, numeric, text, numeric, timestamptz) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. save_pikanteria_answer — reject (and lazily persist) the lock once the
--    question's kickoff time passes, mirroring save_match_prediction.
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
  v_now timestamptz := now();
  v_item record;
  v_existing record;
  v_record_id uuid;
  v_new_label text;
  v_new_odds numeric;
  v_old_label text;
  v_old_odds numeric;
  v_time_locked boolean;
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
    pk.kickoff_time,
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

  v_time_locked := v_item.kickoff_time is not null
    and v_now >= v_item.kickoff_time - interval '5 minutes';

  if v_item.pikanteria_locked or v_time_locked then
    -- Persist a due time-lock so crowd reveals and reads see it consistently.
    if not v_item.pikanteria_locked and v_time_locked then
      update public.pikanteria
      set locked = true
      where id = p_pikanteria_id
        and locked = false;
    end if;

    return jsonb_build_object('ok', false, 'status', 'locked', 'record_id', null, 'message', 'Pikanteria answers are locked');
  end if;

  v_new_label := case p_pick when '1' then v_item.label_1 when '2' then v_item.label_2 else v_item.label_x end;
  v_new_odds  := case p_pick when '1' then v_item.odds_1  when '2' then v_item.odds_2  else v_item.odds_x  end;

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

revoke all on function public.save_pikanteria_answer(uuid, text) from public;
grant execute on function public.save_pikanteria_answer(uuid, text) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. crowd_pikanteria_picks — reveal once locked OR the kickoff lock has passed.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.crowd_pikanteria_picks()
returns table (pikanteria_id uuid, pick text, cnt integer)
language sql
security definer
set search_path = public
as $$
  select a.pikanteria_id, a.pick, count(*)::int
  from pikanteria_answers a
  join pikanteria pk on pk.id = a.pikanteria_id
  where pk.published_at is not null
    and (
      pk.locked
      or (pk.kickoff_time is not null and now() >= pk.kickoff_time - interval '5 minutes')
    )
  group by a.pikanteria_id, a.pick;
$$;

revoke all on function public.crowd_pikanteria_picks() from public;
grant execute on function public.crowd_pikanteria_picks() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RLS — other players' answers become visible once the kickoff lock passes,
--    and writes are blocked at/after the lock (defense in depth for the API).
-- ────────────────────────────────────────────────────────────────────────────
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
          and (
            pk.locked
            or (pk.kickoff_time is not null and now() >= pk.kickoff_time - interval '5 minutes')
          )
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
        and (pk.kickoff_time is null or now() < pk.kickoff_time - interval '5 minutes')
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
        and (pk.kickoff_time is null or now() < pk.kickoff_time - interval '5 minutes')
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
        and (pk.kickoff_time is null or now() < pk.kickoff_time - interval '5 minutes')
        and (pikanteria_answers.pick <> 'X' or pk.odds_x is not null)
    )
  );
