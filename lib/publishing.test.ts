import { describe, it, expect } from 'vitest'
import { shouldDayBeVisible } from './publishing'

describe('shouldDayBeVisible', () => {
  it('is hidden when nothing is published', () => {
    expect(shouldDayBeVisible(0, 0)).toBe(false)
  })

  it('is visible with at least one published match', () => {
    expect(shouldDayBeVisible(1, 0)).toBe(true)
  })

  it('is visible with at least one published pikanteria (no matches)', () => {
    expect(shouldDayBeVisible(0, 1)).toBe(true)
  })

  it('stays visible while any published item remains', () => {
    expect(shouldDayBeVisible(2, 3)).toBe(true)
  })
})
