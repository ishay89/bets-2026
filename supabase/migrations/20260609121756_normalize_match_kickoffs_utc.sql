-- Mondial Bets 2026 - Normalize seeded group-stage fixture times to UTC.
--
-- The public app compares and displays match times in UTC. Keep the stored
-- kickoff_time values aligned with the schedule's UTC date/time columns.

create or replace function pg_temp.normalize_fixture_team(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    replace(
      replace(
        replace(
          replace(lower(value), '&', 'and'),
          'czechia', 'czech republic'
        ),
        'bosnia herzegovina', 'bosnia and herzegovina'
      ),
      'côte d''ivoire', 'ivory coast'
    ),
    '[^a-z0-9]+', '', 'g'
  );
$$;

create temp table expected_match_kickoffs_utc (
  match_no integer primary key,
  date_utc date not null,
  kickoff_time timestamptz not null,
  team_a text not null,
  team_b text not null
) on commit drop;

insert into expected_match_kickoffs_utc (match_no, date_utc, kickoff_time, team_a, team_b) values
  (1, date '2026-06-11', timestamptz '2026-06-11T19:00:00Z', 'Mexico', 'South Africa'),
  (2, date '2026-06-12', timestamptz '2026-06-12T02:00:00Z', 'South Korea', 'Czechia'),
  (3, date '2026-06-12', timestamptz '2026-06-12T19:00:00Z', 'Canada', 'Bosnia & Herzegovina'),
  (4, date '2026-06-13', timestamptz '2026-06-13T01:00:00Z', 'United States', 'Paraguay'),
  (5, date '2026-06-13', timestamptz '2026-06-13T19:00:00Z', 'Qatar', 'Switzerland'),
  (6, date '2026-06-13', timestamptz '2026-06-13T22:00:00Z', 'Brazil', 'Morocco'),
  (7, date '2026-06-14', timestamptz '2026-06-14T01:00:00Z', 'Haiti', 'Scotland'),
  (8, date '2026-06-14', timestamptz '2026-06-14T16:00:00Z', 'Australia', 'Türkiye'),
  (9, date '2026-06-14', timestamptz '2026-06-14T17:00:00Z', 'Germany', 'Curaçao'),
  (10, date '2026-06-14', timestamptz '2026-06-14T20:00:00Z', 'Netherlands', 'Japan'),
  (11, date '2026-06-14', timestamptz '2026-06-14T23:00:00Z', 'Ivory Coast', 'Ecuador'),
  (12, date '2026-06-15', timestamptz '2026-06-15T02:00:00Z', 'Sweden', 'Tunisia'),
  (13, date '2026-06-15', timestamptz '2026-06-15T16:00:00Z', 'Spain', 'Cape Verde'),
  (14, date '2026-06-15', timestamptz '2026-06-15T19:00:00Z', 'Belgium', 'Egypt'),
  (15, date '2026-06-15', timestamptz '2026-06-15T22:00:00Z', 'Saudi Arabia', 'Uruguay'),
  (16, date '2026-06-16', timestamptz '2026-06-16T01:00:00Z', 'Iran', 'New Zealand'),
  (17, date '2026-06-16', timestamptz '2026-06-16T19:00:00Z', 'France', 'Senegal'),
  (18, date '2026-06-16', timestamptz '2026-06-16T22:00:00Z', 'Iraq', 'Norway'),
  (19, date '2026-06-17', timestamptz '2026-06-17T01:00:00Z', 'Argentina', 'Algeria'),
  (20, date '2026-06-17', timestamptz '2026-06-17T04:00:00Z', 'Austria', 'Jordan'),
  (21, date '2026-06-17', timestamptz '2026-06-17T17:00:00Z', 'Portugal', 'DR Congo'),
  (22, date '2026-06-17', timestamptz '2026-06-17T20:00:00Z', 'England', 'Croatia'),
  (23, date '2026-06-17', timestamptz '2026-06-17T23:00:00Z', 'Ghana', 'Panama'),
  (24, date '2026-06-18', timestamptz '2026-06-18T02:00:00Z', 'Uzbekistan', 'Colombia'),
  (25, date '2026-06-18', timestamptz '2026-06-18T16:00:00Z', 'Czechia', 'South Africa'),
  (26, date '2026-06-18', timestamptz '2026-06-18T19:00:00Z', 'Switzerland', 'Bosnia & Herzegovina'),
  (27, date '2026-06-18', timestamptz '2026-06-18T22:00:00Z', 'Canada', 'Qatar'),
  (28, date '2026-06-19', timestamptz '2026-06-19T01:00:00Z', 'Mexico', 'South Korea'),
  (29, date '2026-06-19', timestamptz '2026-06-19T19:00:00Z', 'United States', 'Australia'),
  (30, date '2026-06-19', timestamptz '2026-06-19T22:00:00Z', 'Scotland', 'Morocco'),
  (31, date '2026-06-20', timestamptz '2026-06-20T00:30:00Z', 'Brazil', 'Haiti'),
  (32, date '2026-06-20', timestamptz '2026-06-20T03:00:00Z', 'Türkiye', 'Paraguay'),
  (33, date '2026-06-20', timestamptz '2026-06-20T17:00:00Z', 'Netherlands', 'Sweden'),
  (34, date '2026-06-20', timestamptz '2026-06-20T20:00:00Z', 'Germany', 'Ivory Coast'),
  (35, date '2026-06-21', timestamptz '2026-06-21T00:00:00Z', 'Ecuador', 'Curaçao'),
  (36, date '2026-06-21', timestamptz '2026-06-21T04:00:00Z', 'Tunisia', 'Japan'),
  (37, date '2026-06-21', timestamptz '2026-06-21T16:00:00Z', 'Spain', 'Saudi Arabia'),
  (38, date '2026-06-21', timestamptz '2026-06-21T19:00:00Z', 'Belgium', 'Iran'),
  (39, date '2026-06-21', timestamptz '2026-06-21T22:00:00Z', 'Uruguay', 'Cape Verde'),
  (40, date '2026-06-22', timestamptz '2026-06-22T01:00:00Z', 'New Zealand', 'Egypt'),
  (41, date '2026-06-22', timestamptz '2026-06-22T17:00:00Z', 'Argentina', 'Austria'),
  (42, date '2026-06-22', timestamptz '2026-06-22T21:00:00Z', 'France', 'Iraq'),
  (43, date '2026-06-23', timestamptz '2026-06-23T00:00:00Z', 'Norway', 'Senegal'),
  (44, date '2026-06-23', timestamptz '2026-06-23T03:00:00Z', 'Jordan', 'Algeria'),
  (45, date '2026-06-23', timestamptz '2026-06-23T17:00:00Z', 'Portugal', 'Uzbekistan'),
  (46, date '2026-06-23', timestamptz '2026-06-23T20:00:00Z', 'England', 'Ghana'),
  (47, date '2026-06-23', timestamptz '2026-06-23T23:00:00Z', 'Panama', 'Croatia'),
  (48, date '2026-06-24', timestamptz '2026-06-24T02:00:00Z', 'Colombia', 'DR Congo'),
  (49, date '2026-06-24', timestamptz '2026-06-24T19:00:00Z', 'Switzerland', 'Canada'),
  (50, date '2026-06-24', timestamptz '2026-06-24T19:00:00Z', 'Bosnia & Herzegovina', 'Qatar'),
  (51, date '2026-06-24', timestamptz '2026-06-24T22:00:00Z', 'Scotland', 'Brazil'),
  (52, date '2026-06-24', timestamptz '2026-06-24T22:00:00Z', 'Morocco', 'Haiti'),
  (53, date '2026-06-25', timestamptz '2026-06-25T01:00:00Z', 'Czechia', 'Mexico'),
  (54, date '2026-06-25', timestamptz '2026-06-25T01:00:00Z', 'South Africa', 'South Korea'),
  (55, date '2026-06-25', timestamptz '2026-06-25T20:00:00Z', 'Curaçao', 'Ivory Coast'),
  (56, date '2026-06-25', timestamptz '2026-06-25T20:00:00Z', 'Ecuador', 'Germany'),
  (57, date '2026-06-25', timestamptz '2026-06-25T23:00:00Z', 'Japan', 'Sweden'),
  (58, date '2026-06-25', timestamptz '2026-06-25T23:00:00Z', 'Tunisia', 'Netherlands'),
  (59, date '2026-06-26', timestamptz '2026-06-26T02:00:00Z', 'Türkiye', 'United States'),
  (60, date '2026-06-26', timestamptz '2026-06-26T02:00:00Z', 'Paraguay', 'Australia'),
  (61, date '2026-06-26', timestamptz '2026-06-26T19:00:00Z', 'Norway', 'France'),
  (62, date '2026-06-26', timestamptz '2026-06-26T19:00:00Z', 'Senegal', 'Iraq'),
  (63, date '2026-06-27', timestamptz '2026-06-27T00:00:00Z', 'Cape Verde', 'Saudi Arabia'),
  (64, date '2026-06-27', timestamptz '2026-06-27T00:00:00Z', 'Uruguay', 'Spain'),
  (65, date '2026-06-27', timestamptz '2026-06-27T03:00:00Z', 'Egypt', 'Iran'),
  (66, date '2026-06-27', timestamptz '2026-06-27T03:00:00Z', 'New Zealand', 'Belgium'),
  (67, date '2026-06-27', timestamptz '2026-06-27T21:00:00Z', 'Panama', 'England'),
  (68, date '2026-06-27', timestamptz '2026-06-27T21:00:00Z', 'Croatia', 'Ghana'),
  (69, date '2026-06-27', timestamptz '2026-06-27T23:30:00Z', 'Colombia', 'Portugal'),
  (70, date '2026-06-27', timestamptz '2026-06-27T23:30:00Z', 'DR Congo', 'Uzbekistan'),
  (71, date '2026-06-28', timestamptz '2026-06-28T02:00:00Z', 'Algeria', 'Austria'),
  (72, date '2026-06-28', timestamptz '2026-06-28T02:00:00Z', 'Jordan', 'Argentina');

do $$
declare
  v_expected integer;
  v_matched integer;
  v_day record;
begin
  select count(*) into v_expected from expected_match_kickoffs_utc;

  insert into public.match_days (date, stage, lock_time, published_at)
  select
    expected.date_utc,
    'group',
    min(expected.kickoff_time) - interval '5 minutes',
    null
  from expected_match_kickoffs_utc expected
  where not exists (
    select 1 from public.match_days existing where existing.date = expected.date_utc
  )
  group by expected.date_utc;

  if exists (
    select 1
    from public.match_days
    where date in (select date_utc from expected_match_kickoffs_utc)
    group by date
    having count(*) <> 1
  ) then
    raise exception 'Expected exactly one match_day per UTC fixture date';
  end if;

  create temp table matched_match_kickoffs_utc on commit drop as
  select
    expected.match_no,
    matched.id as match_id,
    matched.match_day_id as old_match_day_id,
    target_day.id as new_match_day_id,
    expected.kickoff_time
  from expected_match_kickoffs_utc expected
  join public.matches matched on (
    (
      pg_temp.normalize_fixture_team(matched.home_team) = pg_temp.normalize_fixture_team(expected.team_a)
      and pg_temp.normalize_fixture_team(matched.away_team) = pg_temp.normalize_fixture_team(expected.team_b)
    )
    or (
      pg_temp.normalize_fixture_team(matched.home_team) = pg_temp.normalize_fixture_team(expected.team_b)
      and pg_temp.normalize_fixture_team(matched.away_team) = pg_temp.normalize_fixture_team(expected.team_a)
    )
  )
  join public.match_days target_day on target_day.date = expected.date_utc;

  select count(*) into v_matched from matched_match_kickoffs_utc;
  if v_matched <> v_expected then
    raise exception 'Expected to match % group-stage fixtures, matched %', v_expected, v_matched;
  end if;

  create temp table affected_match_days_utc on commit drop as
  select distinct old_match_day_id as match_day_id from matched_match_kickoffs_utc
  union
  select distinct new_match_day_id as match_day_id from matched_match_kickoffs_utc;

  update public.matches fixture
  set
    kickoff_time = matched.kickoff_time,
    match_day_id = matched.new_match_day_id
  from matched_match_kickoffs_utc matched
  where fixture.id = matched.match_id;

  for v_day in select match_day_id from affected_match_days_utc loop
    perform public.recompute_match_day_publish(v_day.match_day_id);
  end loop;
end;
$$;
