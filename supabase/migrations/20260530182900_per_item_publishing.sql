-- Mondial Bets 2026 — Per-item publishing
--
-- Until now visibility was tracked only at the day level (match_days.published_at).
-- Publishing a day made every match AND every pikanteria for that date visible at
-- once. This migration adds a per-item published_at to matches and pikanteria so
-- the admin can publish individual matches/pikanteria. match_days.published_at
-- becomes a derived "this day has >= 1 visible item" flag, maintained by the
-- publish/unpublish server actions, so the day still appears in player lists.

alter table public.matches    add column published_at timestamptz;  -- null = draft
alter table public.pikanteria add column published_at timestamptz;  -- null = draft

-- Backfill: items in an already-published day inherit the day's timestamp so
-- existing published days keep all their matches/pikanteria visible.
update public.matches m
  set published_at = md.published_at
  from public.match_days md
  where md.id = m.match_day_id and md.published_at is not null;

update public.pikanteria pk
  set published_at = md.published_at
  from public.match_days md
  where md.id = pk.match_day_id and md.published_at is not null;

create index if not exists idx_matches_published
  on public.matches (match_day_id) where published_at is not null;
create index if not exists idx_pikanteria_published
  on public.pikanteria (match_day_id) where published_at is not null;

-- RLS: hide drafts at the DB level for the user client. Admin pages read via the
-- service-role client, which bypasses RLS, so they still see drafts. The
-- player-facing nested queries (match_days -> matches/pikanteria) now return only
-- published children automatically, because PostgREST applies RLS to embedded
-- resources.
drop policy if exists "matches_read" on public.matches;
create policy "matches_read" on public.matches for select using (published_at is not null);

drop policy if exists "pikanteria_read" on public.pikanteria;
create policy "pikanteria_read" on public.pikanteria for select using (published_at is not null);
