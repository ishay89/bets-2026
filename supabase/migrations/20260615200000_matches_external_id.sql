-- Stable provider match id on each fixture, for exact API->DB result mapping.
--
-- football-data.org gives every match a stable integer id. Once we store it on
-- the matching internal row, the results sync can join on the id exactly,
-- instead of fuzzy-matching team names + kickoff times on every run. The column
-- is nullable (rows are backfilled by scripts/sync-fixtures.ts) and unique so a
-- provider match can map to at most one internal fixture.

alter table public.matches
  add column if not exists external_match_id bigint;

-- Partial unique index: enforce uniqueness only for rows that have an id, so the
-- many not-yet-mapped rows (all NULL) don't collide.
create unique index if not exists matches_external_match_id_key
  on public.matches (external_match_id)
  where external_match_id is not null;
