-- Mondial Bets 2026 — Schema Migration
-- Run this first in the Supabase SQL Editor (Dashboard → SQL Editor).
-- It creates all tables and the leaderboard view.

-- Players
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  is_admin boolean not null default false,
  is_monkey boolean not null default false,
  created_at timestamptz not null default now()
);

-- A day's worth of matches
create table public.match_days (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  stage text not null check (stage in ('group','r16','qf','sf','3rd','final')),
  lock_time timestamptz not null,  -- 30 min before earliest kickoff
  published_at timestamptz,        -- null = draft, set when admin publishes
  created_at timestamptz not null default now()
);

-- Individual matches within a day
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  match_day_id uuid not null references public.match_days(id) on delete cascade,
  home_team text not null,
  away_team text not null,
  kickoff_time timestamptz not null,
  odds_home numeric(5,2) not null,
  odds_draw numeric(5,2) not null,
  odds_away numeric(5,2) not null,
  result text check (result in ('1','X','2')),  -- null until entered
  created_at timestamptz not null default now()
);

-- Pikanteria (bonus side-bet questions per day)
create table public.pikanteria (
  id uuid primary key default gen_random_uuid(),
  match_day_id uuid not null references public.match_days(id) on delete cascade,
  question text not null,
  odds_yes numeric(5,2) not null,
  odds_no numeric(5,2) not null,
  result boolean,  -- null until entered
  created_at timestamptz not null default now()
);

-- Player picks for each match (1/X/2)
create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  pick text not null check (pick in ('1','X','2')),
  points numeric(8,2),  -- null until result entered
  created_at timestamptz not null default now(),
  unique(user_id, match_id)
);

-- Player answers to pikanteria
create table public.pikanteria_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  pikanteria_id uuid not null references public.pikanteria(id) on delete cascade,
  answer boolean not null,
  points numeric(8,2),  -- null until result entered
  created_at timestamptz not null default now(),
  unique(user_id, pikanteria_id)
);

-- One-time pre-tournament picks per player
create table public.pre_tournament_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade unique,
  winner_team text not null,
  winner_odds numeric(5,2) not null,
  top_scorer text not null,
  top_scorer_odds numeric(5,2) not null,
  winner_points numeric(8,2),      -- null until tournament end
  top_scorer_points numeric(8,2),  -- null until tournament end
  created_at timestamptz not null default now()
);

-- Leaderboard helper view (total points per player)
create or replace view public.leaderboard as
select
  u.id,
  u.display_name,
  u.is_monkey,
  coalesce(sum(p.points), 0)
    + coalesce(sum(pa.points), 0)
    + coalesce(pt.winner_points, 0)
    + coalesce(pt.top_scorer_points, 0) as total_points
from public.users u
left join public.predictions p on p.user_id = u.id
left join public.pikanteria_answers pa on pa.user_id = u.id
left join public.pre_tournament_picks pt on pt.user_id = u.id
group by u.id, u.display_name, u.is_monkey, pt.winner_points, pt.top_scorer_points
order by total_points desc;
