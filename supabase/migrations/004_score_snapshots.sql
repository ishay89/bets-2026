-- Mondial Bets 2026 — Score Snapshots
-- Stores a per-user, per-match-day point breakdown that is validated against
-- a fresh recalculation from source tables after each result entry.
-- match_day_id = NULL for the pre-tournament snapshot row.

create table public.score_snapshots (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.users(id) on delete cascade,
  match_day_id                uuid references public.match_days(id) on delete cascade,
  stage                       text,                -- denormalized from match_days; null for pre-tournament
  match_points                numeric(10,2) not null default 0,  -- from predictions (multipliers already applied)
  pikanteria_points           numeric(10,2) not null default 0,  -- from pikanteria_answers
  pre_tournament_winner_pts   numeric(10,2) not null default 0,  -- non-zero on pre-tournament row only
  pre_tournament_scorer_pts   numeric(10,2) not null default 0,  -- non-zero on pre-tournament row only
  day_points                  numeric(10,2) not null default 0,  -- sum of all four columns above
  cumulative_points           numeric(10,2) not null default 0,  -- running total sourced directly from raw tables
  is_valid                    boolean not null default true,
  discrepancy                 numeric(10,2),        -- non-null when is_valid=false: fresh_cumulative - snapshot_sum
  calculated_at               timestamptz not null default now(),
  created_at                  timestamptz not null default now()
);

-- One row per (user, match_day) for scored match days
create unique index score_snapshots_user_day_uidx
  on public.score_snapshots (user_id, match_day_id)
  where match_day_id is not null;

-- One row per user for the pre-tournament snapshot (match_day_id IS NULL)
create unique index score_snapshots_user_pretournament_uidx
  on public.score_snapshots (user_id)
  where match_day_id is null;

alter table public.score_snapshots enable row level security;

create policy "score_snapshots_read_all" on public.score_snapshots
  for select using (true);

-- Service role (used by admin server actions) bypasses RLS and has full access.
-- No write policies are needed for authenticated users.

grant select on public.score_snapshots to anon, authenticated;
