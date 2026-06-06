import { describe, expect, it } from 'vitest'
import { buildHistoricalLeaderboardEntries } from './historical-leaderboard'
import type { ScoredLeaderboardDay } from './types'

const days: ScoredLeaderboardDay[] = [
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
