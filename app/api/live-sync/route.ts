import { NextResponse } from 'next/server'
import { maybeSyncLiveScores } from '@/lib/live-sync'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('users')
    .select('is_admin, status')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!profile?.is_admin && profile?.status !== 'approved') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  await maybeSyncLiveScores()
  return NextResponse.json({ ok: true })
}
