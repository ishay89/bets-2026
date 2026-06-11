import { describe, expect, it, vi } from 'vitest'
import HomePage from './page'
import { redirect } from 'next/navigation'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('HomePage', () => {
  it('opens the social board by default', () => {
    HomePage()

    expect(redirect).toHaveBeenCalledWith('/board')
  })
})
