# Query Reference

Read-only reference for understanding what the explore script computes. Item
ids and picks for the actual write must come from
[explore-template.ts](explore-template.ts)'s output, not from re-deriving
these by hand.

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

## Claude's Leaderboard Position

```sql
select current_rank, id, display_name, total_points, today_points, rank_delta
from public.leaderboard
where id = '00000000-0000-0000-0000-000000000006';
```

## Existing Claude Picks for Open Items

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
 and pr.user_id = '00000000-0000-0000-0000-000000000006'
union all
select 'pikanteria' as item_type, op.pikanteria_id as item_id, pa.pick
from open_pikanteria op
left join public.pikanteria_answers pa
  on pa.pikanteria_id = op.pikanteria_id
 and pa.user_id = '00000000-0000-0000-0000-000000000006';
```
