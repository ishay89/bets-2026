import { describe, expect, it } from 'vitest'
import {
  automatedMatchPick,
  automatedPikanteriaPick,
  buildAutomatedMatchRows,
  buildAutomatedPikaRows,
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

  it('picks highest, median, and lowest pikanteria option odds', () => {
    const options = [
      { id: 'a', odds: 4.5, sort_order: 2 },
      { id: 'b', odds: 1.6, sort_order: 0 },
      { id: 'c', odds: 2.2, sort_order: 1 },
    ]

    expect(automatedPikanteriaPick(options, 'max')).toBe('a')
    expect(automatedPikanteriaPick(options, 'mid')).toBe('c')
    expect(automatedPikanteriaPick(options, 'min')).toBe('b')
  })
})

describe('buildAutomatedMatchRows', () => {
  const users: AutomatedUser[] = [
    { id: 'u-max', automation_strategy: 'max' },
    { id: 'u-min', automation_strategy: 'min' },
  ]

  it('emits one row per user per match', () => {
    const matches = [{ id: 'm1', odds_home: 1.8, odds_draw: 3.1, odds_away: 2.4 }]
    const rows = buildAutomatedMatchRows(users, matches, '2026-06-11')
    expect(rows).toEqual([
      { user_id: 'u-max', match_id: 'm1', pick: 'X' },
      { user_id: 'u-min', match_id: 'm1', pick: '1' },
    ])
  })

  it('is empty when there are no automated users', () => {
    expect(buildAutomatedMatchRows([], [{ id: 'm1', odds_home: 2, odds_draw: 2, odds_away: 2 }], '2026-06-11')).toEqual([])
  })
})

describe('buildAutomatedPikaRows', () => {
  it('emits one answer row per user per pikanteria', () => {
    const users: AutomatedUser[] = [
      { id: 'u-max', automation_strategy: 'max' },
      { id: 'u-min', automation_strategy: 'min' },
    ]
    const pikas = [{
      id: 'p1',
      options: [
        { id: 'a', odds: 4.5, sort_order: 2 },
        { id: 'b', odds: 1.6, sort_order: 0 },
      ],
    }]
    const rows = buildAutomatedPikaRows(users, pikas, '2026-06-11')
    expect(rows).toEqual([
      { user_id: 'u-max', pikanteria_id: 'p1', option_id: 'a' },
      { user_id: 'u-min', pikanteria_id: 'p1', option_id: 'b' },
    ])
  })
})
