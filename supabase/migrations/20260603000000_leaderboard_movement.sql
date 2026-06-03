-- Mondial Bets 2026 - Leaderboard movement
--
-- Adds total-standings movement fields based on the latest scored match day.

create or replace view public.leaderboard as
with latest_scored_day as (
  select md.id as match_day_id
  from public.match_days md
  where exists (
    select 1 from public.matches m
    where m.match_day_id = md.id and m.result is not null
  )
  order by md.date desc
  limit 1
),
day_scores as (
  select ss.user_id, ss.day_points
  from public.score_snapshots ss
  join latest_scored_day lsd on lsd.match_day_id = ss.match_day_id
),
player_scores as (
  select
    u.id,
    u.display_name,
    u.is_monkey,
    u.automation_strategy,
    coalesce(sum(p.points), 0)
      + coalesce(sum(pa.points), 0)
      + coalesce(pt.winner_points, 0)
      + coalesce(pt.top_scorer_points, 0) as total_points,
    coalesce(max(ds.day_points), 0) as today_points
  from public.users u
  left join public.predictions p on p.user_id = u.id
  left join public.pikanteria_answers pa on pa.user_id = u.id
  left join public.pre_tournament_picks pt on pt.user_id = u.id
  left join day_scores ds on ds.user_id = u.id
  where u.status = 'approved'
  group by u.id, u.display_name, u.is_monkey, u.automation_strategy, pt.winner_points, pt.top_scorer_points
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
