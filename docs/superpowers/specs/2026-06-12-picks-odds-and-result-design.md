# Picks Sheet: Odds + Result Verdict Design

## Goal

The `👁 Picks` bottom sheet (`PredictionRevealSheet`) shows who picked what for a match, pikanteria, or futures (champion/top scorer). Currently it only shows each player's pick label. This adds:

1. The odds associated with each player's pick.
2. Once a match/pikanteria has a `result`, a ✓/✗ verdict badge showing whether each player's pick was correct.

## Scope

- **Match & pikanteria reveal sheets** (opened via the `👁 Picks` button on `BetCard`): odds + ✓/✗ verdict (once `result` is set).
- **Futures reveal sheets** (champion / top scorer, opened from `PreTournamentFutures`): odds only. No verdict badge — there is no per-item "result" exposed for futures (tournament winner/top scorer are only resolved at tournament close via `score_tournament_end`), and the user did not ask for this. Out of scope for this change.

## Data Layer (`lib/prediction-reveals.ts`)

Add a single new field to the shared row type:

```ts
export type PlayerRevealRow = {
  userId: string
  displayName: string
  isMonkey: boolean
  automationStrategy: AutomationStrategy | null
  avatarEmoji: string | null
  pick: string
  odds: number | null   // NEW
  rank: number
  totalPoints: number
}
```

- `getMatchPredictionsReveal` and `getPikanteriaAnswersReveal`: set `odds: null` for every row. No new query — `BetCard` already has the per-outcome odds via its `options` prop and fills this in client-side before rendering the sheet (see below).
- `getFuturesReveal`:
  - Extend the `pre_tournament_picks` select to include `winner_odds, top_scorer_odds`.
  - Extend `FuturesRaw` type with `winner_odds: number` and `top_scorer_odds: number`.
  - When building the `winner` list, set `odds: p.winner_odds` per row.
  - When building the `scorer` list, set `odds: p.top_scorer_odds` per row.

`sortAndRankRevealRows` is unchanged (odds doesn't affect sort).

## UI: `components/bet-card.tsx`

When rendering `<PredictionRevealSheet>`:

- Build `oddsByPick: Partial<Record<Pick, number>>` from `options` via `Object.fromEntries(options.map(o => [o.pick, o.odds]))`.
- Map `state.revealRows` to fill in `odds` per row: `{ ...row, odds: oddsByPick[row.pick as Pick] ?? null }`.
- Pass the new `result={result}` prop through to the sheet.

`pre-tournament-futures.tsx` needs no changes — `getFuturesReveal` rows already carry the correct `odds`, and `result` is simply not passed (defaults to `null`/`undefined`), so no verdict badge appears there.

## UI: `components/prediction-reveal-sheet.tsx`

- New optional prop: `result?: Pick | null` (import `Pick` from `@/lib/types`).
- Each row's pick column becomes a right-aligned 2-line stack (replacing the current single `.prediction-reveal-pick` span):
  - **Line 1**: optional verdict badge + pick label.
    - Verdict badge renders only when `result != null`: `✓` in `var(--color-accent)` if `row.pick === result`, else `✗` in `var(--color-danger)`.
    - Pick label keeps its existing color-coding logic (`MATCH_PICK_COLORS` / `SEG_COLORS` via `optionLabels`).
  - **Line 2**: `row.odds?.toFixed(2)`, rendered only when `row.odds != null`, in small muted mono text (matches the odds styling under `PickButtons` in `bet-card.tsx`).

### New CSS (`app/globals.css`, near the existing `.prediction-reveal-*` rules)

```css
.prediction-reveal-pick-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
  gap: 2px;
}

.prediction-reveal-odds {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-muted);
}
```

`.prediction-reveal-pick` (existing rule) stays as the label style, now nested inside `.prediction-reveal-pick-wrap` alongside an inline verdict badge on line 1.

## Edge Cases

| Scenario | Behaviour |
|---|---|
| `result` not passed (futures sheets, or match/pika before result is entered) | No ✓/✗ badge rendered |
| `row.odds` is `null` | Odds line omitted entirely |
| Pikanteria two-way question (no `X`) | Unaffected — `oddsByPick` only contains the two real outcomes; `optionLabels`/color logic unchanged |
| Current user's row highlight (accent background + left border) | Unchanged — verdict badge is additive, doesn't alter row background |

## Files Changed

| File | Change |
|---|---|
| `lib/prediction-reveals.ts` | Add `odds: number \| null` to `PlayerRevealRow`; populate from `pre_tournament_picks.winner_odds`/`top_scorer_odds` in `getFuturesReveal`; set `odds: null` in the match/pikanteria fetchers |
| `lib/prediction-reveals.test.ts` | Update the `base` row fixture to include `odds: null` |
| `components/bet-card.tsx` | Build `oddsByPick`, map `revealRows` to inject `odds`, pass `result` to the sheet |
| `components/prediction-reveal-sheet.tsx` | New `result?` prop; render verdict badge + odds in a 2-line pick column |
| `app/globals.css` | Add `.prediction-reveal-pick-wrap` and `.prediction-reveal-odds` |

## Testing

- Update/run `lib/prediction-reveals.test.ts` (Vitest) for the type change.
- Manual check on `/predict`:
  - Locked match/pikanteria with no result yet: Picks sheet shows odds per player, no ✓/✗.
  - Locked match/pikanteria with a result entered (via `/admin/results`): Picks sheet shows ✓ (green) for players who picked the winning outcome, ✗ (red) for others, plus odds for all.
  - Futures (champion/top scorer) Picks sheet: shows each player's locked-in odds, no verdict badge.
- `npm run lint` after implementation.
