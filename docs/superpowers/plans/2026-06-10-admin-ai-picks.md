# Admin "Pick for AI" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `/admin/ai-picks` page where admins enter match/pikanteria/futures picks for the AI users Claude and Codex, plus a one-click strategy-based futures generator for the four benchmark bots.

**Architecture:** A server-rendered admin page (no client components) with Server Actions that validate against an AI-user allowlist, re-check lock state at save time, and write directly with the service-role client — the same pattern `/admin/publish` uses for benchmark bot picks. Pure helpers in `lib/` carry all testable logic. No migrations: prediction/answer rows are `{ user_id, <item>_id, pick }`; only `pre_tournament_picks` carries odds snapshots.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase service-role client, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-admin-ai-picks-design.md`

---

## File Structure

- Create: `lib/ai-picks.ts` — AI user constants (Claude/Codex IDs), slug/id lookup, pikanteria pick validity, fill-missing futures filter. Pure, no Supabase.
- Create: `lib/ai-picks.test.ts` — tests for the above.
- Modify: `lib/monkey.ts` — add `buildAutomatedFuturesRows` (strategy-based winner/scorer selection mirroring `automatedMatchPick` semantics).
- Modify: `lib/monkey.test.ts` — tests for the new builder.
- Create: `app/admin/ai-picks/actions.ts` — four Server Actions (match pick, pikanteria pick, futures, bot futures generation).
- Create: `app/admin/ai-picks/page.tsx` — the admin page.
- Modify: `app/admin/page.tsx` — add the dashboard card.
- Modify: `AGENTS.md` — document the new admin route.

Conventions used throughout (match the existing codebase):

- All actions start with `await assertAdmin()` then `createAdminClient()`.
- Audit events mirror the SQL RPC shape (see `20260602174444_independent_bet_locks.sql:96-118`): `entity_ref` = item id, `old_value`/`new_value` = `{ pick }`, `metadata` = item context — plus `entered_by_admin: true`. The audit UI reads `metadata.home_team`/`away_team`/`question` (`app/admin/audit/AuditClient.tsx:14-19`), so those keys must be present.
- Page feedback uses a `?notice=` query param + redirect, like `/admin/publish`.

---

### Task 1: AI user constants and pure helpers (`lib/ai-picks.ts`)

**Files:**
- Create: `lib/ai-picks.ts`
- Test: `lib/ai-picks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/ai-picks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  AI_USERS,
  aiUserById,
  aiUserBySlug,
  isValidPikanteriaPick,
  usersMissingFutures,
} from './ai-picks'

describe('AI_USERS', () => {
  it('exposes Claude and Codex with their stable IDs', () => {
    expect(AI_USERS).toEqual([
      { id: '00000000-0000-0000-0000-000000000006', name: 'Claude', slug: 'claude' },
      { id: '00000000-0000-0000-0000-000000000005', name: 'Codex', slug: 'codex' },
    ])
  })
})

describe('aiUserBySlug', () => {
  it('resolves codex by slug', () => {
    expect(aiUserBySlug('codex').name).toBe('Codex')
  })

  it('defaults to Claude for undefined or unknown slugs', () => {
    expect(aiUserBySlug(undefined).name).toBe('Claude')
    expect(aiUserBySlug('monkey').name).toBe('Claude')
  })
})

describe('aiUserById', () => {
  it('resolves both AI users by id', () => {
    expect(aiUserById('00000000-0000-0000-0000-000000000005')?.name).toBe('Codex')
    expect(aiUserById('00000000-0000-0000-0000-000000000006')?.name).toBe('Claude')
  })

  it('returns undefined for any other user id', () => {
    // Monkey's id — a real user, but not an AI user the admin may write for.
    expect(aiUserById('00000000-0000-0000-0000-000000000001')).toBeUndefined()
    expect(aiUserById('not-a-uuid')).toBeUndefined()
  })
})

describe('isValidPikanteriaPick', () => {
  it('accepts 1 and 2 regardless of question shape', () => {
    expect(isValidPikanteriaPick('1', null)).toBe(true)
    expect(isValidPikanteriaPick('2', null)).toBe(true)
    expect(isValidPikanteriaPick('1', 3.5)).toBe(true)
  })

  it('accepts X only on three-way questions', () => {
    expect(isValidPikanteriaPick('X', 3.5)).toBe(true)
    expect(isValidPikanteriaPick('X', null)).toBe(false)
  })
})

describe('usersMissingFutures', () => {
  const bots = [
    { id: 'bot-a' },
    { id: 'bot-b' },
    { id: 'bot-c' },
  ]

  it('keeps only users without an existing futures pick', () => {
    expect(usersMissingFutures(bots, new Set(['bot-b']))).toEqual([
      { id: 'bot-a' },
      { id: 'bot-c' },
    ])
  })

  it('returns everyone when no picks exist and no one when all exist', () => {
    expect(usersMissingFutures(bots, new Set())).toEqual(bots)
    expect(usersMissingFutures(bots, new Set(['bot-a', 'bot-b', 'bot-c']))).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/ai-picks.test.ts`
Expected: FAIL — `Cannot find module './ai-picks'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `lib/ai-picks.ts`:

```ts
import type { Pick } from './types'

// AI-controlled dummy players (see supabase/migrations/20260608000000_ai_dummy_users.sql).
// They are approved regular users with stable IDs; admins enter their picks via
// /admin/ai-picks. Server Actions must refuse to write for any other user.
export const AI_USERS = [
  { id: '00000000-0000-0000-0000-000000000006', name: 'Claude', slug: 'claude' },
  { id: '00000000-0000-0000-0000-000000000005', name: 'Codex', slug: 'codex' },
] as const

export type AiUser = (typeof AI_USERS)[number]

export function aiUserBySlug(slug: string | undefined): AiUser {
  return AI_USERS.find(u => u.slug === slug) ?? AI_USERS[0]
}

export function aiUserById(id: string): AiUser | undefined {
  return AI_USERS.find(u => u.id === id)
}

// X is only a valid pikanteria pick when the question is three-way (odds_x set),
// mirroring the save_pikanteria_answer RPC's validation.
export function isValidPikanteriaPick(pick: Pick, oddsX: number | null): boolean {
  return pick !== 'X' || oddsX != null
}

// Fill-missing-only filter for bot futures generation: never overwrite an
// existing pick (re-running must not re-roll Monkey's random choice).
export function usersMissingFutures<T extends { id: string }>(
  users: T[],
  existingUserIds: ReadonlySet<string>,
): T[] {
  return users.filter(u => !existingUserIds.has(u.id))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/ai-picks.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai-picks.ts lib/ai-picks.test.ts
git commit -m "feat: add AI user constants and pick helpers"
```

---

### Task 2: Bot futures builder (`lib/monkey.ts`)

**Files:**
- Modify: `lib/monkey.ts` (append at end of file)
- Test: `lib/monkey.test.ts` (append at end of file)

- [ ] **Step 1: Write the failing tests**

Append to `lib/monkey.test.ts` (it already imports from `./monkey`; extend the import list with `buildAutomatedFuturesRows` and add this describe block at the end):

```ts
describe('buildAutomatedFuturesRows', () => {
  const teams = [
    { name: 'Longshot FC', odds: 200 },
    { name: 'Favorite FC', odds: 4 },
    { name: 'Middle FC', odds: 40 },
  ]
  const scorers = [
    { name: 'Mid Scorer', odds: 30 },
    { name: 'Long Scorer', odds: 90 },
    { name: 'Fav Scorer', odds: 5 },
  ]

  function rowFor(strategy: 'max' | 'mid' | 'min' | 'monkey') {
    const rows = buildAutomatedFuturesRows(
      [{ id: `u-${strategy}`, automation_strategy: strategy }],
      teams,
      scorers,
    )
    expect(rows).toHaveLength(1)
    return rows[0]
  }

  it('max picks the highest-odds team and scorer with odds snapshots', () => {
    const row = rowFor('max')
    expect(row).toEqual({
      user_id: 'u-max',
      winner_team: 'Longshot FC',
      winner_odds: 200,
      top_scorer: 'Long Scorer',
      top_scorer_odds: 90,
    })
  })

  it('min picks the lowest-odds team and scorer', () => {
    const row = rowFor('min')
    expect(row.winner_team).toBe('Favorite FC')
    expect(row.winner_odds).toBe(4)
    expect(row.top_scorer).toBe('Fav Scorer')
    expect(row.top_scorer_odds).toBe(5)
  })

  it('mid picks the median candidate (sorted by descending odds)', () => {
    // Sorted desc: [200, 40, 4] → floor(3 / 2) = index 1 → 40.
    const row = rowFor('mid')
    expect(row.winner_team).toBe('Middle FC')
    expect(row.top_scorer).toBe('Mid Scorer')
  })

  it('monkey picks a member of each candidate list with matching odds', () => {
    const row = rowFor('monkey')
    const team = teams.find(t => t.name === row.winner_team)
    const scorer = scorers.find(s => s.name === row.top_scorer)
    expect(team).toBeDefined()
    expect(scorer).toBeDefined()
    expect(row.winner_odds).toBe(team!.odds)
    expect(row.top_scorer_odds).toBe(scorer!.odds)
  })

  it('breaks odds ties by list order, like automatedMatchPick', () => {
    const tied = [
      { name: 'First', odds: 10 },
      { name: 'Second', odds: 10 },
    ]
    const rows = buildAutomatedFuturesRows(
      [{ id: 'u-max', automation_strategy: 'max' }],
      tied,
      tied,
    )
    expect(rows[0].winner_team).toBe('First')
  })

  it('builds one row per user', () => {
    const rows = buildAutomatedFuturesRows(
      [
        { id: 'a', automation_strategy: 'max' },
        { id: 'b', automation_strategy: 'min' },
      ],
      teams,
      scorers,
    )
    expect(rows.map(r => r.user_id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/monkey.test.ts`
Expected: FAIL — `buildAutomatedFuturesRows` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/monkey.ts`:

```ts
type FuturesCandidate = { name: string; odds: number }

// Strategy selection over a futures candidate list (TEAMS or SCORERS), with the
// exact semantics of automatedMatchPick: sort by descending odds, stable list
// order as tie-break; max → first, min → last, mid → floor(n / 2), monkey → random.
function automatedFuturesChoice(
  candidates: readonly FuturesCandidate[],
  strategy: AutomationStrategy,
): FuturesCandidate {
  if (strategy === 'monkey') {
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  const sorted = candidates
    .map((candidate, order) => ({ candidate, order }))
    .sort((a, b) => b.candidate.odds - a.candidate.odds || a.order - b.order)
    .map(entry => entry.candidate)

  if (strategy === 'max') return sorted[0]
  if (strategy === 'min') return sorted[sorted.length - 1]
  return sorted[Math.floor(sorted.length / 2)]
}

// Build pre_tournament_picks rows for automated benchmark users — one row per
// user, winner from `teams` and top scorer from `scorers`, odds snapshotted
// from the chosen entries. Used by the admin "Generate bot futures" action.
export function buildAutomatedFuturesRows(
  users: AutomatedUser[],
  teams: readonly FuturesCandidate[],
  scorers: readonly FuturesCandidate[],
): {
  user_id: string
  winner_team: string
  winner_odds: number
  top_scorer: string
  top_scorer_odds: number
}[] {
  return users.map(user => {
    const winner = automatedFuturesChoice(teams, user.automation_strategy)
    const scorer = automatedFuturesChoice(scorers, user.automation_strategy)
    return {
      user_id: user.id,
      winner_team: winner.name,
      winner_odds: winner.odds,
      top_scorer: scorer.name,
      top_scorer_odds: scorer.odds,
    }
  })
}
```

Note: `AutomationStrategy` and `AutomatedUser` are already imported/defined in this file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/monkey.test.ts`
Expected: PASS (all existing tests plus the 6 new ones).

- [ ] **Step 5: Commit**

```bash
git add lib/monkey.ts lib/monkey.test.ts
git commit -m "feat: add strategy-based bot futures row builder"
```

---

### Task 3: Server Actions (`app/admin/ai-picks/actions.ts`)

**Files:**
- Create: `app/admin/ai-picks/actions.ts`

No unit tests for this file (consistent with the rest of the admin surface — all
testable logic already lives in Tasks 1–2). Validation is exercised manually in Task 5.

- [ ] **Step 1: Create the actions file**

Create `app/admin/ai-picks/actions.ts`:

```ts
'use server'

import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { parseUUID, parsePick, parseTeamName, parseScorerName } from '@/lib/validation'
import { aiUserById, isValidPikanteriaPick, usersMissingFutures, type AiUser } from '@/lib/ai-picks'
import { buildAutomatedFuturesRows, type AutomatedUser } from '@/lib/monkey'
import { TEAMS, SCORERS } from '@/lib/pre-tournament'
import { isFuturesLocked, isFuturesPublished } from '@/lib/data'
import { isMatchLocked } from '@/lib/lock'
import { shouldWriteAuditEvent, writeAuditEvent, type AuditJson } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

type AdminClient = ReturnType<typeof createAdminClient>

function aiPicksPath(slug: string, notice?: string) {
  const params = new URLSearchParams({ user: slug })
  if (notice) params.set('notice', notice)
  return `/admin/ai-picks?${params.toString()}`
}

function requireAiUser(formData: FormData): AiUser {
  const userId = parseUUID(formData.get('user_id'), 'user_id')
  const aiUser = aiUserById(userId)
  if (!aiUser) redirect(aiPicksPath('claude', 'invalid'))
  return aiUser
}

function finish(slug: string, notice: string): never {
  revalidatePath('/admin/ai-picks')
  revalidatePath('/predict')
  redirect(aiPicksPath(slug, notice))
}

export async function saveAiMatchPick(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  const aiUser = requireAiUser(formData)
  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const pick = parsePick(formData.get('pick'), 'pick')

  const { data: match } = await supabase
    .from('matches')
    .select('*, match_days(date, stage)')
    .eq('id', matchId)
    .single()

  if (!match || match.published_at == null) redirect(aiPicksPath(aiUser.slug, 'not_found'))
  if (match.result != null || isMatchLocked(match)) redirect(aiPicksPath(aiUser.slug, 'locked'))

  const { data: existing } = await supabase
    .from('predictions')
    .select('id, pick')
    .eq('user_id', aiUser.id)
    .eq('match_id', matchId)
    .maybeSingle()

  if (existing?.pick === pick) redirect(aiPicksPath(aiUser.slug, 'unchanged'))

  const { data: saved, error } = await supabase
    .from('predictions')
    .upsert(
      { user_id: aiUser.id, match_id: matchId, pick, points: null },
      { onConflict: 'user_id,match_id' },
    )
    .select('id')
    .single()
  if (error) throw error

  // Mirrors the audit shape save_match_prediction writes, so /admin/audit
  // renders these events exactly like player-committed ones.
  await writeAuditEvent(supabase, {
    user_id: aiUser.id,
    event_type: 'match_prediction',
    action: existing ? 'update' : 'create',
    entity_id: saved.id,
    entity_ref: matchId,
    old_value: existing ? { pick: existing.pick } : null,
    new_value: { pick },
    metadata: {
      match_id: match.id,
      match_day_id: match.match_day_id,
      date: match.match_days?.date,
      stage: match.match_days?.stage,
      home_team: match.home_team,
      away_team: match.away_team,
      kickoff_time: match.kickoff_time,
      odds_home: match.odds_home,
      odds_draw: match.odds_draw,
      odds_away: match.odds_away,
      entered_by_admin: true,
    },
  })

  finish(aiUser.slug, 'saved')
}

export async function saveAiPikanteriaPick(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  const aiUser = requireAiUser(formData)
  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const pick = parsePick(formData.get('pick'), 'pick')

  const { data: item } = await supabase
    .from('pikanteria')
    .select('*')
    .eq('id', pikanteriaId)
    .single()

  if (!item || item.published_at == null) redirect(aiPicksPath(aiUser.slug, 'not_found'))
  if (item.result != null || item.locked) redirect(aiPicksPath(aiUser.slug, 'locked'))
  if (!isValidPikanteriaPick(pick, item.odds_x)) redirect(aiPicksPath(aiUser.slug, 'invalid'))

  const { data: existing } = await supabase
    .from('pikanteria_answers')
    .select('id, pick')
    .eq('user_id', aiUser.id)
    .eq('pikanteria_id', pikanteriaId)
    .maybeSingle()

  if (existing?.pick === pick) redirect(aiPicksPath(aiUser.slug, 'unchanged'))

  const { data: saved, error } = await supabase
    .from('pikanteria_answers')
    .upsert(
      { user_id: aiUser.id, pikanteria_id: pikanteriaId, pick, points: null },
      { onConflict: 'user_id,pikanteria_id' },
    )
    .select('id')
    .single()
  if (error) throw error

  await writeAuditEvent(supabase, {
    user_id: aiUser.id,
    event_type: 'pikanteria_answer',
    action: existing ? 'update' : 'create',
    entity_id: saved.id,
    entity_ref: pikanteriaId,
    old_value: existing ? { pick: existing.pick } : null,
    new_value: { pick },
    metadata: {
      pikanteria_id: item.id,
      match_day_id: item.match_day_id,
      question: item.question,
      label_1: item.label_1,
      label_2: item.label_2,
      label_x: item.label_x,
      odds_1: item.odds_1,
      odds_2: item.odds_2,
      odds_x: item.odds_x,
      entered_by_admin: true,
    },
  })

  finish(aiUser.slug, 'saved')
}

export async function saveAiFutures(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  const aiUser = requireAiUser(formData)
  const winnerName = parseTeamName(formData.get('winner'))
  const scorerName = parseScorerName(formData.get('scorer'))
  const winner = TEAMS.find(t => t.name === winnerName)!
  const scorer = SCORERS.find(s => s.name === scorerName)!

  const [{ data: existing, error: existingError }, locked, published] = await Promise.all([
    supabase
      .from('pre_tournament_picks')
      .select('id, winner_team, winner_odds, top_scorer, top_scorer_odds')
      .eq('user_id', aiUser.id)
      .maybeSingle(),
    isFuturesLocked(supabase),
    isFuturesPublished(supabase),
  ])

  if (existingError) throw existingError
  if (!published || locked) redirect(aiPicksPath(aiUser.slug, 'locked'))

  const oldValue: AuditJson | null = existing ? {
    winner_team: existing.winner_team,
    winner_odds: existing.winner_odds,
    top_scorer: existing.top_scorer,
    top_scorer_odds: existing.top_scorer_odds,
  } : null
  const newValue: AuditJson = {
    winner_team: winner.name,
    winner_odds: winner.odds,
    top_scorer: scorer.name,
    top_scorer_odds: scorer.odds,
  }
  const shouldAudit = shouldWriteAuditEvent(oldValue, newValue)

  const { data: saved, error } = await supabase
    .from('pre_tournament_picks')
    .upsert({
      user_id: aiUser.id,
      winner_team: winner.name,
      winner_odds: winner.odds,
      top_scorer: scorer.name,
      top_scorer_odds: scorer.odds,
    }, { onConflict: 'user_id' })
    .select('id')
    .single()
  if (error) throw error

  if (shouldAudit) {
    await writeAuditEvent(supabase, {
      user_id: aiUser.id,
      event_type: 'pre_tournament_pick',
      action: existing ? 'update' : 'create',
      entity_id: saved.id,
      entity_ref: 'pre_tournament',
      old_value: oldValue,
      new_value: newValue,
      metadata: { label: 'Pre-tournament', entered_by_admin: true },
    })
  }

  finish(aiUser.slug, shouldAudit ? 'saved' : 'unchanged')
}

async function getAutomatedUsers(supabase: AdminClient): Promise<AutomatedUser[]> {
  const { data } = await supabase
    .from('users')
    .select('id, automation_strategy')
    .not('automation_strategy', 'is', null)
    .returns<AutomatedUser[]>()
  return data ?? []
}

export async function generateBotFutures(formData: FormData) {
  await assertAdmin()
  const supabase = createAdminClient()

  // Keep the user toggle stable across the redirect.
  const slug = formData.get('user_slug') === 'codex' ? 'codex' : 'claude'

  if (await isFuturesLocked(supabase)) redirect(aiPicksPath(slug, 'locked'))

  const bots = await getAutomatedUsers(supabase)
  const { data: existingPicks, error: existingError } = await supabase
    .from('pre_tournament_picks')
    .select('user_id')
    .in('user_id', bots.map(b => b.id))
  if (existingError) throw existingError

  const existingIds = new Set((existingPicks ?? []).map(p => p.user_id))
  const missing = usersMissingFutures(bots, existingIds)

  // Fill-missing-only: never overwrite, so re-clicking can't re-roll Monkey's
  // random pick. No audit events — matches the publish-time bot pick precedent.
  if (missing.length) {
    const rows = buildAutomatedFuturesRows(missing, TEAMS, SCORERS)
    const { error } = await supabase.from('pre_tournament_picks').insert(rows)
    if (error) throw error
  }

  finish(slug, `bots-${missing.length}-${bots.length - missing.length}`)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (If `match.match_days` is typed as an array by the generated
Supabase types, change the metadata lines to use
`const day = Array.isArray(match.match_days) ? match.match_days[0] : match.match_days`
and reference `day?.date` / `day?.stage`.)

- [ ] **Step 3: Commit**

```bash
git add app/admin/ai-picks/actions.ts
git commit -m "feat: add admin server actions for AI picks and bot futures"
```

---

### Task 4: Admin page UI (`app/admin/ai-picks/page.tsx`)

**Files:**
- Create: `app/admin/ai-picks/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/admin/ai-picks/page.tsx`:

```tsx
import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import Link from 'next/link'
import { isMatchLocked } from '@/lib/lock'
import { formatAppDate, formatAppDateTime } from '@/lib/time'
import type { Pick } from '@/lib/types'
import { AI_USERS, aiUserBySlug } from '@/lib/ai-picks'
import { TEAMS, SCORERS } from '@/lib/pre-tournament'
import {
  getPublishedMatchDaysWithAll,
  getUserPredictions,
  getUserPikanteriaAnswers,
  isFuturesLocked,
  isFuturesPublished,
  type FullMatchDay,
} from '@/lib/data'
import {
  saveAiMatchPick,
  saveAiPikanteriaPick,
  saveAiFutures,
  generateBotFutures,
} from './actions'

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter Finals',
  sf: 'Semi Finals', '3rd': 'Third Place', final: 'Final',
}

const NOTICES: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  saved: { text: '✓ Pick saved', tone: 'ok' },
  unchanged: { text: 'No change — pick already set', tone: 'ok' },
  locked: { text: 'That bet is locked and cannot be changed', tone: 'warn' },
  invalid: { text: 'Invalid pick', tone: 'warn' },
  not_found: { text: 'Bet not found or unpublished', tone: 'warn' },
}

function noticeContent(notice: string | undefined) {
  if (!notice) return null
  const bots = notice.match(/^bots-(\d+)-(\d+)$/)
  if (bots) return { text: `🤖 Bot futures: created ${bots[1]}, skipped ${bots[2]}`, tone: 'ok' as const }
  return NOTICES[notice] ?? null
}

// Same open-day filtering as /admin/players/[userId]: published days with at
// least one unlocked, unscored match or pikanteria.
function filterOpenDays(matchDays: FullMatchDay[]) {
  const result = []
  for (const day of matchDays) {
    const openMatches = (day.matches ?? [])
      .filter(m => m.published_at != null && m.result == null && !isMatchLocked(m))
      .toSorted((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
    const openPikanteria = (day.pikanteria ?? [])
      .filter(item => item.published_at != null && item.result == null && !item.locked)
    if (openMatches.length > 0 || openPikanteria.length > 0) {
      result.push({ day, openMatches, openPikanteria })
    }
  }
  return result
}

export default async function AiPicksPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; notice?: string }>
}) {
  const { user: userSlug, notice } = await searchParams
  await assertAdmin()
  const supabase = createAdminClient()

  const aiUser = aiUserBySlug(userSlug)

  const [matchDaysRaw, predictions, answers, { data: futuresPick }, futuresLocked, futuresPublished, botRows] =
    await Promise.all([
      getPublishedMatchDaysWithAll(supabase),
      getUserPredictions(supabase, aiUser.id),
      getUserPikanteriaAnswers(supabase, aiUser.id),
      supabase
        .from('pre_tournament_picks')
        .select('winner_team, top_scorer')
        .eq('user_id', aiUser.id)
        .maybeSingle(),
      isFuturesLocked(supabase),
      isFuturesPublished(supabase),
      supabase
        .from('users')
        .select('id, display_name, pre_tournament_picks(winner_team, top_scorer)')
        .not('automation_strategy', 'is', null)
        .order('display_name'),
    ])

  const predictionMap: Record<string, Pick> = Object.fromEntries(
    predictions.map(p => [p.match_id, p.pick as Pick])
  )
  const answerMap: Record<string, Pick> = Object.fromEntries(
    answers.map(a => [a.pikanteria_id, a.pick as Pick])
  )

  const openDays = filterOpenDays(matchDaysRaw as FullMatchDay[])
  const futuresOpen = futuresPublished && !futuresLocked
  const noticeBox = noticeContent(notice)

  const bots = (botRows.data ?? []).map(bot => {
    const pick = Array.isArray(bot.pre_tournament_picks)
      ? bot.pre_tournament_picks[0]
      : bot.pre_tournament_picks
    return { id: bot.id, name: bot.display_name, pick: pick ?? null }
  })

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>
          🤖 Pick for AI
        </div>
        <div className="text-muted text-xs mt-0.5">
          Enter bets on behalf of the AI players. Locks apply exactly as for humans.
        </div>
      </div>

      {noticeBox && (
        <div className="rounded-xl px-4 py-2.5 text-xs font-semibold"
          style={noticeBox.tone === 'ok'
            ? { color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }
            : { color: 'var(--color-danger)', background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
          {noticeBox.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {AI_USERS.map(u => (
          <Link key={u.slug} href={`/admin/ai-picks?user=${u.slug}`}
            className="rounded-xl px-4 py-2.5 text-center font-bold text-sm transition-colors"
            style={u.slug === aiUser.slug
              ? { color: 'var(--color-amber)', background: 'var(--color-panel)', border: '1px solid var(--border-accent)' }
              : { color: 'var(--color-text)', background: 'var(--color-panel)', border: '1px solid var(--border-base)', opacity: 0.65 }}>
            {u.name}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-muted text-[11px] font-bold uppercase tracking-wide px-1">
          🏆 Futures — {aiUser.name}
        </div>
        {futuresOpen ? (
          <form action={saveAiFutures} className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <input type="hidden" name="user_id" value={aiUser.id} />
            <label className="block text-xs space-y-1">
              <span className="text-muted font-semibold">🥇 Tournament Winner</span>
              <select name="winner" required defaultValue={futuresPick?.winner_team ?? ''}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--border-base)' }}>
                <option value="" disabled>Select team…</option>
                {TEAMS.map(t => (
                  <option key={t.name} value={t.name}>{t.name} ({t.odds})</option>
                ))}
              </select>
            </label>
            <label className="block text-xs space-y-1">
              <span className="text-muted font-semibold">⚽ Top Scorer</span>
              <select name="scorer" required defaultValue={futuresPick?.top_scorer ?? ''}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--border-base)' }}>
                <option value="" disabled>Select scorer…</option>
                {SCORERS.map(s => (
                  <option key={s.name} value={s.name}>{s.name} ({s.odds})</option>
                ))}
              </select>
            </label>
            <button type="submit"
              className="w-full rounded-lg py-2 text-sm font-bold"
              style={{ color: 'var(--color-bg)', background: 'var(--color-amber)' }}>
              Save futures for {aiUser.name}
            </button>
          </form>
        ) : (
          <div className="rounded-xl px-4 py-3 text-xs text-muted"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            🔒 Futures are {futuresPublished ? 'locked' : 'not published'}
            {futuresPick ? ` — ${aiUser.name} picked ${futuresPick.winner_team} / ${futuresPick.top_scorer}` : ` — ${aiUser.name} has no pick`}
          </div>
        )}
      </div>

      {openDays.length === 0 && (
        <div className="text-center py-10">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-text font-semibold">Nothing open to pick</div>
          <div className="text-muted text-sm mt-1">No published, unlocked bets right now.</div>
        </div>
      )}

      {openDays.map(({ day, openMatches, openPikanteria }) => (
        <div key={day.id} className="space-y-2">
          <div className="flex items-center gap-2 pt-1">
            <span className="text-sm font-bold text-text">{formatAppDate(day.date)}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
              {STAGE_LABELS[day.stage] ?? day.stage}
            </span>
          </div>

          {openMatches.map(match => (
            <div key={match.id} className="rounded-xl px-4 py-3 space-y-2"
              style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
              <div>
                <div className="font-semibold text-[13px] text-text">
                  {match.home_team} vs {match.away_team}
                </div>
                <div className="text-muted text-[11px] mt-0.5">
                  {formatAppDateTime(match.kickoff_time, {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
                  })} Jerusalem
                </div>
              </div>
              <form action={saveAiMatchPick} className="grid grid-cols-3 gap-2">
                <input type="hidden" name="user_id" value={aiUser.id} />
                <input type="hidden" name="match_id" value={match.id} />
                <PickChip name="pick" value="1" label="1" odds={match.odds_home} active={predictionMap[match.id] === '1'} />
                <PickChip name="pick" value="X" label="X" odds={match.odds_draw} active={predictionMap[match.id] === 'X'} />
                <PickChip name="pick" value="2" label="2" odds={match.odds_away} active={predictionMap[match.id] === '2'} />
              </form>
            </div>
          ))}

          {openPikanteria.map(item => (
            <div key={item.id} className="rounded-xl px-4 py-3 space-y-2"
              style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
              <div className="flex items-center gap-1.5">
                <span>🌶️</span>
                <span className="font-semibold text-[13px] text-text">{item.question}</span>
              </div>
              <form action={saveAiPikanteriaPick}
                className={`grid gap-2 ${item.odds_x != null ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <input type="hidden" name="user_id" value={aiUser.id} />
                <input type="hidden" name="pikanteria_id" value={item.id} />
                <PickChip name="pick" value="1" label={item.label_1} odds={item.odds_1} active={answerMap[item.id] === '1'} />
                {item.odds_x != null && (
                  <PickChip name="pick" value="X" label={item.label_x ?? 'X'} odds={item.odds_x} active={answerMap[item.id] === 'X'} />
                )}
                <PickChip name="pick" value="2" label={item.label_2} odds={item.odds_2} active={answerMap[item.id] === '2'} />
              </form>
            </div>
          ))}
        </div>
      ))}

      <div className="space-y-2 pt-2">
        <div className="text-muted text-[11px] font-bold uppercase tracking-wide px-1">
          🎰 Benchmark Bot Futures
        </div>
        <div className="rounded-xl p-4 space-y-2"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          {bots.map(bot => (
            <div key={bot.id} className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text">{bot.name}</span>
              {bot.pick ? (
                <span style={{ color: 'var(--color-accent)' }}>
                  ✓ {bot.pick.winner_team} / {bot.pick.top_scorer}
                </span>
              ) : (
                <span style={{ color: 'var(--color-danger)' }}>✗ Missing</span>
              )}
            </div>
          ))}
          {!futuresLocked && (
            <form action={generateBotFutures} className="pt-1">
              <input type="hidden" name="user_slug" value={aiUser.slug} />
              <button type="submit"
                className="w-full rounded-lg py-2 text-sm font-bold"
                style={{ color: 'var(--color-bg)', background: 'var(--color-amber)' }}>
                Generate bot futures (fills missing only)
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function PickChip({
  name, value, label, odds, active,
}: {
  name: string; value: string; label: string; odds: number; active: boolean
}) {
  return (
    <button type="submit" name={name} value={value}
      className="rounded-lg px-2 py-2 text-center transition-colors"
      style={active
        ? { color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }
        : { color: 'var(--color-text)', background: 'var(--color-bg)', border: '1px solid var(--border-base)' }}>
      <div className="text-[11px] font-bold truncate">{label}</div>
      <div className="text-[10px] text-muted">{odds}</div>
    </button>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (Same nested-relation caveat as Task 3: if
`pre_tournament_picks` comes back typed as an array, the `Array.isArray` handling
in the `bots` mapping already covers it.)

- [ ] **Step 3: Smoke-test in the dev server**

Run: `npm run dev`
Visit `http://localhost:3000/admin/ai-picks` as an admin and verify:
- Claude/Codex toggle switches the highlighted user and their picks.
- Tapping a 1/X/2 chip saves and shows "✓ Pick saved"; the chip highlights.
- Re-tapping the same chip shows "No change — pick already set".
- Futures save works and prefills on reload.
- "Generate bot futures" reports `created 4, skipped 0` first click and `created 0, skipped 4` on the second.
- The new picks appear in `/admin/players/<ai-user-id>` and `/admin/audit`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/ai-picks/page.tsx
git commit -m "feat: add admin Pick for AI page"
```

---

### Task 5: Dashboard card, docs, and final verification

**Files:**
- Modify: `app/admin/page.tsx:10` (the `sections` array)
- Modify: `AGENTS.md` (admin routes list, around line 64)

- [ ] **Step 1: Add the dashboard card**

In `app/admin/page.tsx`, add to the `sections` array after the `/admin/players` entry:

```ts
  { href: '/admin/ai-picks', icon: '🤖', label: 'Pick for AI', desc: 'Enter bets for Claude, Codex, and bot futures' },
```

- [ ] **Step 2: Document the route**

In `AGENTS.md`, in the `/admin/*` route list, add after the `/admin/players/[userId]` line:

```markdown
  - `/admin/ai-picks` — enter match/pikanteria/futures picks for the AI users (Claude, Codex) and generate benchmark bot futures
```

- [ ] **Step 3: Run the full test suite and lint**

Run: `npm test`
Expected: all suites pass, including the new `lib/ai-picks.test.ts` and extended `lib/monkey.test.ts`.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.tsx AGENTS.md
git commit -m "feat: link Pick for AI from admin dashboard and document route"
```
