import { describe, expect, it } from 'vitest'
import {
  formatUtcDate,
  formatUtcDateTime,
  formatUtcTime,
  utcDateKey,
  utcDateTimeLocalToIso,
} from './time'

describe('UTC time helpers', () => {
  it('derives date keys from the UTC instant', () => {
    expect(utcDateKey(new Date('2026-06-12T00:30:00+03:00'))).toBe('2026-06-11')
  })

  it('formats match day dates in UTC', () => {
    expect(formatUtcDate('2026-06-12')).toBe('Fri, Jun 12')
  })

  it('formats kickoff times in UTC', () => {
    expect(formatUtcTime('2026-06-15T19:00:00Z')).toBe('19:00')
  })

  it('formats audit timestamps in UTC', () => {
    expect(formatUtcDateTime('2026-06-15T19:00:00Z')).toBe('Jun 15, 2026, 19:00')
  })

  it('converts datetime-local values to explicit UTC ISO timestamps', () => {
    expect(utcDateTimeLocalToIso('2026-06-15T19:00')).toBe('2026-06-15T19:00:00.000Z')
  })
})
