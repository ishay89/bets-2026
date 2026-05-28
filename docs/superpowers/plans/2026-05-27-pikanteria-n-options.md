# Pikanteria N-Option Flexible Bets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize Pikanteria from fixed yes/no to N custom-labeled options so admins can create any bet type (1X2, over/under, who scores first, etc.).

**Architecture:** Schema migration adds a `pikanteria_options` child table; `pikanteria_answers` replaces `answer boolean` with `option_id`. A new `PicanteriaBuilder` client component handles dynamic add/remove in the admin publish form. All player-facing and results pages are updated to work with the new N-option structure.

**Tech Stack:** Next.js 16 App Router (RSC + Server Actions), React 19 (`useTransition`), Supabase (PostgreSQL + RLS), TypeScript strict

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/005_pikanteria_options.sql` | Create (new migration) |
| `lib/types.ts` | Modify — update Pikanteria, add PicanteriaOption, update PicanteriaAnswer |
| `lib/monkey.ts` | Modify — update `monkeyPikanteriaPick` signature |
| `components/pikanteria-builder.tsx` | Create (new client component) |
| `app/admin/publish/page.tsx` | Modify — new server action + use PicanteriaBuilder |
| `components/pikanteria-card.tsx` | Modify — N-option buttons instead of yes/no |
| `app/predict/page.tsx` | Modify — fetch options, update saveAnswer, new answer map |
| `app/admin/results/page.tsx` | Modify — N-option result entry, updated scoring |
| `app/history/page.tsx` | Modify — show option label instead of Yes/No |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/005_pikanteria_options.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 005_pikanteria_options.sql
-- Generalise Pikanteria from yes/no to N custom options.
-- Safe to run: no live pikanteria data exists yet.

-- 1. New child table for options
create table public.pikanteria_options (
  id            uuid primary key default gen_random_uuid(),
  pikanteria_id uuid not null references public.pikanteria(id) on delete cascade,
  label         text not null,
  odds          numeric(5,2) not null,
  is_correct    boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.pikanteria_options enable row level security;

create policy "pikanteria_options_read"
  on public.pikanteria_options for select
  using (true);

-- 2. Update pikanteria_answers: swap answer boolean for option_id
alter table public.pikanteria_answers
  drop column answer;

alter table public.pikanteria_answers
  add column option_id uuid not null references public.pikanteria_options(id) on delete cascade;

-- 3. Strip obsolete columns from pikanteria
alter table public.pikanteria
  drop column odds_yes,
  drop column odds_no,
  drop column result;
```

- [ ] **Step 2: Apply the migration in Supabase**

Go to **Supabase Dashboard → SQL Editor**, paste and run the migration above.

Verify by running:
```sql
select column_name from information_schema.columns
where table_name = 'pikanteria' order by ordinal_position;
-- Expected: id, match_day_id, question, created_at

select column_name from information_schema.columns
where table_name = 'pikanteria_options' order by ordinal_position;
-- Expected: id, pikanteria_id, label, odds, is_correct, sort_order, created_at

select column_name from information_schema.columns
where table_name = 'pikanteria_answers' order by ordinal_position;
-- Expected: id, user_id, pikanteria_id, points, created_at, option_id
```

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/005_pikanteria_options.sql
git commit -m "feat: add pikanteria_options migration for n-option bets"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Update `lib/types.ts`**

Replace the `Pikanteria` and `PicanteriaAnswer` interfaces and add `PicanteriaOption`:

```ts
export type Stage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | '3rd' | 'final'
export type Pick = '1' | 'X' | '2'

export interface User {
  id: string
  email: string
  display_name: string
  is_admin: boolean
  is_monkey: boolean
  created_at: string
}

export interface MatchDay {
  id: string
  date: string
  stage: Stage
  lock_time: string
  published_at: string | null
  created_at: string
}

export interface Match {
  id: string
  match_day_id: string
  home_team: string
  away_team: string
  kickoff_time: string
  odds_home: number
  odds_draw: number
  odds_away: number
  result: Pick | null
}

export interface PicanteriaOption {
  id: string
  pikanteria_id: string
  label: string
  odds: number
  is_correct: boolean
  sort_order: number
}

export interface Pikanteria {
  id: string
  match_day_id: string
  question: string
  created_at: string
  options?: PicanteriaOption[]
}

export interface Prediction {
  id: string
  user_id: string
  match_id: string
  pick: Pick
  points: number | null
}

export interface PicanteriaAnswer {
  id: string
  user_id: string
  pikanteria_id: string
  option_id: string
  points: number | null
}

export interface PreTournamentPick {
  id: string
  user_id: string
  winner_team: string
  winner_odds: number
  top_scorer: string
  top_scorer_odds: number
  winner_points: number | null
  top_scorer_points: number | null
}

export interface LeaderboardEntry {
  id: string
  display_name: string
  is_monkey: boolean
  total_points: number
}

export interface ScoreSnapshot {
  id: string
  user_id: string
  match_day_id: string | null
  stage: string | null
  match_points: number
  pikanteria_points: number
  pre_tournament_winner_pts: number
  pre_tournament_scorer_pts: number
  day_points: number
  cumulative_points: number
  is_valid: boolean
  discrepancy: number | null
  calculated_at: string
  created_at: string
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build
```

Expected: TypeScript errors only in files that still reference `odds_yes`, `odds_no`, `result` (boolean), or `answer` — that's expected and will be fixed in later tasks. No new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: update types for pikanteria n-options (PicanteriaOption, updated Pikanteria/PicanteriaAnswer)"
```

---

## Task 3: Update Monkey Picks

**Files:**
- Modify: `lib/monkey.ts`

- [ ] **Step 1: Update `monkeyPikanteriaPick`**

Replace the entire contents of `lib/monkey.ts`:

```ts
// Seeded hash so monkey picks are reproducible per match per day
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export function monkeyMatchPick(matchId: string, date: string): '1' | 'X' | '2' {
  const picks = ['1', 'X', '2'] as const
  return picks[Math.abs(hashCode(`${matchId}-${date}`)) % 3]
}

// Returns the id of a randomly chosen option (seeded, reproducible).
// optionIds must be non-empty; caller is responsible for ensuring this.
export function monkeyPikanteriaPick(picanteriaId: string, date: string, optionIds: string[]): string {
  return optionIds[Math.abs(hashCode(`${picanteriaId}-${date}`)) % optionIds.length]
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: The build will show an error in `app/admin/publish/page.tsx` because it still calls the old `monkeyPikanteriaPick` with 2 args. That's expected — it will be fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add lib/monkey.ts
git commit -m "feat: update monkeyPikanteriaPick to accept n options and return option_id"
```

---

## Task 4: PicanteriaBuilder Client Component

**Files:**
- Create: `components/pikanteria-builder.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'
import { useState } from 'react'

interface Option {
  label: string
  odds: string
}

interface Props {
  /** Which pikanteria slot this builder is for (1, 2, or 3) */
  questionIndex: number
}

const inputBase = {
  background: 'var(--color-bg)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--color-text)',
}

export function PicanteriaBuilder({ questionIndex: qi }: Props) {
  const [options, setOptions] = useState<Option[]>([
    { label: '', odds: '' },
    { label: '', odds: '' },
  ])

  function addOption() {
    setOptions(o => [...o, { label: '', odds: '' }])
  }

  function removeOption(idx: number) {
    if (options.length <= 2) return
    setOptions(o => o.filter((_, i) => i !== idx))
  }

  function updateOption(idx: number, field: keyof Option, value: string) {
    setOptions(o => o.map((opt, i) => i === idx ? { ...opt, [field]: value } : opt))
  }

  return (
    <div className="space-y-2">
      {/* Hidden count so server action knows how many options to read */}
      <input type="hidden" name={`pik_opt_count_${qi}`} value={options.length} />

      <div className="text-muted text-xs mb-1">Options</div>
      {options.map((opt, idx) => {
        const j = idx + 1
        const placeholder = idx === 0 ? 'Yes' : idx === 1 ? 'No' : `Option ${j}`
        return (
          <div key={idx} className="flex gap-2 items-center">
            <input
              type="text"
              name={`pik_opt_label_${qi}_${j}`}
              placeholder={placeholder}
              value={opt.label}
              onChange={e => updateOption(idx, 'label', e.target.value)}
              style={inputBase}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 flex-1"
            />
            <input
              type="number"
              step="0.01"
              name={`pik_opt_odds_${qi}_${j}`}
              placeholder="1.80"
              value={opt.odds}
              onChange={e => updateOption(idx, 'odds', e.target.value)}
              style={{ ...inputBase, color: 'var(--color-amber)', fontFamily: 'var(--font-mono)' }}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 w-20"
            />
            <button
              type="button"
              onClick={() => removeOption(idx)}
              disabled={options.length <= 2}
              className="text-sm px-2 rounded hover:text-text transition-colors disabled:opacity-30"
              style={{ color: 'var(--color-muted)' }}
              title="Remove option"
            >
              ×
            </button>
          </div>
        )
      })}

      <button
        type="button"
        onClick={addOption}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg mt-1"
        style={{ color: 'var(--color-amber)', background: 'rgba(245,166,35,0.1)' }}
      >
        + Add option
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: No new errors from this file. Existing errors from Tasks 2/3 may still appear.

- [ ] **Step 3: Commit**

```bash
git add components/pikanteria-builder.tsx
git commit -m "feat: add PicanteriaBuilder client component for dynamic option slots"
```

---

## Task 5: Update Admin Publish Page

**Files:**
- Modify: `app/admin/publish/page.tsx`

- [ ] **Step 1: Rewrite `app/admin/publish/page.tsx`**

Replace the entire file:

```tsx
import { createAdminClient } from '@/lib/supabase/server'
import { monkeyMatchPick, monkeyPikanteriaPick } from '@/lib/monkey'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { PicanteriaBuilder } from '@/components/pikanteria-builder'

async function publishMatchDay(formData: FormData) {
  'use server'
  const supabase = createAdminClient()

  const matchDayId = formData.get('match_day_id') as string
  const date = formData.get('date') as string

  // Update odds for each match (hidden inputs carry match UUIDs)
  for (let i = 1; i <= 8; i++) {
    const matchId = (formData.get(`match_id_${i}`) as string | null)?.trim()
    if (!matchId) break
    await supabase.from('matches').update({
      odds_home: parseFloat(formData.get(`odds_home_${i}`) as string),
      odds_draw: parseFloat(formData.get(`odds_draw_${i}`) as string),
      odds_away: parseFloat(formData.get(`odds_away_${i}`) as string),
    }).eq('id', matchId)
  }

  // Recalculate lock_time from stored kickoff times
  const { data: kickoffRows } = await supabase
    .from('matches')
    .select('kickoff_time')
    .eq('match_day_id', matchDayId)
  if (!kickoffRows?.length) throw new Error('No matches found for match day')
  const earliest = Math.min(
    ...kickoffRows.map((m: { kickoff_time: string }) => new Date(m.kickoff_time).getTime())
  )
  const lockTime = new Date(earliest - 30 * 60 * 1000).toISOString()

  // Publish the match day
  await supabase.from('match_days').update({
    published_at: new Date().toISOString(),
    lock_time: lockTime,
  }).eq('id', matchDayId)

  // Insert pikanteria questions with N options each
  const insertedPika: { id: string; optionIds: string[] }[] = []

  for (let i = 1; i <= 3; i++) {
    const q = (formData.get(`pik_q_${i}`) as string | null)?.trim()
    if (!q) continue

    const count = parseInt(formData.get(`pik_opt_count_${i}`) as string || '0')
    if (count < 2) continue

    const { data: pika } = await supabase
      .from('pikanteria')
      .insert({ question: q, match_day_id: matchDayId })
      .select('id')
      .single()
    if (!pika) continue

    const optionRows = []
    for (let j = 1; j <= count; j++) {
      const label = (formData.get(`pik_opt_label_${i}_${j}`) as string | null)?.trim()
      const odds = parseFloat(formData.get(`pik_opt_odds_${i}_${j}`) as string)
      if (!label || isNaN(odds)) continue
      optionRows.push({ pikanteria_id: pika.id, label, odds, sort_order: j - 1 })
    }

    if (optionRows.length < 2) continue

    const { data: insertedOptions } = await supabase
      .from('pikanteria_options')
      .insert(optionRows)
      .select('id')

    insertedPika.push({ id: pika.id, optionIds: (insertedOptions ?? []).map(o => o.id) })
  }

  // Monkey picks
  const { data: monkey } = await supabase.from('users').select('id').eq('is_monkey', true).single()
  if (monkey) {
    const { data: allMatches } = await supabase
      .from('matches').select('id').eq('match_day_id', matchDayId)
    if (allMatches?.length) {
      await supabase.from('predictions').insert(
        allMatches.map((m: { id: string }) => ({
          user_id: monkey.id, match_id: m.id, pick: monkeyMatchPick(m.id, date),
        }))
      )
    }
    if (insertedPika.length) {
      await supabase.from('pikanteria_answers').insert(
        insertedPika.map(p => ({
          user_id: monkey.id,
          pikanteria_id: p.id,
          option_id: monkeyPikanteriaPick(p.id, date, p.optionIds),
        }))
      )
    }
  }

  revalidatePath('/predict')
  redirect('/admin/results')
}

const inputBase = {
  background: 'var(--color-bg)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--color-text)',
}
const cls = 'rounded-lg px-3 py-2 text-sm w-full outline-none focus:ring-1'

export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const selectedDate = date ?? today

  type DraftMatchDay = { id: string; stage: string; date: string }
  type DraftMatch = {
    id: string; home_team: string; away_team: string
    kickoff_time: string; odds_home: number; odds_draw: number; odds_away: number
  }

  let draft: DraftMatchDay | null = null
  let matches: DraftMatch[] = []

  if (date) {
    const supabase = createAdminClient()
    const { data: matchDay } = await supabase
      .from('match_days')
      .select('id, stage, date')
      .eq('date', date)
      .is('published_at', null)
      .maybeSingle()

    if (matchDay) {
      draft = matchDay as DraftMatchDay
      const { data: matchRows } = await supabase
        .from('matches')
        .select('id, home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away')
        .eq('match_day_id', matchDay.id)
        .order('kickoff_time')
      matches = (matchRows ?? []) as DraftMatch[]
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>📋 Publish Match Day</div>
        <div className="text-muted text-xs">Load a draft day, set odds, and publish</div>
      </div>

      {/* Date picker — GET form loads the draft */}
      <form method="GET" className="rounded-xl p-4 space-y-4"
        style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
          Select Date
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-muted text-xs">Date</label>
            <input type="date" name="date" defaultValue={selectedDate}
              required style={inputBase} className={cls} />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
            Load
          </button>
        </div>
      </form>

      {!date && (
        <div className="text-center py-8 text-muted text-sm">
          Pick a date and click Load to see the scheduled matches
        </div>
      )}

      {date && !draft && (
        <div className="rounded-xl p-4"
          style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-amber)' }}>
            No unpublished draft found for {date}
          </div>
          <div className="text-xs text-muted mt-1">
            The day may already be published, or no fixtures were seeded for this date.
          </div>
        </div>
      )}

      {draft && (
        <form action={publishMatchDay} className="space-y-6">
          <input type="hidden" name="match_day_id" value={draft.id} />
          <input type="hidden" name="date" value={draft.date} />

          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(0,217,126,0.08)', border: '1px solid rgba(0,217,126,0.2)' }}>
            <div className="text-lg">📅</div>
            <div>
              <div className="text-sm font-bold text-text">{draft.date} — {draft.stage}</div>
              <div className="text-xs text-muted">{matches.length} matches loaded from schedule</div>
            </div>
          </div>

          {/* Match cards */}
          {matches.map((match, idx) => {
            const i = idx + 1
            const kickoffLabel = new Date(match.kickoff_time).toLocaleTimeString([], {
              hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
            }) + ' UTC'
            const oddsValue = (k: 'home' | 'draw' | 'away') =>
              k === 'home' ? match.odds_home : k === 'draw' ? match.odds_draw : match.odds_away
            return (
              <div key={match.id} className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <input type="hidden" name={`match_id_${i}`} value={match.id} />
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-text">
                    {match.home_team} vs {match.away_team}
                  </div>
                  <div className="text-xs text-muted">{kickoffLabel}</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['home', 'draw', 'away'] as const).map(k => (
                    <div key={k} className="space-y-1">
                      <label className="text-muted text-xs capitalize">Odds {k}</label>
                      <input
                        type="number" step="0.01" name={`odds_${k}_${i}`}
                        required
                        defaultValue={oddsValue(k).toFixed(2)}
                        style={{ ...inputBase, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}
                        className={cls}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Pikanteria */}
          <div className="font-bold text-xs uppercase tracking-wider mt-2" style={{ color: 'var(--color-amber)' }}>
            🌶️ Pikanteria
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl p-4 space-y-3"
              style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="space-y-1">
                <label className="text-muted text-xs">Question {i}{i > 1 ? ' (optional)' : ''}</label>
                <input type="text" name={`pik_q_${i}`} placeholder="e.g. Will Mbappé score?"
                  style={inputBase} className={cls} />
              </div>
              <PicanteriaBuilder questionIndex={i} />
            </div>
          ))}

          <button type="submit" className="w-full py-3 rounded-xl font-black text-sm"
            style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
            🚀 Publish Match Day
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: No errors in `app/admin/publish/page.tsx`. Errors may still exist in predict, results, and history pages — that's fine, they're fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add app/admin/publish/page.tsx
git commit -m "feat: update publish page to use n-option PicanteriaBuilder"
```

---

## Task 6: Update PicanteriaCard + Predict Page

**Files:**
- Modify: `components/pikanteria-card.tsx`
- Modify: `app/predict/page.tsx`

- [ ] **Step 1: Rewrite `components/pikanteria-card.tsx`**

```tsx
'use client'
import { useState, useTransition } from 'react'
import type { Pikanteria, PicanteriaOption } from '@/lib/types'

interface Props {
  item: Pikanteria & { options: PicanteriaOption[] }
  currentAnswer: string | null   // option_id of the player's current pick, or null
  isLocked: boolean
  onSave: (picanteriaId: string, optionId: string) => Promise<void>
}

export function PicanteriaCard({ item, currentAnswer, isLocked, onSave }: Props) {
  const [selected, setSelected] = useState<string | null>(currentAnswer)
  const [pending, startTransition] = useTransition()

  function handleSelect(optionId: string) {
    if (isLocked) return
    setSelected(optionId)
    startTransition(() => onSave(item.id, optionId))
  }

  return (
    <div className="rounded-xl p-4"
      style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[13px] font-semibold text-text mb-3">{item.question}</p>
      <div className="flex gap-1.5 flex-wrap">
        {item.options.map(opt => {
          const sel = selected === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              disabled={isLocked || pending}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 font-bold text-[12px] transition-all min-w-[72px]"
              style={{
                background: sel ? 'var(--color-amber)' : 'var(--color-elev)',
                color: sel ? '#000' : 'var(--color-text)',
                border: sel ? 'none' : '1px solid rgba(255,255,255,0.06)',
                opacity: isLocked ? 0.5 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
              }}
            >
              <span>{opt.label}</span>
              <span className="opacity-70 font-semibold text-[11px]"
                style={{ fontFamily: 'var(--font-mono)' }}>
                {opt.odds.toFixed(2)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `app/predict/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { MatchCard } from '@/components/match-card'
import { PicanteriaCard } from '@/components/pikanteria-card'
import { LockTimer } from '@/components/lock-timer'
import { BottomNav } from '@/components/bottom-nav'
import type { Match, Pikanteria, PicanteriaOption, Pick } from '@/lib/types'

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage ×1', r16: 'Round of 16 ×1.5', qf: 'Quarter Finals ×1.5',
  sf: 'Semi Finals ×2', '3rd': 'Third Place ×1.5', final: 'Final ×3',
}

export default async function PredictPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const today = new Date().toISOString().slice(0, 10)
  const { data: matchDay } = await supabase
    .from('match_days')
    .select('*, matches(*), pikanteria(*, pikanteria_options(*))')
    .eq('date', today)
    .not('published_at', 'is', null)
    .single()

  const [{ data: existingPredictions }, { data: existingAnswers }] = await Promise.all([
    supabase.from('predictions').select('match_id, pick').eq('user_id', user!.id),
    supabase.from('pikanteria_answers').select('pikanteria_id, option_id').eq('user_id', user!.id),
  ])

  const predictionMap = Object.fromEntries(
    (existingPredictions ?? []).map(p => [p.match_id, p.pick as Pick])
  )
  const answerMap = Object.fromEntries(
    (existingAnswers ?? []).map(a => [a.pikanteria_id, a.option_id as string])
  )

  const isLocked = matchDay ? new Date() >= new Date(matchDay.lock_time) : false

  async function savePick(matchId: string, pick: Pick) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('predictions').upsert(
      { user_id: user!.id, match_id: matchId, pick },
      { onConflict: 'user_id,match_id' }
    )
    revalidatePath('/predict')
  }

  async function saveAnswer(picanteriaId: string, optionId: string) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('pikanteria_answers').upsert(
      { user_id: user!.id, pikanteria_id: picanteriaId, option_id: optionId },
      { onConflict: 'user_id,pikanteria_id' }
    )
    revalidatePath('/predict')
  }

  const stageLabel = matchDay ? (STAGE_LABELS[matchDay.stage] ?? matchDay.stage) : ''

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
            {stageLabel}
          </div>
          <div className="text-[22px] font-extrabold text-text tracking-tight leading-tight">Today's picks</div>
        </div>
        {matchDay && !isLocked && (
          <div className="flex flex-col items-end rounded-[10px] px-2.5 py-1.5"
            style={{ background: 'rgba(245,166,35,0.13)', border: '1px solid rgba(245,166,35,0.3)' }}>
            <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-amber)' }}>Locks</div>
            <div className="text-[13px] font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-amber)' }}>
              <LockTimer lockTime={matchDay.lock_time} />
            </div>
          </div>
        )}
      </div>

      <main className="px-4 pb-28 space-y-3 mt-2">
        {!matchDay && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-text font-semibold">No matches today</div>
            <div className="text-muted text-sm mt-1">The admin hasn't published today's form yet</div>
          </div>
        )}

        {matchDay && (
          <>
            {isLocked && (
              <div className="rounded-xl px-4 py-3"
                style={{ background: 'rgba(239,79,91,0.08)', border: '1px solid rgba(239,79,91,0.25)' }}>
                <span className="text-[12px] font-bold" style={{ color: 'var(--color-danger)' }}>
                  🔒 Picks are locked for today
                </span>
              </div>
            )}

            {!isLocked && <LockTimer lockTime={matchDay.lock_time} />}

            {/* Matches */}
            <div className="text-[10px] font-bold uppercase tracking-[1.2px] pt-2"
              style={{ color: 'var(--color-muted)' }}>
              Matches · Multiplier {stageLabel.split('×')[1] ? `×${stageLabel.split('×')[1]}` : ''}
            </div>

            {(matchDay.matches as Match[]).map(match => (
              <MatchCard
                key={match.id}
                match={match}
                currentPick={predictionMap[match.id] ?? null}
                isLocked={isLocked}
                stageLabel={stageLabel}
                onSave={savePick}
              />
            ))}

            {/* Pikanteria */}
            {(matchDay.pikanteria as (Pikanteria & { pikanteria_options: PicanteriaOption[] })[]).length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-4">
                  <span className="text-lg">🌶️</span>
                  <span className="text-[10px] font-bold uppercase tracking-[1.2px]"
                    style={{ color: 'var(--color-amber)' }}>
                    Pikanteria · {(matchDay.pikanteria as any[]).length} side bets
                  </span>
                </div>
                {(matchDay.pikanteria as (Pikanteria & { pikanteria_options: PicanteriaOption[] })[]).map(item => (
                  <PicanteriaCard
                    key={item.id}
                    item={{ ...item, options: [...(item.pikanteria_options ?? [])].sort((a, b) => a.sort_order - b.sort_order) }}
                    currentAnswer={answerMap[item.id] ?? null}
                    isLocked={isLocked}
                    onSave={saveAnswer}
                  />
                ))}
              </>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: No errors in pikanteria-card.tsx or predict/page.tsx. Errors may remain in results and history pages.

- [ ] **Step 4: Commit**

```bash
git add components/pikanteria-card.tsx app/predict/page.tsx
git commit -m "feat: update PicanteriaCard and predict page for n-option answers"
```

---

## Task 7: Update Admin Results Page

**Files:**
- Modify: `app/admin/results/page.tsx`

- [ ] **Step 1: Rewrite `app/admin/results/page.tsx`**

The key changes from the existing file:
1. Select `pikanteria(id, question, pikanteria_options(id, label, odds, is_correct, sort_order))` instead of `pikanteria(id, odds_yes, odds_no)`
2. Radio input value becomes `option.id` (not `'true'`/`'false'`)
3. `enterResults` server action: set `is_correct = true` on winning option, score answers by `option_id` match

```tsx
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { calcMatchPoints, calcPicanteriaPoints } from '@/lib/scoring'
import { snapshotMatchDay } from '@/lib/score-validation'
import type { Stage, Pick } from '@/lib/types'

async function enterResults(formData: FormData) {
  'use server'
  const supabase = await createServiceClient()

  const matchDayId = formData.get('match_day_id') as string
  const { data: matchDay } = await supabase
    .from('match_days')
    .select('stage')
    .eq('id', matchDayId)
    .single()

  const stage = matchDay!.stage as Stage

  const { data: matches } = await supabase
    .from('matches')
    .select('id, odds_home, odds_draw, odds_away')
    .eq('match_day_id', matchDayId)

  for (const match of matches ?? []) {
    const result = formData.get(`result_${match.id}`) as Pick | null
    if (!result) continue

    await supabase.from('matches').update({ result }).eq('id', match.id)

    const { data: predictions } = await supabase
      .from('predictions')
      .select('id, pick')
      .eq('match_id', match.id)

    const oddsForResult = result === '1' ? match.odds_home
      : result === 'X' ? match.odds_draw
      : match.odds_away

    for (const pred of predictions ?? []) {
      const points = calcMatchPoints(oddsForResult, stage, pred.pick === result)
      await supabase.from('predictions').update({ points }).eq('id', pred.id)
    }
  }

  // Score pikanteria using n-option structure
  const { data: pikaItems } = await supabase
    .from('pikanteria')
    .select('id, pikanteria_options(id, odds)')
    .eq('match_day_id', matchDayId)

  for (const pika of pikaItems ?? []) {
    const winningOptionId = formData.get(`pik_${pika.id}`) as string | null
    if (!winningOptionId) continue

    await supabase.from('pikanteria_options')
      .update({ is_correct: true })
      .eq('id', winningOptionId)

    const winningOption = (pika.pikanteria_options as { id: string; odds: number }[])
      .find(o => o.id === winningOptionId)
    if (!winningOption) continue

    const { data: answers } = await supabase
      .from('pikanteria_answers')
      .select('id, option_id')
      .eq('pikanteria_id', pika.id)

    for (const ans of answers ?? []) {
      const points = calcPicanteriaPoints(winningOption.odds, ans.option_id === winningOptionId)
      await supabase.from('pikanteria_answers').update({ points }).eq('id', ans.id)
    }
  }

  await snapshotMatchDay(supabase, matchDayId)

  revalidatePath('/')
  revalidatePath('/leaderboard')
  revalidatePath('/admin/scores')
  redirect('/admin')
}

const inputStyle = {
  background: 'var(--color-bg)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--color-text)',
}

export default async function ResultsPage() {
  const supabase = await createClient()

  const { data: matchDays } = await supabase
    .from('match_days')
    .select('*, matches(*), pikanteria(*, pikanteria_options(*))')
    .not('published_at', 'is', null)
    .order('date', { ascending: false })
    .limit(5)

  const matchDay = (matchDays ?? []).find((d: any) =>
    d.matches.some((m: any) => m.result === null)
  ) ?? matchDays?.[0]

  if (!matchDay) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">✅</div>
        <div className="text-text font-semibold">All match days scored</div>
        <div className="text-muted text-sm mt-1">No pending results to enter</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>
          ✅ Enter Results
        </div>
        <div className="text-muted text-xs">{matchDay.date} · {matchDay.stage}</div>
      </div>

      {(() => {
        const total = (matchDay.matches as any[]).length
        const done = (matchDay.matches as any[]).filter((m: any) => m.result !== null).length
        return (
          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)' }}>
            <div className="text-lg">⏳</div>
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--color-amber)' }}>
                {done} of {total} matches scored
              </div>
              <div className="text-xs text-muted">Submit to update leaderboard</div>
            </div>
          </div>
        )
      })()}

      <form action={enterResults} className="space-y-4">
        <input type="hidden" name="match_day_id" value={matchDay.id} />

        {/* Matches */}
        {(matchDay.matches as any[]).map((match: any) => (
          <div key={match.id} className="rounded-xl p-4 space-y-3"
            style={{
              background: 'var(--color-panel)',
              border: `1px solid ${match.result ? 'rgba(0,217,126,0.3)' : 'rgba(255,255,255,0.06)'}`,
            }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-text">
                {match.home_team} vs {match.away_team}
              </span>
              {match.result && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent-line)' }}>
                  ✓ {match.result} scored
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {[
                { value: '1', label: `1 — ${match.home_team}` },
                { value: 'X', label: 'X — Draw' },
                { value: '2', label: `2 — ${match.away_team}` },
              ].map(({ value, label }) => (
                <label key={value}
                  className="flex-1 flex items-center gap-1.5 rounded-lg p-2 cursor-pointer"
                  style={inputStyle}>
                  <input
                    type="radio"
                    name={`result_${match.id}`}
                    value={value}
                    defaultChecked={match.result === value}
                  />
                  <span className="text-xs text-text font-medium">{label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Pikanteria */}
        {(matchDay.pikanteria as any[]).length > 0 && (
          <>
            <div className="font-bold text-xs uppercase tracking-wider mt-2" style={{ color: 'var(--color-amber)' }}>
              🌶️ Pikanteria Results
            </div>
            {(matchDay.pikanteria as any[]).map((pika: any) => {
              const options = [...(pika.pikanteria_options ?? [])].sort(
                (a: any, b: any) => a.sort_order - b.sort_order
              )
              const correctOption = options.find((o: any) => o.is_correct)
              return (
                <div key={pika.id} className="rounded-xl p-4 space-y-3"
                  style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-sm font-semibold text-text">{pika.question}</p>
                  <div className="flex gap-2 flex-wrap">
                    {options.map((opt: any) => (
                      <label key={opt.id}
                        className="flex-1 flex items-center gap-1.5 rounded-lg p-2 cursor-pointer min-w-[80px]"
                        style={inputStyle}>
                        <input
                          type="radio"
                          name={`pik_${pika.id}`}
                          value={opt.id}
                          defaultChecked={correctOption?.id === opt.id}
                        />
                        <span className="text-xs text-text font-medium">{opt.label}</span>
                        <span className="text-[10px] text-muted" style={{ fontFamily: 'var(--font-mono)' }}>
                          {opt.odds.toFixed(2)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        )}

        <button type="submit"
          className="w-full py-3 rounded-xl font-black text-sm"
          style={{ background: 'var(--color-accent)', color: '#000' }}>
          ⚡ Submit Results & Score All
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: No errors in results/page.tsx. Only history/page.tsx may still have errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/results/page.tsx
git commit -m "feat: update results page for n-option pikanteria scoring"
```

---

## Task 8: Update History Page

**Files:**
- Modify: `app/history/page.tsx`

- [ ] **Step 1: Update the pikanteria query and render in `app/history/page.tsx`**

Three changes:
1. Query: `pikanteria(id, question, pikanteria_options(id, label, is_correct), pikanteria_answers(option_id, points, user_id))`
2. Win/loss check: compare `myAnswer.option_id` to the correct option's id
3. Display: show the chosen option's label instead of "Yes"/"No"

Replace the entire file:

```tsx
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/bottom-nav'

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage', r16: 'Round of 16', qf: 'Quarter Finals',
  sf: 'Semi Finals', '3rd': 'Third Place', final: 'Final',
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: matchDays } = await supabase
    .from('match_days')
    .select(`
      id, date, stage,
      matches(id, home_team, away_team, result,
        predictions(pick, points, user_id)
      ),
      pikanteria(id, question,
        pikanteria_options(id, label, is_correct),
        pikanteria_answers(option_id, points, user_id)
      )
    `)
    .not('published_at', 'is', null)
    .order('date', { ascending: false })

  const allPicks: ('W' | 'L' | null)[] = []
  for (const day of (matchDays ?? []).slice(0, 10)) {
    for (const m of (day as any).matches) {
      const pred = m.predictions.find((p: any) => p.user_id === user!.id)
      if (pred && m.result !== null) {
        allPicks.push(pred.pick === m.result ? 'W' : 'L')
      }
    }
  }
  const streak = allPicks.slice(-15)
  const wins = streak.filter(s => s === 'W').length

  return (
    <div className="min-h-screen bg-bg">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
            Your bets so far
          </div>
          <div className="text-[22px] font-extrabold text-text tracking-tight">History</div>
        </div>
      </div>

      <main className="px-4 pb-28 space-y-4">
        {streak.length > 0 && (
          <div className="rounded-[14px] p-4" style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-muted">
                Last {streak.length} picks
              </span>
              <span className="text-[11px] font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-sub)' }}>
                {wins}W · {streak.length - wins}L · {streak.length > 0 ? Math.round(wins / streak.length * 100) : 0}%
              </span>
            </div>
            <div className="flex gap-1">
              {streak.map((s, i) => (
                <div key={i}
                  className="flex-1 h-7 rounded flex items-center justify-center text-[10px] font-extrabold"
                  style={{
                    background: s === 'W' ? 'rgba(0,217,126,0.14)' : 'rgba(239,79,91,0.13)',
                    border: `1px solid ${s === 'W' ? 'rgba(0,217,126,0.32)' : 'rgba(239,79,91,0.3)'}`,
                    color: s === 'W' ? 'var(--color-accent)' : 'var(--color-danger)',
                  }}
                >{s}</div>
              ))}
            </div>
          </div>
        )}

        <div className="text-[10px] font-bold uppercase tracking-[1.2px] px-0.5 text-muted">By day</div>
        {(matchDays ?? []).length === 0 && (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-text font-semibold">No history yet</div>
          </div>
        )}

        {(matchDays ?? []).map((day: any) => {
          const myMatchPreds = day.matches.map((m: any) => ({
            ...m,
            myPick: m.predictions.find((p: any) => p.user_id === user!.id),
          }))
          const myPikaAnswers = day.pikanteria.map((p: any) => {
            const myAnswer = p.pikanteria_answers.find((a: any) => a.user_id === user!.id)
            const myOption = myAnswer
              ? (p.pikanteria_options as any[]).find((o: any) => o.id === myAnswer.option_id)
              : null
            const correctOption = (p.pikanteria_options as any[]).find((o: any) => o.is_correct) ?? null
            return { ...p, myAnswer, myOption, correctOption }
          })
          const dayPoints = [
            ...myMatchPreds.map((m: any) => m.myPick?.points ?? 0),
            ...myPikaAnswers.map((p: any) => p.myAnswer?.points ?? 0),
          ].reduce((a: number, b: number) => a + b, 0)

          return (
            <div key={day.id} className="rounded-[14px] overflow-hidden"
              style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <div className="font-bold text-[13px] text-text">{day.date}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted mt-0.5">
                    {STAGE_LABELS[day.stage] ?? day.stage}
                  </div>
                </div>
                <div className="font-bold text-[18px]"
                  style={{ fontFamily: 'var(--font-mono)', color: dayPoints > 0 ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                  +{dayPoints.toFixed(1)}
                </div>
              </div>
              <div className="px-4 py-2 space-y-1.5">
                {myMatchPreds.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2 py-1.5"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-base">{/* flag */}</span>
                    <span className="text-[12px] text-sub flex-1">{m.home_team} vs {m.away_team}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded"
                        style={{ background: 'var(--color-elev)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text)' }}>
                        {m.myPick?.pick ?? '—'}
                      </span>
                      <span className="text-[11px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
                        {m.myPick ? (m.result !== null
                          ? m.myPick.pick === m.result
                            ? `+${(m.myPick.points ?? 0).toFixed(2)}`
                            : `✗ (${m.result})`
                          : 'pending'
                        ) : '—'}
                      </span>
                      {m.result !== null && m.myPick && (
                        <span className="text-[10px] font-extrabold w-4 text-center"
                          style={{ color: m.myPick.pick === m.result ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                          {m.myPick.pick === m.result ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {myPikaAnswers.filter((p: any) => p.myAnswer).map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2 py-1.5"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[11px] flex-1" style={{ color: 'var(--color-amber)' }}>
                      🌶️ {p.question}
                    </span>
                    <span className="text-[11px] text-text">{p.myOption?.label ?? '?'}</span>
                    {p.correctOption && (
                      <span className="text-[10px] font-extrabold w-4 text-center"
                        style={{ color: p.myAnswer.option_id === p.correctOption.id ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                        {p.myAnswer.option_id === p.correctOption.id ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </main>

      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 2: Verify full clean build**

```bash
npm run build
```

Expected: ✅ Build completes with zero TypeScript errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: All 13 tests pass. (`calcPicanteriaPoints` signature is unchanged so tests need no edits.)

- [ ] **Step 4: Commit**

```bash
git add app/history/page.tsx
git commit -m "feat: update history page for n-option pikanteria display"
```
