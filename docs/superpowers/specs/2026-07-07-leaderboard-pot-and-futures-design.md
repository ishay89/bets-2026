# Leaderboard Pot Payouts & Futures Picks Design

## Goal

Show two new pieces of information on the leaderboard:

1. Each player's pre-tournament futures picks — champion team and top scorer — inline under their name.
2. Who earns the prize pot: the top 5 real players get green prize amounts, mirroring the existing red "pays extra" fine chips at the bottom.

## Prize & Fine Rules

Prize pot (total ₪7,100), paid by final standing:

| Place | Amount |
| ----- | ------ |
| 1st   | ₪3,400 |
| 2nd   | ₪2,380 |
| 3rd   | ₪1,020 |
| 4th   | ₪200   |
| 5th   | ₪100   |

Fines (existing behavior, logic moves into the new module):

- Last real player pays ₪200.
- Second-to-last real player pays ₪100.

**Eligibility — "real players" only.** Excluded from both prizes and fines:

- Automated baselines: `automation_strategy` in `min` / `mid` / `max` / `monkey`, or `is_monkey`.
- AI players Claude and Codex, matched by their stable IDs from `AI_USERS` in `lib/ai-picks.ts` (robust against display-name edits).

This is a behavior change for fines: today Claude/Codex are treated as finable humans. After this change fines skip them, so the bottom two *real* users pay.

Prizes and fines are computed independently. In the unrealistic case a pool is so small that one player qualifies for both (fewer than 7 eligible players), both chips render.

## Data Layer

No DB migration. New cached fetch in `app/leaderboard/page.tsx`:

- `getCachedFuturesPicksForLeaderboard()` reads `tournament_settings.futures_locked`.
  - Not locked → returns `null`; picks stay hidden pre-lock, matching the existing reveal gating.
  - Locked → returns `Record<userId, { winner: string; scorer: string }>` from `pre_tournament_picks` (`user_id`, `winner_team`, `top_scorer`).
- Cached via `unstable_cache` like the sibling leaderboard fetches (picks are immutable after lock; 30 min TTL, `leaderboard` tag).

The map is passed as an optional prop through `LeaderboardRealtime` into `Leaderboard`, and directly to `Leaderboard` for the historical view. Realtime updates don't touch it.

## Pot Logic Module

New pure module `lib/leaderboard-prizes.ts` with vitest tests (TDD):

- `PRIZES = [3400, 2380, 1020, 200, 100]`, `FINES = [200, 100]`.
- `isRealUser(entry: LeaderboardEntry): boolean` — not automated and not an `AI_USERS` id.
- `computePotAssignments(sortedEntries): { prizeByEntryId: Map<string, number>, fineByEntryId: Map<string, number> }`. Walks the already-sorted entries; assigns prize amounts to the first 5 eligible players and fines to the last 2 eligible players. The two maps are independent, so a player qualifying for both (see edge case above) simply appears in both and gets both chips.
- The component's current inline fine logic (`fineByEntryId`) is replaced by this module.

Edge cases covered by tests:

- Fewer than 5 eligible players → only that many prizes assigned.
- Fewer than 2 eligible players → 1 fine or none.
- Markers, monkey, Claude, and Codex interleaved in the standings are skipped without consuming prize/fine slots.
- Prize/fine overlap when eligible count < 7.

## UI Behavior (`components/leaderboard.tsx`)

**Picks line.** Under each display name — in both the podium and the list rows — a muted 10–11px line:

> 🏆 🇫🇷 France · ⚽ Mbappé

- Uses the existing `getFlag()` helper from `lib/display` for the champion flag.
- Shown for every player who has a pick, including markers/AI (they are already visually dimmed).
- Players without a pick get no line (no placeholder).
- When the picks prop is absent (`null` pre-lock), nothing renders — layout identical to today.

**Prize chips.** Green/accent `₪3,400`-style amounts, same visual language as the red fine chips:

- List rows: right-edge chip in the slot where fine chips render today.
- Podium (top 3): amount rendered under the podium spot's metrics.
- Formatting: prizes render as `₪3,400` (thousands separator via `toLocaleString`, no sign); fines keep their existing `+₪200` format.

**Visibility mode.** Prize and fine chips render only in the **Total + Score** view (`scoreMode === 'total' && sortMode === 'score'`) — the real standings. This slightly tightens the existing fines display, which today also renders under the "Today" ordering where amounts are misleading. The historical day view renders the same component in Total mode, so as-of-day chips and picks appear there too.

**Danger zone banner** keeps its current behavior, driven by the new module's fine assignments.

## Not Changing

- `leaderboard` DB view / schema, realtime subscription payloads, score snapshots.
- The reveal sheets on `/predict` — they remain the pre-lock-safe way to browse picks.

## Testing

- `lib/leaderboard-prizes.test.ts` — pure-function coverage listed above.
- Existing component behavior verified via `npm test` suite; manual check of the leaderboard page (picks line, chips, mode gating) via local render.
