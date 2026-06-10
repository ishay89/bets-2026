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
