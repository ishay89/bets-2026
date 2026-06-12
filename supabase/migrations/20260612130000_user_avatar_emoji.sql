-- Player-chosen avatar emoji.
--
-- Adds an optional `avatar_emoji` to users so a player can personalise the icon
-- shown on their profile, the leaderboard, the board, and prediction reveals.
-- When null, the app falls back to the name-derived animal avatar. Automated
-- benchmark users (markers / monkey) keep their fixed symbols regardless.
--
-- The leaderboard view is recreated to carry the new column through to the
-- leaderboard UI. CREATE OR REPLACE VIEW only allows appending columns, so
-- avatar_emoji is added at the end of the select list; all existing columns keep
-- their position. The view stays security_invoker.

alter table public.users
  add column if not exists avatar_emoji text;

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
    u.avatar_emoji,
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
  previous_rank - current_rank as rank_delta,
  avatar_emoji
from ranked
order by total_points desc;
