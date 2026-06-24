---
name: publish-today
description: Use when asked to publish today's matches, "publish today", "show what's going to be published today", "approve today's matches", or to preview and confirm publishing the current day's draft 1X2 match odds before they go live to players.
version: 0.1.0
---

# Publish Today's Matches

Preview today's draft (unpublished) matches — odds and kickoff time in
Jerusalem time — and publish them only after explicit approval. Mirrors what
an admin would do on `/admin/publish` for "Save & publish", including
generating the automated benchmark (bot) picks for each match, so the
database ends up in the same state the admin UI would leave it in.

Scope is matches only — pikanteria is not touched by this skill.

## Step 1 — Resolve "today" (Jerusalem)

```sql
SELECT (now() AT TIME ZONE 'Asia/Jerusalem')::date AS today;
```

This matches `appDateKey()` in `lib/time.ts` — the same definition the
admin/publish page uses for its default date.

## Step 2 — Find today's match day

```sql
SELECT id, date, stage FROM match_days WHERE date = '<today>';
```

If no row, report "No match day found for today (<today>)." and stop.

## Step 3 — Load today's draft matches

```sql
SELECT id, home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away
FROM matches
WHERE match_day_id = '<match_day_id>'
  AND published_at IS NULL
  AND result IS NULL
ORDER BY kickoff_time;
```

If empty, report "Nothing to publish — today's matches are already
published (or there are none)." and stop.

## Step 4 — Show the preview and ask for approval

Print a table (kickoff times in `Asia/Jerusalem`, e.g. `22:00 Jerusalem`):

```
Home team           | Away team           | Kickoff           | 1     | X     | 2
---------------------+---------------------+-------------------+-------+-------+------
Mexico               | South Africa        | 22:00 Jerusalem    | 1.65  | 3.50  | 4.50
...
```

Then ask the user for one explicit approval covering the whole batch
("publish all N matches above?" yes/no). Do not publish anything before a
clear yes.

## Step 5 — Publish (only after approval)

For each approved match, in order:

1. **Flip published_at**, scoped so a match that became scored or got
   published by someone else mid-flight is silently skipped rather than
   double-published:

   ```sql
   UPDATE matches
   SET published_at = now()
   WHERE id = '<match_id>'
     AND published_at IS NULL
     AND result IS NULL
   RETURNING id;
   ```

   If this returns no row, skip step 2 for this match and note it as
   "skipped (no longer eligible)" in the final report.

2. **Generate automated benchmark picks**, replicating
   `buildAutomatedMatchRows` / `automatedMatchPick` in `lib/monkey.ts`:

   ```sql
   SELECT id, automation_strategy FROM users WHERE automation_strategy IS NOT NULL;
   ```

   For each automated user and this match's `(odds_home, odds_draw,
   odds_away)`, compute their pick:

   - Build the three outcomes `('1', odds_home)`, `('X', odds_draw)`,
     `('2', odds_away)` and sort by odds **descending**, ties broken by
     that fixed `1, X, 2` order.
   - `max` → the **first** (highest-odds) outcome's pick.
   - `mid` → the **middle** (2nd of 3) outcome's pick.
   - `min` → the **last** (lowest-odds) outcome's pick.
   - `monkey` → a pick chosen uniformly at random from `1`/`X`/`2`
     (independent of odds).

   Then upsert one row per automated user for this match:

   ```sql
   INSERT INTO predictions (user_id, match_id, pick)
   VALUES ('<user_id>', '<match_id>', '<pick>'), ...
   ON CONFLICT (user_id, match_id) DO UPDATE SET pick = EXCLUDED.pick;
   ```

   (Batch all automated users for one match into a single INSERT; one
   INSERT per match is fine.)

## Step 6 — Report

Print a summary table of what was actually published:

```
✓ Published | Home team       | Away team    | Kickoff           | Bot picks written
------------+-----------------+--------------+-------------------+-------------------
✓           | Mexico          | South Africa | 22:00 Jerusalem   | 3
...

Skipped (no longer eligible): [list any matches that failed the step 5.1 guard]
```
