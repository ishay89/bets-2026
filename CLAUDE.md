# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@STYLE_GUIDE.md

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
- `/admin/*` — Admin-only pages (guarded in `proxy.ts` middleware)
  - `/admin/players` — Manage users
  - `/admin/tournament` — Create match days and matches
  - `/admin/publish` — Publish drafts to make them playable
  - `/admin/results` — Enter match results and calculate points

#### Middleware Authentication (proxy.ts)

`proxy.ts` implements edge middleware that:
- Redirects unauthenticated users to `/login` (except `/auth/*`)
- Guards `/admin/*` routes (checks `is_admin` flag in users table)
- Uses Supabase SSR client to validate session via cookies

All routes except auth/login require authentication.

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
├── admin/              # Admin pages (tournament setup, results)
├── auth/               # Auth routes (callback handler)
├── predict/            # Make predictions
├── pre-tournament/     # Pre-tournament picks
├── leaderboard/        # Full leaderboard
├── history/            # Past predictions
├── profile/            # User profile
├── login/              # Login page
├── layout.tsx          # Root layout with metadata
└── page.tsx            # Home page (leaderboard mini + today's matches)

components/             # Reusable React components
├── match-card.tsx      # Match display with odds
├── leaderboard-realtime.tsx  # Live leaderboard subscriber
├── pikanteria-card.tsx  # Bonus question card
├── lock-timer.tsx      # Countdown to lock time
└── bottom-nav.tsx      # Mobile navigation bar

lib/
├── scoring.ts          # Point calculation functions
├── types.ts            # TypeScript interfaces (User, Match, Prediction, etc.)
├── monkey.ts           # Monkey AI logic
└── supabase/
    ├── server.ts       # Server-side Supabase client (SSR)
    └── client.ts       # Browser-side Supabase client

supabase/
├── migrations/
│   ├── 001_schema.sql  # Create all tables and leaderboard view
│   └── 002_rls.sql     # Enable RLS policies
└── README.md           # Migration setup instructions

public/                 # Static assets

tsconfig.json           # TypeScript config with @ path alias
next.config.ts          # Next.js config
eslint.config.mjs       # ESLint rules
postcss.config.mjs      # Tailwind CSS PostCSS config
vitest.config.ts        # Vitest config
package.json            # Dependencies and scripts
proxy.ts                # Middleware for auth & admin guard
```

### Testing

Tests are in `lib/*.test.ts` files. Vitest is configured with React support via `@vitejs/plugin-react`.

Example: `lib/scoring.test.ts` covers:
- Point calculations for all match stages
- Pikanteria odds calculation
- Pre-tournament winner/runner-up/other scenarios
- Top scorer odds
- Decimal rounding (2 places)

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

### Next.js 16 Breaking Changes

See `AGENTS.md` (and `node_modules/next/dist/docs/`) for the full list. Notable changes relevant here:
- App Router is standard (no pages directory)
- RSC (React Server Components) by default
- Middleware file was renamed from `middleware.ts` → `proxy.ts`; the exported function is named `proxy` (not `middleware`)

## Database Setup

1. Create Supabase project (free tier works)
2. Run migrations in SQL Editor:
   ```sql
   -- First run 001_schema.sql (creates tables + leaderboard view)
   -- Then run 002_rls.sql (enables row level security)
   ```
3. Insert Monkey player for AI baseline:
   ```sql
   insert into auth.users (id, email, role, email_confirmed_at) values
     ('00000000-0000-0000-0000-000000000001', 'monkey@mondial2026.local', 'authenticated', now());
   insert into public.users (id, email, display_name, is_monkey) values
     ('00000000-0000-0000-0000-000000000001', 'monkey@mondial2026.local', '🐒 Monkey', true);
   ```
4. Set environment variables in `.env.local` (see Supabase dashboard)

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

- **401 Unauthorized on admin routes**: Ensure user has `is_admin = true` in users table
- **Predictions not appearing**: Check match_day has `published_at IS NOT NULL`
- **Lock time shows negative**: Verify match_day.lock_time is in future; UI clamps to 0
- **Points not calculated**: Admin must enter result (1/X/2) in matches table; points trigger on result entry

