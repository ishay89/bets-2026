# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Git Workflow — MANDATORY

**Every code change must follow this workflow. No exceptions.**

1. **Create a new branch** from main before making any changes. Name it descriptively (for example `feature/add-login`, `fix/scoring-bug`, `docs/update-agents-codebase-flow`).
2. **Make changes and commit** on that branch.
3. **Open a Pull Request** targeting main.
4. **Never push directly to main** — all changes go through a PR.

This applies to every task, no matter how small.

## Quick Commands

```bash
npm run dev          # Start Next.js dev server on http://localhost:3000
npm run build        # Build production bundle
npm run start        # Run production server
npm run lint         # Run ESLint on all files
npm test             # Run all tests once (Vitest)
npm run test:watch   # Run tests in watch mode
npm run seed         # Seed 2026 group-stage fixtures into Supabase
npm run gen:types    # Regenerate lib/supabase/types.ts from local Supabase
```

Run a single test file:

```bash
npm test -- lib/scoring.test.ts
```

## Architecture Overview

**Mondial Bets 2026** is a private FIFA World Cup 2026 betting game built with Next.js 16, React 19, Tailwind CSS 4, and Supabase. Players make pre-tournament futures picks, daily match predictions, and pikanteria side bets, then compete against friends and automated benchmark players on a live leaderboard.

### Tech Stack

- **Framework**: Next.js 16 App Router with Server Components and Server Actions
- **UI**: React 19, Tailwind CSS 4, CSS custom-property theming
- **Database**: Supabase PostgreSQL with RLS, SQL views, triggers, RPCs, and Storage
- **Auth**: Supabase Auth, plus app-level player approval/blocking
- **Testing**: Vitest for pure scoring, lock, audit, snapshot, and save helpers
- **Linting**: ESLint 9 with Next.js config
- **TypeScript**: Strict mode enabled, `@/*` path alias to repo root

### Page Routes

- `/` — redirects to `/predict`
- `/login` — auth entry point with Google sign-in
- `/auth/callback` — Supabase OAuth callback handler
- `/pending` — waiting/blocked account screen with sign-out
- `/predict` — primary player surface: futures picks, published match predictions, pikanteria, crowd insights, and lock timers
- `/history` — past picks and results
- `/leaderboard` — full leaderboard
- `/profile` — user profile and stats
- `/board` — message board with user posts, image uploads, and AI recap feed
- `/h2h` — head-to-head player comparison selector
- `/h2h/[opponentId]` — detailed H2H comparison against one opponent
- `/admin/*` — admin-only pages, guarded by `assertAdmin()` in layout and in every Server Action
  - `/admin` — admin dashboard
  - `/admin/publish` — publish or unpublish individual matches/pikanteria for a date; can create and immediately publish pikanteria
  - `/admin/edit` — edit odds, pikanteria, futures lock, match locks, and pikanteria locks for unscored published content
  - `/admin/results` — score/reset individual matches and resolve pikanteria
  - `/admin/tournament` — score tournament winner/top scorer futures
  - `/admin/players` — approve, block, unblock, promote, and demote users
  - `/admin/players/[userId]` — per-user prediction status
  - `/admin/ai-picks` — enter match/pikanteria/futures picks for the AI users (Claude, Codex) and generate benchmark bot futures
  - `/admin/scores` — score snapshot validation and recalculation
  - `/admin/audit` — admin view of prediction audit events

### Authentication, Approval, and Middleware

`proxy.ts` is the Next.js 16 middleware file. Do **not** create `middleware.ts`; having both `proxy.ts` and `middleware.ts` causes a hard build error.

`proxy.ts`:
- Redirects unauthenticated users to `/login`, except `/login` and `/auth/*`
- Reads `users.is_admin` and `users.status`
- Allows admins into `/admin/*`
- Sends pending/blocked non-admin users to `/pending`
- Keeps approved users/admins away from `/pending`
- Refreshes Supabase session cookies via `@supabase/ssr`

`app/layout.tsx` creates a `users` row on first authenticated render if one does not exist. Emails listed in `ADMIN_EMAILS` become approved admins automatically; all other new players start as `pending`.

For Server Components, always check:

```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login')
```

Never use `user!.id` in Server Components.

For admin Server Components and Server Actions, call `assertAdmin()` from `lib/supabase/server.ts` before privileged reads/writes. Use:
- `createClient()` for user-session scoped reads/writes
- `createAdminClient()` for service-role operations that bypass RLS without cookies — required for service_role-only RPCs (scoring, resets)
- `createServiceClient()` only when cookie plumbing is needed; despite the service key, it sends the signed-in user's JWT, so requests run as `authenticated` with RLS enforced — it is NOT a true service-role client

## Data Model

Core tables and views:

- `users` — player profiles, admin flag, automated marker flag/strategy, and `status` (`pending`, `approved`, `blocked`)
- `match_days` — tournament dates, stage, aggregate publish/lock metadata
- `matches` — fixtures, odds, result, per-match lock, per-item `published_at`
- `pikanteria` — side-bet questions in the match 1/X/2 shape: `label_1`/`odds_1`, `label_2`/`odds_2`, optional `label_x`/`odds_x` (null ⇒ two-way, X hidden), admin-entered `result`, per-question lock, per-item `published_at`
- `predictions` — player match picks and scored points
- `pikanteria_answers` — player pikanteria `pick` (`1`/`X`/`2`) and scored points
- `pre_tournament_picks` — futures picks for winner and top scorer
- `tournament_settings` — global futures lock
- `score_snapshots` — per-day and pre-tournament score validation snapshots
- `user_prediction_audit_events` — audit log for committed prediction/futures changes
- `message_board_posts` — user board posts with optional image paths
- `ai_social_posts` — generated recap/commentary posts shown on the board
- `leaderboard` — SQL view aggregating all scored points and today points
- Supabase Storage bucket `message-board-images` — public board image uploads with RLS policies

Automated benchmark users:
- Monkey (`00000000-0000-0000-0000-000000000001`) uses deterministic random picks
- Always Max (`...0002`) chooses highest odds
- Always Mid (`...0003`) chooses median odds
- Always Min (`...0004`) chooses lowest odds

Automated match and pikanteria rows are generated when items are published in `/admin/publish`.

## Scoring and Write Paths

Point math lives in `lib/scoring.ts`:
- Match predictions: plain result odds (no stage multiplier — any weighting is baked into the odds when set)
- Pikanteria: plain result odds (scored exactly like a match, by the winning 1/X/2 outcome)
- Tournament winner: odds `× 1.5` if winner, odds `× 0.75` if runner-up — applied once at tournament close
- Top scorer: odds only
- All point values are rounded to 4 decimals

The ongoing match/pikanteria leaderboard is a straight sum of odds; only the futures bonuses carry multipliers.

Pure builders in `lib/scoring-writes.ts` assemble payloads for atomic scoring RPCs. Keep point math in pure functions and add/update tests when scoring changes.

Prediction save flow:
- `/predict` Server Actions validate IDs/picks with `lib/validation.ts`
- `lib/prediction-saves.ts` calls `save_match_prediction` and `save_pikanteria_answer`
- The SQL RPCs enforce item existence, publication, lock state, and user ownership
- RPC responses normalize to `created`, `updated`, `unchanged`, `locked`, `not_found`, `invalid`, or `error`

Scoring flow:
- `/admin/results` builds match/pikanteria point payloads and calls `enter_match_day_results`
- `/admin/results` reset calls `reset_match_result`
- `/admin/tournament` builds futures point payloads and calls `score_tournament_end`
- Score snapshots are derived after scoring through `lib/score-validation.ts`; they are recoverable and intentionally outside the scoring transaction

Crowd insight flow:
- `/predict` calls `crowd_match_picks` and `crowd_pikanteria_picks`
- RLS/RPC logic reveals aggregate crowd data only after the relevant item is locked

Futures flow:
- The futures UI is part of `/predict` via `components/pre-tournament-futures.tsx`
- Server Actions live in `app/predict/pre-tournament-actions.ts`
- `tournament_settings.futures_locked` blocks edits when set
- The root layout reads the current user's winner pick and applies dynamic team theme variables

Message board flow:
- `/board` loads initial `message_board_posts` and `ai_social_posts`
- `components/board-feed.tsx` handles realtime refresh, client-side image uploads, post creation, and deletion
- Users can delete their own posts; admins can delete any post

## Supabase Migrations

Migrations live in `supabase/migrations/` and must be applied in filename order. The database has evolved beyond the original `001`-`011` files; include `012_atomic_prediction_saves.sql` and all later timestamped migrations.

Important later migrations:
- `012_atomic_prediction_saves.sql` — atomic prediction/pikanteria save RPCs and stricter write policies
- `20260530182900_per_item_publishing.sql` — `matches.published_at`, `pikanteria.published_at`, sync triggers for `match_days`
- `20260530182901_per_item_publish_write_guards.sql` — save guards for per-item publication
- `20260530182902_update_pikanteria.sql` — `update_pikanteria_with_options`
- `20260531000000_tournament_settings_futures_lock.sql` — futures lock table
- `20260601000000_widen_numeric_precision.sql` — widened numeric precision for odds/points
- `20260601000001_reset_match_result_rpc.sql` — atomic result reset
- `20260602000000_player_approval_blocking.sql` — user approval/blocking status and leaderboard filtering
- `20260602174444_independent_bet_locks.sql` — independent match and pikanteria locks
- `20260602193151_message_board.sql` — message board table, Storage bucket, and policies
- `20260602200200_ai_social_posts.sql` — AI recap table
- `20260602204722_admin_delete_message_board_posts.sql` — admin delete policies for posts/images
- `20260604000000_pikanteria_match_model.sql` — **collapses pikanteria into the match 1/X/2 model**: drops `pikanteria_options`, switches `pikanteria_answers.option_id` → `pick`, adds `pikanteria.label_*/odds_*/result`, and rewrites `save_pikanteria_answer`, `enter_match_day_results`, `crowd_pikanteria_picks`, `insert_pikanteria`, `update_pikanteria`, `reset_pikanteria_result`. Destructive (discards existing pikanteria data); safe pre-tournament.

Apply migrations:

```bash
supabase db push
```

Manual fallback: run every SQL file in `supabase/migrations/` in filename order in the Supabase Dashboard SQL Editor. Do not stop at `011`.

After schema changes, regenerate types when a local Supabase instance is available:

```bash
npm run gen:types
```

## Seeding

`scripts/seed-wc2026.ts` inserts the 2026 group-stage `match_days` and `matches` as drafts. It requires:

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Run:

```bash
npm run seed
```

The seed script does not publish matches. Use `/admin/publish` to publish individual matches or pikanteria when ready.

## Testing

Vitest tests are in `lib/*.test.ts`.

Current test focus:
- `lib/scoring.test.ts` — point calculations and rounding
- `lib/scoring-writes.test.ts` — payload builders for atomic scoring RPCs
- `lib/score-validation.test.ts` — score snapshot validity and payloads
- `lib/prediction-saves.test.ts` — save RPC result normalization
- `lib/crowd.test.ts` — crowd pick aggregation and insight logic
- `lib/h2h.test.ts` — head-to-head comparison calculations
- `lib/lock.test.ts` — match lock-time logic
- `lib/monkey.test.ts` — automated benchmark pick strategy
- `lib/pre-tournament.test.ts` — futures pick completion helper
- `lib/team-theme.test.ts` — dynamic team theme token mapping
- `lib/audit.test.ts` — audit event deduplication

Before finishing code changes, run the narrow relevant tests and then `npm run lint` when practical. For docs-only updates, at minimum inspect the diff.

## Styling and UI

Global styles live in `app/globals.css`; additional guidance is in `STYLE_GUIDE.md` and `docs/style-guide.md`.

Key rules:
- Use design tokens (`--color-*`, `--border-*`, `--team-*`) instead of hard-coded colors when possible
- The active champion pick can alter `--color-accent` and related team variables via `lib/team-theme.ts`
- Keep mobile betting screens dense, scannable, and operational
- Main page content usually needs `pb-28` so the bottom nav does not cover controls
- The floating `ThemeToggle` is in the root layout; bottom navigation is page-specific
- Existing UI uses compact betting cards, odds chips, all-caps display labels, and CSS variable inline styles

## Environment Variables

Required for app runtime:

```env
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional:

```env
ADMIN_EMAILS=admin1@example.com,admin2@example.com
NEXT_PUBLIC_GIPHY_API_KEY=...
```

`ADMIN_EMAILS` only affects first-time profile creation in `app/layout.tsx`.
`NEXT_PUBLIC_GIPHY_API_KEY` enables the GIPHY picker on `/board`; without it, users can still write posts and upload images/GIF files.

## Development Notes

- Use `proxy.ts` only for middleware.
- Keep admin Server Actions guarded with `assertAdmin()`.
- Prefer existing helpers in `lib/data.ts`, `lib/validation.ts`, `lib/prediction-saves.ts`, `lib/scoring-writes.ts`, and `lib/score-validation.ts`.
- Do not bypass the prediction save/scoring RPCs with direct table writes unless you are deliberately changing the write path and migrations/tests together.
- Preserve RLS expectations: normal users write their own predictions/answers/posts; service-role clients are for admin-only flows.
- Pikanteria uses the same 1/X/2 model as matches (`label_1`/`odds_1`, `label_2`/`odds_2`, optional `label_x`/`odds_x`, `result`). Author via `insert_pikanteria`/`update_pikanteria`; render with the shared `components/bet-card.tsx`.
- Publication is per item (`matches.published_at`, `pikanteria.published_at`); `match_days.published_at` is synchronized by database triggers.
- Locks are also per item (`matches.locked`, `pikanteria.locked`) plus a separate futures lock.
- If changing leaderboard semantics, update the SQL view migrations and any snapshot validation assumptions together.

## Common Issues

- **Build error "Both middleware file and proxy file are detected"**: Do not create `middleware.ts`; Next.js 16 uses `proxy.ts`.
- **New user stuck on `/pending`**: Approve them in `/admin/players`, or include their email in `ADMIN_EMAILS` before their first profile row is created.
- **Admin cannot access `/admin`**: Ensure `users.is_admin = true` and `users.status = 'approved'`.
- **Predictions not visible/savable**: Check item-level `published_at`, item lock state, and the save RPC response.
- **Crowd picks not visible**: Crowd RPCs reveal data only after locks.
- **Pikanteria answers missing**: A `pick` of `X` is only valid when the question is three-way (`odds_x`/`label_x` set); two-way questions accept only `1`/`2`.
- **Points not updated**: Results must be entered through `/admin/results` or the atomic scoring RPC path.
- **Score snapshot mismatch**: Use `/admin/scores` → Revalidate All, then inspect raw prediction/answer/futures point rows.
- **Message board image failures**: Check the `message-board-images` Storage bucket, file size/type, and Storage policies.
