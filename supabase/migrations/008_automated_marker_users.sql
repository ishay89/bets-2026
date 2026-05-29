-- Add automated benchmark users that are not controlled by players.
-- They provide leaderboard markers for random, high-odds, median-odds, and low-odds strategies.

alter table public.users
  add column if not exists automation_strategy text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_automation_strategy_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_automation_strategy_check
      check (automation_strategy is null or automation_strategy in ('monkey', 'max', 'mid', 'min'));
  end if;
end $$;

create unique index if not exists users_automation_strategy_unique
  on public.users (automation_strategy)
  where automation_strategy is not null;

insert into auth.users (id, email, role, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000001', 'monkey@mondial2026.local', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000002', 'always-max@mondial2026.local', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000003', 'always-mid@mondial2026.local', 'authenticated', now()),
  ('00000000-0000-0000-0000-000000000004', 'always-min@mondial2026.local', 'authenticated', now())
on conflict (id) do nothing;

insert into public.users (id, email, display_name, is_monkey, automation_strategy)
values
  ('00000000-0000-0000-0000-000000000001', 'monkey@mondial2026.local', 'Monkey', true, 'monkey'),
  ('00000000-0000-0000-0000-000000000002', 'always-max@mondial2026.local', 'Always Max', true, 'max'),
  ('00000000-0000-0000-0000-000000000003', 'always-mid@mondial2026.local', 'Always Mid', true, 'mid'),
  ('00000000-0000-0000-0000-000000000004', 'always-min@mondial2026.local', 'Always Min', true, 'min')
on conflict (id) do update
set email = excluded.email,
    is_monkey = true,
    automation_strategy = excluded.automation_strategy;

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
group by u.id, u.display_name, u.is_monkey, u.automation_strategy, pt.winner_points, pt.top_scorer_points
order by total_points desc;
