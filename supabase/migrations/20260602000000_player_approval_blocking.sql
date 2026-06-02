-- Mondial Bets 2026 — Player approval & blocking
--
-- Adds an account lifecycle `status` to users:
--   * pending  — just signed in, waiting for an admin to approve. Cannot bet
--                or use the app until approved.
--   * approved — admin-approved, full access.
--   * blocked  — removed by an admin. The row is kept (still visible in the
--                admin panel marked as blocked) but the player can no longer
--                access the app, and re-logging in with the same email keeps
--                them blocked.
--
-- Existing players are backfilled to `approved` so nobody is locked out by the
-- rollout. New sign-ins land in `pending` (set in app/layout.tsx).

alter table public.users
  add column if not exists status text not null default 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_status_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_status_check
      check (status in ('pending', 'approved', 'blocked'));
  end if;
end $$;

-- Everyone who already exists (real players + automated markers) is approved
-- so the approval gate only affects brand-new sign-ins.
update public.users set status = 'approved' where status = 'pending';

-- Leaderboard only shows approved players. Pending sign-ins and blocked/removed
-- players are excluded from public standings (blocked players stay visible in
-- the admin panel only).
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
where u.status = 'approved'
group by u.id, u.display_name, u.is_monkey, u.automation_strategy, pt.winner_points, pt.top_scorer_points
order by total_points desc;
