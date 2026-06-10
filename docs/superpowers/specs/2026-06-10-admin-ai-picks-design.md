# Admin "Pick for AI" Design

## Goal

Give admins a UI to enter bets on behalf of the two AI-controlled players, Claude and
Codex — daily match predictions, pikanteria answers, and futures (tournament winner +
top scorer). Additionally, give the four automated benchmark bots (Monkey, Always Max,
Always Mid, Always Min) strategy-generated futures picks, which they currently lack.

## Background

Claude (`00000000-0000-0000-0000-000000000006`) and Codex (`...0005`) were created by
`20260608000000_ai_dummy_users.sql` as approved regular players — deliberately **not**
automated markers. The migration states that admins or service-role processes write
their predictions directly using these stable IDs. This feature is the missing UI for
that sanctioned write path.

The `save_match_prediction` / `save_pikanteria_answer` RPCs are `auth.uid()`-scoped, so
an admin cannot use them on behalf of another user. The established precedent for
writing picks for non-human users is `/admin/publish`, which upserts `predictions` and
`pikanteria_answers` rows directly with the service-role client at publish time.

The benchmark bots get match/pikanteria picks at publish time via `lib/monkey.ts`, but
nothing ever writes `pre_tournament_picks` for them — they silently score zero on the
futures bonuses.

## Scope

1. A new admin page at `/admin/ai-picks` ("Pick for AI") where the admin selects Claude
   or Codex and enters their futures picks and 1/X/2 picks for open matches and
   pikanteria.
2. A "Generate bot futures" action on the same page that fills missing
   `pre_tournament_picks` rows for the four benchmark bots by their existing strategies.

Out of scope: no new tables, columns, or RPCs; no changes to scoring, locking, or the
human prediction flow; no automation that calls an actual AI model — the admin sources
the picks (e.g. by asking Claude/Codex in a chat) and enters them by hand.

## Rules

- **Locks are respected everywhere.** AI picks can only be entered or changed while the
  item is open: matches via `isMatchLocked()`, pikanteria via `locked`, futures via
  `tournament_settings.futures_locked`. Locked items do not render pick controls, and
  every Server Action re-checks lock state at save time (the page is server-rendered,
  so an item can lock between render and click).
- **Target allowlist.** Write actions accept only the two AI user IDs, exported as a
  constant from a new `lib/ai-users.ts`. No other user can be written through this page.
- **Odds snapshots.** Prediction/answer/futures rows are written with the same odds
  snapshot columns the existing flows write, so later admin odds edits cannot change
  already-entered picks' value (consistent with the publish-time bot rows and the human
  futures flow).
- **Audit trail.** Every created/changed Claude/Codex pick writes a
  `user_prediction_audit_events` row via `writeAuditEvent`, attributed to the AI user
  with `metadata: { entered_by_admin: true }`, deduplicated with
  `shouldWriteAuditEvent`. Changes are then visible in `/admin/audit` like any player's
  commits. Bot futures generation does **not** write audit events, matching the
  publish-time bot pick precedent.

## Page: `/admin/ai-picks`

**Entry point:** new card in `app/admin/page.tsx`'s `sections` array:

```
{ href: '/admin/ai-picks', icon: '🤖', label: 'Pick for AI', desc: 'Enter bets for Claude, Codex, and bot futures' }
```

**Layout — top to bottom:**

1. **AI user toggle** — a segmented Claude / Codex switch driven by a `?user=` search
   param (server-rendered; defaults to Claude). All sections below show and write that
   user's picks.
2. **Futures** — winner and top scorer selects built from `TEAMS` / `SCORERS` in
   `lib/pre-tournament.ts`, showing current odds, pre-selected with the AI user's
   existing pick. Disabled with a lock notice when `futures_locked`.
3. **Open bets by day** — reuses `getPublishedMatchDaysWithAll` plus the same
   open-day filtering as `/admin/players/[userId]`: published, unlocked matches and
   pikanteria grouped by match day, sorted by kickoff. Each row shows the teams /
   question and three odds-chip buttons (1 / X / 2; X omitted for two-way pikanteria),
   with the AI user's current pick highlighted. Tapping a chip saves immediately via a
   Server Action (same interaction model as `/predict`).

4. **Bot futures panel** — visually separated section at the bottom (it concerns the
   four benchmark bots, not the selected AI user). Shows each bot's current futures
   status (✓ picks or ✗ missing) and a **Generate bot futures** button.

**Empty state:** when nothing is open and futures are locked, sections 2–3 collapse
into a "Nothing open to pick" message mirroring the existing admin empty states; the
bot futures panel remains visible (read-only when locked).

## Write Path (Server Actions, `app/admin/ai-picks/actions.ts`)

All actions call `assertAdmin()` first and use the service-role client for writes.

- `saveAiMatchPick(userId, matchId, pick)` — validates `userId` against the AI
  allowlist and `pick` via `lib/validation.ts`; re-fetches the match and rejects if
  unpublished or locked; upserts `predictions` on `(user_id, match_id)` with the odds
  snapshot; writes the audit event.
- `saveAiPikanteriaPick(userId, pikanteriaId, pick)` — same shape; additionally rejects
  `X` on two-way questions (`odds_x` null), mirroring the RPC's validation.
- `saveAiFutures(userId, winnerName?, topScorerName?)` — winner and top scorer are
  saved independently (either may be omitted, preserving the existing value — same as
  the human flow's separate winner/scorer actions); validates provided names against
  `TEAM_NAMES` / `SCORER_NAMES`; rejects when `futures_locked`; upserts
  `pre_tournament_picks` with odds snapshotted from `TEAMS` / `SCORERS` (same shape as
  `app/predict/pre-tournament-actions.ts`); writes the audit event.
- `generateBotFutures()` — rejects when `futures_locked`; loads the four automated
  users and their existing `pre_tournament_picks`; builds rows only for bots **missing**
  a pick (never overwrites — re-clicking must not re-roll Monkey's random pick);
  inserts them and returns a `created N, skipped M` summary rendered on the page.

Validation/row-building logic that doesn't need a database lives in pure helpers
(`lib/ai-picks.ts`) so it can be unit tested, mirroring how `lib/prediction-saves.ts`
and `lib/scoring-writes.ts` keep logic testable.

## Bot Futures Generation (`lib/monkey.ts`)

New pure builder:

```ts
buildAutomatedFuturesRows(users, teams, scorers)
// → { user_id, winner_team, winner_odds, top_scorer, top_scorer_odds }[]
```

One row per bot. Winner is chosen from `TEAMS` and top scorer from `SCORERS` using the
exact semantics of `automatedMatchPick`: sort candidates by descending odds with stable
list order as tie-break; `max` takes the first, `min` the last, `mid` takes index
`floor(n / 2)`; `monkey` picks uniformly at random. Odds are snapshotted from the
chosen entries.

## Testing

Following the existing pure-function test pattern:

- `lib/monkey.test.ts` additions — `buildAutomatedFuturesRows`: max/mid/min select the
  expected team and scorer for a known odds list (including ties), monkey's pick is a
  member of the list, odds snapshots match the chosen entries, one row per user.
- `lib/ai-picks.test.ts` — AI user allowlist acceptance/rejection; pick validation
  including X-on-two-way rejection; fill-missing-only filtering for bot futures
  (existing picks excluded, no overwrites); upsert row shapes include the odds
  snapshots.

UI and Server Actions are not unit tested (consistent with the rest of the admin
surface); lock re-checks live in the actions and are exercised manually.

## Edge Cases and Reuse

- `isMatchLocked()` from `lib/lock.ts` for match lock state; `locked` flag for
  pikanteria; `tournament_settings.futures_locked` for futures — same checks as the
  player flow.
- A match locking between page render and chip tap is caught by the save-time re-check
  and surfaces as a "locked" error message on the page.
- `generateBotFutures` is idempotent: a second click creates nothing and reports
  `created 0, skipped 4`.
- Claude/Codex rows flow into the leaderboard, crowd picks, H2H, and score snapshots
  exactly like human rows — no special-casing anywhere downstream, which is the point
  of them being ordinary approved users.
- No new RLS policies or migrations; all writes go through the service-role client in
  admin-guarded Server Actions, consistent with `/admin/publish`.
