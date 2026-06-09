-- Mondial Bets 2026 - Normalize seeded group-stage fixture times to Jerusalem time.
--
-- The public app compares, groups, and displays match times in Asia/Jerusalem.
-- Keep the seeded rows aligned with Jerusalem calendar days and explicit +03:00 kickoffs.

create or replace function pg_temp.normalize_fixture_team(value text)
returns text
language sql
immutable
as $$
  with raw(normalized_team) as (
    select lower(value)
  ),
  aliases(normalized_team) as (
    select replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(normalized_team, '&', 'and'),
                      'united states', 'usa'
                    ),
                    'bosnia-herzegovina', 'bosnia and herzegovina'
                  ),
                  'czechia', 'czech republic'
                ),
                'bosnia herzegovina', 'bosnia and herzegovina'
              ),
              'côte d''ivoire', 'ivory coast'
            ),
            'cabo verde', 'cape verde'
          ),
          'curaçao', 'curacao'
        ),
        'türkiye', 'turkiye'
      ),
      'dr congo', 'democratic republic of congo'
    )
    from raw
  )
  select regexp_replace(normalized_team, '[^a-z0-9]+', '', 'g')
  from aliases;
$$;

create temp table expected_match_kickoffs_jerusalem (
  match_no integer primary key,
  date_jerusalem date not null,
  kickoff_time timestamptz not null,
  team_a text not null,
  team_b text not null
) on commit drop;

insert into expected_match_kickoffs_jerusalem (match_no, date_jerusalem, kickoff_time, team_a, team_b) values
  (1, date '2026-06-11', timestamptz '2026-06-11T22:00:00+03:00', 'Mexico', 'South Africa'),
  (2, date '2026-06-12', timestamptz '2026-06-12T05:00:00+03:00', 'South Korea', 'Czechia'),
  (3, date '2026-06-12', timestamptz '2026-06-12T22:00:00+03:00', 'Canada', 'Bosnia-Herzegovina'),
  (4, date '2026-06-13', timestamptz '2026-06-13T04:00:00+03:00', 'USA', 'Paraguay'),
  (5, date '2026-06-13', timestamptz '2026-06-13T22:00:00+03:00', 'Qatar', 'Switzerland'),
  (6, date '2026-06-14', timestamptz '2026-06-14T01:00:00+03:00', 'Brazil', 'Morocco'),
  (7, date '2026-06-14', timestamptz '2026-06-14T04:00:00+03:00', 'Haiti', 'Scotland'),
  (8, date '2026-06-14', timestamptz '2026-06-14T19:00:00+03:00', 'Australia', 'Türkiye'),
  (9, date '2026-06-14', timestamptz '2026-06-14T20:00:00+03:00', 'Germany', 'Curaçao'),
  (10, date '2026-06-14', timestamptz '2026-06-14T23:00:00+03:00', 'Netherlands', 'Japan'),
  (11, date '2026-06-15', timestamptz '2026-06-15T02:00:00+03:00', 'Côte d''Ivoire', 'Ecuador'),
  (12, date '2026-06-15', timestamptz '2026-06-15T05:00:00+03:00', 'Sweden', 'Tunisia'),
  (13, date '2026-06-15', timestamptz '2026-06-15T19:00:00+03:00', 'Spain', 'Cabo Verde'),
  (14, date '2026-06-15', timestamptz '2026-06-15T22:00:00+03:00', 'Belgium', 'Egypt'),
  (15, date '2026-06-16', timestamptz '2026-06-16T01:00:00+03:00', 'Saudi Arabia', 'Uruguay'),
  (16, date '2026-06-16', timestamptz '2026-06-16T04:00:00+03:00', 'Iran', 'New Zealand'),
  (17, date '2026-06-16', timestamptz '2026-06-16T22:00:00+03:00', 'France', 'Senegal'),
  (18, date '2026-06-17', timestamptz '2026-06-17T01:00:00+03:00', 'Iraq', 'Norway'),
  (19, date '2026-06-17', timestamptz '2026-06-17T04:00:00+03:00', 'Argentina', 'Algeria'),
  (20, date '2026-06-17', timestamptz '2026-06-17T07:00:00+03:00', 'Austria', 'Jordan'),
  (21, date '2026-06-17', timestamptz '2026-06-17T20:00:00+03:00', 'Portugal', 'DR Congo'),
  (22, date '2026-06-17', timestamptz '2026-06-17T23:00:00+03:00', 'England', 'Croatia'),
  (23, date '2026-06-18', timestamptz '2026-06-18T02:00:00+03:00', 'Ghana', 'Panama'),
  (24, date '2026-06-18', timestamptz '2026-06-18T05:00:00+03:00', 'Uzbekistan', 'Colombia'),
  (25, date '2026-06-18', timestamptz '2026-06-18T19:00:00+03:00', 'Czechia', 'South Africa'),
  (26, date '2026-06-18', timestamptz '2026-06-18T22:00:00+03:00', 'Switzerland', 'Bosnia-Herzegovina'),
  (27, date '2026-06-19', timestamptz '2026-06-19T01:00:00+03:00', 'Canada', 'Qatar'),
  (28, date '2026-06-19', timestamptz '2026-06-19T04:00:00+03:00', 'Mexico', 'South Korea'),
  (29, date '2026-06-19', timestamptz '2026-06-19T22:00:00+03:00', 'USA', 'Australia'),
  (30, date '2026-06-20', timestamptz '2026-06-20T01:00:00+03:00', 'Scotland', 'Morocco'),
  (31, date '2026-06-20', timestamptz '2026-06-20T03:30:00+03:00', 'Brazil', 'Haiti'),
  (32, date '2026-06-20', timestamptz '2026-06-20T06:00:00+03:00', 'Türkiye', 'Paraguay'),
  (33, date '2026-06-20', timestamptz '2026-06-20T20:00:00+03:00', 'Netherlands', 'Sweden'),
  (34, date '2026-06-20', timestamptz '2026-06-20T23:00:00+03:00', 'Germany', 'Côte d''Ivoire'),
  (35, date '2026-06-21', timestamptz '2026-06-21T03:00:00+03:00', 'Ecuador', 'Curaçao'),
  (36, date '2026-06-21', timestamptz '2026-06-21T07:00:00+03:00', 'Tunisia', 'Japan'),
  (37, date '2026-06-21', timestamptz '2026-06-21T19:00:00+03:00', 'Spain', 'Saudi Arabia'),
  (38, date '2026-06-21', timestamptz '2026-06-21T22:00:00+03:00', 'Belgium', 'Iran'),
  (39, date '2026-06-22', timestamptz '2026-06-22T01:00:00+03:00', 'Uruguay', 'Cabo Verde'),
  (40, date '2026-06-22', timestamptz '2026-06-22T04:00:00+03:00', 'New Zealand', 'Egypt'),
  (41, date '2026-06-22', timestamptz '2026-06-22T20:00:00+03:00', 'Argentina', 'Austria'),
  (42, date '2026-06-23', timestamptz '2026-06-23T00:00:00+03:00', 'France', 'Iraq'),
  (43, date '2026-06-23', timestamptz '2026-06-23T03:00:00+03:00', 'Norway', 'Senegal'),
  (44, date '2026-06-23', timestamptz '2026-06-23T06:00:00+03:00', 'Jordan', 'Algeria'),
  (45, date '2026-06-23', timestamptz '2026-06-23T20:00:00+03:00', 'Portugal', 'Uzbekistan'),
  (46, date '2026-06-23', timestamptz '2026-06-23T23:00:00+03:00', 'England', 'Ghana'),
  (47, date '2026-06-24', timestamptz '2026-06-24T02:00:00+03:00', 'Panama', 'Croatia'),
  (48, date '2026-06-24', timestamptz '2026-06-24T05:00:00+03:00', 'Colombia', 'DR Congo'),
  (49, date '2026-06-24', timestamptz '2026-06-24T22:00:00+03:00', 'Switzerland', 'Canada'),
  (50, date '2026-06-24', timestamptz '2026-06-24T22:00:00+03:00', 'Bosnia-Herzegovina', 'Qatar'),
  (51, date '2026-06-25', timestamptz '2026-06-25T01:00:00+03:00', 'Scotland', 'Brazil'),
  (52, date '2026-06-25', timestamptz '2026-06-25T01:00:00+03:00', 'Morocco', 'Haiti'),
  (53, date '2026-06-25', timestamptz '2026-06-25T04:00:00+03:00', 'South Korea', 'South Africa'),
  (54, date '2026-06-25', timestamptz '2026-06-25T04:00:00+03:00', 'Czechia', 'Mexico'),
  (55, date '2026-06-25', timestamptz '2026-06-25T23:00:00+03:00', 'Germany', 'Ecuador'),
  (56, date '2026-06-25', timestamptz '2026-06-25T23:00:00+03:00', 'Côte d''Ivoire', 'Curaçao'),
  (57, date '2026-06-26', timestamptz '2026-06-26T02:00:00+03:00', 'Netherlands', 'Tunisia'),
  (58, date '2026-06-26', timestamptz '2026-06-26T02:00:00+03:00', 'Japan', 'Sweden'),
  (59, date '2026-06-26', timestamptz '2026-06-26T05:00:00+03:00', 'Türkiye', 'USA'),
  (60, date '2026-06-26', timestamptz '2026-06-26T05:00:00+03:00', 'Paraguay', 'Australia'),
  (61, date '2026-06-26', timestamptz '2026-06-26T22:00:00+03:00', 'Senegal', 'Iraq'),
  (62, date '2026-06-26', timestamptz '2026-06-26T22:00:00+03:00', 'Norway', 'France'),
  (63, date '2026-06-27', timestamptz '2026-06-27T03:00:00+03:00', 'Egypt', 'Iran'),
  (64, date '2026-06-27', timestamptz '2026-06-27T03:00:00+03:00', 'Belgium', 'New Zealand'),
  (65, date '2026-06-27', timestamptz '2026-06-27T06:00:00+03:00', 'Spain', 'Uruguay'),
  (66, date '2026-06-27', timestamptz '2026-06-27T06:00:00+03:00', 'Saudi Arabia', 'Cabo Verde'),
  (67, date '2026-06-28', timestamptz '2026-06-28T00:00:00+03:00', 'Panama', 'England'),
  (68, date '2026-06-28', timestamptz '2026-06-28T00:00:00+03:00', 'Croatia', 'Ghana'),
  (69, date '2026-06-28', timestamptz '2026-06-28T02:30:00+03:00', 'Colombia', 'Portugal'),
  (70, date '2026-06-28', timestamptz '2026-06-28T02:30:00+03:00', 'DR Congo', 'Uzbekistan'),
  (71, date '2026-06-28', timestamptz '2026-06-28T05:00:00+03:00', 'Algeria', 'Austria'),
  (72, date '2026-06-28', timestamptz '2026-06-28T05:00:00+03:00', 'Jordan', 'Argentina');

create temp table expected_match_links on commit drop as
select
  e.match_no,
  e.date_jerusalem,
  e.kickoff_time,
  e.team_a,
  e.team_b,
  m.id as match_id,
  m.match_day_id as current_match_day_id
from expected_match_kickoffs_jerusalem e
join matches m
  on (
    pg_temp.normalize_fixture_team(m.home_team) = pg_temp.normalize_fixture_team(e.team_a)
    and pg_temp.normalize_fixture_team(m.away_team) = pg_temp.normalize_fixture_team(e.team_b)
  )
  or (
    pg_temp.normalize_fixture_team(m.home_team) = pg_temp.normalize_fixture_team(e.team_b)
    and pg_temp.normalize_fixture_team(m.away_team) = pg_temp.normalize_fixture_team(e.team_a)
  );

-- Fail fast if the live seeded rows do not line up with the expected fixture list.
do $$
declare
  expected_count integer;
  linked_count integer;
begin
  select count(*) into expected_count from expected_match_kickoffs_jerusalem;
  select count(*) into linked_count from expected_match_links;

  if expected_count <> 72 then
    raise exception 'Expected 72 fixture rows in migration data, found %', expected_count;
  end if;

  if linked_count <> 72 then
    raise exception 'Expected to match 72 live fixture rows, matched %', linked_count;
  end if;
end;
$$;

create temp table desired_match_days on commit drop as
select
  date_jerusalem as date,
  min(kickoff_time) - interval '5 minutes' as lock_time
from expected_match_kickoffs_jerusalem
group by date_jerusalem;

insert into match_days (date, stage, lock_time, published_at)
select d.date, 'group', d.lock_time, null
from desired_match_days d
where not exists (
  select 1 from match_days md where md.date = d.date and md.stage = 'group'
);

update match_days md
set lock_time = d.lock_time
from desired_match_days d
where md.date = d.date
  and md.stage = 'group';

update matches m
set
  kickoff_time = e.kickoff_time,
  match_day_id = md.id
from expected_match_links e
join match_days md
  on md.date = e.date_jerusalem
  and md.stage = 'group'
where m.id = e.match_id;

-- Remove empty seeded group days left behind after regrouping by Jerusalem date.
delete from match_days md
where md.stage = 'group'
  and md.date between date '2026-06-11' and date '2026-06-28'
  and not exists (select 1 from matches m where m.match_day_id = md.id)
  and not exists (select 1 from pikanteria p where p.match_day_id = md.id);
