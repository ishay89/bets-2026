-- ────────────────────────────────────────────────────────────────────────────
-- Record the final tournament result and guard against double-scoring.
--
-- Until now score_tournament_end only wrote per-pick bonus points; the actual
-- champion / runner-up / top scorer were never persisted, so nothing could tell
-- a player whether their futures bet settled, and re-submitting the admin form
-- silently re-scored. This migration:
--   1. stores the result on the tournament_settings singleton, and
--   2. adds a result-aware score_tournament_end overload that refuses to
--      re-score an already-settled tournament unless explicitly told to.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.tournament_settings
  add column if not exists final_winner     text,
  add column if not exists final_runner_up  text,
  add column if not exists final_top_scorer text,
  add column if not exists scored_at         timestamptz;

-- New overload. The original score_tournament_end(jsonb) is intentionally left
-- in place so a deploy of this migration ahead of the app code cannot break the
-- old call site; it becomes dead once the result-aware caller ships.
create or replace function public.score_tournament_end(
  p_pick_points jsonb,  -- [{"id": uuid, "winner_points": numeric, "top_scorer_points": numeric}]
  p_winner      text,
  p_runner_up   text,
  p_top_scorer  text,
  p_overwrite   boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Refuse to silently re-score a tournament that was already settled. An admin
  -- who genuinely wants to correct a mistake must opt in via p_overwrite.
  if exists (
    select 1 from public.tournament_settings where id and scored_at is not null
  ) and not p_overwrite then
    raise exception 'Tournament end already scored; pass overwrite to re-score'
      using errcode = 'P0001';
  end if;

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

  -- Record the result last so it commits atomically with the points above.
  update public.tournament_settings
  set final_winner     = p_winner,
      final_runner_up  = p_runner_up,
      final_top_scorer = p_top_scorer,
      scored_at        = now()
  where id;
end;
$$;

revoke all on function public.score_tournament_end(jsonb, text, text, text, boolean) from public;
grant execute on function public.score_tournament_end(jsonb, text, text, text, boolean) to service_role;

-- Backfill the result recorded by the existing (pre-migration) scoring run so
-- the already-settled tournament immediately shows correct settlement badges.
-- Values derived from the awarded points: 7 picks took Spain at 1.5x (champion),
-- 1 took Argentina at 0.75x (runner-up), 11 took Mbappé (top scorer).
update public.tournament_settings
set final_winner     = coalesce(final_winner, 'Spain'),
    final_runner_up  = coalesce(final_runner_up, 'Argentina'),
    final_top_scorer = coalesce(final_top_scorer, 'Kylian Mbappé'),
    scored_at        = coalesce(scored_at, timestamptz '2026-07-19 22:06:01.323+00')
where id;
