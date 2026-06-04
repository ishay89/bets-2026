# Prediction Reveal Design

## Goal

After a match or pikanteria item locks, let any player tap a button on the card to see who picked what — sorted by leaderboard rank. Creates immediate social tension before results are known.

## Scope

- Reveal button appears on `MatchCard` and `PicanteriaCard` only when `isLocked` is true.
- Shows all players (humans and automated baselines alike), sorted by current leaderboard rank.
- Implemented as an on-demand fetch (lazy): no data is pre-loaded; the server action fires only when the user opens the sheet.
- No new RLS migrations required — `010_crowd_picks.sql` already allows reading other players' picks after lock.

## Data Layer

### New file: `lib/prediction-reveals.ts`

Two server actions, both `'use server'`:

**`getMatchPredictionsReveal(matchId: string): Promise<PlayerRevealRow[]>`**

Queries `predictions` joined to `users` (for `display_name`, `is_monkey`, `automation_strategy`) and the `leaderboard` view (for `total_points`). Validates `matchId` as a UUID. Returns rows sorted by `total_points DESC`; the `rank` field in each row is the 1-based position in that sorted result (computed in the server action, not from a view column).

**`getPikanteriaAnswersReveal(picanteriaId: string): Promise<PlayerRevealRow[]>`**

Same pattern but joins `pikanteria_answers` → `users` → `leaderboard`. Returns the chosen `option_id` in the `pick` field so the sheet can resolve it to a label via the `optionLabels` prop. Rank is also 1-based position in the `total_points DESC` sorted result.

### Shared return type

```ts
type PlayerRevealRow = {
  userId: string
  displayName: string
  isMonkey: boolean
  automationStrategy: AutomationStrategy | null
  pick: string        // Pick value ('1'|'X'|'2') for matches; option_id for pikanteria
  rank: number | null
  totalPoints: number
}
```

Both actions reuse `parseUUID` from `lib/validation.ts` for input validation and return an empty array on any error (the UI surfaces a fetch-error state separately via try/catch at the call site).

## UI Components

### New file: `components/prediction-reveal-sheet.tsx`

Client component (`'use client'`). Props:

```ts
interface PredictionRevealSheetProps {
  title: string                          // e.g. "France vs Spain · Picks"
  rows: PlayerRevealRow[]
  myUserId: string
  optionLabels?: Record<string, string>  // option_id → label, for pikanteria
  onClose: () => void
}
```

Layout:
- Fixed-position full-screen backdrop (`rgba(0,0,0,0.55)`) dismisses on click.
- Sheet anchored to bottom: `max-height: 70vh`, `overflow-y: auto`, `border-radius: 20px 20px 0 0`, animated slide-up via CSS `transform` transition (no external animation library).
- Drag handle at top center.
- Title row with match/question label and an `×` close button.
- Scrollable player list. Each row:
  - Avatar via `getAvatar()` from `lib/display.ts` in a 30px circle.
  - Display name + optional automation label via `getAutomationLabel()`.
  - Rank chip: `#N` in muted mono font, or `—` if null.
  - Pick label on the right, color-coded:
    - Match picks: `1` → `--color-accent`, `X` → `--color-dim`, `2` → `--color-amber`.
    - Pikanteria: cycles a `SEG_COLORS` constant inlined in the sheet (same values as in `pikanteria-card.tsx` — no extraction needed).
  - Current user's row: `--color-accent-soft` background, accent border — no other visual distinction.
- Empty state: `"No picks recorded yet"` with a 🗳️ icon when `rows` is empty.

### Changes to `MatchCard` (`components/match-card.tsx`)

The `CrowdSection` sub-component receives two new optional props: `onReveal?: () => void` and `revealLoading?: boolean`. When `isLocked` is true and `onReveal` is provided, a `"👁 Picks"` button appears below the crowd bar. While `revealLoading` is true the button shows a spinner and is disabled.

`MatchCard` gains:
- `myUserId: string` prop (passed in from the predict page server component).
- Local state: `revealRows: PlayerRevealRow[] | null`, `revealLoading: boolean`, `revealError: boolean`, `sheetOpen: boolean`.
- `handleReveal()` async function: sets `revealLoading = true`, calls `getMatchPredictionsReveal(match.id)`, stores result, sets `sheetOpen = true`. On error sets `revealError = true`.
- Renders `<PredictionRevealSheet>` when `sheetOpen` is true.
- Error state: replaces button label with `"Could not load picks"` in `--color-danger`; user can retry.

### Changes to `PicanteriaCard` (`components/pikanteria-card.tsx`)

Same pattern. Passes `optionLabels` derived from `item.options` (`Record<id, label>`) to the sheet. Button appears below the crowd bar when `isLocked`.

### Changes to `app/predict/page.tsx`

- Pass `myUserId={user.id}` to every `<MatchCard>` and `<PicanteriaCard>`.

## Edge Cases

| Scenario | Behaviour |
|---|---|
| No picks after lock | Sheet shows empty state with `"No picks recorded yet"` |
| Fetch error | Inline error on button, no sheet. User can retry. |
| Current user has not picked | No highlight row; the user's entry is simply absent |
| Many players (20+) | Sheet scrolls within `max-height: 70vh` |
| Pikanteria option labels | Passed as `optionLabels` prop from card — no extra fetch |
| Automated players | Included, sorted by rank, display via existing `getAvatar`/`getAutomationLabel` |

## Files Changed

| File | Change |
|---|---|
| `lib/prediction-reveals.ts` | **New** — two server actions + `PlayerRevealRow` type |
| `components/prediction-reveal-sheet.tsx` | **New** — bottom sheet client component |
| `components/match-card.tsx` | Add reveal button + sheet integration |
| `components/pikanteria-card.tsx` | Add reveal button + sheet integration |
| `app/predict/page.tsx` | Pass `myUserId` prop to cards |

## Testing

- Manually verify the button is hidden before lock and visible after lock.
- Verify the sheet opens, shows the correct player list sorted by rank, and highlights the current user's row.
- Verify the empty state renders when no picks exist.
- Verify dismissal via backdrop click and `×` button both work.
- Run `npm run lint` after implementation.
