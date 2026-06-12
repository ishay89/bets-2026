# Picks Sheet: Odds + Result Verdict Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the `👁 Picks` bottom sheet, show the odds for each player's pick (matches, pikanteria, and futures), and once a match/pikanteria has a `result`, show a ✓/✗ verdict per player.

**Architecture:** Add a single `odds: number | null` field to the shared `PlayerRevealRow` type. For matches/pikanteria, `BetCard` fills this in client-side from its existing `options` (per-outcome odds it already has); for futures, `getFuturesReveal` populates it server-side from `pre_tournament_picks.winner_odds`/`top_scorer_odds`. `PredictionRevealSheet` gains an optional `result?: Pick | null` prop and renders a 2-line pick column (verdict badge + label, then odds).

**Tech Stack:** Next.js 16 (App Router, Server Components/Actions), React 19, TypeScript strict, Tailwind CSS 4 + CSS custom properties, Vitest, ESLint.

Spec: `docs/superpowers/specs/2026-06-12-picks-odds-and-result-design.md`

---

## Task 1: Add `odds` to `PlayerRevealRow` and populate it in all three reveal fetchers

**Files:**
- Modify: `lib/prediction-reveals.ts`
- Modify: `lib/prediction-reveals.test.ts`

- [ ] **Step 1: Add `odds` to the shared row type**

In `lib/prediction-reveals.ts`, replace the `PlayerRevealRow` type (lines 6-15):

```ts
export type PlayerRevealRow = {
  userId: string
  displayName: string
  isMonkey: boolean
  automationStrategy: AutomationStrategy | null
  avatarEmoji: string | null
  pick: string
  /** Odds for this player's pick. Null for match/pikanteria rows — BetCard fills these in
   * client-side from its own `options`. Populated server-side for futures rows. */
  odds: number | null
  rank: number
  totalPoints: number
}
```

- [ ] **Step 2: Populate `odds: null` in `getMatchPredictionsReveal`**

In `lib/prediction-reveals.ts`, in `getMatchPredictionsReveal`, update the `unranked.push({...})` call (lines 72-80):

```ts
    unranked.push({
      userId: prediction.user_id,
      displayName: prediction.users.display_name,
      isMonkey: prediction.users.is_monkey,
      automationStrategy: prediction.users.automation_strategy,
      avatarEmoji: prediction.users.avatar_emoji,
      pick: prediction.pick,
      odds: null,
      totalPoints: pointsMap[prediction.user_id] ?? 0,
    })
```

- [ ] **Step 3: Populate `odds: null` in `getPikanteriaAnswersReveal`**

In `lib/prediction-reveals.ts`, in `getPikanteriaAnswersReveal`, update the `unranked.push({...})` call (lines 141-149):

```ts
    unranked.push({
      userId: answer.user_id,
      displayName: answer.users.display_name,
      isMonkey: answer.users.is_monkey,
      automationStrategy: answer.users.automation_strategy,
      avatarEmoji: answer.users.avatar_emoji,
      pick: answer.pick,
      odds: null,
      totalPoints: pointsMap[answer.user_id] ?? 0,
    })
```

- [ ] **Step 4: Select and map `winner_odds`/`top_scorer_odds` in `getFuturesReveal`**

In `lib/prediction-reveals.ts`, update the `FuturesRaw` type (lines 85-90):

```ts
type FuturesRaw = {
  user_id: string
  winner_team: string
  winner_odds: number
  top_scorer: string
  top_scorer_odds: number
  users: UserRaw
}
```

Update the `getFuturesReveal` select (line 100-104):

```ts
export async function getFuturesReveal(supabase: Db): Promise<FuturesReveal> {
  const [{ data }, pointsMap] = await Promise.all([
    supabase
      .from('pre_tournament_picks')
      .select('user_id, winner_team, winner_odds, top_scorer, top_scorer_odds, users(display_name, is_monkey, automation_strategy, avatar_emoji, status)'),
    buildPointsMap(supabase),
  ])
```

Update the return statement (lines 115-118) to set `odds` per list:

```ts
  return {
    winner: sortAndRankRevealRows(approved.map(p => ({ ...base(p), pick: p.winner_team, odds: p.winner_odds }))),
    scorer: sortAndRankRevealRows(approved.map(p => ({ ...base(p), pick: p.top_scorer, odds: p.top_scorer_odds }))),
  }
```

(`base(p)` itself, lines 107-114, is unchanged — it doesn't set `pick` or `odds`.)

- [ ] **Step 5: Update the test fixture**

In `lib/prediction-reveals.test.ts`, update the `base` fixture (line 4) to include the new required field:

```ts
const base = { isMonkey: false as const, automationStrategy: null, avatarEmoji: null, pick: '1', odds: null }
```

- [ ] **Step 6: Run the prediction-reveals tests**

Run: `npm test -- lib/prediction-reveals.test.ts`

Expected: PASS — all 5 tests in `sortAndRankRevealRows` still pass (`odds` doesn't affect sorting/ranking).

- [ ] **Step 7: Type-check the project**

Run: `npx tsc --noEmit 2>&1 | grep -v "^worktrees/"`

Expected: no output (clean). Pre-existing errors only exist under `worktrees/` (other agents' in-progress work) and are filtered out — they are unrelated to this change.

- [ ] **Step 8: Commit**

```bash
git add lib/prediction-reveals.ts lib/prediction-reveals.test.ts
git commit -m "feat: add odds field to PlayerRevealRow, populate for futures picks"
```

---

## Task 2: Render odds + ✓/✗ verdict in `PredictionRevealSheet`

**Files:**
- Modify: `components/prediction-reveal-sheet.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Import `Pick` and add the `result` prop**

In `components/prediction-reveal-sheet.tsx`, add the import (after line 4):

```ts
import type { Pick } from '@/lib/types'
```

Update the `Props` interface (lines 20-27):

```ts
interface Props {
  title: string
  rows: PlayerRevealRow[]
  myUserId: string
  /** option_id → label map; when present, treats `row.pick` as an option_id. */
  optionLabels?: Record<string, string>
  /** Winning outcome, if known. When set, each row shows a ✓/✗ verdict against `row.pick`. */
  result?: Pick | null
  onClose: () => void
}
```

Update the function signature (line 29):

```ts
export function PredictionRevealSheet({ title, rows, myUserId, optionLabels, result, onClose }: Props) {
```

- [ ] **Step 2: Replace the pick-label block with a pick column (verdict + label + odds)**

In `components/prediction-reveal-sheet.tsx`, replace the "Pick label" block (lines 125-131):

```tsx
                  {/* Pick label */}
                  <div
                    className="prediction-reveal-pick"
                    style={{ color: pickColor }}
                  >
                    {pickLabel}
                  </div>
```

with:

```tsx
                  {/* Pick label, odds, and result verdict */}
                  <div className="prediction-reveal-pick-wrap">
                    <div className="flex items-center gap-1">
                      {result != null && (
                        <span style={{ fontSize: 12, color: row.pick === result ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                          {row.pick === result ? '✓' : '✗'}
                        </span>
                      )}
                      <div className="prediction-reveal-pick" style={{ color: pickColor }}>
                        {pickLabel}
                      </div>
                    </div>
                    {row.odds != null && (
                      <div className="prediction-reveal-odds">{row.odds.toFixed(2)}</div>
                    )}
                  </div>
```

- [ ] **Step 3: Add the new CSS rules**

In `app/globals.css`, after the `.prediction-reveal-pick` rule (lines 271-276), add:

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

- [ ] **Step 4: Type-check the project**

Run: `npx tsc --noEmit 2>&1 | grep -v "^worktrees/"`

Expected: no output (clean). At this point `result` is optional and unused by existing callers (`bet-card.tsx`, `pre-tournament-futures.tsx`), so both still compile.

- [ ] **Step 5: Commit**

```bash
git add components/prediction-reveal-sheet.tsx app/globals.css
git commit -m "feat: show odds and result verdict in the picks reveal sheet"
```

---

## Task 3: Wire `oddsByPick` and `result` from `BetCard` into the sheet

**Files:**
- Modify: `components/bet-card.tsx`

- [ ] **Step 1: Compute `oddsByPick` from `options`**

In `components/bet-card.tsx`, inside `BetCard`, after the destructure block (after line 112, `const theme = THEME[variant]`), add:

```ts
  const oddsByPick: Partial<Record<Pick, number>> = {}
  for (const o of options) oddsByPick[o.pick] = o.odds
```

- [ ] **Step 2: Pass mapped rows and `result` to the sheet**

In `components/bet-card.tsx`, replace the `<PredictionRevealSheet>` block (lines 247-255):

```tsx
      {state.sheetOpen && state.revealRows !== null && myUserId && (
        <PredictionRevealSheet
          title={variant === 'match' ? `${homeTeam} vs ${awayTeam} · Picks` : (question ?? 'Picks')}
          rows={state.revealRows}
          myUserId={myUserId}
          optionLabels={variant === 'pika' ? Object.fromEntries(options.map(o => [o.pick, o.label])) : undefined}
          onClose={() => dispatch({ type: 'sheetClosed' })}
        />
      )}
```

with:

```tsx
      {state.sheetOpen && state.revealRows !== null && myUserId && (
        <PredictionRevealSheet
          title={variant === 'match' ? `${homeTeam} vs ${awayTeam} · Picks` : (question ?? 'Picks')}
          rows={state.revealRows.map(row => ({ ...row, odds: oddsByPick[row.pick as Pick] ?? null }))}
          myUserId={myUserId}
          optionLabels={variant === 'pika' ? Object.fromEntries(options.map(o => [o.pick, o.label])) : undefined}
          result={result}
          onClose={() => dispatch({ type: 'sheetClosed' })}
        />
      )}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit 2>&1 | grep -v "^worktrees/"`

Expected: no output (clean).

Run: `npm run lint`

Expected: no errors (warnings, if any, must be pre-existing — do not introduce new ones).

- [ ] **Step 4: Run the full test suite**

Run: `npm test`

Expected: PASS — all existing suites pass (this task doesn't change any pure functions covered by tests, but confirms nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add components/bet-card.tsx
git commit -m "feat: pass per-outcome odds and result into the picks reveal sheet"
```

---

## Task 4: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` and open `http://localhost:3000/predict`.

- [ ] **Step 2: Verify a locked match/pikanteria with no result yet**

Find a locked match or pikanteria card whose `result` is not yet entered (admin hasn't scored it in `/admin/results`). Tap `👁 Picks`.

Expected: the sheet opens; each row shows the player's pick label with the odds for that pick below it (e.g., `1` / `2.45`); no ✓/✗ badge appears on any row.

- [ ] **Step 3: Verify a match/pikanteria that has a result**

Using `/admin/results`, ensure at least one locked match has a `result` entered. Reload `/predict` (or `/history` if that's where scored items surface) and open its `👁 Picks` sheet.

Expected: rows whose `pick` matches the result show a green `✓` before the pick label; all other rows show a red `✗`; odds are still shown for every row regardless of the verdict.

- [ ] **Step 4: Verify the futures (champion/top scorer) picks sheet**

After the futures lock, on `/predict`, open "See everyone's champion" and "See everyone's top scorer" from the `PreTournamentFutures` section.

Expected: each row shows the player's pick (team or scorer name) with their locked-in odds below it (matching `pre_tournament_picks.winner_odds` / `top_scorer_odds`); no ✓/✗ badge appears (futures have no `result` wired in).

- [ ] **Step 5: Verify the current-user row highlight is unchanged**

In any of the sheets above, confirm your own row still shows the accent background + left border highlight, unaffected by the new badge/odds.

- [ ] **Step 6: Final full test + lint pass**

Run: `npm test && npm run lint`

Expected: both PASS with no new failures or errors.

If any issue is found during manual verification, fix it in the relevant file from Tasks 1-3, re-run the affected verification step, then commit the fix:

```bash
git add <fixed files>
git commit -m "fix: <short description of the fix>"
```
