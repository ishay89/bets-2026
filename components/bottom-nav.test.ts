import { describe, expect, it } from 'vitest'
import { bottomNavTabs } from './bottom-nav'

describe('bottomNavTabs', () => {
  it('has separate social and AI recap tabs', () => {
    expect(bottomNavTabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: '/board', label: 'Social' }),
        expect.objectContaining({ href: '/recaps', label: 'Recaps' }),
      ]),
    )
  })
})
