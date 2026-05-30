-- Mondial Bets 2026 — Crowd Picks & Insights
--
-- Exposes aggregate crowd-pick counts (never individual picks) and tightens the
-- previously world-readable predictions / pikanteria_answers RLS so that other
-- players' picks are only visible AFTER a match locks (kickoff − 5 min, or a
-- manual match/day lock). Your own picks stay visible at all times; admins keep
-- full read access for the per-player audit pages.
--
-- The 5-minute lock lead must stay in sync with LOCK_LEAD_MS in lib/lock.ts.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Aggregate crowd-pick RPCs (SECURITY DEFINER → bypass RLS internally, but
--    only ever return counts gated behind the lock; no user identity leaks).
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.crowd_match_picks()
returns table (match_id uuid, pick text, cnt integer)
language sql
security definer
set search_path = public
as $$
  select p.match_id, p.pick, count(*)::int
  from predictions p
  join matches m on m.id = p.match_id
  join match_days md on md.id = m.match_day_id
  where md.published_at is not null
    and (m.locked or md.locked or now() >= m.kickoff_time - interval '5 minutes')
  group by p.match_id, p.pick;
$$;

revoke all on function public.crowd_match_picks() from public;
grant execute on function public.crowd_match_picks() to authenticated;

create or replace function public.crowd_pikanteria_picks()
returns table (pikanteria_id uuid, option_id uuid, cnt integer)
language sql
security definer
set search_path = public
as $$
  select a.pikanteria_id, a.option_id, count(*)::int
  from pikanteria_answers a
  join pikanteria pk on pk.id = a.pikanteria_id
  join match_days md on md.id = pk.match_day_id
  where md.published_at is not null
    and (md.locked or now() >= md.lock_time)
  group by a.pikanteria_id, a.option_id;
$$;

revoke all on function public.crowd_pikanteria_picks() from public;
grant execute on function public.crowd_pikanteria_picks() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Tighten raw-row RLS: own picks always; others' only once locked. Admins
--    keep full read access. (Closes the prior `using (true)` read-all leak.)
-- ────────────────────────────────────────────────────────────────────────────

drop policy if exists "predictions_read_all" on public.predictions;
drop policy if exists "predictions_read_own_or_locked" on public.predictions;
create policy "predictions_read_own_or_locked" on public.predictions for select using (
  auth.uid() = user_id
  or exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
  or exists (
    select 1 from public.matches m
    join public.match_days md on md.id = m.match_day_id
    where m.id = predictions.match_id
      and (m.locked or md.locked or now() >= m.kickoff_time - interval '5 minutes')
  )
);

drop policy if exists "pik_answers_read_all" on public.pikanteria_answers;
drop policy if exists "pik_answers_read_own_or_locked" on public.pikanteria_answers;
create policy "pik_answers_read_own_or_locked" on public.pikanteria_answers for select using (
  auth.uid() = user_id
  or exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin)
  or exists (
    select 1 from public.pikanteria pk
    join public.match_days md on md.id = pk.match_day_id
    where pk.id = pikanteria_answers.pikanteria_id
      and (md.locked or now() >= md.lock_time)
  )
);
