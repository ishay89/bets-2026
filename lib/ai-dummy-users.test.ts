import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readdirSync(join(process.cwd(), 'supabase', 'migrations'))
  .filter(file => file.endsWith('.sql'))
  .sort()
  .map(file => readFileSync(join(process.cwd(), 'supabase', 'migrations', file), 'utf8'))
  .join('\n\n')

describe('AI dummy users migration', () => {
  it('creates Codex and Claude as approved non-automated users', () => {
    expect(migrationSql).toContain(
      "('00000000-0000-0000-0000-000000000005', 'codex@mondial2026.local', 'authenticated', now())",
    )
    expect(migrationSql).toContain(
      "('00000000-0000-0000-0000-000000000006', 'claude@mondial2026.local', 'authenticated', now())",
    )
    expect(migrationSql).toContain(
      "('00000000-0000-0000-0000-000000000005', 'codex@mondial2026.local', 'Codex', false, null, 'approved')",
    )
    expect(migrationSql).toContain(
      "('00000000-0000-0000-0000-000000000006', 'claude@mondial2026.local', 'Claude', false, null, 'approved')",
    )
  })
})
