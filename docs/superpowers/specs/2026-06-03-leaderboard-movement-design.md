# Leaderboard Movement Design

## Goal

Show rank movement on the total leaderboard so players can see how their standing changed since the latest scored snapshot day.

## Scope

Movement is shown only for the main `Total` leaderboard mode. The `Today` mode remains a daily-points ranking and does not show rank movement.

The visible target format is compact:

- Current total rank, for example `#7`.
- Rank delta, for example `+3` or `-2`.
- Latest scored day points, for example `+8.50 today`.

## Recommended Approach

Extend the existing `public.leaderboard` SQL view in a new migration.

The view already identifies the latest scored match day and exposes that snapshot row as `today_points`. The movement calculation will reuse that same day:

1. Compute each approved player's current `total_points` using the existing leaderboard point math.
2. Compute `previous_total_points` as `total_points - today_points`.
3. Rank current standings by `total_points`.
4. Rank previous standings by `previous_total_points`.
5. Expose `previous_rank`, `current_rank`, and `rank_delta`, where `rank_delta = previous_rank - current_rank`.

With that formula, moving from rank 10 to rank 7 displays `+3`; moving from rank 10 to rank 12 displays `-2`.

## Data Contract

`LeaderboardEntry` will keep the existing fields:

- `id`
- `display_name`
- `is_monkey`
- `automation_strategy`
- `total_points`
- `today_points`

It will add nullable movement fields:

- `current_rank: number | null`
- `previous_rank: number | null`
- `rank_delta: number | null`
- `previous_total_points: number | null`

Nullable fields allow the UI to handle empty or not-yet-scored leaderboard states without inventing fake movement.

## UI Behavior

`components/leaderboard.tsx` will continue to sort total mode using the server-provided order. In `Total` mode it will display:

- The current rank from the row when present, falling back to the displayed index.
- A compact delta chip for positive or negative movement.
- A `+N.NN today` label when `today_points > 0`.

In `Today` mode:

- Entries are still sorted by `today_points`.
- The movement chip is hidden.
- The score remains the selected daily score.

The display should stay dense and scannable on mobile, matching the existing leaderboard style.

## Edge Cases

- If no latest scored day exists, `today_points` remains `0` and movement fields are `null`.
- If a player has no snapshot for the latest scored day, their `today_points` is `0`, and their movement should be neutral or hidden.
- Automated marker users remain included because the existing leaderboard view includes approved users and automated users are approved.
- Ties should use the same SQL ranking function for current and previous rank. `rank()` is preferred because it reflects competition-style standings and avoids pretending tied players have distinct positions.

## Testing

Add pure UI/helper tests for movement formatting:

- Positive rank delta formats as `+3`.
- Negative rank delta formats as `-2`.
- Zero or null rank delta is hidden.
- Positive latest day points format as `+8.50 today`.

Run the relevant Vitest file after the failing test is added and again after implementation. Run `npm run lint` when the implementation is complete.

If local Supabase is unavailable, inspect the SQL migration and note that it was not applied locally.
