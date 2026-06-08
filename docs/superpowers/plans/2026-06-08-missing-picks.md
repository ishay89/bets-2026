# Missing Picks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show players an in-app reminder when they have open picks they haven't submitted, and give admins a `/admin/missing-picks` dashboard summarizing who's behind.

**Architecture:** A new pure helper module `lib/missing-picks.ts` extracts the open-item/missing-pick aggregation already proven in `/admin/players/[userId]`, exposing one function for a single user (used by a banner on `/predict`) and one for all players (used by the new admin page). No new tables, RPCs, or write paths — purely additive read-side display code.

**Tech Stack:** Next.js 16 App Router (Server Components), React 19, TypeScript strict mode, Tailwind CSS 4 with CSS custom-property design tokens, Supabase (admin client for the dashboard, user-session client for the banner), Vitest for the pure helpers.

---

## Reference: existing helpers and types you'll use

- `isMatchLocked(match, now?)` in `lib/lock.ts:19` — `match: { kickoff_time: string; locked?: boolean | null }`
- `hasCompletedPreTournamentPick(pick)` in `lib/pre-tournament.ts:124` — `pick: { winner_team?: string | null; top_scorer?: string | null } | null`
- `getPublishedMatchDaysWithAll(supabase)` in `lib/data.ts:55` returns `FullMatchDay[]` where `FullMatchDay = MatchDay & { matches: Match[]; pikanteria: Pikanteria[] }`
- `Match` and `Pikanteria` (in `lib/types.ts`) both carry `published_at: string | null`, `locked: boolean | null` / `boolean`
- `assertAdmin()` and `createAdminClient()` in `lib/supabase/server.ts:36` / `:28`

---

### Task 1: `computeUserMissingCounts` helper (TDD)

**Files:**
- Create: `lib/missing-picks.ts`
- Test: `lib/missing-picks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/missing-picks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeUserMissingCounts } from './missing-picks'

const day = (overrides: Partial<{
  id: string
  matches: { id: string; kickoff_time: string; locked: boolean | null; published_at: string | null }[]
  pikanteria: { id: string; locked: boolean; published_at: string | null }[]
}> = {}) => ({
  id: overrides.id ?? 'day-1',
  date: '2026-06-10',
  stage: 'group' as const,
  matches: overrides.matches ?? [],
  pikanteria: overrides.pikanteria ?? [],
})

const FUTURE_KICKOFF = '2999-01-01T12:00:00Z'
const PAST_KICKOFF = '2000-01-01T12:00:00Z'

describe('computeUserMissingCounts', () => {
  it('returns zero missing when there are no open items and futures is not open', () => {
    const result = computeUserMissingCounts({
      matchDays: [],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 0, submitted: 0, missing: 0 })
  })

  it('counts an open match with no prediction as missing', () => {
    const result = computeUserMissingCounts({
      matchDays: [day({ matches: [
        { id: 'm1', kickoff_time: FUTURE_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' },
      ] })],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 1, submitted: 0, missing: 1 })
  })

  it('counts an open pikanteria with no answer as missing', () => {
    const result = computeUserMissingCounts({
      matchDays: [day({ pikanteria: [
        { id: 'p1', locked: false, published_at: '2026-06-01T00:00:00Z' },
      ] })],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 1, submitted: 0, missing: 1 })
  })

  it('does not count locked or unpublished items', () => {
    const result = computeUserMissingCounts({
      matchDays: [day({
        matches: [
          { id: 'm-locked', kickoff_time: PAST_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' },
          { id: 'm-unpublished', kickoff_time: FUTURE_KICKOFF, locked: false, published_at: null },
        ],
        pikanteria: [
          { id: 'p-locked', locked: true, published_at: '2026-06-01T00:00:00Z' },
          { id: 'p-unpublished', locked: false, published_at: null },
        ],
      })],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 0, submitted: 0, missing: 0 })
  })

  it('treats a submitted match as not missing', () => {
    const result = computeUserMissingCounts({
      matchDays: [day({ matches: [
        { id: 'm1', kickoff_time: FUTURE_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' },
      ] })],
      predictedMatchIds: new Set(['m1']),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 1, submitted: 1, missing: 0 })
  })

  it('counts an open futures slot only when futuresOpen is true', () => {
    const closedFutures = computeUserMissingCounts({
      matchDays: [],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: false,
      futuresCompleted: false,
    })
    expect(closedFutures).toEqual({ total: 0, submitted: 0, missing: 0 })

    const openIncomplete = computeUserMissingCounts({
      matchDays: [],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: true,
      futuresCompleted: false,
    })
    expect(openIncomplete).toEqual({ total: 1, submitted: 0, missing: 1 })

    const openComplete = computeUserMissingCounts({
      matchDays: [],
      predictedMatchIds: new Set(),
      answeredPikanteriaIds: new Set(),
      futuresOpen: true,
      futuresCompleted: true,
    })
    expect(openComplete).toEqual({ total: 1, submitted: 1, missing: 0 })
  })

  it('combines matches, pikanteria, and futures into one mixed total', () => {
    const result = computeUserMissingCounts({
      matchDays: [day({
        matches: [
          { id: 'm-done', kickoff_time: FUTURE_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' },
          { id: 'm-missing', kickoff_time: FUTURE_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' },
        ],
        pikanteria: [
          { id: 'p-missing', locked: false, published_at: '2026-06-01T00:00:00Z' },
        ],
      })],
      predictedMatchIds: new Set(['m-done']),
      answeredPikanteriaIds: new Set(),
      futuresOpen: true,
      futuresCompleted: false,
    })
    expect(result).toEqual({ total: 4, submitted: 1, missing: 3 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/missing-picks.test.ts`
Expected: FAIL — `Cannot find module './missing-picks'` (the module doesn't exist yet)

- [ ] **Step 3: Implement `lib/missing-picks.ts`**

```ts
import { isMatchLocked } from './lock'

export type OpenMatch = {
  id: string
  kickoff_time: string
  locked: boolean | null
  published_at: string | null
}

export type OpenPikanteria = {
  id: string
  locked: boolean
  published_at: string | null
}

export type MatchDayWithItems = {
  id: string
  date: string
  stage: string
  matches: OpenMatch[]
  pikanteria: OpenPikanteria[]
}

export type MissingCounts = {
  total: number
  submitted: number
  missing: number
}

/**
 * Open items are published and not yet locked — exactly what a player can
 * still act on. Per-item publishing means a match_day can be published while
 * an individual match or pikanteria item inside it is still a draft.
 */
function openItemsForDay(day: MatchDayWithItems): { matches: OpenMatch[]; pikanteria: OpenPikanteria[] } {
  return {
    matches: day.matches.filter(m => m.published_at != null && !isMatchLocked(m)),
    pikanteria: day.pikanteria.filter(p => p.published_at != null && !p.locked),
  }
}

export function computeUserMissingCounts(params: {
  matchDays: MatchDayWithItems[]
  predictedMatchIds: Set<string>
  answeredPikanteriaIds: Set<string>
  futuresOpen: boolean
  futuresCompleted: boolean
}): MissingCounts {
  const { matchDays, predictedMatchIds, answeredPikanteriaIds, futuresOpen, futuresCompleted } = params

  let total = 0
  let submitted = 0

  for (const day of matchDays) {
    const { matches, pikanteria } = openItemsForDay(day)
    total += matches.length + pikanteria.length
    submitted += matches.filter(m => predictedMatchIds.has(m.id)).length
    submitted += pikanteria.filter(p => answeredPikanteriaIds.has(p.id)).length
  }

  if (futuresOpen) {
    total += 1
    if (futuresCompleted) submitted += 1
  }

  return { total, submitted, missing: total - submitted }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/missing-picks.test.ts`
Expected: PASS — all 7 tests in `computeUserMissingCounts` green

- [ ] **Step 5: Commit**

```bash
git add lib/missing-picks.ts lib/missing-picks.test.ts
git commit -m "feat: add computeUserMissingCounts helper for missing picks"
```

---

### Task 2: `computeAllPlayersMissingPicks` helper (TDD)

**Files:**
- Modify: `lib/missing-picks.ts`
- Modify: `lib/missing-picks.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/missing-picks.test.ts` (add this import alongside the existing one):

```ts
import { computeAllPlayersMissingPicks, computeUserMissingCounts } from './missing-picks'
```

Then add:

```ts
describe('computeAllPlayersMissingPicks', () => {
  const players = [
    { id: 'u1', display_name: 'Alice' },
    { id: 'u2', display_name: 'Bob' },
  ]

  const oneOpenMatchDay = [day({
    id: 'day-1',
    matches: [
      { id: 'm1', kickoff_time: FUTURE_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' },
    ],
  })]

  it('aggregates per-day submitted counts across all players', () => {
    const result = computeAllPlayersMissingPicks({
      matchDays: oneOpenMatchDay,
      players,
      predictions: [{ user_id: 'u1', match_id: 'm1' }],
      answers: [],
      futuresPicks: [],
      futuresOpen: false,
    })
    expect(result.days).toEqual([
      { matchDayId: 'day-1', date: '2026-06-10', stage: 'group', totalSlots: 2, submittedCount: 1, missingCount: 1 },
    ])
  })

  it('omits days with no open items from the aggregate', () => {
    const lockedDay = [day({
      id: 'day-locked',
      matches: [{ id: 'm-locked', kickoff_time: PAST_KICKOFF, locked: false, published_at: '2026-06-01T00:00:00Z' }],
    })]
    const result = computeAllPlayersMissingPicks({
      matchDays: lockedDay,
      players,
      predictions: [],
      answers: [],
      futuresPicks: [],
      futuresOpen: false,
    })
    expect(result.days).toEqual([])
  })

  it('builds a futures aggregate only when futures is open', () => {
    const closed = computeAllPlayersMissingPicks({
      matchDays: [],
      players,
      predictions: [],
      answers: [],
      futuresPicks: [{ user_id: 'u1', winner_team: 'Brazil', top_scorer: 'Mbappé' }],
      futuresOpen: false,
    })
    expect(closed.futures).toBeNull()

    const open = computeAllPlayersMissingPicks({
      matchDays: [],
      players,
      predictions: [],
      answers: [],
      futuresPicks: [{ user_id: 'u1', winner_team: 'Brazil', top_scorer: 'Mbappé' }],
      futuresOpen: true,
    })
    expect(open.futures).toEqual({ totalPlayers: 2, completedCount: 1 })
  })

  it('builds a per-player row with total missing across days and futures, sorted by most missing first', () => {
    const result = computeAllPlayersMissingPicks({
      matchDays: oneOpenMatchDay,
      players,
      predictions: [{ user_id: 'u1', match_id: 'm1' }],
      answers: [],
      futuresPicks: [{ user_id: 'u1', winner_team: 'Brazil', top_scorer: 'Mbappé' }],
      futuresOpen: true,
    })
    expect(result.players).toEqual([
      { player: { id: 'u2', display_name: 'Bob' }, missingCount: 2, futuresMissing: true },
      { player: { id: 'u1', display_name: 'Alice' }, missingCount: 0, futuresMissing: false },
    ])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/missing-picks.test.ts`
Expected: FAIL — `computeAllPlayersMissingPicks` is not exported / not defined

- [ ] **Step 3: Implement `computeAllPlayersMissingPicks`**

Append to `lib/missing-picks.ts` (after `computeUserMissingCounts`):

```ts
import { hasCompletedPreTournamentPick } from './pre-tournament'

export type DayMissingSummary = {
  matchDayId: string
  date: string
  stage: string
  totalSlots: number
  submittedCount: number
  missingCount: number
}

export type FuturesMissingSummary = {
  totalPlayers: number
  completedCount: number
}

export type PlayerMissingRow = {
  player: { id: string; display_name: string }
  missingCount: number
  futuresMissing: boolean
}

export type MissingPicksSummary = {
  days: DayMissingSummary[]
  futures: FuturesMissingSummary | null
  players: PlayerMissingRow[]
}

function groupByUser<T extends { user_id: string }, K extends string>(
  rows: T[],
  keyOf: (row: T) => K,
): Map<string, Set<K>> {
  const map = new Map<string, Set<K>>()
  for (const row of rows) {
    const set = map.get(row.user_id) ?? new Set<K>()
    set.add(keyOf(row))
    map.set(row.user_id, set)
  }
  return map
}

export function computeAllPlayersMissingPicks(params: {
  matchDays: MatchDayWithItems[]
  players: { id: string; display_name: string }[]
  predictions: { user_id: string; match_id: string }[]
  answers: { user_id: string; pikanteria_id: string }[]
  futuresPicks: { user_id: string; winner_team: string | null; top_scorer: string | null }[]
  futuresOpen: boolean
}): MissingPicksSummary {
  const { matchDays, players, predictions, answers, futuresPicks, futuresOpen } = params

  const predictionsByUser = groupByUser(predictions, p => p.match_id)
  const answersByUser = groupByUser(answers, a => a.pikanteria_id)
  const completedFuturesByUser = new Set(
    futuresPicks.filter(hasCompletedPreTournamentPick).map(f => f.user_id),
  )

  const openByDay = matchDays.map(day => ({ day, open: openItemsForDay(day) }))

  const days: DayMissingSummary[] = []
  for (const { day, open } of openByDay) {
    const itemCount = open.matches.length + open.pikanteria.length
    if (itemCount === 0) continue

    let submittedCount = 0
    for (const player of players) {
      const predicted = predictionsByUser.get(player.id) ?? new Set<string>()
      const answered = answersByUser.get(player.id) ?? new Set<string>()
      submittedCount += open.matches.filter(m => predicted.has(m.id)).length
      submittedCount += open.pikanteria.filter(p => answered.has(p.id)).length
    }

    const totalSlots = itemCount * players.length
    days.push({
      matchDayId: day.id,
      date: day.date,
      stage: day.stage,
      totalSlots,
      submittedCount,
      missingCount: totalSlots - submittedCount,
    })
  }

  const futures: FuturesMissingSummary | null = futuresOpen
    ? {
        totalPlayers: players.length,
        completedCount: players.filter(p => completedFuturesByUser.has(p.id)).length,
      }
    : null

  const playerRows: PlayerMissingRow[] = players.map(player => {
    const predicted = predictionsByUser.get(player.id) ?? new Set<string>()
    const answered = answersByUser.get(player.id) ?? new Set<string>()

    let missingCount = 0
    for (const { open } of openByDay) {
      missingCount += open.matches.filter(m => !predicted.has(m.id)).length
      missingCount += open.pikanteria.filter(p => !answered.has(p.id)).length
    }

    const futuresMissing = futuresOpen && !completedFuturesByUser.has(player.id)
    if (futuresMissing) missingCount += 1

    return { player, missingCount, futuresMissing }
  })

  playerRows.sort((a, b) => b.missingCount - a.missingCount)

  return { days, futures, players: playerRows }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/missing-picks.test.ts`
Expected: PASS — all tests in both `describe` blocks green

- [ ] **Step 5: Commit**

```bash
git add lib/missing-picks.ts lib/missing-picks.test.ts
git commit -m "feat: add computeAllPlayersMissingPicks helper for admin dashboard"
```

---

### Task 3: `MissingPicksBanner` component

**Files:**
- Create: `components/missing-picks-banner.tsx`

- [ ] **Step 1: Create the component**

This is a thin display component — no test file, matching the convention for other display-only components like `components/lock-timer.tsx` and `components/leaderboard-movement.tsx`'s formatting helpers (which carry the tested logic, not the component).

```tsx
type MissingPicksBannerProps = {
  missing: number
}

export function MissingPicksBanner({ missing }: MissingPicksBannerProps) {
  if (missing <= 0) return null

  const label = missing === 1 ? 'open pick' : 'open picks'

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }}
    >
      <span className="text-xl">⚠️</span>
      <div>
        <div className="font-bold text-[13px]" style={{ color: 'var(--color-amber)' }}>
          You have {missing} {label} left
        </div>
        <div className="text-muted text-[11px] mt-0.5">
          Submit before they lock to keep scoring points
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/missing-picks-banner.tsx
git commit -m "feat: add MissingPicksBanner display component"
```

---

### Task 4: Wire the banner into `/predict`

**Files:**
- Modify: `app/predict/page.tsx`

- [ ] **Step 1: Add imports**

In `app/predict/page.tsx`, add to the existing import block (near the `PreTournamentFutures` import on line 11):

```ts
import { MissingPicksBanner } from '@/components/missing-picks-banner'
import { computeUserMissingCounts } from '@/lib/missing-picks'
```

- [ ] **Step 2: Compute the missing count**

In `PredictPage`, right after `const predictionMap = ...` / `const answerMap = ...` block (around line 173, after both maps are built), add:

```ts
  const predictedMatchIds = new Set(existingPredictions.map(p => p.match_id))
  const answeredPikanteriaIds = new Set(existingAnswers.map(a => a.pikanteria_id))
  const futuresOpen = futuresPublished && !futuresLocked
  const { missing: missingPicks } = computeUserMissingCounts({
    matchDays,
    predictedMatchIds,
    answeredPikanteriaIds,
    futuresOpen,
    futuresCompleted: hasEntryPick,
  })
```

(`matchDays` here is the full `FullMatchDay[]` returned by `getPublishedMatchDaysWithAll` — it satisfies `MatchDayWithItems` because `Match`/`Pikanteria` both carry `published_at`/`locked`/`id`/`kickoff_time`.)

- [ ] **Step 3: Render the banner**

In the JSX, immediately inside `<main>` and before the `{futuresPublished && !hasEntryPick && (...)}` block (around line 197), add:

```tsx
        <MissingPicksBanner missing={missingPicks} />

```

- [ ] **Step 4: Run the relevant tests and lint**

Run: `npm test -- lib/missing-picks.test.ts && npm run lint`
Expected: PASS, no lint errors

- [ ] **Step 5: Manually verify in the dev server**

Run: `npm run dev`, sign in as a player with at least one open unpicked match, and confirm the amber banner appears above "Today's picks" content with the correct count. Submit the pick and refresh — the banner should disappear (or its count should decrease).

- [ ] **Step 6: Commit**

```bash
git add app/predict/page.tsx
git commit -m "feat: show missing-picks banner on /predict"
```

---

### Task 5: `/admin/missing-picks` dashboard page

**Files:**
- Create: `app/admin/missing-picks/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import Link from 'next/link'
import { getPublishedMatchDaysWithAll } from '@/lib/data'
import { computeAllPlayersMissingPicks, type MissingPicksSummary } from '@/lib/missing-picks'

export const metadata = { title: 'Missing Picks | Admin' }

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter Finals',
  sf: 'Semi Finals', '3rd': 'Third Place', final: 'Final',
}

export default async function MissingPicksPage() {
  await assertAdmin()
  const supabase = createAdminClient()

  const [matchDays, { data: predictions }, { data: answers }, { data: futuresPicks }, { data: players }, { data: tournamentSettings }] =
    await Promise.all([
      getPublishedMatchDaysWithAll(supabase),
      supabase.from('predictions').select('user_id, match_id'),
      supabase.from('pikanteria_answers').select('user_id, pikanteria_id'),
      supabase.from('pre_tournament_picks').select('user_id, winner_team, top_scorer'),
      supabase.from('users').select('id, display_name').eq('status', 'approved').eq('is_monkey', false),
      supabase.from('tournament_settings').select('futures_locked, futures_published').eq('id', true).single(),
    ])

  const futuresOpen = (tournamentSettings?.futures_published ?? true) && !(tournamentSettings?.futures_locked ?? false)

  const summary = computeAllPlayersMissingPicks({
    matchDays,
    players: players ?? [],
    predictions: predictions ?? [],
    answers: answers ?? [],
    futuresPicks: futuresPicks ?? [],
    futuresOpen,
  })

  const nothingOpen = summary.days.length === 0 && summary.futures === null

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">
      <div>
        <Link href="/admin" className="text-muted hover:text-amber transition-colors text-xs">
          ← Admin
        </Link>
        <div className="font-black text-lg mt-1" style={{ color: 'var(--color-amber)' }}>
          🔔 Missing Picks
        </div>
        <div className="text-muted text-xs">Who still needs to submit before bets lock</div>
      </div>

      {nothingOpen && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-text font-semibold">Everyone&apos;s caught up</div>
          <div className="text-muted text-sm mt-1">Nothing is currently open for predictions.</div>
        </div>
      )}

      {!nothingOpen && (
        <>
          <DaySummarySection summary={summary} />
          <PlayerBreakdownSection summary={summary} />
        </>
      )}
    </div>
  )
}

function DaySummarySection({ summary }: { summary: MissingPicksSummary }) {
  return (
    <div className="space-y-2">
      <div className="text-muted text-[11px] font-bold uppercase tracking-wide px-1">Open match days</div>
      {summary.days.map(d => {
        const dateLabel = new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        })
        return (
          <div key={d.matchDayId} className="rounded-xl px-4 py-3"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-text">{dateLabel}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
                {STAGE_LABELS[d.stage] ?? d.stage}
              </span>
            </div>
            <div className="text-muted text-[11px] mt-1">
              {d.submittedCount} / {d.totalSlots} submitted · {d.missingCount} missing
            </div>
          </div>
        )
      })}
      {summary.futures && (
        <div className="rounded-xl px-4 py-3"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          <div className="flex items-center gap-1.5">
            <span>🏆</span>
            <span className="text-sm font-bold text-text">Tournament Winner & Top Scorer</span>
          </div>
          <div className="text-muted text-[11px] mt-1">
            {summary.futures.completedCount} / {summary.futures.totalPlayers} completed
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerBreakdownSection({ summary }: { summary: MissingPicksSummary }) {
  return (
    <div className="space-y-2">
      <div className="text-muted text-[11px] font-bold uppercase tracking-wide px-1">Players</div>
      {summary.players.map(row => (
        <Link key={row.player.id} href={`/admin/players/${row.player.id}`}
          className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-[13px] text-text truncate">{row.player.display_name}</span>
            <FuturesBadge missing={row.futuresMissing} />
          </div>
          <MissingCountBadge count={row.missingCount} />
        </Link>
      ))}
    </div>
  )
}

function FuturesBadge({ missing }: { missing: boolean }) {
  const styles = missing
    ? { color: 'var(--color-danger)', background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }
    : { color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }
  return (
    <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0" style={styles}>
      {missing ? '🏆 ✗' : '🏆 ✓'}
    </span>
  )
}

function MissingCountBadge({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-3"
        style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }}>
        ✓ all done
      </span>
    )
  }
  return (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-3"
      style={{ color: 'var(--color-danger)', background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
      {count} missing
    </span>
  )
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors in the new file

- [ ] **Step 3: Commit**

```bash
git add app/admin/missing-picks/page.tsx
git commit -m "feat: add admin missing-picks dashboard page"
```

---

### Task 6: Link the dashboard from the admin home

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Add the new section card**

In `app/admin/page.tsx`, add an entry to the `sections` array (after the `/admin/audit` entry, around line 9):

```ts
  { href: '/admin/missing-picks', icon: '🔔', label: 'Missing Picks', desc: 'See who still needs to submit picks' },
```

So the array reads:

```ts
const sections = [
  { href: '/admin/publish', icon: '📋', label: 'Publish & Edit Bets', desc: 'Manage odds, visibility, pikanteria, and locks' },
  { href: '/admin/results', icon: '✅', label: 'Enter Results', desc: 'Record outcomes and trigger scoring' },
  { href: '/admin/tournament', icon: '🏆', label: 'Tournament End', desc: 'Set winner and top scorer' },
  { href: '/admin/players', icon: '👥', label: 'Manage Players', desc: 'View players and admin roles' },
  { href: '/admin/scores', icon: '📊', label: 'Score Snapshots', desc: 'Per-day breakdown and validation audit' },
  { href: '/admin/audit', icon: '🧾', label: 'User Audit', desc: 'Track user prediction commits and changes' },
  { href: '/admin/missing-picks', icon: '🔔', label: 'Missing Picks', desc: 'See who still needs to submit picks' },
]
```

- [ ] **Step 2: Manually verify in the dev server**

Run: `npm run dev`, sign in as an admin, open `/admin`, confirm the "Missing Picks" card appears and links to a working `/admin/missing-picks` page showing the aggregate and per-player sections (or the "Everyone's caught up" empty state if nothing is open).

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat: link missing-picks dashboard from admin home"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new `lib/missing-picks.test.ts`

- [ ] **Step 2: Run lint across the project**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 3: Manual end-to-end check**

With `npm run dev` running:
1. As a regular player with open unpicked items, load `/predict` and confirm the banner shows the correct count, then disappears as picks are submitted.
2. As an admin, load `/admin/missing-picks` and confirm the day aggregate, futures aggregate, and per-player list match what you'd expect from `/admin/players/[userId]` for a couple of spot-checked players.
3. Confirm the empty state ("Everyone's caught up") renders correctly when there's nothing open (you can check this against a tournament-settings/match-day state where all items are locked, or reason about it from the code paths if no such state exists in your seed data).

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feature/missing-picks-reminders
gh pr create --title "Add missing-picks reminders and admin dashboard" --body "$(cat <<'EOF'
## Summary
- Show an in-app banner on /predict when a player has open unpicked matches, pikanteria, or futures
- Add an admin dashboard at /admin/missing-picks with a per-day/futures aggregate and a per-player missing-picks breakdown
- Extract the open-item aggregation already used in /admin/players/[userId] into a shared, tested lib/missing-picks.ts

## Test plan
- [ ] npm test passes including lib/missing-picks.test.ts
- [ ] npm run lint passes
- [ ] Banner appears/disappears correctly on /predict as picks are submitted
- [ ] /admin/missing-picks shows correct aggregate and per-player counts, with working links to /admin/players/[userId]
EOF
)"
```
