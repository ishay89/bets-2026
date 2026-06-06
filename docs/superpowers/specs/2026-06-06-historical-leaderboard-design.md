# Historical Leaderboard Design

## Goal

Let approved users view the leaderboard as of any scored match day, so they can audit how each player's total changed day by day and confirm the standings remain consistent with the previous scored day.

## Scope

The historical view is available on the public `/leaderboard` page for the same users who can already see the live leaderboard. It is based only on scored match days, not arbitrary calendar dates.

The live leaderboard remains the default view. Selecting a scored match day switches the leaderboard into an "as of" mode backed by `score_snapshots`.

## Recommended Approach

Use `score_snapshots` as the source of historical standings.

Each scored match day already has one snapshot row per user with:

- `day_points`
- `cumulative_points`
- `match_points`
- `pikanteria_points`
- validation fields used by `/admin/scores`

The historical leaderboard should query those snapshots joined to `users` and `match_days`, filter users to `status = 'approved'`, rank by `cumulative_points`, and compare each row to the previous scored match day's snapshot for the same user.

This avoids replaying raw prediction rows in application code and keeps the user-facing audit view aligned with the existing validated snapshot model.

## URL and Navigation

The route remains `/leaderboard`.

Query parameters:

- No `day` parameter: show the current live leaderboard, as today.
- `?day=<match_day_id>`: show the historical leaderboard for that scored match day.

The page header should include a compact scored-day selector. The selector options should be:

- `Live`
- One option per scored match day, sorted newest first, labeled with date and stage.

If `day` is provided but does not match a scored day, fall back to live mode.

## Data Contract

Create a historical leaderboard row shape that mirrors the live leaderboard row enough for the existing UI to render it:

- `id`
- `display_name`
- `is_monkey`
- `automation_strategy`
- `total_points`: snapshot `cumulative_points`
- `today_points`: snapshot `day_points`
- `previous_total_points`: previous scored day `cumulative_points`, or `null`
- `current_rank`: rank within the selected scored day
- `previous_rank`: rank within the previous scored day, or `null`
- `rank_delta`: `previous_rank - current_rank`, or `null`

Historical rows also include selected-day metadata for UI copy and tests:

- `selected_match_day_id`
- `selected_date`
- `selected_stage`

The live leaderboard continues to use `public.leaderboard`.

## UI Behavior

In live mode, keep the current Total/Today behavior and realtime refresh.

In historical mode:

- Render the leaderboard in Total mode by default.
- Show each player's total as of the selected scored day.
- Show `+N.NN today` using the selected day's `day_points`.
- Show rank movement relative to the previous scored day when available.
- Do not use realtime refresh, because historical snapshots are stable until an admin recalculates snapshots.
- Use a short header label such as `As of Jun 14 - group`.

The existing compact mobile leaderboard presentation should remain intact. Historical mode should not introduce a separate admin-style table on the player page.

## Consistency and Visibility

Historical rows must match the live leaderboard visibility contract:

- Include only approved users.
- Include approved automated marker users.
- Exclude pending and blocked users even if their raw prediction rows or snapshot rows are readable.

The selected day's standings should be rankable even if some users have no previous-day snapshot. In that case their previous rank and rank delta are hidden.

## Edge Cases

- No score snapshots exist: show live leaderboard and no historical day options.
- Selected day has snapshots but no previous scored day: show day points and current rank, but no rank delta.
- A user's selected-day snapshot is invalid: still show the row. Validation status stays on `/admin/scores` and is not rendered on the public leaderboard in this version.
- Admin recalculates snapshots: historical rows should update on the next page load.
- Ties should use PostgreSQL `rank()` semantics so tied users share the same rank.

## Testing

Add pure helper tests for building historical leaderboard rows:

- Ranks selected-day rows by cumulative points.
- Computes positive and negative `rank_delta` against the previous scored day.
- Hides previous-rank fields when no previous scored day exists.
- Filters out non-approved users.

Add page/data tests only where existing patterns make them practical. At minimum, run the new helper tests and lint before finishing implementation.
