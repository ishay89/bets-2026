-- Widen numeric precision for odds and points columns.
--
-- Odds:   numeric(5,2)  → numeric(8,4)  — max 9999.9999, 4 decimal places
-- Points: numeric(8,2)  → numeric(10,4) — max 999999.9999, 4 decimal places
-- Snapshots: numeric(10,2) → numeric(12,4) — cumulative totals with full precision
--
-- The leaderboard view references predictions.points and pikanteria_answers.points,
-- so we drop and recreate it around the ALTER statements.

drop view if exists public.leaderboard;

-- Match odds
alter table public.matches
  alter column odds_home type numeric(8,4),
  alter column odds_draw type numeric(8,4),
  alter column odds_away type numeric(8,4);

-- Pikanteria option odds
alter table public.pikanteria_options
  alter column odds type numeric(8,4);

-- Pre-tournament odds
alter table public.pre_tournament_picks
  alter column winner_odds     type numeric(8,4),
  alter column top_scorer_odds type numeric(8,4);

-- Prediction points
alter table public.predictions
  alter column points type numeric(10,4);

-- Pikanteria answer points
alter table public.pikanteria_answers
  alter column points type numeric(10,4);

-- Pre-tournament points
alter table public.pre_tournament_picks
  alter column winner_points     type numeric(10,4),
  alter column top_scorer_points type numeric(10,4);

-- Score snapshot columns
alter table public.score_snapshots
  alter column match_points              type numeric(12,4),
  alter column pikanteria_points         type numeric(12,4),
  alter column pre_tournament_winner_pts type numeric(12,4),
  alter column pre_tournament_scorer_pts type numeric(12,4),
  alter column day_points                type numeric(12,4),
  alter column cumulative_points         type numeric(12,4),
  alter column discrepancy               type numeric(12,4);

-- Recreate leaderboard view (same definition as migration 008)
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
  coalesce(max(ds.day_points), 0) as today_points,
  u.automation_strategy
from public.users u
left join public.predictions p on p.user_id = u.id
left join public.pikanteria_answers pa on pa.user_id = u.id
left join public.pre_tournament_picks pt on pt.user_id = u.id
left join day_scores ds on ds.user_id = u.id
group by u.id, u.display_name, u.is_monkey, u.automation_strategy, pt.winner_points, pt.top_scorer_points
order by total_points desc;
