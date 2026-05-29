-- Mondial Bets 2026 — Atomic scoring write path (issue #37)
--
-- The admin scoring actions previously issued many independent awaited writes
-- across four tables with no transaction. A crash, timeout, or dropped
-- connection mid-way left a match day partially scored (some predictions with
-- points, others NULL; both old + new pikanteria options flagged correct; etc).
--
-- These functions move each multi-table scoring write into a single plpgsql
-- function. A plpgsql function runs inside one implicit transaction, so any
-- error — including the invariant `raise exception`s below — rolls back every
-- statement in the call. Scoring is now all-or-nothing.
--
-- Pure point math stays in lib/scoring.ts: the caller computes each row's
-- points and passes them in. These functions own only the atomic write and the
-- post-write invariant checks.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. enter_match_day_results — atomically score one match day.
--    Phases (all in one transaction):
--      a. matches.result          (per scored match)
--      b. predictions.points      (per prediction)
--      c. pikanteria_options flip (clear affected questions, then set winners)
--      d. pikanteria_answers.points
--    Then asserts every prediction/answer on a scored match/resolved question
--    has non-NULL points, so a half-written day can never commit.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.enter_match_day_results(
  p_match_day_id        uuid,
  p_match_results       jsonb,  -- [{"match_id": uuid, "result": "1"|"X"|"2"}]
  p_prediction_points   jsonb,  -- [{"id": uuid, "points": numeric}]
  p_pikanteria_winners  jsonb,  -- [{"pikanteria_id": uuid, "option_id": uuid}]
  p_answer_points       jsonb   -- [{"id": uuid, "points": numeric}]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- a. Match results
  update public.matches m
  set result = r.result
  from jsonb_to_recordset(p_match_results) as r(match_id uuid, result text)
  where m.id = r.match_id
    and m.match_day_id = p_match_day_id;

  -- b. Prediction points
  update public.predictions p
  set points = pp.points
  from jsonb_to_recordset(p_prediction_points) as pp(id uuid, points numeric)
  where p.id = pp.id;

  -- c. Pikanteria option flip — atomic within the transaction: clear every
  --    option for the affected questions, then mark the winners correct. The
  --    old "clear then set" race (both true, or all false) cannot be observed.
  update public.pikanteria_options po
  set is_correct = false
  where po.pikanteria_id in (
    select w.pikanteria_id
    from jsonb_to_recordset(p_pikanteria_winners) as w(pikanteria_id uuid, option_id uuid)
  );

  update public.pikanteria_options po
  set is_correct = true
  from jsonb_to_recordset(p_pikanteria_winners) as w(pikanteria_id uuid, option_id uuid)
  where po.id = w.option_id;

  -- d. Answer points
  update public.pikanteria_answers a
  set points = ap.points
  from jsonb_to_recordset(p_answer_points) as ap(id uuid, points numeric)
  where a.id = ap.id;

  -- Invariant: every prediction on a scored match in this day has points.
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

  -- Invariant: every answer to a resolved pikanteria (one with a correct
  -- option) has points.
  if exists (
    select 1
    from public.pikanteria_answers a
    join public.pikanteria pk on pk.id = a.pikanteria_id
    where pk.match_day_id = p_match_day_id
      and a.points is null
      and exists (
        select 1 from public.pikanteria_options po
        where po.pikanteria_id = pk.id and po.is_correct
      )
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
-- 2. score_tournament_end — atomically write pre-tournament bonus points.
--    Asserts no pick is left half-scored (one column written, the other NULL).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.score_tournament_end(
  p_pick_points jsonb  -- [{"id": uuid, "winner_points": numeric, "top_scorer_points": numeric}]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pre_tournament_picks pt
  set winner_points     = pp.winner_points,
      top_scorer_points = pp.top_scorer_points
  from jsonb_to_recordset(p_pick_points)
    as pp(id uuid, winner_points numeric, top_scorer_points numeric)
  where pt.id = pp.id;

  -- Scoring covers every pick, so none may remain unscored after the write.
  if exists (
    select 1 from public.pre_tournament_picks
    where winner_points is null or top_scorer_points is null
  ) then
    raise exception
      'Scoring invariant violated: pre-tournament picks with NULL points remain after scoring';
  end if;
end;
$$;

revoke all on function public.score_tournament_end(jsonb) from public;
grant execute on function public.score_tournament_end(jsonb) to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. insert_pikanteria_with_options — atomically create a pikanteria question
--    together with its options, so a question can never be orphaned (inserted
--    without options) by a mid-way failure during publish.
--    Returns {"id": uuid, "options": [{"id","odds","sort_order"}, ...]}.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.insert_pikanteria_with_options(
  p_match_day_id uuid,
  p_question     text,
  p_options      jsonb  -- [{"label": text, "odds": numeric, "sort_order": int}]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pika_id uuid;
  v_options jsonb;
begin
  if jsonb_array_length(p_options) < 2 then
    raise exception 'A pikanteria question requires at least 2 options';
  end if;

  insert into public.pikanteria (question, match_day_id)
  values (p_question, p_match_day_id)
  returning id into v_pika_id;

  insert into public.pikanteria_options (pikanteria_id, label, odds, sort_order)
  select v_pika_id, o.label, o.odds, o.sort_order
  from jsonb_to_recordset(p_options) as o(label text, odds numeric, sort_order int);

  select jsonb_agg(
           jsonb_build_object('id', id, 'odds', odds, 'sort_order', sort_order)
           order by sort_order
         )
  into v_options
  from public.pikanteria_options
  where pikanteria_id = v_pika_id;

  return jsonb_build_object('id', v_pika_id, 'options', v_options);
end;
$$;

revoke all on function public.insert_pikanteria_with_options(uuid, text, jsonb) from public;
grant execute on function public.insert_pikanteria_with_options(uuid, text, jsonb) to service_role;
