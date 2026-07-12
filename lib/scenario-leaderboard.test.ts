import { describe, expect, it } from 'vitest'
import {
  buildScenarioLeaderboard,
  buildScenarioLeaderboardEntries,
  type ScenarioFuturesPick,
} from './scenario-leaderboard'
import type { LeaderboardEntry } from './types'

function entry(id: string, totalPoints: number, currentRank: number): LeaderboardEntry {
  return {
    id,
    display_name: id,
    is_monkey: false,
    automation_strategy: null,
    avatar_emoji: null,
    total_points: totalPoints,
    today_points: 0,
    previous_total_points: totalPoints,
    current_rank: currentRank,
    previous_rank: currentRank,
    rank_delta: 0,
    total_success_rate: null,
    total_successful_picks: 0,
    total_scored_picks: 0,
    today_success_rate: null,
    today_successful_picks: 0,
    today_scored_picks: 0,
  }
}

function pick(overrides: Partial<ScenarioFuturesPick>): ScenarioFuturesPick {
  return {
    user_id: 'Alice',
    winner_team: 'France',
    winner_odds: 4.5,
    top_scorer: 'Kylian Mbappé',
    top_scorer_odds: 5,
    winner_points: null,
    top_scorer_points: null,
    ...overrides,
  }
}

describe('buildScenarioLeaderboard', () => {
  it('applies winner, runner-up, and top-scorer bonuses and re-ranks the table', () => {
    const rows = buildScenarioLeaderboard(
      [entry('Bob', 20, 1), entry('Alice', 18, 2), entry('Cara', 17, 3)],
      [
        pick({ user_id: 'Alice' }),
        pick({ user_id: 'Bob', winner_team: 'Spain', winner_odds: 4.5, top_scorer: 'Harry Kane', top_scorer_odds: 6.5 }),
        pick({ user_id: 'Cara', winner_team: 'Brazil', winner_odds: 7, top_scorer: 'Harry Kane', top_scorer_odds: 6.5 }),
      ],
      { winner: 'France', runnerUp: 'Spain', topScorer: 'Kylian Mbappé' },
    )

    expect(rows.map(row => [row.id, row.projectedPoints, row.projectedRank])).toEqual([
      ['Alice', 29.75, 1],
      ['Bob', 23.375, 2],
      ['Cara', 17, 3],
    ])
    expect(rows[0].rankChange).toBe(1)
  })

  it('replaces settled futures points instead of counting them twice', () => {
    const rows = buildScenarioLeaderboard(
      [entry('Alice', 30, 1)],
      [pick({ winner_points: 7, top_scorer_points: 5 })],
      { winner: 'Spain', runnerUp: 'France', topScorer: 'Harry Kane' },
    )

    // 30 - 12 settled points + France runner-up points (4.5 * .75).
    expect(rows[0].projectedPoints).toBe(21.375)
  })

  it('uses competition ranks for tied projected totals', () => {
    const rows = buildScenarioLeaderboard(
      [entry('Alice', 10, 1), entry('Bob', 10, 1), entry('Cara', 5, 3)],
      [],
      { winner: 'France', runnerUp: 'Spain', topScorer: 'Kylian Mbappé' },
    )

    expect(rows.map(row => row.projectedRank)).toEqual([1, 1, 3])
  })

  it('projects into canonical leaderboard entries for the existing UI', () => {
    const rows = buildScenarioLeaderboardEntries(
      [entry('Bob', 20, 1), entry('Alice', 18, 2)],
      [pick({ user_id: 'Alice' })],
      { winner: 'France', runnerUp: 'Spain', topScorer: 'Kylian Mbappé' },
    )

    expect(rows[0]).toMatchObject({
      id: 'Alice',
      total_points: 29.75,
      today_points: 11.75,
      current_rank: 1,
      previous_rank: 2,
      rank_delta: 1,
    })
    expect(rows[1]).toMatchObject({ id: 'Bob', current_rank: 2, previous_rank: 1, rank_delta: -1 })
  })
})
