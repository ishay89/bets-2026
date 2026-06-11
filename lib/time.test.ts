import { describe, expect, it } from 'vitest'
import {
  appDateKey,
  appDateTimeLocalToIso,
  formatAppDate,
  formatAppDateTime,
  formatAppTime,
} from './time'

describe('app time helpers', () => {
  it('derives date keys from the US Eastern calendar day', () => {
    expect(appDateKey(new Date('2026-06-11T21:30:00Z'))).toBe('2026-06-11')
  })

  it('formats match day dates in US Eastern time', () => {
    expect(formatAppDate('2026-06-12')).toBe('Fri, Jun 12')
    expect(formatAppDate('2026-06-11T21:30:00Z')).toBe('Thu, Jun 11')
  })

  it('formats kickoff times in US Eastern time', () => {
    expect(formatAppTime('2026-06-15T19:00:00Z')).toBe('15:00')
  })

  it('formats audit timestamps in US Eastern time', () => {
    expect(formatAppDateTime('2026-06-15T19:00:00Z')).toBe('Jun 15, 2026, 15:00')
  })

  it('converts US Eastern datetime-local values to explicit UTC ISO timestamps', () => {
    expect(appDateTimeLocalToIso('2026-06-15T22:00')).toBe('2026-06-16T02:00:00.000Z')
  })
})
