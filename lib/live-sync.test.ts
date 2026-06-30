import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FdMatch, FdScore } from './football-data'

const updatePayloads: unknown[] = []

const extraTimeMatch: FdMatch = {
  id: 537418,
  utcDate: '2026-06-17T17:00:00Z',
  status: 'PAUSED',
  stage: 'LAST_32',
  group: null,
  minute: null,
  injuryTime: null,
  homeTeam: { id: 8601, name: 'Netherlands' },
  awayTeam: { id: 815, name: 'Morocco' },
  score: {
    winner: 'HOME_TEAM',
    duration: 'EXTRA_TIME',
    fullTime: { home: 2, away: 1 },
    regularTime: { home: null, away: null },
    extraTime: { home: 1, away: 0 },
  } as FdScore,
}

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('./result-sync-runner', () => ({
  runResultsSync: vi.fn().mockResolvedValue({
    ok: true,
    fetched: 1,
    matched: 1,
    scored: 1,
    unmatched: 0,
    failures: [],
    unmatchedSample: [],
  }),
}))

vi.mock('./football-data', async () => {
  const actual = await vi.importActual<typeof import('./football-data')>('./football-data')
  return {
    ...actual,
    getFootballDataConfig: vi.fn(() => ({ apiKey: 'test-key', competition: 'WC' })),
    fetchAllMatches: vi.fn(async () => [extraTimeMatch]),
  }
})

vi.mock('./supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'matches') throw new Error(`Unexpected table: ${table}`)
      return {
        update: (payload: unknown) => ({
          in: () => ({ lt: vi.fn(async () => ({ error: null })) }),
          eq: vi.fn(async () => {
            updatePayloads.push(payload)
            return { error: null }
          }),
        }),
        select: () => ({
          gte: () => ({
            lte: () => ({
              not: () => ({
                or: () => ({
                  or: () => ({
                    limit: () => ({
                      maybeSingle: vi.fn(async () => ({ data: { id: 'active-match' } })),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }
    },
  }),
}))

describe('maybeSyncLiveScores', () => {
  beforeEach(() => {
    updatePayloads.length = 0
    vi.setSystemTime(new Date('2026-06-17T18:00:00Z'))
  })

  it('keeps provider live score/status updating while settlement runs after regulation', async () => {
    const { maybeSyncLiveScores } = await import('./live-sync')
    const { runResultsSync } = await import('./result-sync-runner')

    await expect(maybeSyncLiveScores()).resolves.toBe(true)

    expect(updatePayloads).toContainEqual(expect.objectContaining({
      live_status: 'PAUSED',
      live_score_home: 2,
      live_score_away: 1,
      live_minute: null,
    }))
    expect(runResultsSync).toHaveBeenCalledTimes(1)
  })
})
