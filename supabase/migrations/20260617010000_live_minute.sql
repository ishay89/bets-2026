-- Live match minute on matches.
--
-- Written by the background live-sync (lib/live-sync.ts) alongside the other
-- live_* fields. Mirrors football-data.org's `minute` attribute for IN_PLAY /
-- PAUSED games, so the live banner can show how far into the match we are.
-- Display-only — like the other live_* columns it never feeds into scoring.

alter table public.matches
  add column if not exists live_minute integer;
