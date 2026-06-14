import { describe, expect, it } from 'vitest'

import { orderResultsMatchDays } from './admin-results-order'

describe('orderResultsMatchDays', () => {
  it('orders match days from latest to earliest by date', () => {
    const days = [
      { id: 'day-1', date: '2026-06-11' },
      { id: 'day-3', date: '2026-06-13' },
      { id: 'day-2', date: '2026-06-12' },
    ]

    const ordered = orderResultsMatchDays(days)

    expect(ordered.map(day => day.id)).toEqual(['day-3', 'day-2', 'day-1'])
  })
})
