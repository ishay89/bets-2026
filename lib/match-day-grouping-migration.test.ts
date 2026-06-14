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

  test('does not repoint published or scored matches except explicit approved Germany rows', () => {
    expect(sql).toMatch(/update public\.matches[\s\S]+set match_day_id = target_days\.match_day_id/)
    expect(sql).toContain('approved_published_match_moves')
    expect(sql).toContain('7e2a406d-9275-4797-9c90-ae009edb8243')
    expect(sql).toMatch(/where md\.stage = 'group'[\s\S]+and m\.result is null[\s\S]+and \([\s\S]+m\.published_at is null[\s\S]+or m\.id in/)
  })

  test('moves the explicitly approved published Germany pikanteria row', () => {
    expect(sql).toContain('approved_published_pikanteria_moves')
    expect(sql).toContain('6ba642bb-fa1d-474f-a3fa-40f799559bfb')
    expect(sql).toMatch(/update public\.pikanteria p[\s\S]+set match_day_id = target_days\.match_day_id/)
  })

  test('recomputes affected match-day metadata after regrouping', () => {
    expect(sql).toContain('perform public.recompute_match_day_publish(day_id)')
  })
})
