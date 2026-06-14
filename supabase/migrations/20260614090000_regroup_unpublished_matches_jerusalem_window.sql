-- Mondial Bets 2026 - Regroup draft group-stage matches by Jerusalem evening window.
--
-- The app displays times in Asia/Jerusalem. Match-day buckets use the evening
-- date for the overnight window: kickoffs from 18:00 through 09:00 the next
-- morning belong to the evening's group date.
--
-- Already published or scored matches are intentionally left on their current
-- match_day_id so live player-visible rows are not moved by this migration.

create or replace function pg_temp.jerusalem_match_group_date(kickoff timestamptz)
returns date
language sql
stable
as $$
  select case
    when (kickoff at time zone 'Asia/Jerusalem')::time <= time '09:00'
      then ((kickoff at time zone 'Asia/Jerusalem')::date - interval '1 day')::date
    else (kickoff at time zone 'Asia/Jerusalem')::date
  end;
$$;

create temp table moving_matches on commit drop as
select
  m.id as match_id,
  m.match_day_id as old_match_day_id,
  pg_temp.jerusalem_match_group_date(m.kickoff_time) as target_date
from public.matches m
join public.match_days md on md.id = m.match_day_id
where md.stage = 'group'
  and m.published_at is null
  and m.result is null
  and md.date is distinct from pg_temp.jerusalem_match_group_date(m.kickoff_time);

insert into public.match_days (date, stage, lock_time, published_at)
select
  mm.target_date,
  'group',
  min(m.kickoff_time) - interval '5 minutes',
  null
from moving_matches mm
join public.matches m on m.id = mm.match_id
where not exists (
  select 1
  from public.match_days md
  where md.stage = 'group'
    and md.date = mm.target_date
)
group by mm.target_date;

create temp table target_days on commit drop as
select distinct on (mm.target_date)
  mm.target_date,
  md.id as match_day_id
from moving_matches mm
join public.match_days md
  on md.stage = 'group'
  and md.date = mm.target_date
order by
  mm.target_date,
  md.lock_time,
  md.id;

create temp table affected_match_days on commit drop as
select old_match_day_id as match_day_id from moving_matches
union
select match_day_id from target_days;

update public.matches m
set match_day_id = target_days.match_day_id
from moving_matches mm
join target_days on target_days.target_date = mm.target_date
where m.id = mm.match_id
  and m.published_at is null
  and m.result is null
  and m.match_day_id is distinct from target_days.match_day_id;

do $$
declare
  day_id uuid;
begin
  for day_id in select match_day_id from affected_match_days loop
    perform public.recompute_match_day_publish(day_id);
  end loop;
end;
$$;

delete from public.match_days md
using affected_match_days amd
where md.id = amd.match_day_id
  and md.published_at is null
  and not exists (select 1 from public.matches m where m.match_day_id = md.id)
  and not exists (select 1 from public.pikanteria p where p.match_day_id = md.id)
  and not exists (select 1 from public.score_snapshots s where s.match_day_id = md.id);

do $$
declare
  mismatched integer;
begin
  select count(*) into mismatched
  from public.matches m
  join public.match_days md on md.id = m.match_day_id
  where md.stage = 'group'
    and m.published_at is null
    and m.result is null
    and md.date <> pg_temp.jerusalem_match_group_date(m.kickoff_time);

  if mismatched <> 0 then
    raise exception 'Expected 0 unpublished group-stage matches misaligned with Jerusalem window, found %', mismatched;
  end if;
end;
$$;
