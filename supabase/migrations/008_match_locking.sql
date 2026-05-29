-- Mondial Bets 2026 — Match & Match Day locking
-- Adds manual/auto lock flags so predictions can be frozen 5 minutes before
-- kickoff (persisted lazily on the first save attempt past the deadline) or
-- locked manually by an admin.

-- Per-match lock: set manually by admin, or auto-persisted when a user tries to
-- save a pick at/after kickoff − 5 min (locks the match for everyone).
alter table public.matches
  add column if not exists locked boolean not null default false;

-- Per-day lock: set manually by admin. Locks every match in the day plus its
-- pikanteria side bets.
alter table public.match_days
  add column if not exists locked boolean not null default false;
