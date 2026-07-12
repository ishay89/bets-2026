import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { backfillLiveScores } from '@/lib/live-score-backfill'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const summary = await backfillLiveScores(createAdminClient())
  if (summary.reason) {
    return NextResponse.json({ ok: false, error: summary.reason }, { status: 500 })
  }

  return NextResponse.json({
    ok: summary.ok,
    finished_from_api: summary.finishedFromApi,
    published_in_db: summary.publishedInDb,
    updated: summary.updated,
    unchanged: summary.unchanged,
    errors: summary.errors,
  })
}
