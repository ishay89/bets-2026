import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

describe('Jerusalem match-day grouping migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260614090000_regroup_unpublished_matches_jerusalem_window.sql'),
    'utf8',
  )

  test('groups by the Jerusalem evening-to-morning window', () => {
    expect(sql).toContain("at time zone 'Asia/Jerusalem'")
    expect(sql).toContain("time '09:00'")
    expect(sql).toContain("interval '1 day'")
    expect(sql).not.toContain('America/New_York')
  })

  test('does not repoint already published or scored matches', () => {
    expect(sql).toMatch(/update public\.matches[\s\S]+set match_day_id = target_days\.match_day_id/)
    expect(sql).toMatch(/update public\.matches[\s\S]+where m\.id = mm\.match_id[\s\S]+and m\.published_at is null[\s\S]+and m\.result is null/)
  })

  test('recomputes affected match-day metadata after regrouping', () => {
    expect(sql).toContain('perform public.recompute_match_day_publish(day_id)')
  })
})
