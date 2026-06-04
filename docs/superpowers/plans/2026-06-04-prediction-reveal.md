# Prediction Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a match or pikanteria item locks, show a bottom sheet listing every player's pick, sorted by leaderboard rank.

**Architecture:** Pure helper + DB query functions live in `lib/prediction-reveals.ts` (accepts a Supabase client, no `'use server'`); inline server actions in `app/predict/page.tsx` wrap those with `createClient()` and pass them as `onReveal` props to the cards. The sheet is a fixed-position client component that slides up from the bottom of the viewport.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase-js v2, Vitest, Tailwind/CSS variables (no new deps)

---

## File Map

| File | Change |
|---|---|
| `lib/prediction-reveals.ts` | **New** — `PlayerRevealRow` type, `sortAndRankRevealRows` pure helper, `getMatchPredictionsReveal`, `getPikanteriaAnswersReveal` |
| `lib/prediction-reveals.test.ts` | **New** — unit tests for `sortAndRankRevealRows` |
| `components/prediction-reveal-sheet.tsx` | **New** — bottom sheet client component |
| `components/match-card.tsx` | Add `myUserId` + `onReveal` props, reveal state, sheet render |
| `components/pikanteria-card.tsx` | Same pattern for pikanteria |
| `app/predict/page.tsx` | Add inline server actions + pass props to cards |

---

### Task 1: Type + Pure Helper + Tests

**Files:**
- Create: `lib/prediction-reveals.ts`
- Create: `lib/prediction-reveals.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/prediction-reveals.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sortAndRankRevealRows } from './prediction-reveals'

const base = { isMonkey: false as const, automationStrategy: null, pick: '1' }

describe('sortAndRankRevealRows', () => {
  it('sorts by totalPoints descending and assigns 1-based rank', () => {
    const rows = [
      { ...base, userId: 'b', displayName: 'Bob', totalPoints: 10 },
      { ...base, userId: 'a', displayName: 'Alice', totalPoints: 30 },
      { ...base, userId: 'c', displayName: 'Carol', totalPoints: 20 },
    ]
    const result = sortAndRankRevealRows(rows)
    expect(result[0]).toMatchObject({ userId: 'a', rank: 1, totalPoints: 30 })
    expect(result[1]).toMatchObject({ userId: 'c', rank: 2, totalPoints: 20 })
    expect(result[2]).toMatchObject({ userId: 'b', rank: 3, totalPoints: 10 })
  })

  it('returns an empty array for empty input', () => {
    expect(sortAndRankRevealRows([])).toEqual([])
  })

  it('assigns rank 1 to the single entry', () => {
    const result = sortAndRankRevealRows([
      { ...base, userId: 'x', displayName: 'X', totalPoints: 5 },
    ])
    expect(result[0].rank).toBe(1)
  })

  it('does not mutate the input array', () => {
    const rows = [
      { ...base, userId: 'b', displayName: 'Bob', totalPoints: 5 },
      { ...base, userId: 'a', displayName: 'Alice', totalPoints: 15 },
    ]
    sortAndRankRevealRows(rows)
    expect(rows[0].userId).toBe('b')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- prediction-reveals
```

Expected: FAIL — `sortAndRankRevealRows` is not defined.

- [ ] **Step 3: Create `lib/prediction-reveals.ts` with the type and helper**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AutomationStrategy } from './types'
import type { Database } from './supabase/types'

export type PlayerRevealRow = {
  userId: string
  displayName: string
  isMonkey: boolean
  automationStrategy: AutomationStrategy | null
  pick: string
  rank: number
  totalPoints: number
}

export function sortAndRankRevealRows(
  rows: Omit<PlayerRevealRow, 'rank'>[],
): PlayerRevealRow[] {
  return [...rows]
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- prediction-reveals
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/prediction-reveals.ts lib/prediction-reveals.test.ts
git commit -m "feat: add PlayerRevealRow type and sortAndRankRevealRows helper"
```

---

### Task 2: DB Query Functions

**Files:**
- Modify: `lib/prediction-reveals.ts` (append the two async functions)

- [ ] **Step 1: Append the two query functions to `lib/prediction-reveals.ts`**

Add these after `sortAndRankRevealRows` (do not change or replace existing code above):

```ts
type Db = SupabaseClient<Database>

type PredRaw = {
  pick: string
  user_id: string
  users: {
    display_name: string
    is_monkey: boolean
    automation_strategy: AutomationStrategy | null
  }
}

type AnswerRaw = {
  option_id: string
  user_id: string
  users: {
    display_name: string
    is_monkey: boolean
    automation_strategy: AutomationStrategy | null
  }
}

async function buildPointsMap(supabase: Db): Promise<Record<string, number>> {
  const { data } = await supabase.from('leaderboard').select('id, total_points')
  return Object.fromEntries((data ?? []).map(r => [r.id as string, Number(r.total_points) || 0]))
}

export async function getMatchPredictionsReveal(
  supabase: Db,
  matchId: string,
): Promise<PlayerRevealRow[]> {
  const [{ data: predData }, pointsMap] = await Promise.all([
    supabase
      .from('predictions')
      .select('pick, user_id, users(display_name, is_monkey, automation_strategy)')
      .eq('match_id', matchId),
    buildPointsMap(supabase),
  ])
  if (!predData) return []
  const unranked = (predData as unknown as PredRaw[]).map(p => ({
    userId: p.user_id,
    displayName: p.users.display_name,
    isMonkey: p.users.is_monkey,
    automationStrategy: p.users.automation_strategy,
    pick: p.pick,
    totalPoints: pointsMap[p.user_id] ?? 0,
  }))
  return sortAndRankRevealRows(unranked)
}

export async function getPikanteriaAnswersReveal(
  supabase: Db,
  picanteriaId: string,
): Promise<PlayerRevealRow[]> {
  const [{ data: answerData }, pointsMap] = await Promise.all([
    supabase
      .from('pikanteria_answers')
      .select('option_id, user_id, users(display_name, is_monkey, automation_strategy)')
      .eq('pikanteria_id', picanteriaId),
    buildPointsMap(supabase),
  ])
  if (!answerData) return []
  const unranked = (answerData as unknown as AnswerRaw[]).map(a => ({
    userId: a.user_id,
    displayName: a.users.display_name,
    isMonkey: a.users.is_monkey,
    automationStrategy: a.users.automation_strategy,
    pick: a.option_id,
    totalPoints: pointsMap[a.user_id] ?? 0,
  }))
  return sortAndRankRevealRows(unranked)
}
```

- [ ] **Step 2: Verify tests still pass**

```
npm test -- prediction-reveals
```

Expected: PASS — 4 tests pass (unchanged).

- [ ] **Step 3: Commit**

```bash
git add lib/prediction-reveals.ts
git commit -m "feat: add getMatchPredictionsReveal and getPikanteriaAnswersReveal"
```

---

### Task 3: Bottom Sheet Component

**Files:**
- Create: `components/prediction-reveal-sheet.tsx`

- [ ] **Step 1: Create `components/prediction-reveal-sheet.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { PlayerRevealRow } from '@/lib/prediction-reveals'
import { getAvatar, getAutomationLabel } from '@/lib/display'

const SEG_COLORS = [
  'var(--color-amber)',
  'var(--color-accent)',
  'var(--color-dim)',
  'var(--color-silver)',
  'var(--color-sub)',
]

const MATCH_PICK_COLORS: Record<string, string> = {
  '1': 'var(--color-accent)',
  X: 'var(--color-dim)',
  '2': 'var(--color-amber)',
}

interface Props {
  title: string
  rows: PlayerRevealRow[]
  myUserId: string
  /** option_id → label map; when present, treats `row.pick` as an option_id. */
  optionLabels?: Record<string, string>
  onClose: () => void
}

export function PredictionRevealSheet({ title, rows, myUserId, optionLabels, onClose }: Props) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setVisible(true) }, [])

  const optionKeys = optionLabels ? Object.keys(optionLabels) : []

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s ease-out',
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxHeight: '70vh',
          overflowY: 'auto',
          borderRadius: '20px 20px 0 0',
          background: 'var(--color-panel)',
          border: '1px solid var(--border-base)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease-out',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div
            style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--color-dim)', opacity: 0.5 }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px 12px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--color-text)',
              letterSpacing: '0.03em',
              flex: 1,
              marginRight: 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 20,
              color: 'var(--color-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '2px 4px',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Player list */}
        {rows.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--color-muted)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🗳️</div>
            No picks recorded yet
          </div>
        ) : (
          <div style={{ paddingBottom: 8 }}>
            {rows.map((row, i) => {
              const isMe = row.userId === myUserId
              const pickLabel = optionLabels ? (optionLabels[row.pick] ?? row.pick) : row.pick
              const pickColor = optionLabels
                ? SEG_COLORS[optionKeys.indexOf(row.pick) % SEG_COLORS.length]
                : (MATCH_PICK_COLORS[row.pick] ?? 'var(--color-muted)')
              const automationLabel = getAutomationLabel(row)

              return (
                <div
                  key={row.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 16px',
                    borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    background: isMe ? 'var(--color-accent-soft)' : 'transparent',
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: 'var(--color-elev)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {getAvatar(row)}
                  </div>

                  {/* Name + rank */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--color-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {row.displayName}
                      {automationLabel && (
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--color-muted)',
                            fontWeight: 400,
                            marginLeft: 4,
                          }}
                        >
                          · {automationLabel}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--color-muted)',
                        marginTop: 1,
                      }}
                    >
                      #{row.rank}
                    </div>
                  </div>

                  {/* Pick label */}
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 13,
                      fontWeight: 700,
                      color: pickColor,
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}
                  >
                    {pickLabel}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/prediction-reveal-sheet.tsx
git commit -m "feat: add PredictionRevealSheet bottom sheet component"
```

---

### Task 4: Integrate Reveal into MatchCard

**Files:**
- Modify: `components/match-card.tsx`

- [ ] **Step 1: Add imports at the top of `components/match-card.tsx`**

After the existing imports, add:

```ts
import { useState } from 'react'   // already imported — just add these two lines:
import type { PlayerRevealRow } from '@/lib/prediction-reveals'
import { PredictionRevealSheet } from './prediction-reveal-sheet'
```

Note: `useState` is already imported. Only add the two new lines.

- [ ] **Step 2: Extend the `Props` interface**

Replace the existing `Props` interface:

```ts
interface Props {
  match: Match
  currentPick: Pick | null
  isLocked: boolean
  stageLabel: string
  onSave: (matchId: string, pick: Pick) => Promise<SaveResult>
  crowd?: CrowdPct | null
  crowdTotal?: number
  insight?: Insight | null
  myUserId?: string
  onReveal?: (matchId: string) => Promise<PlayerRevealRow[]>
}
```

- [ ] **Step 3: Add reveal state and handler in `MatchCard`**

Inside the `MatchCard` function body, after the existing state declarations (`optimisticPick`, `error`, `saving`, `pending`, `inFlightRef`), add:

```ts
const [revealRows, setRevealRows] = useState<PlayerRevealRow[] | null>(null)
const [revealLoading, setRevealLoading] = useState(false)
const [revealError, setRevealError] = useState(false)
const [sheetOpen, setSheetOpen] = useState(false)

async function handleReveal() {
  if (!onReveal) return
  setRevealLoading(true)
  setRevealError(false)
  try {
    const rows = await onReveal(match.id)
    setRevealRows(rows)
    setSheetOpen(true)
  } catch {
    setRevealError(true)
  } finally {
    setRevealLoading(false)
  }
}
```

- [ ] **Step 4: Pass reveal props to `CrowdSection` and render the sheet**

Find the `<CrowdSection ... />` call in the `MatchCard` return and extend it:

```tsx
<CrowdSection
  isLocked={isLocked}
  crowd={crowd}
  crowdTotal={crowdTotal}
  insight={insight}
  options={options}
  selected={selected}
  onReveal={onReveal ? handleReveal : undefined}
  revealLoading={revealLoading}
  revealError={revealError}
/>
```

Then, just before the closing `</div>` of the outer card `div`, add the sheet:

```tsx
{sheetOpen && revealRows !== null && myUserId && (
  <PredictionRevealSheet
    title={`${match.home_team} vs ${match.away_team} · Picks`}
    rows={revealRows}
    myUserId={myUserId}
    onClose={() => setSheetOpen(false)}
  />
)}
```

- [ ] **Step 5: Update `CrowdSection` signature and add reveal button**

Replace the `CrowdSection` function with this updated version (the crowd bar display logic is unchanged; the function signature and the locked-without-crowd path gain the reveal button):

```tsx
function CrowdSection({
  isLocked,
  crowd,
  crowdTotal,
  insight,
  options,
  selected,
  onReveal,
  revealLoading,
  revealError,
}: {
  isLocked: boolean
  crowd?: CrowdPct | null
  crowdTotal: number
  insight?: Insight | null
  options: [Pick, number][]
  selected: Pick | null
  onReveal?: () => void
  revealLoading?: boolean
  revealError?: boolean
}) {
  if (!isLocked) {
    return (
      <div
        className="px-4 pb-3"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
        }}
      >
        Crowd revealed at lock
      </div>
    )
  }

  return (
    <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
      {crowd && crowdTotal > 0 && (
        <>
          <div className="flex items-center justify-between mb-2 gap-2">
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 12,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--color-muted)',
              }}
            >
              Crowd · {crowdTotal} {crowdTotal === 1 ? 'pick' : 'picks'}
            </span>
            {insight && <CrowdInsight insight={insight} />}
          </div>

          <div
            className="flex w-full rounded-full overflow-hidden"
            style={{ height: 8, background: 'var(--color-elev)' }}
          >
            {options.map(([pick]) =>
              crowd[pick] > 0 ? (
                <div
                  key={pick}
                  style={{
                    width: `${crowd[pick]}%`,
                    background: SEG_COLOR[pick],
                    opacity: selected === pick ? 1 : 0.8,
                  }}
                />
              ) : null
            )}
          </div>

          <div className="flex justify-between mt-1.5 mb-2">
            {options.map(([pick]) => (
              <span
                key={pick}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: selected === pick ? 'var(--color-accent)' : 'var(--color-muted)',
                  fontWeight: selected === pick ? 700 : 400,
                }}
              >
                {crowd[pick]}% · {pick}
              </span>
            ))}
          </div>
        </>
      )}

      {onReveal && (
        <button
          type="button"
          onClick={onReveal}
          disabled={revealLoading}
          style={{
            width: '100%',
            padding: '6px 12px',
            borderRadius: 10,
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: revealError ? 'var(--color-danger)' : 'var(--color-accent)',
            background: revealError ? 'var(--color-danger-soft)' : 'var(--color-accent-soft)',
            border: revealError ? '1px solid var(--border-danger)' : '1px solid var(--border-accent)',
            cursor: revealLoading ? 'not-allowed' : 'pointer',
            opacity: revealLoading ? 0.6 : 1,
          }}
        >
          {revealLoading ? '…' : revealError ? 'Could not load picks' : '👁 Picks'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add components/match-card.tsx
git commit -m "feat: add prediction reveal button and sheet to MatchCard"
```

---

### Task 5: Integrate Reveal into PicanteriaCard

**Files:**
- Modify: `components/pikanteria-card.tsx`

- [ ] **Step 1: Add imports at the top of `components/pikanteria-card.tsx`**

After the existing imports, add:

```ts
import type { PlayerRevealRow } from '@/lib/prediction-reveals'
import { PredictionRevealSheet } from './prediction-reveal-sheet'
```

- [ ] **Step 2: Extend the `Props` interface**

Replace the existing `Props` interface:

```ts
interface Props {
  item: Pikanteria & { options: PicanteriaOption[] }
  currentAnswer: string | null
  isLocked: boolean
  onSave: (picanteriaId: string, optionId: string) => Promise<SaveResult>
  crowd?: Record<string, number> | null
  crowdTotal?: number
  myUserId?: string
  onReveal?: (picanteriaId: string) => Promise<PlayerRevealRow[]>
}
```

- [ ] **Step 3: Add reveal state and handler in `PicanteriaCard`**

Inside the `PicanteriaCard` function body, after the existing state declarations, add:

```ts
const [revealRows, setRevealRows] = useState<PlayerRevealRow[] | null>(null)
const [revealLoading, setRevealLoading] = useState(false)
const [revealError, setRevealError] = useState(false)
const [sheetOpen, setSheetOpen] = useState(false)

async function handleReveal() {
  if (!onReveal) return
  setRevealLoading(true)
  setRevealError(false)
  try {
    const rows = await onReveal(item.id)
    setRevealRows(rows)
    setSheetOpen(true)
  } catch {
    setRevealError(true)
  } finally {
    setRevealLoading(false)
  }
}
```

- [ ] **Step 4: Add the reveal button below the crowd section and render the sheet**

Find the closing `</div>` of the `<div className="px-4 py-3">` block (the last closing div inside the outer card div). Just before it, add the reveal button and sheet:

```tsx
{isLocked && onReveal && (
  <div style={{ marginTop: 8 }}>
    <button
      type="button"
      onClick={handleReveal}
      disabled={revealLoading}
      style={{
        width: '100%',
        padding: '6px 12px',
        borderRadius: 10,
        fontFamily: 'var(--font-display)',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: revealError ? 'var(--color-danger)' : 'var(--color-amber)',
        background: revealError ? 'var(--color-danger-soft)' : 'var(--color-amber-soft)',
        border: revealError ? '1px solid var(--border-danger)' : '1px solid var(--border-warn)',
        cursor: revealLoading ? 'not-allowed' : 'pointer',
        opacity: revealLoading ? 0.6 : 1,
      }}
    >
      {revealLoading ? '…' : revealError ? 'Could not load picks' : '👁 Picks'}
    </button>
  </div>
)}

{sheetOpen && revealRows !== null && myUserId && (
  <PredictionRevealSheet
    title={item.question}
    rows={revealRows}
    myUserId={myUserId}
    optionLabels={Object.fromEntries(item.options.map(o => [o.id, o.label]))}
    onClose={() => setSheetOpen(false)}
  />
)}
```

- [ ] **Step 5: Commit**

```bash
git add components/pikanteria-card.tsx
git commit -m "feat: add prediction reveal button and sheet to PicanteriaCard"
```

---

### Task 6: Wire Up Predict Page

**Files:**
- Modify: `app/predict/page.tsx`

- [ ] **Step 1: Add imports to `app/predict/page.tsx`**

After the existing imports, add:

```ts
import { getMatchPredictionsReveal, getPikanteriaAnswersReveal } from '@/lib/prediction-reveals'
```

- [ ] **Step 2: Add inline server actions after `saveAnswer`**

After the `saveAnswer` function (around line 89 in the current file), add:

```ts
async function revealMatchPicks(matchId: string) {
  'use server'
  const supabase = await createClient()
  return getMatchPredictionsReveal(supabase, matchId)
}

async function revealPikanteriaAnswers(picanteriaId: string) {
  'use server'
  const supabase = await createClient()
  return getPikanteriaAnswersReveal(supabase, picanteriaId)
}
```

- [ ] **Step 3: Pass `myUserId` and `onReveal` to every `MatchCard`**

Find the `<MatchCard ... />` in the predict page render and add the two new props:

```tsx
<MatchCard
  key={`${match.id}:${predictionMap[match.id] ?? 'none'}`}
  match={match}
  currentPick={predictionMap[match.id] ?? null}
  isLocked={isMatchLocked(match)}
  stageLabel={stageLabel}
  onSave={savePick}
  crowd={toPct(tally)}
  crowdTotal={tally.total}
  insight={matchInsight({
    tally,
    odds: { '1': match.odds_home, X: match.odds_draw, '2': match.odds_away },
    myPick: predictionMap[match.id] ?? null,
  })}
  myUserId={user.id}
  onReveal={revealMatchPicks}
/>
```

- [ ] **Step 4: Pass `myUserId` and `onReveal` to every `PicanteriaCard`**

Find the `<PicanteriaCard ... />` in the predict page render and add the two new props:

```tsx
<PicanteriaCard
  key={`${item.id}:${answerMap[item.id] ?? 'none'}`}
  item={{ ...item, options: (item.pikanteria_options ?? []).toSorted((a, b) => a.sort_order - b.sort_order) }}
  currentAnswer={answerMap[item.id] ?? null}
  isLocked={item.locked}
  onSave={saveAnswer}
  crowd={crowdPik[item.id]?.counts ?? null}
  crowdTotal={crowdPik[item.id]?.total ?? 0}
  myUserId={user.id}
  onReveal={revealPikanteriaAnswers}
/>
```

- [ ] **Step 5: Commit**

```bash
git add app/predict/page.tsx
git commit -m "feat: wire prediction reveal server actions to predict page"
```

---

### Task 7: Lint + Tests

- [ ] **Step 1: Run full test suite**

```
npm test
```

Expected: All existing tests pass + 4 new prediction-reveals tests pass.

- [ ] **Step 2: Run lint**

```
npm run lint
```

Expected: No errors. Fix any TypeScript or ESLint errors before proceeding.

- [ ] **Step 3: Manual verification checklist**

With the app running (`npm run dev`), open the predict page for a locked match day:

- [ ] Confirm `👁 Picks` button is visible on locked MatchCards
- [ ] Confirm `👁 Picks` button is NOT visible on unlocked MatchCards
- [ ] Tap the button — sheet slides up from the bottom
- [ ] Confirm sheet shows all players sorted by rank (highest `total_points` = rank 1)
- [ ] Confirm current user's row has a green-tinted background
- [ ] Confirm tapping the backdrop dismisses the sheet
- [ ] Confirm the `×` button dismisses the sheet
- [ ] Open a locked pikanteria card — confirm `👁 Picks` button appears, sheet shows option labels (not raw IDs)
- [ ] Confirm automated players appear in the list with their automation label

- [ ] **Step 4: Final commit if lint/manual fixes were needed**

```bash
git add -p
git commit -m "fix: lint and type errors in prediction reveal"
```
