# Query Reference

Use these as templates. Keep the item ids and picks explicit in the decision summary and in the write query.

## Open Items

```sql
select * from (
  select
    'match' as item_type,
    m.id,
    md.date as match_day_date,
    md.stage,
    m.home_team || ' vs ' || m.away_team as title,
    m.kickoff_time,
    (m.kickoff_time at time zone 'Asia/Jerusalem') as kickoff_israel,
    '1' as pick_1,
    m.home_team as label_1,
    m.odds_home as odds_1,
    'X' as pick_x,
    'Draw' as label_x,
    m.odds_draw as odds_x,
    '2' as pick_2,
    m.away_team as label_2,
    m.odds_away as odds_2,
    m.locked,
    m.published_at
  from public.matches m
  join public.match_days md on md.id = m.match_day_id
  where m.published_at is not null
    and coalesce(m.locked, false) = false
    and m.result is null
    and m.kickoff_time > now() + interval '5 minutes'
  union all
  select
    'pikanteria' as item_type,
    p.id,
    md.date as match_day_date,
    md.stage,
    p.question as title,
    null::timestamptz as kickoff_time,
    null::timestamp as kickoff_israel,
    '1' as pick_1,
    p.label_1,
    p.odds_1,
    case when p.odds_x is null or p.label_x is null then null else 'X' end as pick_x,
    p.label_x,
    p.odds_x,
    '2' as pick_2,
    p.label_2,
    p.odds_2,
    p.locked,
    p.published_at
  from public.pikanteria p
  join public.match_days md on md.id = p.match_day_id
  where p.published_at is not null
    and coalesce(p.locked, false) = false
    and p.result is null
) open_items
order by match_day_date, kickoff_time nulls last, item_type, title;
```

## Codex Position

```sql
select current_rank, id, display_name, total_points, today_points, rank_delta
from public.leaderboard
where id = '00000000-0000-0000-0000-000000000005';
```

## Existing Codex Picks for Open Items

Replace the CTE bodies with the current open item ids.

```sql
with open_matches(match_id) as (
  values
    ('00000000-0000-0000-0000-000000000000'::uuid)
),
open_pikanteria(pikanteria_id) as (
  values
    ('00000000-0000-0000-0000-000000000000'::uuid)
)
select 'match' as item_type, om.match_id as item_id, pr.pick
from open_matches om
left join public.predictions pr
  on pr.match_id = om.match_id
 and pr.user_id = '00000000-0000-0000-0000-000000000005'
union all
select 'pikanteria' as item_type, op.pikanteria_id as item_id, pa.pick
from open_pikanteria op
left join public.pikanteria_answers pa
  on pa.pikanteria_id = op.pikanteria_id
 and pa.user_id = '00000000-0000-0000-0000-000000000005';
```

## Codex-Only Upsert and Validation

Fill `chosen_matches` and `chosen_pikanteria` from the exact picks chosen by Codex. When there are no chosen rows of a type, use an empty CTE body like `select null::uuid as match_id, null::text as pick where false`.

```sql
begin;

create temp table before_other_prediction_counts as
select match_id, count(*) as row_count, count(*) filter (where pick is not null) as pick_count
from public.predictions
where user_id <> '00000000-0000-0000-0000-000000000005'
group by match_id;

create temp table before_other_pikanteria_counts as
select pikanteria_id, count(*) as row_count, count(*) filter (where pick is not null) as pick_count
from public.pikanteria_answers
where user_id <> '00000000-0000-0000-0000-000000000005'
group by pikanteria_id;

with codex_user as (
  select '00000000-0000-0000-0000-000000000005'::uuid as user_id
),
chosen_matches(match_id, pick) as (
  values
    ('00000000-0000-0000-0000-000000000000'::uuid, '1')
),
open_matches as (
  select am.match_id, am.pick
  from chosen_matches am
  join public.matches m on m.id = am.match_id
  where m.published_at is not null
    and coalesce(m.locked, false) = false
    and m.result is null
    and m.kickoff_time > now() + interval '5 minutes'
    and am.pick in ('1','X','2')
),
written_matches as (
  insert into public.predictions (id, user_id, match_id, pick, points, created_at)
  select gen_random_uuid(), cu.user_id, om.match_id, om.pick, null, now()
  from open_matches om
  cross join codex_user cu
  on conflict (user_id, match_id) do update
    set pick = excluded.pick,
        points = null
  returning match_id, pick
),
chosen_pikanteria(pikanteria_id, pick) as (
  values
    ('00000000-0000-0000-0000-000000000000'::uuid, '1')
),
open_pikanteria as (
  select ap.pikanteria_id, ap.pick
  from chosen_pikanteria ap
  join public.pikanteria p on p.id = ap.pikanteria_id
  where p.published_at is not null
    and coalesce(p.locked, false) = false
    and p.result is null
    and (ap.pick in ('1','2') or (ap.pick = 'X' and p.odds_x is not null and p.label_x is not null))
),
written_pikanteria as (
  insert into public.pikanteria_answers (id, user_id, pikanteria_id, pick, points, created_at)
  select gen_random_uuid(), cu.user_id, op.pikanteria_id, op.pick, null, now()
  from open_pikanteria op
  cross join codex_user cu
  on conflict (user_id, pikanteria_id) do update
    set pick = excluded.pick,
        points = null
  returning pikanteria_id, pick
)
select 'match' as item_type, match_id as item_id, pick from written_matches
union all
select 'pikanteria' as item_type, pikanteria_id as item_id, pick from written_pikanteria
order by item_type, item_id;

with chosen_matches(match_id, pick) as (
  values
    ('00000000-0000-0000-0000-000000000000'::uuid, '1')
),
chosen_pikanteria(pikanteria_id, pick) as (
  values
    ('00000000-0000-0000-0000-000000000000'::uuid, '1')
),
codex_match_validation as (
  select 'match' as item_type, am.match_id as item_id, am.pick as expected_pick, pr.pick as actual_pick
  from chosen_matches am
  left join public.predictions pr
    on pr.match_id = am.match_id
   and pr.user_id = '00000000-0000-0000-0000-000000000005'
),
codex_pikanteria_validation as (
  select 'pikanteria' as item_type, ap.pikanteria_id as item_id, ap.pick as expected_pick, pa.pick as actual_pick
  from chosen_pikanteria ap
  left join public.pikanteria_answers pa
    on pa.pikanteria_id = ap.pikanteria_id
   and pa.user_id = '00000000-0000-0000-0000-000000000005'
)
select *
from codex_match_validation
union all
select *
from codex_pikanteria_validation
order by item_type, item_id;

with chosen_matches(match_id, pick) as (
  values
    ('00000000-0000-0000-0000-000000000000'::uuid, '1')
),
chosen_pikanteria(pikanteria_id, pick) as (
  values
    ('00000000-0000-0000-0000-000000000000'::uuid, '1')
),
after_other_prediction_counts as (
  select p.match_id, count(*) as row_count, count(*) filter (where p.pick is not null) as pick_count
  from public.predictions p
  join chosen_matches am on am.match_id = p.match_id
  where p.user_id <> '00000000-0000-0000-0000-000000000005'
  group by p.match_id
),
after_other_pikanteria_counts as (
  select pa.pikanteria_id, count(*) as row_count, count(*) filter (where pa.pick is not null) as pick_count
  from public.pikanteria_answers pa
  join chosen_pikanteria ap on ap.pikanteria_id = pa.pikanteria_id
  where pa.user_id <> '00000000-0000-0000-0000-000000000005'
  group by pa.pikanteria_id
),
match_other_validation as (
  select
    'match' as item_type,
    am.match_id as item_id,
    coalesce(b.row_count, 0) as before_rows,
    coalesce(a.row_count, 0) as after_rows,
    coalesce(b.pick_count, 0) as before_picks,
    coalesce(a.pick_count, 0) as after_picks,
    coalesce(b.row_count, 0) = coalesce(a.row_count, 0)
      and coalesce(b.pick_count, 0) = coalesce(a.pick_count, 0) as unchanged
  from chosen_matches am
  left join before_other_prediction_counts b on b.match_id = am.match_id
  left join after_other_prediction_counts a on a.match_id = am.match_id
),
pikanteria_other_validation as (
  select
    'pikanteria' as item_type,
    ap.pikanteria_id as item_id,
    coalesce(b.row_count, 0) as before_rows,
    coalesce(a.row_count, 0) as after_rows,
    coalesce(b.pick_count, 0) as before_picks,
    coalesce(a.pick_count, 0) as after_picks,
    coalesce(b.row_count, 0) = coalesce(a.row_count, 0)
      and coalesce(b.pick_count, 0) = coalesce(a.pick_count, 0) as unchanged
  from chosen_pikanteria ap
  left join before_other_pikanteria_counts b on b.pikanteria_id = ap.pikanteria_id
  left join after_other_pikanteria_counts a on a.pikanteria_id = ap.pikanteria_id
)
select *
from match_other_validation
union all
select *
from pikanteria_other_validation
order by item_type, item_id;

commit;
```
