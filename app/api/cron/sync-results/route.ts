// Scheduled results sync endpoint.
//
// Triggered by Vercel Cron (see vercel.json). Vercel sends the configured
// CRON_SECRET as a Bearer token; we reject anything else so the endpoint can't
// be poked anonymously. Auto-scores finished matches via enter_match_day_results;
// pikanteria remain manual.

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { runResultsSync } from '@/lib/result-sync-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  // Allow ?secret= for manual curl / external schedulers that can't set headers.
  const url = new URL(req.url)
  return url.searchParams.get('secret') === secret
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const summary = await runResultsSync(supabase)
    if (summary.scored > 0) {
      revalidatePath('/')
      revalidatePath('/predict')
      revalidatePath('/leaderboard')
    }
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
