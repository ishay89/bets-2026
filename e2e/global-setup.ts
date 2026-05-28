/**
 * E2E Global Setup
 *
 * Runs once before all tests. Creates isolated test users and a draft match day
 * in Supabase, then authenticates each user via magic-link so the browser
 * cookies are saved to disk and reused by the test.
 *
 * Requirements:
 *  - .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *    SUPABASE_SERVICE_ROLE_KEY
 *  - No other PUBLISHED match day for today (predict page uses .single())
 *  - Supabase auth "Enable email confirmations" OFF, or email_confirm: true via admin API
 */
import fs from 'fs'
import { chromium, type Browser } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Loose type so helper functions work across different Supabase generic instantiations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export const TEST_ADMIN_EMAIL = 'e2e-admin@mondial-test.local'
export const TEST_PLAYER1_EMAIL = 'e2e-player1@mondial-test.local'
export const TEST_PLAYER2_EMAIL = 'e2e-player2@mondial-test.local'

export const ADMIN_AUTH_FILE = '.playwright/admin-auth.json'
export const PLAYER1_AUTH_FILE = '.playwright/player1-auth.json'
export const PLAYER2_AUTH_FILE = '.playwright/player2-auth.json'
export const STATE_FILE = '.playwright/e2e-state.json'

export interface E2EState {
  matchDayId: string
  matchIds: string[]
  match1: { home_team: string; away_team: string; odds_home: number; odds_draw: number; odds_away: number }
  match2: { home_team: string; away_team: string; odds_home: number; odds_draw: number; odds_away: number }
  adminId: string
  player1Id: string
  player2Id: string
  today: string
}

export default async function globalSetup() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Missing env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local'
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: AdminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Clean up any data left by a previous (interrupted) run
  await cleanupPreviousRun(supabase)

  // ── Guard: no other published match day for today ──────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const { data: alreadyPublished } = await supabase
    .from('match_days')
    .select('id, date')
    .eq('date', today)
    .not('published_at', 'is', null)

  if (alreadyPublished && alreadyPublished.length > 0) {
    throw new Error(
      `A published match day already exists for today (${today}). ` +
      `The predict page uses .single() so running E2E tests would cause a conflict. ` +
      `Run the tests on a day with no real match data, or point to a test Supabase project.`
    )
  }

  // ── Create test users ──────────────────────────────────────────────────────
  const [adminRes, p1Res, p2Res] = await Promise.all([
    supabase.auth.admin.createUser({ email: TEST_ADMIN_EMAIL, email_confirm: true }),
    supabase.auth.admin.createUser({ email: TEST_PLAYER1_EMAIL, email_confirm: true }),
    supabase.auth.admin.createUser({ email: TEST_PLAYER2_EMAIL, email_confirm: true }),
  ])

  for (const [res, label] of [[adminRes, 'admin'], [p1Res, 'player1'], [p2Res, 'player2']] as const) {
    if (res.error) throw new Error(`Failed to create ${label}: ${res.error.message}`)
  }

  const adminId = adminRes.data.user!.id
  const player1Id = p1Res.data.user!.id
  const player2Id = p2Res.data.user!.id

  // ── Create draft match day for today ───────────────────────────────────────
  // Kickoff 3+ hours from now → lock_time will be ~2.5h away after publish
  const kickoff1 = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
  const kickoff2 = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()

  const { data: matchDay, error: mdErr } = await supabase
    .from('match_days')
    .insert({ date: today, stage: 'group', lock_time: new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString() })
    .select()
    .single()

  if (mdErr || !matchDay) throw new Error(`Failed to create match day: ${mdErr?.message}`)

  const match1Data = { match_day_id: matchDay.id, home_team: 'Brazil', away_team: 'Argentina', kickoff_time: kickoff1, odds_home: 2.10, odds_draw: 3.20, odds_away: 3.50 }
  const match2Data = { match_day_id: matchDay.id, home_team: 'France', away_team: 'Germany', kickoff_time: kickoff2, odds_home: 1.90, odds_draw: 3.40, odds_away: 4.00 }

  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .insert([match1Data, match2Data])
    .select()

  if (mErr || !matches) throw new Error(`Failed to create matches: ${mErr?.message}`)

  // ── Authenticate users (magic link → browser → save cookies) ──────────────
  fs.mkdirSync('.playwright', { recursive: true })

  const browser = await chromium.launch()

  await authenticateUser(browser, supabase, TEST_ADMIN_EMAIL, ADMIN_AUTH_FILE)
  await authenticateUser(browser, supabase, TEST_PLAYER1_EMAIL, PLAYER1_AUTH_FILE)
  await authenticateUser(browser, supabase, TEST_PLAYER2_EMAIL, PLAYER2_AUTH_FILE)

  await browser.close()

  // Force-set is_admin on the admin user AFTER the auth callback
  // (the callback sets is_admin based on ADMIN_EMAILS env; test email isn't in that list)
  await supabase.from('users').update({ is_admin: true, display_name: 'E2E Admin' }).eq('id', adminId)
  await supabase.from('users').update({ display_name: 'E2E Player 1' }).eq('id', player1Id)
  await supabase.from('users').update({ display_name: 'E2E Player 2' }).eq('id', player2Id)

  // ── Persist state for teardown and tests ───────────────────────────────────
  const state: E2EState = {
    matchDayId: matchDay.id,
    matchIds: matches.map((m: { id: string }) => m.id),
    match1: { home_team: 'Brazil', away_team: 'Argentina', odds_home: 2.10, odds_draw: 3.20, odds_away: 3.50 },
    match2: { home_team: 'France', away_team: 'Germany', odds_home: 1.90, odds_draw: 3.40, odds_away: 4.00 },
    adminId,
    player1Id,
    player2Id,
    today,
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

  console.log('\n✅ E2E setup complete')
  console.log(`   Match day ${matchDay.id} (${today}, draft — not yet published)`)
  console.log(`   Matches: Brazil vs Argentina  |  France vs Germany`)
  console.log(`   Admin  : ${TEST_ADMIN_EMAIL}`)
  console.log(`   Players: ${TEST_PLAYER1_EMAIL}, ${TEST_PLAYER2_EMAIL}\n`)
}

async function authenticateUser(
  browser: Browser,
  supabase: AdminClient,
  email: string,
  storageFile: string,
) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'http://localhost:3000/auth/callback' },
  })

  if (error || !data.properties?.action_link) {
    throw new Error(`Failed to generate magic link for ${email}: ${error?.message}`)
  }

  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    // Navigate to the magic link; Supabase verifies token and redirects to /auth/callback
    await page.goto(data.properties.action_link)
    // The callback handler exchanges the code, sets session cookies, redirects to /
    await page.waitForURL('http://localhost:3000/**', { timeout: 30_000 })
  } catch (err) {
    throw new Error(`Authentication failed for ${email}: ${err}`)
  }
  await context.storageState({ path: storageFile })
  await context.close()
}

async function cleanupPreviousRun(supabase: ReturnType<typeof createClient>) {
  // If a previous run was interrupted (no teardown), clean up leftover test data
  if (fs.existsSync(STATE_FILE)) {
    const prev = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as E2EState
    await deleteSingleRun(supabase, prev)
    fs.rmSync(STATE_FILE)
  }

  // Also clean up test users that may have been orphaned
  const testEmails = [TEST_ADMIN_EMAIL, TEST_PLAYER1_EMAIL, TEST_PLAYER2_EMAIL]
  const { data: orphanUsers } = await supabase.from('users').select('id').in('email', testEmails)
  for (const u of (orphanUsers ?? []) as { id: string }[]) {
    await supabase.auth.admin.deleteUser(u.id)
  }
}

export async function deleteSingleRun(
  supabase: AdminClient,
  state: E2EState,
) {
  const ids = [state.adminId, state.player1Id, state.player2Id]

  await supabase.from('score_snapshots').delete().in('user_id', ids)
  await supabase.from('pikanteria_answers').delete().in('user_id', ids)
  await supabase.from('predictions').delete().in('user_id', ids)
  await supabase.from('pre_tournament_picks').delete().in('user_id', ids)

  // Delete match day (cascades to matches and pikanteria)
  await supabase.from('match_days').delete().eq('id', state.matchDayId)

  // Delete public user records then auth records
  await supabase.from('users').delete().in('id', ids)
  for (const id of ids) {
    await supabase.auth.admin.deleteUser(id)
  }
}
