import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { snapshotMatchDay, recalculateAllSnapshots, buildPreTournamentSnapshotPayloads } from './score-validation'

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

// PostgREST caps un-paged responses at max_rows (1000 in supabase/config.toml).
// The fake enforces the same cap so tests catch reads that skip fetchAllRows.
const POSTGREST_MAX_ROWS = 1000

class FakeQuery implements PromiseLike<{ data: Row[] | Row | null; error: null; count?: number }> {
  private rows: Row[]
  private singleMode: 'single' | 'maybeSingle' | null = null
  private countMode: 'exact' | null = null
  private headOnly = false
  private rangeApplied = false

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

  range(from: number, to: number): this {
    this.rangeApplied = true
    this.rows = this.rows.slice(from, to + 1)
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
      const capped = this.rangeApplied ? this.rows : this.rows.slice(0, POSTGREST_MAX_ROWS)
      result = { data: capped, error: null }
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

describe('snapshotMatchDay with more than 1000 existing snapshot rows', () => {
  // Regression for the 2026-07-05 production incident: once score_snapshots
  // crossed PostgREST's 1000-row cap, the un-paged existingSnapshots read in
  // snapshotMatchDay missed the current day's rows (they were the newest, past
  // the cap), classified every user as "insert" instead of "update", and the
  // whole batch aborted on the (user_id, match_day_id) unique index — leaving
  // today_points stale for all users after a pikanteria was scored.
  it('updates the existing day row in place instead of inserting a duplicate', async () => {
    const filler: Row[] = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({
      id: `snap-filler-${i}`,
      user_id: `filler-user-${i}`,
      match_day_id: 'old-day',
      stage: 'group',
      match_points: 0,
      pikanteria_points: 0,
      pre_tournament_winner_pts: 0,
      pre_tournament_scorer_pts: 0,
      day_points: 0,
      cumulative_points: 0,
      is_valid: true,
      discrepancy: null,
      calculated_at: '2026-06-01T00:00:00.000Z',
    }))

    const db: Db = {
      users: [{ id: 'u1' }],
      match_days: [{ id: 'day-1', stage: 'r16' }],
      predictions: [
        { id: 'pred-1', user_id: 'u1', points: 3, match_day_id: 'day-1' },
      ],
      // Scored after the day row below was written — the refresh under test
      // must fold these 2.75 points into the existing row.
      pikanteria_answers: [
        { id: 'ans-1', user_id: 'u1', points: 2.75, match_day_id: 'day-1' },
      ],
      pre_tournament_picks: [],
      score_snapshots: [
        ...filler,
        // The current day's row sits past the 1000-row cap (newest rows last).
        {
          id: 'snap-day1',
          user_id: 'u1',
          match_day_id: 'day-1',
          stage: 'r16',
          match_points: 3,
          pikanteria_points: 0,
          pre_tournament_winner_pts: 0,
          pre_tournament_scorer_pts: 0,
          day_points: 3,
          cumulative_points: 3,
          is_valid: true,
          discrepancy: null,
          calculated_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    }

    await snapshotMatchDay(createFakeSupabase(db), 'day-1')

    const dayRows = db.score_snapshots.filter(s => s.user_id === 'u1' && s.match_day_id === 'day-1')
    expect(dayRows).toHaveLength(1)
    expect(dayRows[0].day_points).toBe(5.75)
    expect(dayRows[0].pikanteria_points).toBe(2.75)
    expect(dayRows[0].is_valid).toBe(true)
  })
})

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

describe('buildPreTournamentSnapshotPayloads (batched pre-tournament refresh)', () => {
  it('updates users with an existing NULL row and inserts users without one, in one pass', () => {
    const { toInsert, toUpdate } = buildPreTournamentSnapshotPayloads({
      preTournRows: [
        { user_id: 'u1', winner_points: 10, top_scorer_points: 5 },
        { user_id: 'u2', winner_points: 0, top_scorer_points: 0 },
        { user_id: 'u3', winner_points: 4, top_scorer_points: null }, // null scorer -> 0
      ],
      // Cumulative raw points per user (all scored predictions / answers).
      allPredRows: [
        { user_id: 'u1', points: 3 },
        { user_id: 'u1', points: 7 },
        { user_id: 'u2', points: 2 },
      ],
      allPikaRows: [
        { user_id: 'u1', points: 2.75 },
        { user_id: 'u3', points: 1 },
      ],
      // Post-write snapshot state: match-day rows feed otherDaysSum; the NULL row
      // (when present) is the one to update in place.
      snapshots: [
        { id: 'n1', user_id: 'u1', match_day_id: null, day_points: 15 },
        { id: 'd1', user_id: 'u1', match_day_id: 'day-1', day_points: 5.75 },
        { id: 'd2', user_id: 'u1', match_day_id: 'day-2', day_points: 7 },
        { id: 'd3', user_id: 'u2', match_day_id: 'day-1', day_points: 2 }, // u2 has no NULL row -> insert
        { id: 'n3', user_id: 'u3', match_day_id: null, day_points: 99 },
        { id: 'd4', user_id: 'u3', match_day_id: 'day-1', day_points: 1 },
      ],
      now: '2026-07-10T00:00:00.000Z',
    })

    // u1 + u3 have NULL rows -> update; u2 has none -> insert.
    expect(toUpdate.map(r => r.id).sort()).toEqual(['n1', 'n3'])
    expect(toInsert).toHaveLength(1)

    const u1 = toUpdate.find(r => r.user_id === 'u1')!
    // cumulative = 3+7 (pred) + 2.75 (pika) + 10 + 5 = 27.75; otherDaysSum = 5.75+7 = 12.75; +day 15 = 27.75 -> valid
    expect(u1.cumulative_points).toBe(27.75)
    expect(u1.day_points).toBe(15)
    expect(u1.pre_tournament_winner_pts).toBe(10)
    expect(u1.pre_tournament_scorer_pts).toBe(5)
    expect(u1.match_day_id).toBeNull()
    expect(u1.is_valid).toBe(true)
    expect(u1.discrepancy).toBeNull()

    const u3 = toUpdate.find(r => r.user_id === 'u3')!
    // null scorer coerces to 0; cumulative = 1 (pika) + 4 + 0 = 5; otherDaysSum 1 + day 4 = 5 -> valid
    expect(u3.cumulative_points).toBe(5)
    expect(u3.day_points).toBe(4)
    expect(u3.pre_tournament_scorer_pts).toBe(0)
    expect(u3.is_valid).toBe(true)

    const u2 = toInsert[0]
    expect(u2.user_id).toBe('u2')
    expect(u2).not.toHaveProperty('id')
    // cumulative = 2 (pred) + 0 = 2; otherDaysSum 2 + day 0 = 2 -> valid
    expect(u2.cumulative_points).toBe(2)
    expect(u2.day_points).toBe(0)
    expect(u2.is_valid).toBe(true)
  })
})

describe('snapshotMatchDay refreshes pre-tournament rows for every user (batched)', () => {
  it('updates one user\'s NULL row and inserts a NULL row for a user who lacked one', async () => {
    const db: Db = {
      users: [{ id: 'u1' }, { id: 'u2' }],
      match_days: [{ id: 'day-1', stage: 'group' }],
      predictions: [
        { id: 'p1', user_id: 'u1', points: 7, match_day_id: 'day-1' },
        { id: 'p2', user_id: 'u2', points: 3, match_day_id: 'day-1' },
      ],
      pikanteria_answers: [],
      pre_tournament_picks: [
        { user_id: 'u1', winner_points: 10, top_scorer_points: 5 },
        { user_id: 'u2', winner_points: 0, top_scorer_points: 0 }, // has picks but no NULL snapshot yet
      ],
      score_snapshots: [
        // u1 already has a (stale) pre-tournament row + day row.
        {
          id: 'snap-pre-u1', user_id: 'u1', match_day_id: null, stage: null,
          match_points: 0, pikanteria_points: 0, pre_tournament_winner_pts: 10,
          pre_tournament_scorer_pts: 5, day_points: 15, cumulative_points: 18,
          is_valid: true, discrepancy: null, calculated_at: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 'snap-d1-u1', user_id: 'u1', match_day_id: 'day-1', stage: 'group',
          match_points: 3, pikanteria_points: 0, pre_tournament_winner_pts: 0,
          pre_tournament_scorer_pts: 0, day_points: 3, cumulative_points: 18,
          is_valid: true, discrepancy: null, calculated_at: '2026-06-01T00:00:00.000Z',
        },
        // u2 has only a day row, no pre-tournament NULL row.
        {
          id: 'snap-d1-u2', user_id: 'u2', match_day_id: 'day-1', stage: 'group',
          match_points: 3, pikanteria_points: 0, pre_tournament_winner_pts: 0,
          pre_tournament_scorer_pts: 0, day_points: 3, cumulative_points: 3,
          is_valid: true, discrepancy: null, calculated_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    }

    await snapshotMatchDay(createFakeSupabase(db), 'day-1')

    const u1Null = db.score_snapshots.filter(s => s.user_id === 'u1' && s.match_day_id === null)
    const u2Null = db.score_snapshots.filter(s => s.user_id === 'u2' && s.match_day_id === null)

    // u1's NULL row updated in place (no duplicate); cumulative reflects the 7-pt day.
    expect(u1Null).toHaveLength(1)
    expect(u1Null[0].cumulative_points).toBe(22) // 7 + 10 + 5
    expect(u1Null[0].is_valid).toBe(true)

    // u2's NULL row created exactly once, cumulative = 3 (day) + 0 pre-tournament.
    expect(u2Null).toHaveLength(1)
    expect(u2Null[0].day_points).toBe(0)
    expect(u2Null[0].cumulative_points).toBe(3)
    expect(u2Null[0].is_valid).toBe(true)
  })
})
