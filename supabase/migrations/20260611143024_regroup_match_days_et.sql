-- Mondial Bets 2026 - Regroup match_days by US Eastern (America/New_York) calendar day.
--
-- The app's display/grouping timezone switches from Asia/Jerusalem to
-- America/New_York (lib/time.ts). Each match's day-bucket must follow its
-- ET calendar date instead of its previous grouping.
--
-- This is computed directly from matches.kickoff_time (a fixed UTC instant),
-- independent of each match's current match_day_id / match_days.date - so
-- it converges to the correct end state regardless of how matches are
-- currently grouped.

-- 1. Ensure a stage='group' match_days row exists for every ET calendar date
--    that any match's kickoff falls on. (No-op on both local and remote
--    today, since Jun 11-27 already exist - kept for robustness.)
insert into match_days (date, stage, lock_time, published_at)
select
  (m.kickoff_time at time zone 'America/New_York')::date as date,
  'group',
  min(m.kickoff_time), -- placeholder, refreshed by recompute_match_day_publish below
  null
from matches m
where not exists (
  select 1 from match_days md
  where md.date = (m.kickoff_time at time zone 'America/New_York')::date
)
group by (m.kickoff_time at time zone 'America/New_York')::date;

-- 2. Repoint every match to the match_days row matching its ET calendar date.
update matches m
set match_day_id = md.id
from match_days md
where md.stage = 'group'
  and md.date = (m.kickoff_time at time zone 'America/New_York')::date
  and m.match_day_id is distinct from md.id;

-- 3. Recompute lock_time / published_at for every group-stage day, since
--    membership changed but match_day_id is not a trigger column.
do $$
declare
  day_id uuid;
begin
  for day_id in select id from match_days where stage = 'group' loop
    perform recompute_match_day_publish(day_id);
  end loop;
end;
$$;

-- 4. Drop any group-stage day left with no matches and nothing else
--    referencing it.
delete from match_days md
where md.stage = 'group'
  and not exists (select 1 from matches m where m.match_day_id = md.id)
  and not exists (select 1 from pikanteria p where p.match_day_id = md.id)
  and not exists (select 1 from score_snapshots s where s.match_day_id = md.id);

-- 5. Fail fast if anything is misaligned.
do $$
declare
  mismatched integer;
  total_matches integer;
  total_grouped integer;
  group_days integer;
begin
  select count(*) into mismatched
  from matches m
  join match_days md on md.id = m.match_day_id
  where md.stage = 'group'
    and md.date <> (m.kickoff_time at time zone 'America/New_York')::date;

  if mismatched <> 0 then
    raise exception 'Expected 0 matches misaligned with their ET match day, found %', mismatched;
  end if;

  select count(*) into total_matches from matches;

  select count(*) into total_grouped
  from matches m
  join match_days md on md.id = m.match_day_id
  where md.stage = 'group';

  if total_matches <> total_grouped then
    raise exception 'Expected all % matches to belong to a group-stage match day, found %', total_matches, total_grouped;
  end if;

  select count(*) into group_days from match_days where stage = 'group';

  if group_days <> 17 then
    raise exception 'Expected 17 group-stage match days after regroup, found %', group_days;
  end if;
end;
$$;
