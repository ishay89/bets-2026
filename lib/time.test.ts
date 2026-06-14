import { describe, expect, it } from 'vitest'
import {
  appDateKey,
  appDateTimeLocalToIso,
  formatAppDate,
  formatAppDateTime,
  formatAppTime,
  matchGroupDateKey,
} from './time'

describe('app time helpers', () => {
  it('derives date keys from the Jerusalem calendar day', () => {
    expect(appDateKey(new Date('2026-06-11T21:30:00Z'))).toBe('2026-06-12')
  })

  it('formats match day dates in Jerusalem time', () => {
    expect(formatAppDate('2026-06-12')).toBe('Fri, Jun 12')
    expect(formatAppDate('2026-06-11T21:30:00Z')).toBe('Fri, Jun 12')
  })

  it('formats kickoff times in Jerusalem time', () => {
    expect(formatAppTime('2026-06-15T19:00:00Z')).toBe('22:00')
  })

  it('formats audit timestamps in Jerusalem time', () => {
    expect(formatAppDateTime('2026-06-15T19:00:00Z')).toBe('Jun 15, 2026, 22:00')
  })

  it('converts Jerusalem datetime-local values to explicit UTC ISO timestamps', () => {
    expect(appDateTimeLocalToIso('2026-06-15T22:00')).toBe('2026-06-15T19:00:00.000Z')
  })

  it('groups evening and next-morning Jerusalem kickoffs into one match day', () => {
    expect(matchGroupDateKey('2026-06-14T18:00:00+03:00')).toBe('2026-06-14')
    expect(matchGroupDateKey('2026-06-14T23:00:00+03:00')).toBe('2026-06-14')
    expect(matchGroupDateKey('2026-06-15T05:00:00+03:00')).toBe('2026-06-14')
    expect(matchGroupDateKey('2026-06-15T09:00:00+03:00')).toBe('2026-06-14')
    expect(matchGroupDateKey('2026-06-15T09:01:00+03:00')).toBe('2026-06-15')
  })
})
