# Missing Picks Design

## Goal

Help players notice when they have open picks they haven't submitted yet, and give admins
a quick way to see who is behind across all open match days and futures — so admins can
nudge stragglers before bets lock.

## Scope

Two surfaces, both read-only displays built on data the app already has:

1. A banner on `/predict` shown to a player when they have open (published, unlocked)
   matches, pikanteria, or futures picks they haven't submitted yet.
2. A new admin page at `/admin/missing-picks` showing an aggregate summary per open
   match day plus a per-player breakdown of how many picks each approved real player
   is missing.

No new tables, columns, RPCs, or write paths. No notification delivery (push/email) —
purely in-app, computed fresh on each render from existing `predictions`,
`pikanteria_answers`, and `pre_tournament_picks` data.

## Recommended Approach

Reuse the exact aggregation pattern already proven in `/admin/players/[userId]`, which
computes `submittedBets / totalBets` over open match days using `getPublishedMatchDaysWithAll`,
`getUserPredictions`, `getUserPikanteriaAnswers`, `isMatchLocked`, and
`hasCompletedPreTournamentPick`.

Extract that pattern into a small pure helper module, `lib/missing-picks.ts`, with two
functions:

- `computeUserMissingCounts(...)` — returns `{ total, submitted, missing }` for one user;
  used by the `/predict` banner from data the page already fetches.
- `computeAllPlayersMissingPicks(...)` — returns per-day aggregate counts and per-player
  missing totals; used by the admin page.

Both functions are pure (no Supabase calls), so they're easy to unit test and keep the
existing pages' data-fetching shape intact.

### Why not a new RPC or client-side realtime fetch

A dedicated SQL aggregation RPC (`get_missing_picks_summary()`) would require a new
migration and duplicate logic that's already expressible from existing tables — overkill
for a private friend-group app of roughly twenty players. A client-side fetch with
Supabase Realtime subscriptions would add complexity for a dashboard that doesn't need
sub-second updates; a server-rendered one-shot read is consistent with every other admin
page in this codebase.

## User-Facing Banner (`/predict`)

**Placement:** Directly below the "Today's picks" header, above the futures section and
match days — the first thing a returning player sees.

**Trigger:** Shown only when `missing > 0`. The count covers:

- Open (published, unlocked) matches without a `predictions` row
- Open (published, unlocked) pikanteria without a `pikanteria_answers` row
- Futures (winner + top scorer), counted only when
  `futures_published && !futures_locked && !hasCompletedPreTournamentPick(...)`

**Content:** A compact warning-style card using existing design tokens
(`--color-amber`/`--color-danger`, matching the "Locks" badge and `FuturesBadge` styles):

```
⚠️  You have 4 open picks left
    Submit before they lock to keep scoring points
```

No deep link to a specific item — the relevant cards are already listed below on the
same page, so the count alone is enough to prompt action.

**No dismiss/snooze state.** The banner is derived purely from current data on each
render; it disappears naturally once the player picks or the remaining items lock. This
avoids any new table or local/client storage.

**Component:** `components/missing-picks-banner.tsx` — a thin display component that
receives `{ missing, total }` as props computed inline by the `/predict` Server Component
(which already has all the necessary data fetched). Renders nothing when `missing === 0`.

## Admin Missing-Picks Dashboard (`/admin/missing-picks`)

**Entry point:** New card in `app/admin/page.tsx`'s `sections` array:

```
{ href: '/admin/missing-picks', icon: '🔔', label: 'Missing Picks', desc: 'See who still needs to submit picks' }
```

**Layout — two parts, top to bottom:**

1. **Aggregate summary** — one compact card per open match day, styled like the existing
   panel cards on `/admin/players`:

   ```
   Sat Jun 8 · Group Stage
   8 / 12 players submitted · 4 missing
   ```

   Plus one card for futures: `Tournament Winner & Top Scorer · 9 / 12 completed`.

   Sorted by date ascending (soonest-locking days first).

2. **Per-player breakdown** — approved real players only (excluding monkeys, mirroring
   the `realPlayers` filter in `/admin/players`), each row showing:

   ```
   Daisy K.                          🏆 ✗   3 missing
   ```

   - Reuses the `FuturesBadge`-style ✓/✗ indicator for futures completion
   - Shows total missing-pick count across all open days
   - Sorted with the most-missing players first
   - Links to `/admin/players/[userId]`, which already shows the full per-bet breakdown
     for that player — no need to duplicate that detail UI here

**Empty state:** When there are no open match days and all futures are complete, show a
"✅ Everyone's caught up" message, mirroring the empty state already used in
`/admin/players/[userId]`.

**Data fetching (Server Component, `createAdminClient()` + `assertAdmin()`):**

- `getPublishedMatchDaysWithAll(supabase)`
- `supabase.from('predictions').select('user_id, match_id')`
- `supabase.from('pikanteria_answers').select('user_id, pikanteria_id')`
- `supabase.from('pre_tournament_picks').select('user_id, winner_team, top_scorer')`
- `supabase.from('users').select('*').eq('status', 'approved').eq('is_monkey', false)`

All fetched in parallel via `Promise.all`, then passed to `computeAllPlayersMissingPicks`.

## Testing

`lib/missing-picks.test.ts`, following the existing pure-function test pattern (e.g.
`lib/pre-tournament.test.ts`, `lib/h2h.test.ts`):

- User with zero open items → `missing: 0`
- User missing only a match, only a pikanteria, only futures, or a mix
- Locked or unpublished items excluded from totals (mirrors `filterOpenDays` in
  `/admin/players/[userId]`)
- Aggregate counts correct across multiple days and multiple players
- Monkey/automated users excluded from the admin aggregate
- Futures counted only when `futures_published && !futures_locked`

## Edge Cases and Reuse

- `isMatchLocked()` from `lib/lock.ts` determines match lock state (same as
  `/admin/players/[userId]`)
- `hasCompletedPreTournamentPick()` from `lib/pre-tournament.ts` determines futures
  completion
- No new RLS policies or migrations — admin reads go through `createAdminClient()`; the
  banner reads go through the user's own session, scoped to `user.id` exactly like the
  rest of `/predict`
- Purely a read/display feature: no scoring, save-RPC, or audit-log implications
