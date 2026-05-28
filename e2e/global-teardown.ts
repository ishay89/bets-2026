import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { STATE_FILE, deleteSingleRun, type E2EState } from './global-setup'

export default async function globalTeardown() {
  if (!fs.existsSync(STATE_FILE)) return

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as E2EState

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  await deleteSingleRun(supabase, state)

  fs.rmSync(STATE_FILE)
  for (const f of ['.playwright/admin-auth.json', '.playwright/player1-auth.json', '.playwright/player2-auth.json']) {
    if (fs.existsSync(f)) fs.rmSync(f)
  }

  console.log('\n🧹 E2E teardown complete — test data removed\n')
}
