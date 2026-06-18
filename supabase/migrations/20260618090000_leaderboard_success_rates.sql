-- Mondial Bets 2026 - Add settled-pick success rates to the leaderboard.
--
-- Ranking remains based only on total_points. The new columns are appended to
-- the existing view so consumers can show total and latest-day hit rates for
-- scored match predictions plus scored pikanteria answers. Futures are excluded
-- because they are tournament-long bonuses, not daily 1/X/2 settled picks.

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
scored_picks as (
  select p.user_id, m.match_day_id, (p.pick = m.result) as is_success
  from public.predictions p
  join public.matches m on m.id = p.match_id
  where m.result is not null

  union all

  select pa.user_id, pk.match_day_id, (pa.pick = pk.result) as is_success
  from public.pikanteria_answers pa
  join public.pikanteria pk on pk.id = pa.pikanteria_id
  where pk.result is not null
),
success_totals as (
  select
    sp.user_id,
    count(*)::integer as total_scored_picks,
    count(*) filter (where sp.is_success)::integer as total_successful_picks,
    count(*) filter (where sp.match_day_id = lsd.match_day_id)::integer as today_scored_picks,
    count(*) filter (where sp.match_day_id = lsd.match_day_id and sp.is_success)::integer as today_successful_picks
  from scored_picks sp
  left join latest_scored_day lsd on true
  group by sp.user_id
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
    coalesce(ds.day_points, 0) as today_points,
    case
      when coalesce(st.total_scored_picks, 0) = 0 then null
      else round((coalesce(st.total_successful_picks, 0)::numeric * 100) / st.total_scored_picks, 1)
    end as total_success_rate,
    coalesce(st.total_successful_picks, 0)::integer as total_successful_picks,
    coalesce(st.total_scored_picks, 0)::integer as total_scored_picks,
    case
      when coalesce(st.today_scored_picks, 0) = 0 then null
      else round((coalesce(st.today_successful_picks, 0)::numeric * 100) / st.today_scored_picks, 1)
    end as today_success_rate,
    coalesce(st.today_successful_picks, 0)::integer as today_successful_picks,
    coalesce(st.today_scored_picks, 0)::integer as today_scored_picks
  from public.users u
  left join prediction_totals pt on pt.user_id = u.id
  left join pikanteria_totals pk on pk.user_id = u.id
  left join public.pre_tournament_picks ptp on ptp.user_id = u.id
  left join day_scores ds on ds.user_id = u.id
  left join success_totals st on st.user_id = u.id
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
  avatar_emoji,
  total_success_rate,
  total_successful_picks,
  total_scored_picks,
  today_success_rate,
  today_successful_picks,
  today_scored_picks
from ranked
order by total_points desc;
