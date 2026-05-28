# E2E Test Suite — Full App Flow

**Date**: 2026-05-28
**Branch**: `claude/e2e-app-flow-test-zyF6X`

## Goal

Verify the complete betting game flow end-to-end before releasing to friends and family:
admin publishes a match day → users log in and place bets → admin enters results → leaderboard shows correct scores.

## Approach

Headless Playwright against a local Supabase instance (Docker). Auth uses the real magic-link flow with Inbucket (local Supabase's built-in email catcher) to retrieve links without modifying the app. Zero changes to production code.

## Infrastructure

### Local Supabase
- Start: `supabase start` (Docker)
- Postgres on port 54322, Auth+REST on 54321, Inbucket on 54324
- `supabase db reset` applies all migrations and the test seed before each full run

### Environment
`.env.test.local` pointing at local Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
```

### Next.js dev server
Started once before the test suite with `DOTENV_CONFIG_PATH=.env.test.local npm run dev`, killed after.

## Test Seed

Applied by `supabase db reset` via `supabase/seed.sql`:

**Users**
| email | is_admin |
|---|---|
| `admin@test.local` | true |
| `alice@test.local` | false |
| `bob@test.local` | false |

**Match day** — today's date, stage `group`, 2 matches, 1 pikanteria question (2 options)

| Match | home_team | away_team | odds_home | odds_draw | odds_away |
|---|---|---|---|---|---|
| 1 | Brazil | Argentina | 2.10 | 3.20 | 3.50 |
| 2 | France | Germany | 1.90 | 3.40 | 3.80 |

Pikanteria: "Will there be a red card?" — Yes (2.50, sort_order 0) / No (1.60, sort_order 1)

Match day starts as a **draft** (`published_at = null`) so the admin-publish test exercises the real publish flow.

## Auth Strategy

`loginAs(page, email)` helper (used in every test):
1. POST to Supabase local auth to trigger magic link for `email`
2. GET `http://localhost:54324/api/v1/mailbox/{email}/messages` until message arrives
3. Extract the magic link URL from the email body
4. `page.goto(magicLinkUrl)` — lands on `/auth/callback`, sets session cookies
5. Wait for redirect to home page

## Test Isolation

Between tests, a `resetTransactions()` helper clears only mutable state:
- `predictions` — truncate
- `pikanteria_answers` — truncate
- `match.result` + `predictions.points` + `pikanteria_answers.points` — set to null
- `match_days.published_at` — set to null (re-draft)
- `match_days.lock_time` — reset to 2 hours in future

Users and match/pikanteria structure persist across tests (no re-seeding needed between tests).

## Test Scenarios

### Test 1 — Admin publishes a match day
- Login as `admin@test.local`
- Navigate to `/admin/publish?date=<today>`
- Verify both matches appear with pre-filled odds
- Fill pikanteria question 1 with "Will there be a red card?", options Yes/No with odds
- Click "Publish Match Day"
- Assert redirect to `/admin/results`
- Assert DB: `match_days.published_at` is not null for today's match day

### Test 2 — Users place predictions (before lock)
- Login as Alice → `/predict`
- Assert both matches are visible
- Pick `1` (Brazil) on match 1, `2` (Germany) on match 2
- Answer pikanteria: Yes
- Login as Bob → `/predict`
- Pick `X` (draw) on match 1, `1` (France) on match 2
- Answer pikanteria: No
- Assert DB: both users have predictions with correct `pick` values, `points = null`

### Test 3 — Predictions lock after lock time
- Directly set `match_days.lock_time` to 1 minute in the past via service client
- Login as Alice → `/predict`
- Assert locked banner is visible
- Assert pick buttons are disabled (not clickable)
- Assert DB: Alice's existing picks unchanged

### Test 4 — Admin enters results and scores are calculated
- Login as admin → `/admin/results`
- Set match 1 result = `1` (Brazil wins)
- Set match 2 result = `X` (draw)
- Set pikanteria winner = Yes
- Click "Submit Results & Score All"
- Assert redirect to `/admin`
- Assert DB predictions points:
  - Alice match 1: `2.10 × 1 = 2.10` ✓ (picked 1, correct)
  - Alice match 2: `0` (picked 2, draw happened)
  - Bob match 1: `0` (picked X, Brazil won)
  - Bob match 2: `0` (picked 1, draw happened)
- Assert DB pikanteria points:
  - Alice: `2.50` ✓ (picked Yes, correct)
  - Bob: `0` (picked No)

### Test 5 — Leaderboard reflects correct standings
- Navigate to `/leaderboard` (as any logged-in user)
- Assert Alice's total = `2.10 + 2.50 = 4.60`
- Assert Bob's total = `0`
- Assert Alice is ranked above Bob

## Expected Points Summary

| User | Match 1 | Match 2 | Pikanteria | Total |
|---|---|---|---|---|
| Alice | 2.10 | 0 | 2.50 | **4.60** |
| Bob | 0 | 0 | 0 | **0** |

## File Structure

```
e2e/
├── playwright.config.ts       # Base URL, browser, timeouts
├── helpers/
│   ├── auth.ts                # loginAs() — magic link via Inbucket
│   ├── reset.ts               # resetTransactions() — between-test cleanup
│   └── supabase.ts            # Admin client for direct DB assertions
└── tests/
    ├── 01-publish.spec.ts
    ├── 02-predict.spec.ts
    ├── 03-lock.spec.ts
    ├── 04-results.spec.ts
    └── 05-leaderboard.spec.ts
```

## Running the Suite

```bash
# One-time: start local Supabase
supabase start

# Before each full run: reset DB + apply seed
supabase db reset

# Run tests (starts Next.js automatically via webServer config)
npm run test:e2e

# After: stop local Supabase
supabase stop
```

`package.json` will have:
```json
"test:e2e": "playwright test"
```

Playwright's `webServer` config starts `next dev` with `.env.test.local` before the tests run and kills it after.
