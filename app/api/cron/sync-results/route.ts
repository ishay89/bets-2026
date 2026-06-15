// Scheduled results sync endpoint.
//
// Triggered by Vercel Cron (see vercel.json). Vercel sends the configured
// CRON_SECRET as a Bearer token; we reject anything else so the endpoint can't
// be poked anonymously. It only ever writes advisory suggestion rows — no
// scoring happens here, so even a spurious call is harmless.

import { NextResponse } from 'next/server'
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
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
