import { describe, expect, it } from 'vitest'
import { hasLeaderboardResults, sortLeaderboardEntries } from './leaderboard-sort'
import type { LeaderboardEntry } from './types'

function entry(overrides: Partial<LeaderboardEntry> & Pick<LeaderboardEntry, 'id' | 'display_name'>): LeaderboardEntry {
  const { id, display_name, ...rest } = overrides
  return {
    id,
    display_name,
    is_monkey: false,
    automation_strategy: null,
    avatar_emoji: null,
    total_points: 0,
    today_points: 0,
    previous_total_points: null,
    current_rank: null,
    previous_rank: null,
    rank_delta: null,
    total_success_rate: null,
    total_successful_picks: 0,
    total_scored_picks: 0,
    today_success_rate: null,
    today_successful_picks: 0,
    today_scored_picks: 0,
    ...rest,
  }
}

describe('sortLeaderboardEntries', () => {
  it('keeps total score sorting in the server-provided default order', () => {
    const entries = [
      entry({ id: 'score-leader', display_name: 'Score Leader', total_points: 9, total_success_rate: 40 }),
      entry({ id: 'rate-leader', display_name: 'Rate Leader', total_points: 2, total_success_rate: 100 }),
    ]

    expect(sortLeaderboardEntries(entries, 'total', 'score').map(item => item.id)).toEqual([
      'score-leader',
      'rate-leader',
    ])
  })

  it('sorts total standings by total success rate with score as the tie breaker', () => {
    const entries = [
      entry({ id: 'score-leader', display_name: 'Score Leader', total_points: 20, total_success_rate: 50 }),
      entry({ id: 'rate-leader', display_name: 'Rate Leader', total_points: 4, total_success_rate: 100 }),
      entry({ id: 'unscored', display_name: 'Unscored', total_points: 99, total_success_rate: null }),
      entry({ id: 'rate-tie', display_name: 'Rate Tie', total_points: 12, total_success_rate: 50 }),
    ]

    expect(sortLeaderboardEntries(entries, 'total', 'successRate').map(item => item.id)).toEqual([
      'rate-leader',
      'score-leader',
      'rate-tie',
      'unscored',
    ])
  })

  it('sorts day standings by day success rate with day score as the tie breaker', () => {
    const entries = [
      entry({ id: 'score-leader', display_name: 'Score Leader', today_points: 20, today_success_rate: 50 }),
      entry({ id: 'rate-leader', display_name: 'Rate Leader', today_points: 4, today_success_rate: 100 }),
      entry({ id: 'unscored', display_name: 'Unscored', today_points: 99, today_success_rate: null }),
      entry({ id: 'rate-tie', display_name: 'Rate Tie', today_points: 12, today_success_rate: 50 }),
    ]

    expect(sortLeaderboardEntries(entries, 'today', 'successRate').map(item => item.id)).toEqual([
      'rate-leader',
      'score-leader',
      'rate-tie',
      'unscored',
    ])
  })
})

describe('hasLeaderboardResults', () => {
  it('treats scored zero-point days as having day results', () => {
    const entries = [
      entry({ id: 'missed', display_name: 'Missed', today_points: 0, today_scored_picks: 2, today_success_rate: 0 }),
    ]

    expect(hasLeaderboardResults(entries, 'today')).toBe(true)
  })
})
