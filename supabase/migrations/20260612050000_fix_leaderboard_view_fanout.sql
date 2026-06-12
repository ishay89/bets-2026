-- Mondial Bets 2026 - Fix leaderboard totals (join fan-out) and today_points.
--
-- 1. total_points: the previous view joined users -> predictions and
--    users -> pikanteria_answers in the same FROM list. Two independent
--    one-to-many joins multiply each other (M prediction rows x N answer rows
--    per user), so sum(p.points) was counted N times and sum(pa.points) was
--    counted M times - inflating every player who had both kinds of scored
--    bets. Aggregate each table per user first, then join the per-user totals.
--
-- 2. today_points: latest_scored_day only looked at matches.result, so a day
--    where only pikanteria were scored never became the "latest scored day".
--    It now mirrors selectScoredLeaderboardDays (lib/historical-leaderboard.ts):
--    a day counts as scored when any match OR pikanteria has a result.
--
-- Output columns are unchanged (CREATE OR REPLACE VIEW requires it), and the
-- view stays security_invoker per 20260610051453_harden_public_rls_and_rpc_grants.

create or replace view public.leaderboard
with (security_invoker = true)
as
with latest_scored_day as (
  select md.id as match_day_id
  from public.match_days md
  where exists (
      select 1 from public.matches m
      where m.match_day_id = md.id and m.result is not null
    )
    or exists (
      select 1 from public.pikanteria pk
      where pk.match_day_id = md.id and pk.result is not null
    )
  order by md.date desc
  limit 1
),
day_scores as (
  select ss.user_id, ss.day_points
  from public.score_snapshots ss
  join latest_scored_day lsd on lsd.match_day_id = ss.match_day_id
),
prediction_totals as (
  select p.user_id, sum(p.points) as points
  from public.predictions p
  group by p.user_id
),
pikanteria_totals as (
  select pa.user_id, sum(pa.points) as points
  from public.pikanteria_answers pa
  group by pa.user_id
),
player_scores as (
  select
    u.id,
    u.display_name,
    u.is_monkey,
    u.automation_strategy,
    coalesce(pt.points, 0)
      + coalesce(pk.points, 0)
      + coalesce(ptp.winner_points, 0)
      + coalesce(ptp.top_scorer_points, 0) as total_points,
    coalesce(ds.day_points, 0) as today_points
  from public.users u
  left join prediction_totals pt on pt.user_id = u.id
  left join pikanteria_totals pk on pk.user_id = u.id
  left join public.pre_tournament_picks ptp on ptp.user_id = u.id
  left join day_scores ds on ds.user_id = u.id
  where u.status = 'approved'
),
ranked as (
  select
    ps.*,
    ps.total_points - ps.today_points as previous_total_points,
    rank() over (order by ps.total_points desc) as current_rank,
    rank() over (order by (ps.total_points - ps.today_points) desc) as previous_rank
  from player_scores ps
)
select
  id,
  display_name,
  is_monkey,
  total_points,
  today_points,
  automation_strategy,
  previous_total_points,
  current_rank,
  previous_rank,
  previous_rank - current_rank as rank_delta
from ranked
order by total_points desc;
