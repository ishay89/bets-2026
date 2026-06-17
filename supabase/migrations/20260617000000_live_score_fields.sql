-- Live score tracking fields on matches.
--
-- These are written by the background live-sync (lib/live-sync.ts) and are
-- completely decoupled from matches.result, which is the admin-settled
-- outcome used for scoring. Live data is display-only — it never feeds into
-- enter_match_day_results or any scoring RPC.
--
-- live_status   : mirrors the football-data.org status field
-- live_score_*  : current score (updated during play; reflects final score
--                 when status = FINISHED, before the admin settles the result)
-- live_synced_at: when these fields were last written by the sync job

alter table public.matches
  add column if not exists live_status text
    check (live_status in ('TIMED', 'IN_PLAY', 'PAUSED', 'FINISHED')),
  add column if not exists live_score_home integer,
  add column if not exists live_score_away integer,
  add column if not exists live_synced_at timestamptz;

-- Partial index covering only published matches (the only ones the sync cares
-- about). Supports the per-request staleness check in needsLiveSync().
create index if not exists matches_live_window_idx
  on public.matches (kickoff_time, live_synced_at)
  where published_at is not null;
