# E2E Test Suite — Full App Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 5-test headless Playwright suite covering the full app flow: admin publishes match day → users predict → lock enforced → admin scores → leaderboard verified.

**Architecture:** Local Supabase (Docker) provides an isolated, real Postgres+auth instance. Playwright drives Chromium headless against a Next.js dev server pointed at local Supabase. Auth uses `signInWithPassword` (email provider enabled in local config only) with session cookies injected directly into the browser context. Each spec is self-contained — its `beforeAll` sets up required DB state programmatically via the service-role client, so any spec can run in isolation.

**Tech Stack:** `@playwright/test`, `@supabase/supabase-js`, local Supabase CLI (Docker), Next.js 16 dev server, `dotenv`

---

## File Map

```
supabase/
  config.toml             CREATE — local Supabase config (disable email confirm, enable email auth)
  seed.sql                CREATE — draft match day + 2 matches for CURRENT_DATE
.env.e2e                  CREATE — local Supabase credentials (gitignored)
playwright.config.ts      CREATE — Playwright config (webServer, workers:1, load .env.e2e)
e2e/
  global-setup.ts         CREATE — creates 3 test auth users + public.users records
  helpers/
    supabase.ts           CREATE — getAdminClient(), getMatchDay(), getUserId()
    auth.ts               CREATE — loginAs(page, email) via signInWithPassword + cookie inject
    reset.ts              CREATE — resetTransactions() — re-drafts match day, clears predictions
  tests/
    01-publish.spec.ts    CREATE — admin publishes match day via UI
    02-predict.spec.ts    CREATE — Alice + Bob place predictions via UI
    03-lock.spec.ts       CREATE — locked banner shown, picks disabled after lock_time
    04-results.spec.ts    CREATE — admin scores results, points computed correctly
    05-leaderboard.spec.ts CREATE — leaderboard order + point totals correct
package.json              MODIFY — add @playwright/test, test:e2e script
.gitignore                MODIFY — add .env.e2e
```

---

## Task 1: Install Playwright and update package.json

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install @playwright/test**

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Expected output ends with: `✔ Chromium ... downloaded`

- [ ] **Step 2: Add test:e2e script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test:e2e": "supabase db reset && playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 3: Add .env.e2e to .gitignore**

Append to `.gitignore`:
```
.env.e2e
```

- [ ] **Step 4: Verify playwright is importable**

```bash
node -e "require('@playwright/test'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: install playwright for E2E tests"
```

---

## Task 2: Initialize local Supabase and configure

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)

- [ ] **Step 1: Initialize Supabase project**

```bash
supabase init
```

If asked "Generate VS Code settings?" answer `n`. This creates `supabase/config.toml`.

- [ ] **Step 2: Edit config.toml — disable email confirmation, enable email auth**

Open `supabase/config.toml`. Find the `[auth.email]` section (or add it) and set:

```toml
[auth.email]
enable_signup = true
double_confirm_changes = false
enable_confirmations = false
```

Also ensure the `[auth]` section has:
```toml
[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]
```

- [ ] **Step 3: Start local Supabase (first time pulls Docker images — may take 2-5 min)**

```bash
supabase start
```

Expected output includes lines like:
```
API URL: http://127.0.0.1:54321
anon key: eyJh...
service_role key: eyJh...
```

Copy these values — you will paste them in Task 4.

- [ ] **Step 4: Verify local Supabase is running**

```bash
supabase status
```

Expected: shows `API URL`, `anon key`, `service_role key`.

- [ ] **Step 5: Commit config.toml**

```bash
git add supabase/config.toml
git commit -m "chore: initialize supabase local config for E2E"
```

---

## Task 3: Create seed.sql

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Write seed.sql**

Create `supabase/seed.sql`:

```sql
-- E2E Test Seed — applied by `supabase db reset`
-- Creates a draft match day for CURRENT_DATE with 2 matches.
-- Auth users are created by e2e/global-setup.ts (not here).

DO $$
DECLARE
  day_id   uuid := gen_random_uuid();
  match1   uuid := gen_random_uuid();
  match2   uuid := gen_random_uuid();
  today    date := CURRENT_DATE;
BEGIN
  INSERT INTO public.match_days (id, date, stage, lock_time, published_at)
  VALUES (day_id, today, 'group', NOW() + INTERVAL '2 hours 30 minutes', null);

  INSERT INTO public.matches (id, match_day_id, home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away)
  VALUES
    (match1, day_id, 'Brazil',  'Argentina', NOW() + INTERVAL '3 hours', 2.10, 3.20, 3.50),
    (match2, day_id, 'France',  'Germany',   NOW() + INTERVAL '5 hours', 1.90, 3.40, 3.80);
END $$;
```

- [ ] **Step 2: Run db reset to apply migrations + seed**

```bash
supabase db reset
```

Expected: `Finished supabase db reset.`

- [ ] **Step 3: Verify seed ran correctly**

```bash
supabase db execute --local --sql "SELECT date, stage, published_at FROM public.match_days;"
```

Expected: one row with today's date, stage=`group`, `published_at` = null.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "test: add E2E seed — draft match day with 2 matches"
```

---

## Task 4: Create .env.e2e and playwright.config.ts

**Files:**
- Create: `.env.e2e`
- Create: `playwright.config.ts`

- [ ] **Step 1: Create .env.e2e** (paste keys from `supabase status` output)

Create `.env.e2e` in the project root:

```bash
# Local Supabase credentials — copy from `supabase status`
E2E_SUPABASE_URL=http://127.0.0.1:54321
E2E_SUPABASE_ANON_KEY=<paste anon key here>
E2E_SUPABASE_SERVICE_ROLE_KEY=<paste service_role key here>
```

Replace the placeholder values with the keys printed by `supabase start` / `supabase status`.

- [ ] **Step 2: Create playwright.config.ts**

Create `playwright.config.ts` in the project root:

```typescript
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.e2e' })

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  retries: 0,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  globalSetup: './e2e/global-setup.ts',

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY!,
      SUPABASE_SERVICE_ROLE_KEY: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
      ADMIN_EMAILS: 'admin@test.local',
    },
  },
})
```

- [ ] **Step 3: Verify config loads**

```bash
node -e "const d = require('dotenv'); d.config({path:'.env.e2e'}); console.log('URL:', process.env.E2E_SUPABASE_URL)"
```

Expected: `URL: http://127.0.0.1:54321`

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts
git commit -m "test: add playwright config (headless chromium, local supabase webServer)"
```

---

## Task 5: Create global setup (test user provisioning)

**Files:**
- Create: `e2e/global-setup.ts`

- [ ] **Step 1: Create e2e/global-setup.ts**

Create `e2e/global-setup.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const USERS = [
  { email: 'admin@test.local', displayName: 'Test Admin', isAdmin: true },
  { email: 'alice@test.local', displayName: 'Alice',      isAdmin: false },
  { email: 'bob@test.local',   displayName: 'Bob',        isAdmin: false },
]

const PASSWORD = 'Test1234!'

export default async function globalSetup() {
  const admin = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  for (const { email, displayName, isAdmin } of USERS) {
    // Create auth user (idempotent — ignore "already registered" errors)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    })

    if (error && !error.message.toLowerCase().includes('already')) {
      throw new Error(`Failed to create auth user ${email}: ${error.message}`)
    }

    const userId = data?.user?.id
    if (!userId) {
      // User already existed — look up their ID
      const { data: existing } = await admin.auth.admin.listUsers()
      const found = existing?.users.find(u => u.email === email)
      if (!found) throw new Error(`Cannot find user ${email} after creation attempt`)
      // Upsert public.users with existing ID
      await admin.from('users').upsert(
        { id: found.id, email, display_name: displayName, is_admin: isAdmin },
        { onConflict: 'id' }
      )
      continue
    }

    // Upsert public.users record
    const { error: upsertErr } = await admin.from('users').upsert(
      { id: userId, email, display_name: displayName, is_admin: isAdmin },
      { onConflict: 'id' }
    )
    if (upsertErr) throw new Error(`Failed to upsert public.users for ${email}: ${upsertErr.message}`)
  }

  console.log('[global-setup] Test users provisioned')
}
```

- [ ] **Step 2: Verify it runs (requires supabase start + db reset done)**

```bash
node -r dotenv/config -e "
  process.env.DOTENV_CONFIG_PATH = '.env.e2e';
" && npx playwright test --list 2>&1 | head -5
```

This just verifies the config is parseable. Actual user creation is tested in Task 6.

- [ ] **Step 3: Commit**

```bash
git add e2e/global-setup.ts
git commit -m "test: add global setup — provisions 3 test auth users"
```

---

## Task 6: Create helpers

**Files:**
- Create: `e2e/helpers/supabase.ts`
- Create: `e2e/helpers/auth.ts`
- Create: `e2e/helpers/reset.ts`

- [ ] **Step 1: Create e2e/helpers/supabase.ts**

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Returns today's match day row. Throws if none found. */
export async function getMatchDay(admin: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await admin
    .from('match_days')
    .select('id, date, stage, lock_time, published_at')
    .eq('date', today)
    .single()
  if (error || !data) throw new Error(`No match day found for ${today}: ${error?.message}`)
  return data
}

/** Returns matches for a given match_day_id, ordered by kickoff_time. */
export async function getMatches(admin: SupabaseClient, matchDayId: string) {
  const { data, error } = await admin
    .from('matches')
    .select('id, home_team, away_team, odds_home, odds_draw, odds_away, result')
    .eq('match_day_id', matchDayId)
    .order('kickoff_time')
  if (error) throw new Error(`Failed to fetch matches: ${error.message}`)
  return data ?? []
}

/** Returns the public.users id for a given email. */
export async function getUserId(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .single()
  if (error || !data) throw new Error(`User not found: ${email}`)
  return data.id
}

/**
 * Programmatically publishes the match day (sets published_at, lock_time 2h from now)
 * and inserts the standard test pikanteria: "Will there be a red card?" Yes(2.50)/No(1.60).
 * Returns pikanteria option IDs { yesId, noId }.
 */
export async function publishMatchDay(admin: SupabaseClient, matchDayId: string) {
  await admin
    .from('match_days')
    .update({
      published_at: new Date().toISOString(),
      lock_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', matchDayId)

  const { data: pika, error: pikaErr } = await admin
    .from('pikanteria')
    .insert({ question: 'Will there be a red card?', match_day_id: matchDayId })
    .select('id')
    .single()
  if (pikaErr || !pika) throw new Error(`Failed to insert pikanteria: ${pikaErr?.message}`)

  const { data: opts, error: optsErr } = await admin
    .from('pikanteria_options')
    .insert([
      { pikanteria_id: pika.id, label: 'Yes', odds: 2.50, sort_order: 0 },
      { pikanteria_id: pika.id, label: 'No',  odds: 1.60, sort_order: 1 },
    ])
    .select('id, label')
  if (optsErr || !opts) throw new Error(`Failed to insert pikanteria options: ${optsErr?.message}`)

  const yesId = opts.find(o => o.label === 'Yes')!.id
  const noId  = opts.find(o => o.label === 'No')!.id
  return { pikaId: pika.id, yesId, noId }
}
```

- [ ] **Step 2: Create e2e/helpers/auth.ts**

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'

const PASSWORD = 'Test1234!'

/**
 * Authenticates `email` by signing in with password (via the Supabase anon client),
 * then injects the session into the Playwright browser context as cookies.
 *
 * @supabase/ssr's createBrowserClient stores sessions as:
 *   cookie name:  supabase.auth.token
 *   cookie value: "base64-" + base64url(JSON.stringify(session))
 */
export async function loginAs(page: Page, email: string): Promise<void> {
  const client = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error || !data.session) {
    throw new Error(`signInWithPassword failed for ${email}: ${error?.message}`)
  }

  const encoded = 'base64-' + Buffer.from(JSON.stringify(data.session)).toString('base64url')

  await page.context().addCookies([{
    name: 'supabase.auth.token',
    value: encoded,
    domain: 'localhost',
    path: '/',
    sameSite: 'Lax',
    httpOnly: false,
  }])

  await page.goto('/')
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 10_000 })
}
```

- [ ] **Step 3: Create e2e/helpers/reset.ts**

```typescript
import { getAdminClient, getMatchDay } from './supabase'

/**
 * Resets all transactional state so the next spec starts clean.
 * Does NOT touch auth.users or public.users.
 * Call in beforeAll of each spec.
 */
export async function resetTransactions(): Promise<void> {
  const admin = getAdminClient()
  const matchDay = await getMatchDay(admin)
  const id = matchDay.id

  // Clear scored results on matches
  await admin.from('matches').update({ result: null }).eq('match_day_id', id)

  // Remove all pikanteria for this match day (cascades to options + answers)
  await admin.from('pikanteria').delete().eq('match_day_id', id)

  // Remove all predictions for matches in this match day
  const { data: matches } = await admin
    .from('matches')
    .select('id')
    .eq('match_day_id', id)
  const matchIds = (matches ?? []).map(m => m.id)
  if (matchIds.length > 0) {
    await admin.from('predictions').delete().in('match_id', matchIds)
  }

  // Re-draft the match day and reset lock_time to 2 hours from now
  await admin
    .from('match_days')
    .update({
      published_at: null,
      lock_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', id)
}
```

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/
git commit -m "test: add E2E helpers — admin client, auth cookie injection, transaction reset"
```

---

## Task 7: Test 01 — Admin publishes match day

**Files:**
- Create: `e2e/tests/01-publish.spec.ts`

- [ ] **Step 1: Write the test**

Create `e2e/tests/01-publish.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers/auth'
import { resetTransactions } from '../helpers/reset'
import { getAdminClient, getMatchDay } from '../helpers/supabase'

test.describe('01 — Admin publishes match day', () => {
  test.beforeAll(async () => {
    await resetTransactions()
  })

  test('admin fills publish form and match day becomes published', async ({ page }) => {
    await loginAs(page, 'admin@test.local')

    const today = new Date().toISOString().slice(0, 10)
    await page.goto(`/admin/publish?date=${today}`)

    // Match cards should be visible
    await expect(page.getByText('Brazil')).toBeVisible()
    await expect(page.getByText('France')).toBeVisible()

    // Verify pre-filled odds for match 1 (Brazil home odds = 2.10)
    await expect(page.locator('[name="odds_home_1"]')).toHaveValue('2.10')

    // Fill pikanteria question 1
    await page.locator('[name="pik_q_1"]').fill('Will there be a red card?')
    await page.locator('[name="pik_opt_label_1_1"]').fill('Yes')
    await page.locator('[name="pik_opt_odds_1_1"]').fill('2.50')
    await page.locator('[name="pik_opt_label_1_2"]').fill('No')
    await page.locator('[name="pik_opt_odds_1_2"]').fill('1.60')

    // Submit
    await page.getByRole('button', { name: /Publish Match Day/ }).click()

    // Should redirect to /admin/results
    await page.waitForURL('**/admin/results', { timeout: 15_000 })

    // DB assertion: published_at is set
    const admin = getAdminClient()
    const matchDay = await getMatchDay(admin)
    expect(matchDay.published_at).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run just this test to verify it passes**

```bash
npx playwright test e2e/tests/01-publish.spec.ts --project=chromium
```

Expected: `1 passed`

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/01-publish.spec.ts
git commit -m "test(e2e): 01 — admin publish match day"
```

---

## Task 8: Test 02 — Users place predictions

**Files:**
- Create: `e2e/tests/02-predict.spec.ts`

- [ ] **Step 1: Write the test**

Create `e2e/tests/02-predict.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers/auth'
import { resetTransactions } from '../helpers/reset'
import { getAdminClient, getMatchDay, getMatches, getUserId, publishMatchDay } from '../helpers/supabase'

test.describe('02 — Users place predictions', () => {
  let matchDay: Awaited<ReturnType<typeof getMatchDay>>

  test.beforeAll(async () => {
    await resetTransactions()
    const admin = getAdminClient()
    matchDay = await getMatchDay(admin)
    await publishMatchDay(admin, matchDay.id)
  })

  test('Alice picks 1 (Brazil) and 2 (Germany) and Yes on pikanteria', async ({ page }) => {
    await loginAs(page, 'alice@test.local')
    await page.goto('/predict')

    // Both matches visible
    await expect(page.getByText('BRA')).toBeVisible()
    await expect(page.getByText('FRA')).toBeVisible()

    // Pick "1" on Brazil match (home odds 2.10 — unique across all buttons)
    await page.getByRole('button').filter({ hasText: '2.10' }).click()

    // Pick "2" on France match (away odds 3.80 — unique)
    await page.getByRole('button').filter({ hasText: '3.80' }).click()

    // Answer pikanteria: Yes (odds 2.50 — unique)
    await page.getByRole('button').filter({ hasText: '2.50' }).click()

    // Wait for saves to complete (server actions are async)
    await page.waitForTimeout(1_000)

    // DB assertions
    const admin = getAdminClient()
    const matches = await getMatches(admin, matchDay.id)
    const brazilMatch = matches.find(m => m.home_team === 'Brazil')!
    const franceMatch = matches.find(m => m.home_team === 'France')!
    const aliceId = await getUserId(admin, 'alice@test.local')

    const { data: preds } = await admin
      .from('predictions')
      .select('match_id, pick, points')
      .eq('user_id', aliceId)

    const aliceBrazil = preds?.find(p => p.match_id === brazilMatch.id)
    const aliceFrance = preds?.find(p => p.match_id === franceMatch.id)

    expect(aliceBrazil?.pick).toBe('1')
    expect(aliceBrazil?.points).toBeNull()
    expect(aliceFrance?.pick).toBe('2')
    expect(aliceFrance?.points).toBeNull()

    // Pikanteria answer
    const { data: pikas } = await admin
      .from('pikanteria')
      .select('id, pikanteria_options(id, label)')
      .eq('match_day_id', matchDay.id)
      .single()
    const yesOption = (pikas?.pikanteria_options as { id: string; label: string }[])
      .find(o => o.label === 'Yes')!

    const { data: ans } = await admin
      .from('pikanteria_answers')
      .select('option_id, points')
      .eq('user_id', aliceId)
      .single()

    expect(ans?.option_id).toBe(yesOption.id)
    expect(ans?.points).toBeNull()
  })

  test('Bob picks X (draw) and 1 (France) and No on pikanteria', async ({ page }) => {
    await loginAs(page, 'bob@test.local')
    await page.goto('/predict')

    // Pick "X" on Brazil match (draw odds 3.20 — unique)
    await page.getByRole('button').filter({ hasText: '3.20' }).click()

    // Pick "1" on France match (home odds 1.90 — unique)
    await page.getByRole('button').filter({ hasText: '1.90' }).click()

    // Answer pikanteria: No (odds 1.60 — unique)
    await page.getByRole('button').filter({ hasText: '1.60' }).click()

    await page.waitForTimeout(1_000)

    // DB assertions
    const admin = getAdminClient()
    const matches = await getMatches(admin, matchDay.id)
    const brazilMatch = matches.find(m => m.home_team === 'Brazil')!
    const franceMatch = matches.find(m => m.home_team === 'France')!
    const bobId = await getUserId(admin, 'bob@test.local')

    const { data: preds } = await admin
      .from('predictions')
      .select('match_id, pick, points')
      .eq('user_id', bobId)

    expect(preds?.find(p => p.match_id === brazilMatch.id)?.pick).toBe('X')
    expect(preds?.find(p => p.match_id === franceMatch.id)?.pick).toBe('1')
  })
})
```

- [ ] **Step 2: Run**

```bash
npx playwright test e2e/tests/02-predict.spec.ts --project=chromium
```

Expected: `2 passed`

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/02-predict.spec.ts
git commit -m "test(e2e): 02 — Alice and Bob place predictions"
```

---

## Task 9: Test 03 — Lock enforcement

**Files:**
- Create: `e2e/tests/03-lock.spec.ts`

- [ ] **Step 1: Write the test**

Create `e2e/tests/03-lock.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers/auth'
import { resetTransactions } from '../helpers/reset'
import { getAdminClient, getMatchDay, getMatches, getUserId, publishMatchDay } from '../helpers/supabase'

test.describe('03 — Predictions lock after lock_time', () => {
  let matchDay: Awaited<ReturnType<typeof getMatchDay>>

  test.beforeAll(async () => {
    await resetTransactions()
    const admin = getAdminClient()
    matchDay = await getMatchDay(admin)
    await publishMatchDay(admin, matchDay.id)

    // Place Alice's prediction (pick "1" on Brazil match)
    const matches = await getMatches(admin, matchDay.id)
    const brazilMatch = matches.find(m => m.home_team === 'Brazil')!
    const aliceId = await getUserId(admin, 'alice@test.local')
    await admin.from('predictions').upsert(
      { user_id: aliceId, match_id: brazilMatch.id, pick: '1' },
      { onConflict: 'user_id,match_id' }
    )

    // Move lock_time 2 minutes into the past
    await admin
      .from('match_days')
      .update({ lock_time: new Date(Date.now() - 2 * 60 * 1000).toISOString() })
      .eq('id', matchDay.id)
  })

  test('locked banner visible and pick buttons are disabled', async ({ page }) => {
    await loginAs(page, 'alice@test.local')
    await page.goto('/predict')

    // Locked banner
    await expect(page.getByText('Picks are locked for today')).toBeVisible()

    // All pick buttons should be disabled
    const buttons = page.getByRole('button').filter({ hasText: /^[1X2]$/ })
    const count = await buttons.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      await expect(buttons.nth(i)).toBeDisabled()
    }
  })

  test('Alice pick in DB unchanged after lock', async ({ page }) => {
    const admin = getAdminClient()
    const matches = await getMatches(admin, matchDay.id)
    const brazilMatch = matches.find(m => m.home_team === 'Brazil')!
    const aliceId = await getUserId(admin, 'alice@test.local')

    const { data } = await admin
      .from('predictions')
      .select('pick')
      .eq('user_id', aliceId)
      .eq('match_id', brazilMatch.id)
      .single()

    expect(data?.pick).toBe('1')
  })
})
```

- [ ] **Step 2: Run**

```bash
npx playwright test e2e/tests/03-lock.spec.ts --project=chromium
```

Expected: `2 passed`

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/03-lock.spec.ts
git commit -m "test(e2e): 03 — lock enforcement after lock_time passes"
```

---

## Task 10: Test 04 — Admin enters results and scores are calculated

**Files:**
- Create: `e2e/tests/04-results.spec.ts`

- [ ] **Step 1: Write the test**

Create `e2e/tests/04-results.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers/auth'
import { resetTransactions } from '../helpers/reset'
import {
  getAdminClient, getMatchDay, getMatches, getUserId, publishMatchDay
} from '../helpers/supabase'

test.describe('04 — Admin enters results and points are calculated', () => {
  let matchDay: Awaited<ReturnType<typeof getMatchDay>>

  test.beforeAll(async () => {
    await resetTransactions()
    const admin = getAdminClient()
    matchDay = await getMatchDay(admin)
    await publishMatchDay(admin, matchDay.id)

    // Place predictions for Alice and Bob
    const matches = await getMatches(admin, matchDay.id)
    const brazilMatch = matches.find(m => m.home_team === 'Brazil')!
    const franceMatch = matches.find(m => m.home_team === 'France')!
    const aliceId = await getUserId(admin, 'alice@test.local')
    const bobId   = await getUserId(admin, 'bob@test.local')

    await admin.from('predictions').upsert([
      { user_id: aliceId, match_id: brazilMatch.id, pick: '1' },
      { user_id: aliceId, match_id: franceMatch.id, pick: '2' },
      { user_id: bobId,   match_id: brazilMatch.id, pick: 'X' },
      { user_id: bobId,   match_id: franceMatch.id, pick: '1' },
    ], { onConflict: 'user_id,match_id' })

    // Place pikanteria answers
    const { data: pikas } = await admin
      .from('pikanteria')
      .select('id, pikanteria_options(id, label)')
      .eq('match_day_id', matchDay.id)
      .single()
    const opts = pikas?.pikanteria_options as { id: string; label: string }[]
    const yesId = opts.find(o => o.label === 'Yes')!.id
    const noId  = opts.find(o => o.label === 'No')!.id

    await admin.from('pikanteria_answers').upsert([
      { user_id: aliceId, pikanteria_id: pikas!.id, option_id: yesId },
      { user_id: bobId,   pikanteria_id: pikas!.id, option_id: noId  },
    ], { onConflict: 'user_id,pikanteria_id' })

    // Move lock_time to past so admin can submit results
    await admin
      .from('match_days')
      .update({ lock_time: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', matchDay.id)
  })

  test('admin submits results — Brazil wins (1), France vs Germany draw (X), red card Yes', async ({ page }) => {
    await loginAs(page, 'admin@test.local')
    await page.goto('/admin/results')

    await expect(page.getByText('Brazil vs Argentina')).toBeVisible()

    // Set match 1 (Brazil vs Argentina) result = 1 (Brazil wins)
    const brazilCard = page.locator('.rounded-xl').filter({ hasText: 'Brazil vs Argentina' })
    await brazilCard.locator('input[value="1"]').check()

    // Set match 2 (France vs Germany) result = X (draw)
    const franceCard = page.locator('.rounded-xl').filter({ hasText: 'France vs Germany' })
    await franceCard.locator('input[value="X"]').check()

    // Set pikanteria winner = Yes
    const pikaCard = page.locator('.rounded-xl').filter({ hasText: 'Will there be a red card?' })
    await pikaCard.locator('label').filter({ hasText: 'Yes' }).locator('input[type="radio"]').check()

    // Submit
    await page.getByRole('button', { name: /Submit Results/ }).click()
    await page.waitForURL('**/admin', { timeout: 15_000 })
  })

  test('Alice points correct: 2.10 (Brazil match) + 0 (France) + 2.50 (pikanteria) = 4.60', async () => {
    const admin = getAdminClient()
    const matches = await getMatches(admin, matchDay.id)
    const brazilMatch = matches.find(m => m.home_team === 'Brazil')!
    const franceMatch = matches.find(m => m.home_team === 'France')!
    const aliceId = await getUserId(admin, 'alice@test.local')

    const { data: preds } = await admin
      .from('predictions')
      .select('match_id, pick, points')
      .eq('user_id', aliceId)

    const aliceBrazil = preds?.find(p => p.match_id === brazilMatch.id)
    const aliceFrance = preds?.find(p => p.match_id === franceMatch.id)

    // Alice picked 1 (Brazil wins) → correct → 2.10 × 1 (group) = 2.10
    expect(Number(aliceBrazil?.points)).toBe(2.10)
    // Alice picked 2 (Germany) → draw happened → 0
    expect(Number(aliceFrance?.points)).toBe(0)

    // Pikanteria: Alice picked Yes → correct → 2.50
    const { data: ans } = await admin
      .from('pikanteria_answers')
      .select('points')
      .eq('user_id', aliceId)
      .single()
    expect(Number(ans?.points)).toBe(2.50)
  })

  test('Bob points correct: 0 + 0 + 0 = 0', async () => {
    const admin = getAdminClient()
    const matches = await getMatches(admin, matchDay.id)
    const brazilMatch = matches.find(m => m.home_team === 'Brazil')!
    const franceMatch = matches.find(m => m.home_team === 'France')!
    const bobId = await getUserId(admin, 'bob@test.local')

    const { data: preds } = await admin
      .from('predictions')
      .select('match_id, points')
      .eq('user_id', bobId)

    // Bob picked X (draw) for Brazil match → Brazil won → 0
    expect(Number(preds?.find(p => p.match_id === brazilMatch.id)?.points)).toBe(0)
    // Bob picked 1 (France) for France match → draw → 0
    expect(Number(preds?.find(p => p.match_id === franceMatch.id)?.points)).toBe(0)

    const { data: ans } = await admin
      .from('pikanteria_answers')
      .select('points')
      .eq('user_id', bobId)
      .single()
    // Bob picked No → Yes was correct → 0
    expect(Number(ans?.points)).toBe(0)
  })
})
```

- [ ] **Step 2: Run**

```bash
npx playwright test e2e/tests/04-results.spec.ts --project=chromium
```

Expected: `3 passed`

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/04-results.spec.ts
git commit -m "test(e2e): 04 — results scoring, point calculations verified"
```

---

## Task 11: Test 05 — Leaderboard

**Files:**
- Create: `e2e/tests/05-leaderboard.spec.ts`

- [ ] **Step 1: Write the test**

Create `e2e/tests/05-leaderboard.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'
import { loginAs } from '../helpers/auth'
import { resetTransactions } from '../helpers/reset'
import {
  getAdminClient, getMatchDay, getMatches, getUserId, publishMatchDay
} from '../helpers/supabase'
import { calcMatchPoints, calcPicanteriaPoints } from '../../lib/scoring'

test.describe('05 — Leaderboard shows correct standings', () => {
  let matchDay: Awaited<ReturnType<typeof getMatchDay>>

  test.beforeAll(async () => {
    await resetTransactions()
    const admin = getAdminClient()
    matchDay = await getMatchDay(admin)
    const { pikaId, yesId, noId } = await publishMatchDay(admin, matchDay.id)
    const matches = await getMatches(admin, matchDay.id)
    const brazilMatch = matches.find(m => m.home_team === 'Brazil')!
    const franceMatch = matches.find(m => m.home_team === 'France')!
    const aliceId = await getUserId(admin, 'alice@test.local')
    const bobId   = await getUserId(admin, 'bob@test.local')

    // Place predictions
    await admin.from('predictions').upsert([
      { user_id: aliceId, match_id: brazilMatch.id, pick: '1' },
      { user_id: aliceId, match_id: franceMatch.id, pick: '2' },
      { user_id: bobId,   match_id: brazilMatch.id, pick: 'X' },
      { user_id: bobId,   match_id: franceMatch.id, pick: '1' },
    ], { onConflict: 'user_id,match_id' })

    // Place pikanteria answers
    await admin.from('pikanteria_answers').upsert([
      { user_id: aliceId, pikanteria_id: pikaId, option_id: yesId },
      { user_id: bobId,   pikanteria_id: pikaId, option_id: noId  },
    ], { onConflict: 'user_id,pikanteria_id' })

    // Move lock_time to past
    await admin
      .from('match_days')
      .update({ lock_time: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', matchDay.id)

    // Score results: Brazil wins (1), France vs Germany draw (X), pikanteria Yes
    await admin.from('matches').update({ result: '1' }).eq('id', brazilMatch.id)
    await admin.from('matches').update({ result: 'X' }).eq('id', franceMatch.id)

    // Score Alice's predictions
    const alicePts = {
      brazil: calcMatchPoints(brazilMatch.odds_home, 'group', true),   // 2.10
      france: calcMatchPoints(franceMatch.odds_away, 'group', false),  // 0
    }
    await admin.from('predictions')
      .update({ points: alicePts.brazil })
      .eq('user_id', aliceId).eq('match_id', brazilMatch.id)
    await admin.from('predictions')
      .update({ points: alicePts.france })
      .eq('user_id', aliceId).eq('match_id', franceMatch.id)

    // Score Bob's predictions (all wrong → 0)
    await admin.from('predictions')
      .update({ points: 0 })
      .eq('user_id', bobId).eq('match_id', brazilMatch.id)
    await admin.from('predictions')
      .update({ points: 0 })
      .eq('user_id', bobId).eq('match_id', franceMatch.id)

    // Score pikanteria (Yes correct = 2.50, No wrong = 0)
    await admin.from('pikanteria_options').update({ is_correct: true }).eq('id', yesId)
    const alicePikaPts = calcPicanteriaPoints(2.50, true)  // 2.50
    await admin.from('pikanteria_answers')
      .update({ points: alicePikaPts }).eq('user_id', aliceId).eq('pikanteria_id', pikaId)
    await admin.from('pikanteria_answers')
      .update({ points: 0 }).eq('user_id', bobId).eq('pikanteria_id', pikaId)
  })

  test('leaderboard shows Alice ranked above Bob with correct totals', async ({ page }) => {
    await loginAs(page, 'alice@test.local')
    await page.goto('/leaderboard')

    await expect(page.getByText('Leaderboard')).toBeVisible()

    // Alice total = 2.10 + 2.50 = 4.60
    // Bob total = 0
    // The leaderboard view returns rows ordered by total_points desc
    const rows = page.locator('text=Alice, text=Bob').locator('..')
    // Use DB assertion for exact values (more reliable than scraping rendered text)
    const admin = getAdminClient()
    const { data: entries } = await admin
      .from('leaderboard')
      .select('display_name, total_points')
      .in('display_name', ['Alice', 'Bob'])

    const alice = entries?.find(e => e.display_name === 'Alice')
    const bob   = entries?.find(e => e.display_name === 'Bob')

    expect(Number(alice?.total_points)).toBe(4.60)
    expect(Number(bob?.total_points)).toBe(0)

    // Alice ranked above Bob
    expect(Number(alice?.total_points)).toBeGreaterThan(Number(bob?.total_points))
  })

  test('leaderboard page renders Alice before Bob in DOM order', async ({ page }) => {
    await loginAs(page, 'alice@test.local')
    await page.goto('/leaderboard')
    await page.waitForTimeout(500) // let real-time subscription settle

    const allText = await page.locator('body').innerText()
    const alicePos = allText.indexOf('Alice')
    const bobPos   = allText.indexOf('Bob')

    expect(alicePos).toBeGreaterThan(-1)
    expect(bobPos).toBeGreaterThan(-1)
    expect(alicePos).toBeLessThan(bobPos)
  })
})
```

- [ ] **Step 2: Run**

```bash
npx playwright test e2e/tests/05-leaderboard.spec.ts --project=chromium
```

Expected: `2 passed`

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/05-leaderboard.spec.ts
git commit -m "test(e2e): 05 — leaderboard standings and point totals"
```

---

## Task 12: Full suite run and verification

- [ ] **Step 1: Ensure local Supabase is running**

```bash
supabase status
```

If not running: `supabase start`

- [ ] **Step 2: Run complete suite**

```bash
npm run test:e2e
```

This runs `supabase db reset && playwright test`. Expected output:

```
Running 8 tests using 1 worker

  ✓ 01 — Admin publishes match day › admin fills publish form ...
  ✓ 02 — Users place predictions › Alice picks 1 ...
  ✓ 02 — Users place predictions › Bob picks X ...
  ✓ 03 — Predictions lock after lock_time › locked banner visible ...
  ✓ 03 — Predictions lock after lock_time › Alice pick in DB unchanged ...
  ✓ 04 — Admin enters results › admin submits results ...
  ✓ 04 — Admin enters results › Alice points correct ...
  ✓ 04 — Admin enters results › Bob points correct ...
  ✓ 05 — Leaderboard › shows Alice ranked above Bob ...
  ✓ 05 — Leaderboard › renders Alice before Bob in DOM ...

  10 passed (45s)
```

- [ ] **Step 3: If any test fails, debug with headed mode**

```bash
npx playwright test --headed --project=chromium
```

Or inspect the trace:
```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "test(e2e): full suite passing — admin publish → predict → lock → results → leaderboard"
```

---

## Troubleshooting

**`signInWithPassword` returns 400 "Email not confirmed"**
→ Check `supabase/config.toml` has `enable_confirmations = false` under `[auth.email]`, then run `supabase stop && supabase start`.

**Middleware redirects test user to `/login` despite cookie**
→ The cookie name may differ. Navigate to any page as Alice in `--headed` mode, open DevTools → Application → Cookies. Find the `supabase.auth.token` cookie and confirm the name matches `supabase.auth.token` exactly.

**Publish page shows "No unpublished draft found"**
→ Run `supabase db reset` to re-seed today's match day. The seed uses `CURRENT_DATE` so must be run on the same day as the test.

**`supabase db reset` fails with migration errors**
→ Check if the migration files reference the `r32` stage check — migration `003_add_r32_stage.sql` modifies the constraint. Make sure migrations run in numeric order.
