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

describe('admin audit player filter', () => {
  test('loads player options from the users table', () => {
    const actions = readFileSync(
      join(process.cwd(), 'app/admin/audit/actions.ts'),
      'utf8'
    )
    const fetchUsersAction = actions.slice(actions.indexOf('export async function fetchAuditUsers'))

    expect(fetchUsersAction).toMatch(/\.from\('users'\)/)
    expect(fetchUsersAction).not.toMatch(/\.from\('user_prediction_audit_events'\)/)
  })

  test('refreshes player options when the client reloads audit data', () => {
    const client = readFileSync(
      join(process.cwd(), 'app/admin/audit/AuditClient.tsx'),
      'utf8'
    )

    expect(client).toMatch(/import \{ fetchAuditEvents, fetchAuditUsers \} from '\.\/actions'/)
    expect(client).toMatch(/users: AuditUser\[\]/)
    expect(client.match(/fetchAuditUsers\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
