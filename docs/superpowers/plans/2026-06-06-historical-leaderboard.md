# Historical Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public `/leaderboard` scored-day selector that shows standings as of a selected scored match day.

**Architecture:** Keep the live leaderboard backed by `public.leaderboard`. Add a pure TypeScript historical builder that treats `score_snapshots.day_points` as ledger entries, computes chronological totals through the selected scored day, ranks selected and previous-day standings, and feeds those rows into the existing leaderboard UI.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase JS, Vitest, ESLint.

---

## File Structure

- Create `lib/historical-leaderboard.ts`: pure ranking and chronological-total builder for historical rows.
- Create `lib/historical-leaderboard.test.ts`: Vitest coverage for rank, movement, selected day points, and approved-user filtering.
- Modify `lib/leaderboard-movement.ts`: allow the movement points label to say `day` in historical mode while keeping live `today` behavior.
- Modify `lib/leaderboard-movement.test.ts`: test the optional label.
- Modify `lib/types.ts`: add `ScoredLeaderboardDay` and `HistoricalLeaderboardEntry` types.
- Modify `lib/data.ts`: add `getScoredLeaderboardDays()` and `getHistoricalLeaderboardEntries()`.
- Create `components/leaderboard-day-selector.tsx`: small client selector that navigates between live and scored-day leaderboard URLs.
- Modify `components/leaderboard.tsx`: accept optional labels for historical mode.
- Modify `components/leaderboard-realtime.tsx`: pass default live labels unchanged.
- Modify `app/leaderboard/page.tsx`: read `searchParams.day`, select live or historical data, render the selector, and skip realtime in historical mode.

## Task 1: Historical Leaderboard Pure Builder

**Files:**
- Create: `lib/historical-leaderboard.test.ts`
- Create: `lib/historical-leaderboard.ts`
- Modify: `lib/types.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/historical-leaderboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildHistoricalLeaderboardEntries } from './historical-leaderboard'

const days = [
  { id: 'day-1', date: '2026-06-11', stage: 'group' },
  { id: 'day-2', date: '2026-06-12', stage: 'group' },
  { id: 'day-3', date: '2026-06-13', stage: 'group' },
]

const users = [
  { id: 'u1', display_name: 'Ada', is_monkey: false, automation_strategy: null, status: 'approved' },
  { id: 'u2', display_name: 'Ben', is_monkey: false, automation_strategy: null, status: 'approved' },
  { id: 'u3', display_name: 'Cy', is_monkey: false, automation_strategy: null, status: 'approved' },
  { id: 'blocked', display_name: 'Blocked', is_monkey: false, automation_strategy: null, status: 'blocked' },
] as const

describe('buildHistoricalLeaderboardEntries', () => {
  it('builds selected-day totals by summing day points through the selected scored day', () => {
    const entries = buildHistoricalLeaderboardEntries({
      selectedDayId: 'day-2',
      days,
      users,
      snapshots: [
        { user_id: 'u1', match_day_id: 'day-1', day_points: 4 },
        { user_id: 'u1', match_day_id: 'day-2', day_points: 3 },
        { user_id: 'u1', match_day_id: 'day-3', day_points: 99 },
        { user_id: 'u2', match_day_id: 'day-1', day_points: 8 },
        { user_id: 'u2', match_day_id: 'day-2', day_points: 1 },
        { user_id: 'u3', match_day_id: 'day-1', day_points: 0 },
        { user_id: 'u3', match_day_id: 'day-2', day_points: 10 },
        { user_id: 'blocked', match_day_id: 'day-1', day_points: 100 },
        { user_id: 'blocked', match_day_id: 'day-2', day_points: 100 },
      ],
    })

    expect(entries.map(e => [e.id, e.total_points, e.today_points])).toEqual([
      ['u3', 10, 10],
      ['u2', 9, 1],
      ['u1', 7, 3],
    ])
  })

  it('computes rank movement against the previous scored day', () => {
    const entries = buildHistoricalLeaderboardEntries({
      selectedDayId: 'day-2',
      days,
      users,
      snapshots: [
        { user_id: 'u1', match_day_id: 'day-1', day_points: 10 },
        { user_id: 'u1', match_day_id: 'day-2', day_points: 0 },
        { user_id: 'u2', match_day_id: 'day-1', day_points: 8 },
        { user_id: 'u2', match_day_id: 'day-2', day_points: 8 },
        { user_id: 'u3', match_day_id: 'day-1', day_points: 0 },
        { user_id: 'u3', match_day_id: 'day-2', day_points: 20 },
      ],
    })

    expect(entries.map(e => [e.id, e.current_rank, e.previous_rank, e.rank_delta, e.previous_total_points])).toEqual([
      ['u3', 1, 3, 2, 0],
      ['u2', 2, 2, 0, 8],
      ['u1', 3, 1, -2, 10],
    ])
  })

  it('hides previous-day movement for the first scored day', () => {
    const entries = buildHistoricalLeaderboardEntries({
      selectedDayId: 'day-1',
      days,
      users,
      snapshots: [
        { user_id: 'u1', match_day_id: 'day-1', day_points: 5 },
        { user_id: 'u2', match_day_id: 'day-1', day_points: 2 },
      ],
    })

    expect(entries[0]).toMatchObject({
      id: 'u1',
      total_points: 5,
      today_points: 5,
      previous_total_points: null,
      previous_rank: null,
      rank_delta: null,
    })
  })

  it('returns an empty list when the selected day is not a scored day', () => {
    const entries = buildHistoricalLeaderboardEntries({
      selectedDayId: 'missing',
      days,
      users,
      snapshots: [],
    })

    expect(entries).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node node_modules/vitest/vitest.mjs run lib/historical-leaderboard.test.ts
```

Expected: FAIL because `./historical-leaderboard` does not exist.

- [ ] **Step 3: Add shared types**

In `lib/types.ts`, add these exports after `LeaderboardEntry`:

```ts
export interface ScoredLeaderboardDay {
  id: string
  date: string
  stage: Stage
}

export interface HistoricalLeaderboardEntry extends LeaderboardEntry {
  selected_match_day_id: string
  selected_date: string
  selected_stage: Stage
}
```

- [ ] **Step 4: Implement the pure builder**

Create `lib/historical-leaderboard.ts`:

```ts
import type { AutomationStrategy, HistoricalLeaderboardEntry, ScoredLeaderboardDay, Stage, UserStatus } from './types'

type HistoricalUser = {
  id: string
  display_name: string
  is_monkey: boolean
  automation_strategy: AutomationStrategy | null
  status: UserStatus
}

type HistoricalSnapshot = {
  user_id: string
  match_day_id: string | null
  day_points: number | null
}

function rankByTotal(rows: { id: string; total: number }[]): Map<string, number> {
  const sorted = rows.toSorted((a, b) => b.total - a.total || a.id.localeCompare(b.id))
  const ranks = new Map<string, number>()
  let previousTotal: number | null = null
  let previousRank = 0

  sorted.forEach((row, index) => {
    const rank = previousTotal === row.total ? previousRank : index + 1
    ranks.set(row.id, rank)
    previousTotal = row.total
    previousRank = rank
  })

  return ranks
}

export function buildHistoricalLeaderboardEntries(params: {
  selectedDayId: string
  days: ScoredLeaderboardDay[]
  users: HistoricalUser[]
  snapshots: HistoricalSnapshot[]
}): HistoricalLeaderboardEntry[] {
  const orderedDays = params.days.toSorted((a, b) => a.date.localeCompare(b.date))
  const selectedIndex = orderedDays.findIndex(day => day.id === params.selectedDayId)
  if (selectedIndex === -1) return []

  const selectedDay = orderedDays[selectedIndex]
  const previousDay = selectedIndex > 0 ? orderedDays[selectedIndex - 1] : null
  const selectedDayIds = new Set(orderedDays.slice(0, selectedIndex + 1).map(day => day.id))
  const previousDayIds = new Set(orderedDays.slice(0, selectedIndex).map(day => day.id))

  const selectedDayPoints = new Map<string, number>()
  const selectedTotals = new Map<string, number>()
  const previousTotals = new Map<string, number>()

  for (const snapshot of params.snapshots) {
    if (!snapshot.match_day_id) continue
    const points = Number(snapshot.day_points ?? 0)
    if (snapshot.match_day_id === selectedDay.id) {
      selectedDayPoints.set(snapshot.user_id, (selectedDayPoints.get(snapshot.user_id) ?? 0) + points)
    }
    if (selectedDayIds.has(snapshot.match_day_id)) {
      selectedTotals.set(snapshot.user_id, (selectedTotals.get(snapshot.user_id) ?? 0) + points)
    }
    if (previousDayIds.has(snapshot.match_day_id)) {
      previousTotals.set(snapshot.user_id, (previousTotals.get(snapshot.user_id) ?? 0) + points)
    }
  }

  const approvedUsers = params.users.filter(user => user.status === 'approved')
  const selectedRankInput = approvedUsers.map(user => ({
    id: user.id,
    total: selectedTotals.get(user.id) ?? 0,
  }))
  const previousRankInput = previousDay
    ? approvedUsers.map(user => ({ id: user.id, total: previousTotals.get(user.id) ?? 0 }))
    : []

  const currentRanks = rankByTotal(selectedRankInput)
  const previousRanks = previousDay ? rankByTotal(previousRankInput) : new Map<string, number>()

  return approvedUsers
    .map(user => {
      const total = selectedTotals.get(user.id) ?? 0
      const previousTotal = previousDay ? previousTotals.get(user.id) ?? 0 : null
      const currentRank = currentRanks.get(user.id) ?? null
      const previousRank = previousDay ? previousRanks.get(user.id) ?? null : null

      return {
        id: user.id,
        display_name: user.display_name,
        is_monkey: user.is_monkey,
        automation_strategy: user.automation_strategy,
        total_points: total,
        today_points: selectedDayPoints.get(user.id) ?? 0,
        previous_total_points: previousTotal,
        current_rank: currentRank,
        previous_rank: previousRank,
        rank_delta: previousRank !== null && currentRank !== null ? previousRank - currentRank : null,
        selected_match_day_id: selectedDay.id,
        selected_date: selectedDay.date,
        selected_stage: selectedDay.stage as Stage,
      }
    })
    .toSorted((a, b) => b.total_points - a.total_points || a.display_name.localeCompare(b.display_name))
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
node node_modules/vitest/vitest.mjs run lib/historical-leaderboard.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add lib/types.ts lib/historical-leaderboard.ts lib/historical-leaderboard.test.ts
git commit -m "test: add historical leaderboard builder"
```

## Task 2: Data Fetching for Scored-Day Historical Rows

**Files:**
- Modify: `lib/data.ts`

- [ ] **Step 1: Add imports**

Change the type import in `lib/data.ts`:

```ts
import type { MatchDay, Match, Pikanteria, LeaderboardEntry, Pick, ScoredLeaderboardDay, HistoricalLeaderboardEntry } from './types'
import { buildHistoricalLeaderboardEntries } from './historical-leaderboard'
```

- [ ] **Step 2: Add scored-day and historical query functions**

Append these functions after `getLeaderboardEntries()` in `lib/data.ts`:

```ts
export async function getScoredLeaderboardDays(supabase: Db): Promise<ScoredLeaderboardDay[]> {
  const { data, error } = await supabase
    .from('match_days')
    .select('id, date, stage, score_snapshots!inner(id)')
    .order('date', { ascending: false })
  if (error) throw error

  return (data ?? []).map(day => ({
    id: day.id,
    date: day.date,
    stage: day.stage,
  })) as ScoredLeaderboardDay[]
}

export async function getHistoricalLeaderboardEntries(
  supabase: Db,
  selectedDayId: string,
  days: ScoredLeaderboardDay[],
): Promise<HistoricalLeaderboardEntry[]> {
  const [{ data: users, error: usersError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
    supabase
      .from('users')
      .select('id, display_name, is_monkey, automation_strategy, status'),
    supabase
      .from('score_snapshots')
      .select('user_id, match_day_id, day_points')
      .not('match_day_id', 'is', null),
  ])

  if (usersError) throw usersError
  if (snapshotsError) throw snapshotsError

  return buildHistoricalLeaderboardEntries({
    selectedDayId,
    days,
    users: users ?? [],
    snapshots: snapshots ?? [],
  })
}
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
node node_modules/vitest/vitest.mjs run lib/historical-leaderboard.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add lib/data.ts
git commit -m "feat: add historical leaderboard data helpers"
```

## Task 3: Historical Labels in Existing Leaderboard UI

**Files:**
- Modify: `lib/leaderboard-movement.test.ts`
- Modify: `lib/leaderboard-movement.ts`
- Modify: `components/leaderboard.tsx`
- Modify: `components/leaderboard-realtime.tsx`

- [ ] **Step 1: Write the failing formatter test**

Add this test inside `describe('formatTodayMovementPoints', ...)`:

```ts
it('formats positive points with a custom label', () => {
  expect(formatTodayMovementPoints(4, 'day')).toBe('+4.00 day')
})
```

- [ ] **Step 2: Run the formatter test to verify it fails**

Run:

```bash
node node_modules/vitest/vitest.mjs run lib/leaderboard-movement.test.ts
```

Expected: FAIL because `formatTodayMovementPoints` ignores the custom label.

- [ ] **Step 3: Add the optional label argument**

Update `formatTodayMovementPoints` in `lib/leaderboard-movement.ts`:

```ts
export function formatTodayMovementPoints(
  points: number | null | undefined,
  label = 'today',
): string | null {
  if (!points || points <= 0) return null
  return `+${points.toFixed(2)} ${label}`
}
```

- [ ] **Step 4: Update the leaderboard props and labels**

In `components/leaderboard.tsx`, update `Props`:

```ts
interface Props {
  entries: LeaderboardEntry[]
  currentUserId: string
  todayModeLabel?: string
  movementPointsLabel?: string
}
```

Update the function signature:

```ts
export function Leaderboard({
  entries,
  currentUserId,
  todayModeLabel = 'Today',
  movementPointsLabel = 'today',
}: Props) {
```

Replace button text:

```tsx
{m === 'total' ? 'Total' : todayModeLabel}
```

Replace no-data copy:

```tsx
No results scored yet for the selected day
```

Replace both calls to `formatTodayMovementPoints(entry.today_points)`:

```ts
const todayMovement = mode === 'total' ? formatTodayMovementPoints(entry.today_points, movementPointsLabel) : null
```

In `components/leaderboard-realtime.tsx`, keep the existing call unchanged:

```tsx
return <Leaderboard entries={entries} currentUserId={currentUserId} />
```

- [ ] **Step 5: Run formatter tests**

Run:

```bash
node node_modules/vitest/vitest.mjs run lib/leaderboard-movement.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add lib/leaderboard-movement.ts lib/leaderboard-movement.test.ts components/leaderboard.tsx components/leaderboard-realtime.tsx
git commit -m "feat: support historical leaderboard labels"
```

## Task 4: Scored-Day Selector and Page Wiring

**Files:**
- Create: `components/leaderboard-day-selector.tsx`
- Modify: `app/leaderboard/page.tsx`

- [ ] **Step 1: Create the client selector**

Create `components/leaderboard-day-selector.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import type { ScoredLeaderboardDay } from '@/lib/types'

interface Props {
  days: ScoredLeaderboardDay[]
  selectedDayId: string | null
}

function labelForDay(day: ScoredLeaderboardDay): string {
  return `${day.date} - ${day.stage}`
}

export function LeaderboardDaySelector({ days, selectedDayId }: Props) {
  const router = useRouter()

  return (
    <label className="flex items-center gap-2 text-[11px] font-semibold text-sub">
      <span className="sr-only">Leaderboard day</span>
      <select
        value={selectedDayId ?? ''}
        onChange={event => {
          const nextDay = event.target.value
          router.push(nextDay ? `/leaderboard?day=${nextDay}` : '/leaderboard')
        }}
        className="rounded-lg px-2 py-1 text-[11px] font-bold"
        style={{
          background: 'var(--color-elev)',
          border: '1px solid var(--border-base)',
          color: 'var(--color-text)',
        }}
      >
        <option value="">Live</option>
        {days.map(day => (
          <option key={day.id} value={day.id}>
            {labelForDay(day)}
          </option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 2: Wire `/leaderboard` search params and data**

Replace `app/leaderboard/page.tsx` with:

```tsx
import { createClient } from '@/lib/supabase/server'
import { LeaderboardRealtime } from '@/components/leaderboard-realtime'
import { Leaderboard } from '@/components/leaderboard'
import { LeaderboardDaySelector } from '@/components/leaderboard-day-selector'
import { BottomNav } from '@/components/bottom-nav'
import { getHistoricalLeaderboardEntries, getLeaderboardEntries, getScoredLeaderboardDays } from '@/lib/data'

export const metadata = { title: 'Leaderboard | Mondial Bets 2026', description: 'Full player leaderboard' }

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>
}) {
  const { day } = await searchParams
  const supabase = await createClient()
  const [{ data: { user } }, liveEntries, scoredDays] = await Promise.all([
    supabase.auth.getUser(),
    getLeaderboardEntries(supabase),
    getScoredLeaderboardDays(supabase),
  ])

  const selectedDay = scoredDays.find(scoredDay => scoredDay.id === day) ?? null
  const entries = selectedDay
    ? await getHistoricalLeaderboardEntries(supabase, selectedDay.id, scoredDays)
    : liveEntries
  const eyebrow = selectedDay ? `As of ${selectedDay.date} - ${selectedDay.stage}` : 'Live rankings'

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
            {eyebrow}
          </div>
          <div className="text-[22px] font-extrabold text-text tracking-tight">Leaderboard</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-[11px] font-semibold text-sub">{entries.length} players</div>
          <LeaderboardDaySelector days={scoredDays} selectedDayId={selectedDay?.id ?? null} />
        </div>
      </div>

      <main className="pb-24">
        {selectedDay ? (
          <Leaderboard
            entries={entries}
            currentUserId={user?.id ?? ''}
            todayModeLabel="Day"
            movementPointsLabel="day"
          />
        ) : (
          <LeaderboardRealtime initialEntries={entries} currentUserId={user?.id ?? ''} />
        )}
      </main>

      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
node node_modules/vitest/vitest.mjs run lib/historical-leaderboard.test.ts lib/leaderboard-movement.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add app/leaderboard/page.tsx components/leaderboard-day-selector.tsx
git commit -m "feat: add historical leaderboard selector"
```

## Task 5: Verification and Pull Request

**Files:**
- No planned file edits unless verification finds an issue.

- [ ] **Step 1: Run all relevant tests**

Run:

```bash
node node_modules/vitest/vitest.mjs run lib/historical-leaderboard.test.ts lib/leaderboard-movement.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
node node_modules/eslint/bin/eslint.js
```

Expected: exit code 0.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git status --short
git diff --stat origin/main..HEAD
```

Expected: only historical leaderboard branch files are committed; unrelated local files remain uncommitted.

- [ ] **Step 4: Push and open PR**

Run:

```bash
git push -u origin feature/historical-leaderboard
gh pr create --base main --head feature/historical-leaderboard --title "Add historical leaderboard by scored day" --body "Adds a scored match-day selector to the public leaderboard so users can view chronological standings and day-by-day movement from score snapshots."
```

Expected: branch pushed and PR URL returned.

---

## Self-Review

- Spec coverage: the plan implements scored-match-day selection, public visibility, snapshot-derived chronological totals, previous-day movement, live default behavior, and focused tests.
- Placeholder scan: no `TBD`, `TODO`, or open implementation placeholders remain.
- Type consistency: `ScoredLeaderboardDay`, `HistoricalLeaderboardEntry`, and `LeaderboardEntry` fields match the planned consumers.
