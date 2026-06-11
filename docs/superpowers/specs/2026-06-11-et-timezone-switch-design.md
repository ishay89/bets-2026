# ET Timezone Switch Design

## Goal

Switch the app's display timezone from Israel time (`Asia/Jerusalem`) to US Eastern
time (`America/New_York`), since the World Cup matches are played in the USA. This is
a **full switch**: `match_days` groupings are re-derived around ET calendar days (not
just a display relabel), executed now — today, June 11, 2026 — for all 72 group-stage
matches. The existing 24-hour time format is kept.

## Background

- `lib/time.ts`'s `APP_TIME_ZONE` constant drives every date/time helper
  (`appDateKey`, `formatAppDate`, `formatAppTime`, `formatAppDateTime`,
  `appDateTimeLocalToIso`), currently `'Asia/Jerusalem'`.
- `matches.kickoff_time` / `match_days.lock_time` are already correct UTC instants
  (migration `20260609121756_normalize_match_kickoffs_jerusalem.sql`, PR #106) — no
  data fix needed for the instants themselves.
- `match_days` rows group matches into the daily buckets shown on `/predict`
  (`getPublishedMatchDaysWithAll`). Membership is a static `matches.match_day_id` FK —
  it is **not** recomputed from `kickoff_time` at render time. Changing
  `APP_TIME_ZONE` alone would relabel each day's heading but would not move matches
  between days, so a migration is required to realign membership.
- During June 2026, Israel is UTC+3 (IDT) and US Eastern is UTC-4 (EDT) — a 7-hour
  difference. A match's calendar date is one day earlier in ET than in Jerusalem
  whenever its Jerusalem kickoff hour is before 07:00.

## Scope

1. `lib/time.ts`: change `APP_TIME_ZONE` to `'America/New_York'`. No other formatting
   options change (24-hour time stays).
2. `lib/time.test.ts`: update expected values for ET.
3. New migration: regroup all 72 group-stage matches from Jerusalem-day `match_days`
   into ET-day `match_days`, reusing the existing 17 rows for Jun 11–27 (same ids and
   `date` values) and removing the now-empty Jun 28 row.

Out of scope: `kickoff_time` / `lock_time` instants (unchanged), prediction locking
(`lib/lock.ts` is purely `kickoff_time`-based and untouched), and publish status for
any match (the migration only moves matches between day-groups; publishing remains a
separate admin action via `/admin/publish`).

## A. `lib/time.ts`

One-line change:

```ts
const APP_TIME_ZONE = 'America/New_York'
```

Every helper (`appDateKey`, `formatAppDate`, `formatAppTime`, `formatAppDateTime`,
`appDateTimeLocalToIso`) automatically follows since they all resolve through
`APP_TIME_ZONE`.

## B. `lib/time.test.ts`

Expected values shift by the 7-hour Jerusalem→ET offset:

| Test | Old (Jerusalem) | New (ET) |
|---|---|---|
| `appDateKey(new Date('2026-06-11T21:30:00Z'))` | `'2026-06-12'` | `'2026-06-11'` (17:30 ET, same day) |
| `formatAppDate('2026-06-12')` | `'Fri, Jun 12'` | `'Fri, Jun 12'` (date-only inputs are timezone-stable — midnight-local round-trips to the same calendar day) |
| `formatAppDate('2026-06-11T21:30:00Z')` | `'Fri, Jun 12'` | `'Thu, Jun 11'` (17:30 ET) |
| `formatAppTime('2026-06-15T19:00:00Z')` | `'22:00'` | `'15:00'` |
| `formatAppDateTime('2026-06-15T19:00:00Z')` | `'Jun 15, 2026, 22:00'` | `'Jun 15, 2026, 15:00'` |
| `appDateTimeLocalToIso('2026-06-15T22:00')` | `'2026-06-15T19:00:00.000Z'` | `'2026-06-16T02:00:00.000Z'` (22:00 EDT = 02:00 UTC next day) |

## C. Migration: regroup `match_days` by ET calendar day

All 18 existing `stage='group'` `match_days` rows (Jun 11–28, dates = Jerusalem
calendar days) stay in place by id. The migration only moves matches between them and
removes the row that ends up empty.

1. **Repoint movers.** For every match where
   `(kickoff_time AT TIME ZONE 'America/New_York')::date <
   (kickoff_time AT TIME ZONE 'Asia/Jerusalem')::date`,
   set `match_day_id` to the existing `match_days` row with
   `date = (jerusalem_date - 1 day) AND stage = 'group'`. That row always exists for
   Jun 11–27 (every "ET day N" row is fed by "Jerusalem day N" non-movers plus
   "Jerusalem day N+1" movers).

2. **Recompute.** Call `recompute_match_day_publish(match_day_id)` for every
   `match_days` row whose membership changed (Jun 11–28), refreshing `lock_time` and
   `published_at`.

3. **Drop the empty day.** All 6 of Jun 28's matches move back to Jun 27, leaving the
   Jun 28 `match_days` row empty. Delete it (after confirming no `pikanteria` /
   `score_snapshots` rows reference it — verified zero do).

Net effect — per-day match counts (Jerusalem → ET):

| Jerusalem date | matches moving to previous ET day | total matches |
|---|---|---|
| Jun 11 | 0 | 1 |
| Jun 12 | 1 | 2 |
| Jun 13 | 1 | 2 |
| Jun 14 | 2 | 5 |
| Jun 15 | 2 | 4 |
| Jun 16 | 2 | 3 |
| Jun 17 | 2 | 5 |
| Jun 18 | 2 | 4 |
| Jun 19 | 2 | 3 |
| Jun 20 | 3 | 5 |
| Jun 21 | 1 | 4 |
| Jun 22 | 2 | 3 |
| Jun 23 | 3 | 5 |
| Jun 24 | 2 | 4 |
| Jun 25 | 4 | 6 |
| Jun 26 | 4 | 6 |
| Jun 27 | 4 | 4 |
| Jun 28 | 6 | 6 |

Result: 17 non-empty `match_days` rows (Jun 11–27), 72 matches total, Jun 28 row
removed.

**Safety check** (mirroring the precedent migration's fail-fast style): assert before
running that exactly 18 group-stage `match_days` rows with 72 matches total exist, and
after running that exactly 17 remain with 72 matches total and the Jun 28 row is gone.

## Edge Cases

- **South Korea vs Czech Republic** (today's only mover): currently grouped under
  "Jun 12", `published_at = null`, 4 predictions — all from automated marker bots
  (0 real users), since RLS hides unpublished matches from players. Moves into the
  "Jun 11" group. Stays unpublished; the admin publishes it via `/admin/publish`
  whenever ready, same as it would have under "Jun 12".
- **Mexico vs South Africa** (today, live, 34 predictions incl. 30 real users):
  unaffected. 22:00 Jerusalem = 15:00 ET — same calendar day in both zones, so it
  stays in the "Jun 11" group with all existing predictions intact.
- `pikanteria` has exactly 1 row, referencing "Jun 11" (retained). `score_snapshots`
  has 0 rows. Neither blocks the Jun 28 row deletion or is affected by the regroup.
- `lib/lock.ts` locking is per-match via `kickoff_time`, independent of
  `match_day_id` — unaffected by membership changes.

## Testing

- `lib/time.test.ts`: updated expected values per the table above (unit, no DB).
- Migration: apply locally (`supabase db reset` / migration apply against local DB),
  then verify via `supabase db query`:
  - 17 `stage='group'` `match_days` rows remain (Jun 11–27), each with ≥1 match.
  - Total matches across those rows = 72.
  - South Korea vs Czech Republic's `match_day_id` now equals the "Jun 11" row id.
  - `lock_time` for "Jun 11" and "Jun 12" reflect the new membership.
