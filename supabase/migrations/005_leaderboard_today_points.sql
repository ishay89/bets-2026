-- Mondial Bets 2026 — Leaderboard view with today_points
-- Replaces the leaderboard view to include the most recent scored match day's
-- points alongside the all-time total.

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
)
select
  u.id,
  u.display_name,
  u.is_monkey,
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
group by u.id, u.display_name, u.is_monkey, pt.winner_points, pt.top_scorer_points
order by total_points desc;
