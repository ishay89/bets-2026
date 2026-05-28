import { describe, expect, test } from 'vitest'
import { shouldWriteAuditEvent } from './audit'

describe('shouldWriteAuditEvent', () => {
  test('writes an audit event when there is no previous value', () => {
    expect(shouldWriteAuditEvent(null, { pick: '1' })).toBe(true)
  })

  test('writes an audit event when the value changes', () => {
    expect(shouldWriteAuditEvent({ pick: '1' }, { pick: 'X' })).toBe(true)
  })

  test('skips an audit event when the value is unchanged', () => {
    expect(shouldWriteAuditEvent({ pick: '1' }, { pick: '1' })).toBe(false)
  })
})
