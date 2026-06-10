import { describe, expect, it } from 'vitest'
import {
  automatedMatchPick,
  automatedPikanteriaPick,
  buildAutomatedMatchRows,
  buildAutomatedPikaRows,
  buildAutomatedFuturesRows,
  AUTOMATED_MARKER_USERS,
  type AutomatedUser,
} from './monkey'

describe('automated marker users', () => {
  it('defines max, mid, and min marker users', () => {
    expect(AUTOMATED_MARKER_USERS.map(user => user.strategy)).toEqual(['max', 'mid', 'min'])
  })

  it('picks the highest, middle, and lowest match odds', () => {
    const match = { odds_home: 1.8, odds_draw: 3.1, odds_away: 2.4 }

    expect(automatedMatchPick(match, 'max')).toBe('X')
    expect(automatedMatchPick(match, 'mid')).toBe('2')
    expect(automatedMatchPick(match, 'min')).toBe('1')
  })

  it('uses stable pick order to break match odds ties', () => {
    const match = { odds_home: 2, odds_draw: 2, odds_away: 1.5 }

    expect(automatedMatchPick(match, 'max')).toBe('1')
    expect(automatedMatchPick(match, 'mid')).toBe('X')
    expect(automatedMatchPick(match, 'min')).toBe('2')
  })

  it('picks highest, median, and lowest pikanteria outcome odds (three-way)', () => {
    // odds_1 = 1.6, odds_x = 2.2, odds_2 = 4.5 → sorted desc: 2 (4.5), X (2.2), 1 (1.6)
    const pika = { odds_1: 1.6, odds_2: 4.5, odds_x: 2.2 }

    expect(automatedPikanteriaPick(pika, 'max')).toBe('2')
    expect(automatedPikanteriaPick(pika, 'mid')).toBe('X')
    expect(automatedPikanteriaPick(pika, 'min')).toBe('1')
  })

  it('only picks from available outcomes on a two-way question', () => {
    // No X outcome: only 1 and 2 are pickable.
    const pika = { odds_1: 1.8, odds_2: 2.4, odds_x: null }

    // Sorted desc by odds: [2 (2.4), 1 (1.8)].
    expect(automatedPikanteriaPick(pika, 'max')).toBe('2')
    expect(automatedPikanteriaPick(pika, 'mid')).toBe('1') // floor(2/2) = index 1
    expect(automatedPikanteriaPick(pika, 'min')).toBe('1')
  })
})

describe('buildAutomatedMatchRows', () => {
  const users: AutomatedUser[] = [
    { id: 'u-max', automation_strategy: 'max' },
    { id: 'u-min', automation_strategy: 'min' },
  ]

  it('emits one row per user per match', () => {
    const matches = [{ id: 'm1', odds_home: 1.8, odds_draw: 3.1, odds_away: 2.4 }]
    const rows = buildAutomatedMatchRows(users, matches)
    expect(rows).toEqual([
      { user_id: 'u-max', match_id: 'm1', pick: 'X' },
      { user_id: 'u-min', match_id: 'm1', pick: '1' },
    ])
  })

  it('is empty when there are no automated users', () => {
    expect(buildAutomatedMatchRows([], [{ id: 'm1', odds_home: 2, odds_draw: 2, odds_away: 2 }])).toEqual([])
  })
})

describe('buildAutomatedPikaRows', () => {
  it('emits one answer row per user per pikanteria', () => {
    const users: AutomatedUser[] = [
      { id: 'u-max', automation_strategy: 'max' },
      { id: 'u-min', automation_strategy: 'min' },
    ]
    // Two-way question: odds_2 (4.5) is the long shot, odds_1 (1.6) the favourite.
    const pikas = [{ id: 'p1', odds_1: 1.6, odds_2: 4.5, odds_x: null }]
    const rows = buildAutomatedPikaRows(users, pikas)
    expect(rows).toEqual([
      { user_id: 'u-max', pikanteria_id: 'p1', pick: '2' },
      { user_id: 'u-min', pikanteria_id: 'p1', pick: '1' },
    ])
  })
})

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
