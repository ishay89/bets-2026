import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { snapshotMatchDay, recalculateAllSnapshots } from './score-validation'

// ---------------------------------------------------------------------------
// Minimal in-memory fake of the subset of the Supabase JS / PostgREST query
// builder used by lib/score-validation.ts. It supports just enough chaining
// (.select/.eq/.not/.is/.or/.in/.order/.maybeSingle/.single, plus
// .update/.insert/.upsert) for snapshotMatchDay, upsertPreTournamentSnapshot
// and recalculateAllSnapshots to run against an in-memory data set.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

interface Db {
  users: Row[]
  match_days: Row[]
  predictions: Row[]
  pikanteria_answers: Row[]
  pre_tournament_picks: Row[]
  score_snapshots: Row[]
}

function getPath(row: Row, path: string): unknown {
  // Only the leaf column name matters for our fake joins — the embedded
  // resource (e.g. "matches.match_day_id") was flattened onto the row at
  // fixture-creation time as `match_day_id`.
  const leaf = path.includes('.') ? path.split('.').pop()! : path
  return row[leaf]
}

class FakeQuery implements PromiseLike<{ data: Row[] | Row | null; error: null; count?: number }> {
  private rows: Row[]
  private singleMode: 'single' | 'maybeSingle' | null = null
  private countMode: 'exact' | null = null
  private headOnly = false

  constructor(private db: Db, private table: keyof Db, rows?: Row[]) {
    this.rows = rows ?? [...db[this.table]]
  }

  select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }): this {
    if (opts?.count) this.countMode = opts.count
    if (opts?.head) this.headOnly = true
    return this
  }

  eq(col: string, value: unknown): this {
    this.rows = this.rows.filter(r => getPath(r, col) === value)
    return this
  }

  in(col: string, values: unknown[]): this {
    this.rows = this.rows.filter(r => values.includes(getPath(r, col)))
    return this
  }

  not(col: string, _op: string, value: unknown): this {
    if (value === null) {
      this.rows = this.rows.filter(r => getPath(r, col) !== null && getPath(r, col) !== undefined)
    }
    return this
  }

  is(col: string, value: unknown): this {
    if (value === null) {
      this.rows = this.rows.filter(r => getPath(r, col) === null || getPath(r, col) === undefined)
    }
    return this
  }

  // Supports the two .or() shapes used in score-validation.ts:
  //   `match_day_id.neq.${id},match_day_id.is.null`
  or(expr: string): this {
    const clauses = expr.split(',')
    this.rows = this.rows.filter(row =>
      clauses.some(clause => {
        const [col, op, ...rest] = clause.split('.')
        const val = rest.join('.')
        const actual = getPath(row, col)
        if (op === 'neq') return actual !== val
        if (op === 'is' && val === 'null') return actual === null || actual === undefined
        return false
      })
    )
    return this
  }

  order(): this {
    return this
  }

  maybeSingle(): this {
    this.singleMode = 'maybeSingle'
    return this
  }

  single(): this {
    this.singleMode = 'single'
    return this
  }

  then<TResult1 = { data: Row[] | Row | null; error: null; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | Row | null; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let result: { data: Row[] | Row | null; error: null; count?: number }
    if (this.headOnly && this.countMode) {
      result = { data: null, error: null, count: this.rows.length }
    } else if (this.singleMode === 'single') {
      result = { data: this.rows[0] ?? null, error: null }
    } else if (this.singleMode === 'maybeSingle') {
      result = { data: this.rows[0] ?? null, error: null }
    } else {
      result = { data: this.rows, error: null }
    }
    return Promise.resolve(result).then(onfulfilled, onrejected)
  }
}

class FakeMutation implements PromiseLike<{ data: null; error: null }> {
  private rows: Row[]
  private filters: ((row: Row) => boolean)[] = []

  constructor(private db: Db, private table: keyof Db, private kind: 'update' | 'insert' | 'upsert', private payload: Row | Row[]) {
    this.rows = db[this.table]
  }

  eq(col: string, value: unknown): this {
    this.filters.push(row => getPath(row, col) === value)
    return this
  }

  is(col: string, value: unknown): this {
    if (value === null) {
      this.filters.push(row => getPath(row, col) === null || getPath(row, col) === undefined)
    }
    return this
  }

  private apply(): void {
    if (this.kind === 'update') {
      const payload = this.payload as Row
      for (const row of this.rows) {
        if (this.filters.every(f => f(row))) {
          Object.assign(row, payload)
        }
      }
    } else if (this.kind === 'insert') {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload]
      for (const p of payloads) {
        this.rows.push({ id: `generated-${this.rows.length}-${Math.random().toString(36).slice(2)}`, ...p })
      }
    } else if (this.kind === 'upsert') {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload]
      for (const p of payloads) {
        const id = (p as Row).id
        const existing = this.rows.find(r => r.id === id)
        if (existing) {
          Object.assign(existing, p)
        } else {
          this.rows.push({ ...p })
        }
      }
    }
  }

  then<TResult1 = { data: null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.apply()
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected)
  }
}

function createFakeSupabase(db: Db): SupabaseClient {
  const client = {
    from(table: keyof Db) {
      return {
        select: (cols?: string, opts?: { count?: 'exact'; head?: boolean }) => new FakeQuery(db, table).select(cols, opts),
        update: (payload: Row) => new FakeMutation(db, table, 'update', payload),
        insert: (payload: Row | Row[]) => new FakeMutation(db, table, 'insert', payload),
        upsert: (payload: Row | Row[]) => new FakeMutation(db, table, 'upsert', payload),
      }
    },
  }
  return client as unknown as SupabaseClient
}

// ---------------------------------------------------------------------------
// Scenario fixture: one user ("u1") who already has a *valid* pre-tournament
// snapshot row (created after scoreTournamentEnd ran), plus a single scored
// match day ("day-1"). The match day is then *re-scored* (its points are
// corrected upward), mirroring an admin correction made via /admin/results.
// ---------------------------------------------------------------------------

function buildScenario(): Db {
  return {
    users: [{ id: 'u1' }],
    match_days: [{ id: 'day-1', stage: 'group' }],
    predictions: [
      // Single prediction for day-1, already scored at 3 points.
      { id: 'pred-1', user_id: 'u1', points: 3, match_day_id: 'day-1' },
    ],
    pikanteria_answers: [],
    pre_tournament_picks: [
      { user_id: 'u1', winner_points: 10, top_scorer_points: 5 },
    ],
    score_snapshots: [
      // Pre-tournament snapshot row, computed back when day-1's day_points
      // were 3: cumulative = 3 (match) + 10 + 5 = 18, otherDaysSum (day-1's
      // day_points = 3) + dayPoints (15) = 18 → valid.
      {
        id: 'snap-pre',
        user_id: 'u1',
        match_day_id: null,
        stage: null,
        match_points: 0,
        pikanteria_points: 0,
        pre_tournament_winner_pts: 10,
        pre_tournament_scorer_pts: 5,
        day_points: 15,
        cumulative_points: 18,
        is_valid: true,
        discrepancy: null,
        calculated_at: '2026-06-01T00:00:00.000Z',
      },
      // Existing day-1 snapshot row (about to become stale once day-1 is
      // re-scored at 7 points instead of 3).
      {
        id: 'snap-day1',
        user_id: 'u1',
        match_day_id: 'day-1',
        stage: 'group',
        match_points: 3,
        pikanteria_points: 0,
        pre_tournament_winner_pts: 0,
        pre_tournament_scorer_pts: 0,
        day_points: 3,
        cumulative_points: 18,
        is_valid: true,
        discrepancy: null,
        calculated_at: '2026-06-01T00:00:00.000Z',
      },
    ],
  }
}

describe('snapshotMatchDay vs recalculateAllSnapshots after a match-day correction', () => {
  it('refreshes the pre-tournament snapshot row so cumulative_points/is_valid stay correct (regression)', async () => {
    const db = buildScenario()

    // Admin corrects day-1's prediction from 3 -> 7 points (e.g. a result fix).
    db.predictions[0].points = 7

    const supabase = createFakeSupabase(db)
    await snapshotMatchDay(supabase, 'day-1')

    const day1Snap = db.score_snapshots.find(s => s.match_day_id === 'day-1')!
    const preSnap = db.score_snapshots.find(s => s.match_day_id === null)!

    // The match-day row itself is recomputed correctly.
    expect(day1Snap.day_points).toBe(7)
    expect(day1Snap.cumulative_points).toBe(22) // 7 + 10 + 5
    expect(day1Snap.is_valid).toBe(true)

    // The pre-tournament row must also be refreshed: true cumulative is now
    // 22 (7 + 10 + 5), not the stale 18 computed before the correction.
    expect(preSnap.cumulative_points).toBe(22)
    expect(preSnap.is_valid).toBe(true)
    expect(preSnap.discrepancy).toBeNull()
  })

  it('produces the same snapshot rows as a full recalculateAllSnapshots rebuild', async () => {
    // snapshotMatchDay path
    const dbAuto = buildScenario()
    dbAuto.predictions[0].points = 7
    await snapshotMatchDay(createFakeSupabase(dbAuto), 'day-1')

    // recalculateAllSnapshots path, starting from the same corrected raw data
    // but with score_snapshots wiped (full rebuild from scratch).
    const dbManual = buildScenario()
    dbManual.predictions[0].points = 7
    dbManual.score_snapshots = []
    // recalculateAllSnapshots only considers published match days.
    dbManual.match_days[0].published_at = '2026-06-01T00:00:00.000Z'
    dbManual.match_days[0].matches = [{ result: '1' }]
    dbManual.match_days[0].pikanteria = []
    await recalculateAllSnapshots(createFakeSupabase(dbManual))

    const autoPre = dbAuto.score_snapshots.find(s => s.match_day_id === null)!
    const manualPre = dbManual.score_snapshots.find(s => s.match_day_id === null)!
    const autoDay1 = dbAuto.score_snapshots.find(s => s.match_day_id === 'day-1')!
    const manualDay1 = dbManual.score_snapshots.find(s => s.match_day_id === 'day-1')!

    expect(autoPre.cumulative_points).toBe(manualPre.cumulative_points)
    expect(autoPre.is_valid).toBe(manualPre.is_valid)
    expect(autoPre.day_points).toBe(manualPre.day_points)

    expect(autoDay1.cumulative_points).toBe(manualDay1.cumulative_points)
    expect(autoDay1.is_valid).toBe(manualDay1.is_valid)
    expect(autoDay1.day_points).toBe(manualDay1.day_points)
  })
})
