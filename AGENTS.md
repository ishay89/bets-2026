# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Git Workflow — MANDATORY

**Every code change must follow this workflow. No exceptions.**

1. **Create a new branch** from main before making any changes. Name it descriptively (e.g. `feature/add-login`, `fix/scoring-bug`).
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
```

## Architecture Overview

**Mondial Bets 2026** is a real-time FIFA World Cup 2026 betting game built with Next.js 16, React 19, and Supabase. Players make predictions on match outcomes and bonus questions (Pikanteria), earn points based on odds and tournament stage, and compete on a live leaderboard.

### Tech Stack

- **Framework**: Next.js 16 (App Router with SSR)
- **UI**: React 19, Tailwind CSS 4
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Auth**: Supabase Auth (magic link / OAuth)
- **Testing**: Vitest (scoring logic tests)
- **Linting**: ESLint 9 with Next.js config
- **TypeScript**: Strict mode enabled

### Key Architecture Decisions

#### Page Routes (App Router)

The app uses Next.js App Router with this structure:
- `/` — Home page with leaderboard mini-view, today's matches, countdown to lock time
- `/login` — Auth entry point (redirects authenticated users home)
- `/auth/callback` — Supabase OAuth callback handler
- `/predict` — Make/view predictions for today's matches
- `/pre-tournament` — One-time picks for tournament winner and top scorer
- `/history` — View past predictions and results
- `/leaderboard` — Full leaderboard with all players
- `/profile` — User profile/settings
- `/h2h` — Head-to-head player comparison selector
- `/h2h/[opponentId]` — Detailed H2H comparison against a specific opponent
- `/admin/*` — Admin-only pages (guarded by `assertAdmin()` in layout + each Server Action)
  - `/admin/players` — Manage users
  - `/admin/players/[userId]` — Per-user prediction status
  - `/admin/tournament` — Create match days and matches
  - `/admin/edit` — Edit existing match days and matches
  - `/admin/publish` — Publish drafts to make them playable
  - `/admin/results` — Enter match results and calculate points
  - `/admin/scores` — Score validation and recalculation
  - `/admin/audit` — View prediction audit log

#### Middleware Authentication (proxy.ts)

`proxy.ts` implements edge middleware that:
- Redirects unauthenticated users to `/login` (except `/auth/*`)
- Guards `/admin/*` routes (checks `is_admin` flag in users table)
- Uses Supabase SSR client to validate session via cookies

All routes except auth/login require authentication.

> **IMPORTANT — Next.js 16 naming**: In Next.js 16, the middleware file is `proxy.ts` (not `middleware.ts`). Do **not** create a `middleware.ts` file — having both files simultaneously causes a hard build error: `Both middleware file and proxy file are detected. Please use proxy.ts only.`

For programmatic admin checks inside Server Components and Server Actions, use the `assertAdmin()` helper from `lib/supabase/server.ts` — it calls `getUser()` and redirects to `/login` or `/` on failure.

#### Data Model & Scoring

**Core Tables**:
- `users` — Player profiles (id, email, display_name, is_admin, is_monkey, created_at)
- `match_days` — Tournament days (date, stage, lock_time, published_at status)
- `matches` — Individual matches (home/away teams, odds, result)
- `predictions` — Player picks per match (1=home win, X=draw, 2=away win)
- `pikanteria` — Daily bonus questions (yes/no format with odds)
- `pikanteria_answers` — Player answers to bonus questions
- `pre_tournament_picks` — One-time bets on tournament winner and top scorer

**Leaderboard View**: SQL view aggregates all points (predictions + pikanteria + pre-tournament) per player, ordered descending.

**Scoring Logic** (`lib/scoring.ts`):
- Match predictions: `odds × stage_multiplier` (group=1x, r16/qf/3rd=1.5x, sf=2x, final=3x)
- Pikanteria: `odds × 1` (no multiplier)
- Tournament winner: `odds × 1.5` (if correct), `odds × 0.75` (if runner-up), 0 (otherwise)
- Top scorer: `odds × 1` (if correct)
- Points calculated only after admin enters result

#### Authentication & Authorization

- Supabase handles user signup/login with magic links or OAuth
- "Monkey" player (id: 00000000-0000-0000-0000-000000000001) is AI baseline for scoring comparison
- Row Level Security (RLS) enforces:
  - Predictions/pikanteria answers are user-scoped (read all, write own)
  - Match days only visible if `published_at IS NOT NULL`
  - Admins have unrestricted access (not enforced by RLS, but by middleware)
- **`assertAdmin()`** in `lib/supabase/server.ts` — call at the top of every admin Server Action and admin layout to verify the user is authenticated and has `is_admin = true`; redirects to `/login` or `/` on failure
- **Server Components**: after `supabase.auth.getUser()`, always check `if (!user) redirect('/login')` before using `user.id` — never use `user!.id`

**Environment Variables Required**:
```
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # For server-side admin operations
```

#### Real-Time Components

`components/leaderboard-realtime.tsx` uses Supabase's real-time subscription API to listen for prediction/answer changes and update leaderboard live during a match day.

### Directory Structure

```
app/                    # Next.js app router pages
├── admin/              # Admin pages (all guarded by assertAdmin())
│   ├── layout.tsx      # Shared admin layout with nav; calls assertAdmin()
│   ├── page.tsx        # Admin dashboard
│   ├── audit/          # Prediction audit log
│   ├── edit/           # Edit match days and matches
│   ├── players/        # Manage users
│   │   └── [userId]/   # Per-user prediction status
│   ├── publish/        # Publish draft match days
│   ├── results/        # Enter match results
│   ├── scores/         # Score validation and recalculation
│   └── tournament/     # Create match days and matches
├── auth/callback/      # Supabase OAuth callback handler
├── h2h/                # Head-to-head comparison selector
│   └── [opponentId]/   # Detailed H2H stats page
├── history/            # Past predictions and results
├── leaderboard/        # Full live leaderboard
├── login/              # Auth entry point
├── predict/            # Make/view daily predictions
├── pre-tournament/     # One-time tournament picks
├── profile/            # User profile and stats
├── layout.tsx          # Root layout with metadata
└── page.tsx            # Home page (mini leaderboard + today's matches)

components/             # Reusable React components
├── admin-nav.tsx       # Admin section navigation bar
├── bottom-nav.tsx      # Mobile bottom navigation
├── crowd-insight.tsx   # Crowd pick distribution display
├── leaderboard.tsx     # Leaderboard table component
├── leaderboard-realtime.tsx  # Live leaderboard with Supabase subscription
├── lock-timer.tsx      # Countdown to pick lock time
├── match-card.tsx      # Match display with odds and pick UI
├── pikanteria-builder.tsx    # Admin: pikanteria question builder
├── pikanteria-card.tsx # Pikanteria side-bet card
└── theme-toggle.tsx    # Light/dark theme switcher

lib/
├── audit.ts            # Audit event writing helpers
├── crowd.ts            # Crowd pick aggregation and insight logic
├── display.ts          # Shared display/formatting utilities
├── h2h.ts              # Head-to-head comparison calculations
├── lock.ts             # Match lock-time helpers (5 min before kickoff)
├── monkey.ts           # Monkey AI pick logic
├── pre-tournament.ts   # Pre-tournament pick helpers and guards
├── score-validation.ts # Score integrity validation
├── scoring.ts          # Point calculation functions
├── team-theme.ts       # Winner team dynamic theme tokens
├── types.ts            # TypeScript interfaces (User, Match, Prediction, etc.)
└── supabase/
    ├── server.ts       # Server-side Supabase client; exports createClient(),
    │                   # createAdminClient(), createServiceClient(), assertAdmin()
    └── client.ts       # Browser-side Supabase client

supabase/
├── config.toml                 # Supabase CLI project config (fill in project_id)
└── migrations/
    ├── 001_schema.sql              # Create all tables and leaderboard view
    ├── 002_rls.sql                 # Enable RLS policies
    ├── 003_add_r32_stage.sql       # Add r32 stage
    ├── 004_score_snapshots.sql     # Score snapshot table
    ├── 005_leaderboard_today_points.sql
    ├── 006_pikanteria_options.sql  # N-option pikanteria support
    ├── 007_user_prediction_audit_events.sql
    ├── 008_automated_marker_users.sql
    ├── 009_match_locking.sql       # Per-match lock flag
    ├── 010_crowd_picks.sql         # Crowd pick RPCs
    └── 011_atomic_scoring.sql      # Atomic scoring write path

public/                 # Static assets

proxy.ts                # Next.js 16 middleware (auth guard + session refresh)
tsconfig.json           # TypeScript config with @ path alias
next.config.ts          # Next.js config
eslint.config.mjs       # ESLint rules
postcss.config.mjs      # Tailwind CSS PostCSS config
vitest.config.ts        # Vitest config
package.json            # Dependencies and scripts
```

### Testing

Tests are in `lib/*.test.ts` files. Vitest is configured with React support via `@vitejs/plugin-react`.

Test files:
- `lib/scoring.test.ts` — point calculations for all stages, rounding
- `lib/crowd.test.ts` — crowd pick aggregation and percentage logic
- `lib/h2h.test.ts` — head-to-head comparison calculations
- `lib/lock.test.ts` — match lock-time logic
- `lib/monkey.test.ts` — monkey AI pick strategy
- `lib/pre-tournament.test.ts` — pre-tournament pick helpers
- `lib/team-theme.test.ts` — team theme token mapping
- `lib/audit.test.ts` — audit event deduplication

Run single test file:
```bash
npm test -- lib/scoring.test.ts
```

### Configuration Files

- **tsconfig.json**: Strict mode, @ alias to root, incremental builds
- **next.config.ts**: Empty (can add image optimization, API routes, etc.)
- **postcss.config.mjs**: Tailwind CSS 4 plugin
- **eslint.config.mjs**: ESLint 9 flat config with Next.js/TypeScript rules
- **vitest.config.ts**: Node environment, React plugin

### CSS & Styling

- **Tailwind CSS 4** with custom CSS variables for theming
- Global styles in `app/globals.css`
- Custom color tokens: `--color-accent` (green), `--color-bg`, `--color-panel`, `--color-text`, `--color-muted`, etc.
- Fonts: Inter (body), IBM Plex Mono (monospace), Geist (via next/font)

## Database Setup

1. Create Supabase project (free tier works)
2. Fill in `project_id` in `supabase/config.toml` (Supabase Dashboard → Settings → General)
3. Apply all migrations via the Supabase CLI:
   ```bash
   npm install -g supabase   # install CLI once
   supabase login
   supabase db push          # applies 001 → 011 in order
   ```
   Migrations include automated benchmark users (Monkey, Always Max, Always Mid, Always Min) — no manual seed needed.
4. Set environment variables in `.env.local` (see Supabase dashboard)

> **Manual fallback**: if the CLI is unavailable, run each file in `supabase/migrations/` in numeric order (001 → 011) via Supabase Dashboard → SQL Editor.

## Development Workflow

### Making Predictions Feature Changes

1. Pages fetch data server-side with `createClient()` from `lib/supabase/server.ts`
2. Add real-time listeners in component `useEffect` using browser client from `lib/supabase/client.ts`
3. Updates insert/update predictions via Supabase client (RLS enforces user_id = auth.uid())
4. Lock time is checked in the component (server calculates, UI shows countdown)

### Adding Tournament Stages & Matches

1. Create match_day record with stage, date, lock_time, published_at (null = draft)
2. Insert match records under that match_day
3. Set odds for each match
4. Admin publishes match_day (sets published_at), making it visible to players
5. After kickoff, admin enters results (1/X/2) and system auto-calculates points

### Updating Scoring Rules

1. Modify `STAGE_MULTIPLIERS` or calculation functions in `lib/scoring.ts`
2. Update tests in `lib/scoring.test.ts`
3. Admin runs "recalculate" endpoint (if implemented) or manually updates predictions.points in DB

## Common Issues

- **Build error "Both middleware file and proxy file are detected"**: Do NOT create `middleware.ts` — Next.js 16 uses `proxy.ts` as its middleware file. Delete `middleware.ts` if it exists.
- **401 Unauthorized on admin routes**: Ensure user has `is_admin = true` in users table; check `assertAdmin()` is called in the layout and each Server Action
- **Predictions not appearing**: Check match_day has `published_at IS NOT NULL`
- **Lock time shows negative**: Verify match_day.lock_time is in future; UI clamps to 0
- **Points not calculated**: Admin must enter result (1/X/2) in matches table; points trigger on result entry
- **Server crash / forced reload**: Never use `user!.id` in Server Components — always guard with `if (!user) redirect('/login')` after `getUser()`
