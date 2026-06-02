# Social Recap Queries

Run these with the Supabase plugin SQL execution tool.

## Current Standings

```sql
select
  l.id,
  l.display_name,
  l.total_points,
  l.today_points
from public.leaderboard l
join public.users u on u.id = l.id
where u.status = 'approved'
  and not u.is_monkey
  and u.automation_strategy is null
order by l.total_points desc, l.display_name;
```

## Recent Daily Scores

```sql
select
  md.id as match_day_id,
  md.date,
  u.display_name,
  ss.day_points,
  ss.cumulative_points
from public.score_snapshots ss
join public.users u on u.id = ss.user_id
join public.match_days md on md.id = ss.match_day_id
where u.status = 'approved'
  and not u.is_monkey
  and u.automation_strategy is null
order by md.date desc, ss.day_points desc, u.display_name
limit 100;
```

## Previous AI Recaps

Use this to avoid repeating the same joke or headline.

```sql
select title, body, created_at
from public.ai_social_posts
order by created_at desc
limit 5;
```

## Publish

Replace the placeholders. Use a real queried `match_day_id`, or `null` when no scored day exists.

```sql
insert into public.ai_social_posts (title, body, match_day_id)
values (
  $recap_title$TITLE$recap_title$,
  $recap_body$BODY$recap_body$,
  MATCH_DAY_ID_OR_NULL
)
returning id, title, created_at;
```
