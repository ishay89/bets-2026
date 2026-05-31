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

-- ────────────────────────────────────────────────────────────────────────────
-- Keep match_days.published_at + lock_time in sync with the per-item flags.
--
-- match_days.published_at is a derived "this day has >= 1 published item" flag,
-- so the day appears in player lists. Rather than recompute it from application
-- code on every toggle (chatty + racey), a trigger maintains it in the same
-- transaction as the item's publish flip:
--   * published_at: set to now() when the day gains its first published item,
--     cleared when the last published item is removed, otherwise left as-is.
--   * lock_time (NOT NULL): 5 min before the earliest published match kickoff,
--     falling back to all matches' kickoffs for a pikanteria-only day, and to
--     the current value if the day has no matches at all.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.recompute_match_day_publish(p_match_day_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_published boolean;
  v_lock timestamptz;
  v_current_published timestamptz;
begin
  select
    exists (select 1 from public.matches    where match_day_id = p_match_day_id and published_at is not null)
    or exists (select 1 from public.pikanteria where match_day_id = p_match_day_id and published_at is not null)
  into v_has_published;

  select min(kickoff_time) - interval '5 minutes' into v_lock
  from public.matches where match_day_id = p_match_day_id and published_at is not null;
  if v_lock is null then
    select min(kickoff_time) - interval '5 minutes' into v_lock
    from public.matches where match_day_id = p_match_day_id;
  end if;

  select published_at into v_current_published from public.match_days where id = p_match_day_id;

  update public.match_days
  set published_at = case when v_has_published then coalesce(v_current_published, now()) else null end,
      lock_time = coalesce(v_lock, lock_time)
  where id = p_match_day_id;
end;
$$;

create or replace function public.trg_matches_publish_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_match_day_publish(old.match_day_id);
    return old;
  end if;
  perform public.recompute_match_day_publish(new.match_day_id);
  return new;
end;
$$;

create or replace function public.trg_pikanteria_publish_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_match_day_publish(old.match_day_id);
    return old;
  end if;
  perform public.recompute_match_day_publish(new.match_day_id);
  return new;
end;
$$;

drop trigger if exists matches_publish_sync on public.matches;
create trigger matches_publish_sync
  after insert or update of published_at, kickoff_time or delete on public.matches
  for each row execute function public.trg_matches_publish_sync();

drop trigger if exists pikanteria_publish_sync on public.pikanteria;
create trigger pikanteria_publish_sync
  after insert or update of published_at or delete on public.pikanteria
  for each row execute function public.trg_pikanteria_publish_sync();

