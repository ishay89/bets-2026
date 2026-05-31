import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

describe('audit event RLS migration', () => {
  test('allows authenticated users to insert their own audit events', () => {
    const baseMigration = readFileSync(
      join(process.cwd(), 'supabase/migrations/007_user_prediction_audit_events.sql'),
      'utf8'
    )
    const forwardMigration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260530071748_user_prediction_audit_events_rls.sql'),
      'utf8'
    )

    for (const sql of [baseMigration, forwardMigration]) {
      expect(sql).toMatch(/create policy "user_prediction_audit_events_insert_own"/)
      expect(sql).toMatch(/for insert\s+with check \(auth\.uid\(\) = user_id\)/)
    }
  })
})
