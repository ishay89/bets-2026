-- Mondial Bets 2026 - Regroup draft group-stage matches by Jerusalem evening window.
--
-- The app displays times in Asia/Jerusalem. Match-day buckets use the evening
-- date for the overnight window: kickoffs from 18:00 through 09:00 the next
-- morning belong to the evening's group date.
--
-- Already published or scored rows are intentionally left on their current
-- match_day_id, except for the two explicitly approved unscored Germany bets
-- that were published on the wrong day before this regrouping pass.

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

create temp table approved_published_match_moves (
  match_id uuid primary key
) on commit drop;

insert into approved_published_match_moves (match_id) values
  ('7e2a406d-9275-4797-9c90-ae009edb8243'); -- Germany vs Curacao match

create temp table approved_published_pikanteria_moves (
  pikanteria_id uuid primary key,
  target_date date not null
) on commit drop;

insert into approved_published_pikanteria_moves (pikanteria_id, target_date) values
  ('6ba642bb-fa1d-474f-a3fa-40f799559bfb', date '2026-06-14'); -- Germany vs Curacao pikanteria

create temp table moving_matches on commit drop as
select
  m.id as match_id,
  m.match_day_id as old_match_day_id,
  pg_temp.jerusalem_match_group_date(m.kickoff_time) as target_date
from public.matches m
join public.match_days md on md.id = m.match_day_id
where md.stage = 'group'
  and m.result is null
  and (
    m.published_at is null
    or m.id in (select match_id from approved_published_match_moves)
  )
  and md.date is distinct from pg_temp.jerusalem_match_group_date(m.kickoff_time);

create temp table moving_pikanteria on commit drop as
select
  p.id as pikanteria_id,
  p.match_day_id as old_match_day_id,
  approved.target_date
from public.pikanteria p
join approved_published_pikanteria_moves approved on approved.pikanteria_id = p.id
join public.match_days md on md.id = p.match_day_id
where p.result is null
  and md.date is distinct from approved.target_date;

create temp table target_dates on commit drop as
select target_date from moving_matches
union
select target_date from moving_pikanteria;

insert into public.match_days (date, stage, lock_time, published_at)
select
  td.target_date,
  'group',
  coalesce(min(m.kickoff_time) - interval '5 minutes', now()),
  null
from target_dates td
left join public.matches m
  on pg_temp.jerusalem_match_group_date(m.kickoff_time) = td.target_date
where not exists (
  select 1
  from public.match_days md
  where md.stage = 'group'
    and md.date = td.target_date
)
group by td.target_date;

create temp table target_days on commit drop as
select distinct on (td.target_date)
  td.target_date,
  md.id as match_day_id
from target_dates td
join public.match_days md
  on md.stage = 'group'
  and md.date = td.target_date
order by
  td.target_date,
  md.lock_time,
  md.id;

create temp table affected_match_days on commit drop as
select old_match_day_id as match_day_id from moving_matches
union
select old_match_day_id as match_day_id from moving_pikanteria
union
select match_day_id from target_days;

update public.matches m
set match_day_id = target_days.match_day_id
from moving_matches mm
join target_days on target_days.target_date = mm.target_date
where m.id = mm.match_id
  and m.result is null
  and (
    m.published_at is null
    or m.id in (select match_id from approved_published_match_moves)
  )
  and m.match_day_id is distinct from target_days.match_day_id;

update public.pikanteria p
set match_day_id = target_days.match_day_id
from moving_pikanteria mp
join target_days on target_days.target_date = mp.target_date
where p.id = mp.pikanteria_id
  and p.result is null
  and p.id in (select pikanteria_id from approved_published_pikanteria_moves)
  and p.match_day_id is distinct from target_days.match_day_id;

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

do $$
declare
  mismatched integer;
begin
  select count(*) into mismatched
  from approved_published_match_moves approved
  join public.matches m on m.id = approved.match_id
  join public.match_days md on md.id = m.match_day_id
  where md.date <> pg_temp.jerusalem_match_group_date(m.kickoff_time);

  if mismatched <> 0 then
    raise exception 'Expected approved published Germany match rows to align with Jerusalem window, found %', mismatched;
  end if;

  select count(*) into mismatched
  from approved_published_pikanteria_moves approved
  join public.pikanteria p on p.id = approved.pikanteria_id
  join public.match_days md on md.id = p.match_day_id
  where md.date <> approved.target_date;

  if mismatched <> 0 then
    raise exception 'Expected approved published Germany pikanteria rows to align with Jerusalem window, found %', mismatched;
  end if;
end;
$$;
