# Leaderboard Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add total-standings leaderboard movement based on the latest scored snapshot day.

**Architecture:** Extend the existing `public.leaderboard` view so rank movement is computed in PostgreSQL beside the existing total and today point data. Add a small pure TypeScript formatter for the UI labels, then render those labels only in the leaderboard `Total` mode.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase PostgreSQL migrations, Vitest.

---

## File Structure

- Create `lib/leaderboard-movement.ts`: pure helpers for movement and today-points label formatting.
- Create `lib/leaderboard-movement.test.ts`: Vitest tests for the helper behavior.
- Modify `lib/types.ts`: add nullable movement fields to `LeaderboardEntry`.
- Modify `components/leaderboard.tsx`: render rank delta and latest-day points only in `Total` mode.
- Create `supabase/migrations/20260603000000_leaderboard_movement.sql`: replace `public.leaderboard` with movement-aware columns.

## Task 1: Movement Formatting Helper

**Files:**
- Create: `lib/leaderboard-movement.test.ts`
- Create: `lib/leaderboard-movement.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/leaderboard-movement.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatRankDelta, formatTodayMovementPoints } from './leaderboard-movement'

describe('formatRankDelta', () => {
  it('formats positive rank movement with a plus sign', () => {
    expect(formatRankDelta(3)).toBe('+3')
  })

  it('formats negative rank movement', () => {
    expect(formatRankDelta(-2)).toBe('-2')
  })

  it('hides zero and missing rank movement', () => {
    expect(formatRankDelta(0)).toBeNull()
    expect(formatRankDelta(null)).toBeNull()
  })
})

describe('formatTodayMovementPoints', () => {
  it('formats positive latest-day points with a today suffix', () => {
    expect(formatTodayMovementPoints(8.5)).toBe('+8.50 today')
  })

  it('hides zero and missing latest-day points', () => {
    expect(formatTodayMovementPoints(0)).toBeNull()
    expect(formatTodayMovementPoints(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/leaderboard-movement.test.ts`

Expected: FAIL because `./leaderboard-movement` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `lib/leaderboard-movement.ts`:

```ts
export function formatRankDelta(delta: number | null | undefined): string | null {
  if (!delta) return null
  return delta > 0 ? `+${delta}` : String(delta)
}

export function formatTodayMovementPoints(points: number | null | undefined): string | null {
  if (!points || points <= 0) return null
  return `+${points.toFixed(2)} today`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/leaderboard-movement.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add lib/leaderboard-movement.ts lib/leaderboard-movement.test.ts
git commit -m "test: add leaderboard movement formatting"
```

## Task 2: Leaderboard View Movement Columns

**Files:**
- Create: `supabase/migrations/20260603000000_leaderboard_movement.sql`
- Modify: `lib/types.ts`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/20260603000000_leaderboard_movement.sql`:

```sql
-- Mondial Bets 2026 - Leaderboard movement
--
-- Adds total-standings movement fields based on the latest scored match day.

create or replace view public.leaderboard as
with latest_scored_day as (
  select md.id as match_day_id
  from public.match_days md
  where exists (
    select 1 from public.matches m
    where m.match_day_id = md.id and m.result is not null
  )
  order by md.date desc
  limit 1
),
day_scores as (
  select ss.user_id, ss.day_points
  from public.score_snapshots ss
  join latest_scored_day lsd on lsd.match_day_id = ss.match_day_id
),
player_scores as (
  select
    u.id,
    u.display_name,
    u.is_monkey,
    u.automation_strategy,
    coalesce(sum(p.points), 0)
      + coalesce(sum(pa.points), 0)
      + coalesce(pt.winner_points, 0)
      + coalesce(pt.top_scorer_points, 0) as total_points,
    coalesce(max(ds.day_points), 0) as today_points
  from public.users u
  left join public.predictions p on p.user_id = u.id
  left join public.pikanteria_answers pa on pa.user_id = u.id
  left join public.pre_tournament_picks pt on pt.user_id = u.id
  left join day_scores ds on ds.user_id = u.id
  where u.status = 'approved'
  group by u.id, u.display_name, u.is_monkey, u.automation_strategy, pt.winner_points, pt.top_scorer_points
),
ranked as (
  select
    ps.*,
    ps.total_points - ps.today_points as previous_total_points,
    rank() over (order by ps.total_points desc) as current_rank,
    rank() over (order by (ps.total_points - ps.today_points) desc) as previous_rank
  from player_scores ps
)
select
  id,
  display_name,
  is_monkey,
  total_points,
  today_points,
  automation_strategy,
  previous_total_points,
  current_rank,
  previous_rank,
  previous_rank - current_rank as rank_delta
from ranked
order by total_points desc;
```

- [ ] **Step 2: Update TypeScript type**

In `lib/types.ts`, update `LeaderboardEntry`:

```ts
export interface LeaderboardEntry {
  id: string
  display_name: string
  is_monkey: boolean
  automation_strategy: AutomationStrategy | null
  total_points: number
  today_points: number
  previous_total_points: number | null
  current_rank: number | null
  previous_rank: number | null
  rank_delta: number | null
}
```

- [ ] **Step 3: Inspect SQL**

Run: `Get-Content supabase\migrations\20260603000000_leaderboard_movement.sql`

Expected: migration contains `create or replace view public.leaderboard` and the selected columns include `rank_delta`.

- [ ] **Step 4: Commit**

Run:

```bash
git add lib/types.ts supabase/migrations/20260603000000_leaderboard_movement.sql
git commit -m "feat: add leaderboard movement data"
```

## Task 3: Leaderboard UI Rendering

**Files:**
- Modify: `components/leaderboard.tsx`

- [ ] **Step 1: Import formatters**

Add this import:

```ts
import { formatRankDelta, formatTodayMovementPoints } from '@/lib/leaderboard-movement'
```

- [ ] **Step 2: Render total movement labels**

Inside both podium and rest item rendering, compute:

```ts
const rankDelta = mode === 'total' ? formatRankDelta(entry.rank_delta) : null
const todayMovement = mode === 'total' ? formatTodayMovementPoints(entry.today_points) : null
```

Render `rankDelta` as a compact chip near the rank or score, using green-ish accent color for positive movement and danger color for negative movement. Render `todayMovement` as muted monospace text under or beside the total score. Do not render either label in `Today` mode.

- [ ] **Step 3: Prefer server rank in total mode**

For total mode ranks, use:

```ts
const displayRank = mode === 'total' && entry.current_rank ? entry.current_rank : rank
```

Use `displayRank` wherever the total-mode rank is displayed.

- [ ] **Step 4: Run formatting tests**

Run: `npm test -- lib/leaderboard-movement.test.ts`

Expected: PASS.

- [ ] **Step 5: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add components/leaderboard.tsx
git commit -m "feat: show leaderboard movement"
```

## Task 4: Final Verification and Pull Request

**Files:**
- No new files.

- [ ] **Step 1: Check branch state**

Run: `git status --short --branch`

Expected: branch is `feature/leaderboard-movement`; only pre-existing untracked local files may remain.

- [ ] **Step 2: Review final diff**

Run: `git log --oneline origin/main..HEAD`

Expected: commits include the design doc and three implementation commits.

- [ ] **Step 3: Push branch**

Run: `git push -u origin feature/leaderboard-movement`

Expected: branch is pushed to GitHub.

- [ ] **Step 4: Open PR**

Run: `gh pr create --base main --head feature/leaderboard-movement --title "Add leaderboard movement" --body "Adds total-standings rank movement based on the latest scored snapshot day, plus compact leaderboard UI labels."`

Expected: PR URL is printed.
