import { describe, expect, it, vi } from 'vitest'
import type { createAdminClient } from './supabase/server'
import type { FdMatch } from './football-data'

const finishedMatches: FdMatch[] = [
  {
    id: 537385,
    utcDate: '2026-07-11T21:00:00Z',
    status: 'FINISHED',
    stage: 'SEMI_FINALS',
    group: null,
    homeTeam: { id: 1, name: 'Norway' },
    awayTeam: { id: 2, name: 'England' },
    score: {
      winner: 'AWAY_TEAM',
      duration: 'EXTRA_TIME',
      fullTime: { home: 1, away: 2 },
      regularTime: { home: null, away: null },
      extraTime: { home: 0, away: 1 },
    },
  },
  {
    id: 537383,
    utcDate: '2026-07-09T20:00:00Z',
    status: 'FINISHED',
    stage: 'QUARTER_FINALS',
    group: null,
    homeTeam: { id: 3, name: 'France' },
    awayTeam: { id: 4, name: 'Morocco' },
    score: {
      winner: 'HOME_TEAM',
      duration: 'REGULAR',
      fullTime: { home: 2, away: 0 },
    },
  },
]

vi.mock('./football-data', async () => {
  const actual = await vi.importActual<typeof import('./football-data')>('./football-data')
  return {
    ...actual,
    fetchFinishedMatches: vi.fn(async () => finishedMatches),
  }
})

describe('backfillLiveScores', () => {
  it('repairs stale non-null scores and skips rows that already match', async () => {
    const updates: Array<{ payload: Record<string, unknown>; id: string }> = []
    const rows = [
      {
        id: 'norway-england',
        home_team: 'Norway',
        away_team: 'England',
        external_match_id: 537385,
        live_status: 'FINISHED',
        live_score_home: 1,
        live_score_away: 1,
      },
      {
        id: 'france-morocco',
        home_team: 'France',
        away_team: 'Morocco',
        external_match_id: 537383,
        live_status: 'FINISHED',
        live_score_home: 2,
        live_score_away: 0,
      },
    ]

    const admin = {
      from: () => ({
        select: () => ({
          not: vi.fn(async () => ({ data: rows, error: null })),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: vi.fn(async (_column: string, id: string) => {
            updates.push({ payload, id })
            return { error: null }
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createAdminClient>

    const { backfillLiveScores } = await import('./live-score-backfill')
    const summary = await backfillLiveScores(admin, { apiKey: 'test-key', competition: 'WC' })

    expect(summary).toMatchObject({
      ok: true,
      finishedFromApi: 2,
      publishedInDb: 2,
      updated: 1,
      unchanged: 1,
      errors: [],
    })
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      id: 'norway-england',
      payload: {
        live_status: 'FINISHED',
        live_score_home: 1,
        live_score_away: 2,
        live_minute: null,
      },
    })
  })
})
