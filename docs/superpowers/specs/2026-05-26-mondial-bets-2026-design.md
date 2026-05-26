# Mondial Bets 2026 — Design Spec

_Date: 2026-05-26_

---

## Overview

A free, mobile-first web app for a group betting game on the FIFA World Cup 2026. Friends open a URL in any browser, sign in with Google, and submit daily match predictions for points. No app store, no download, no cost.

**URL:** `mondial-bets-2026.vercel.app` (free Vercel subdomain)  
**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + Realtime) · Vercel (hosting)  
**Cost:** $0 — all free tiers  
**Participants:** 25–30 people  
**Tournament:** FIFA World Cup 2026 (~1 month)

---

## Rules (same as Euro 2024)

### Entry & Prizes
- Entry fee: ₪200/person (collected outside the app via PayBox)
- **Penalties:** Last place pays +₪200 · Second-to-last pays +₪100
- **Prizes:** 1st = 70% · 2nd = 30% · 3rd = ₪300 (from penalty pool)
- Tie-breaking: tied players split the combined prize equally

### Scoring

**Pre-tournament picks (one-time, before first match):**
- Tournament winner: odds from Winner site × 1.5 if correct, × 0.75 if runner-up
- Top scorer: exact odds from Winner site

**Daily match predictions (1/X/2):**
| Stage | Multiplier |
|---|---|
| Group stage | ×1 |
| Round of 16 & Quarter-finals | ×1.5 |
| Semi-finals | ×2 |
| Third-place match | ×1.5 |
| Final | ×3 |

Points = odds × stage multiplier (only for correct predictions)

**Pikanteria (bonus side bets):**
- Daily yes/no predictions (e.g. "Mbappé scores?", "Over 2.5 goals")
- Multiplier: ×1
- Available through quarter-finals only (not semi-finals or final)

**The Monkey:** A ghost participant making random auto-predictions. Predictions are generated server-side with a fixed seed at the start of each match day (before the lock), so they're reproducible but unpredictable to players. Visible on leaderboard for fun but excluded from prizes and penalty payments.

### Prediction Locking
- Locks automatically **30 minutes before the first match of the day**
- After lock: no edits allowed

---

## Architecture

```
Browser (mobile/desktop)
    │
    ▼
Next.js App Router (Vercel)
    │  ├── /                    Home / leaderboard
    │  ├── /predict             Daily prediction form
    │  ├── /history             Past predictions & scores
    │  ├── /profile             Personal score breakdown
    │  ├── /pre-tournament      Winner + top scorer picks
    │  └── /admin/*             Admin panel (role-gated)
    │
    ▼
Supabase
    ├── Auth (Google OAuth)
    ├── Postgres (all data)
    └── Realtime (leaderboard live updates)
```

### Key data tables

| Table | Purpose |
|---|---|
| `users` | Player profiles, Google identity, admin flag |
| `match_days` | Each day's matches with kickoff time and lock time |
| `matches` | Individual matches with teams, stage, odds |
| `pikanteria` | Bonus side-bet questions per day |
| `predictions` | Each player's 1/X/2 pick per match |
| `pikanteria_answers` | Each player's yes/no per pikanteria question |
| `pre_tournament_picks` | Winner + top scorer picks per player |
| `match_results` | Admin-entered outcomes (triggers scoring) |
| `scores` | Computed points per player per match (derived on result entry) |

---

## Screens

### Player screens
| Screen | Description |
|---|---|
| **Login** | Google sign-in button; first login auto-registers player |
| **Home** | Live leaderboard with podium (top 3), full list, danger zone (last 2), your position always highlighted |
| **Predict** | Today's matches with 1/X/2 buttons + pikanteria; lock countdown prominent; auto-locks at cutoff |
| **History** | Past days' predictions with result and points earned |
| **Profile** | Score breakdown (matches / pikanteria / pre-tournament bonus) |
| **Pre-tournament** | One-time winner + top scorer picks with odds dropdowns |

### Admin screens (role-gated)
| Screen | Description |
|---|---|
| **Publish form** | Add today's matches (teams, odds, kickoff time) and pikanteria questions |
| **Enter results** | Record match outcomes and pikanteria answers after games; triggers auto-scoring |
| **Manage players** | View all registered players, assign/remove admin role, view the Monkey |

---

## Visual Design

- **Theme:** Dark sports (dark background `#0f172a`, green accent `#22c55e`)
- **Mobile-first:** Bottom navigation bar on mobile; sidebar on desktop
- **Leaderboard:** Podium view for top 3, scrollable list for the rest, danger zone highlighted in red at the bottom
- **Prediction form:** 1/X/2 buttons per match; selected = green highlighted; lock timer shown prominently
- **Typography:** System font stack; numbers in bold green for scores

---

## Authentication & Authorization

- Google OAuth via Supabase Auth — one-click sign in
- First login auto-creates a player record
- Admin flag stored on the `users` table
- Initial admins bootstrapped via `ADMIN_EMAILS` environment variable (comma-separated); any user whose Google email matches gets admin on first login
- Additional admins can be promoted via the Manage Players screen by an existing admin
- Admin routes protected server-side in Next.js middleware
- No self-registration control needed — anyone with the link can join (by design)

---

## Scoring Engine

Scoring runs server-side (Next.js API route or Supabase function) when an admin submits results:

1. For each match result entered:
   - Find all predictions for that match
   - Compare player pick vs result (1/X/2)
   - Correct picks: `points = odds × stage_multiplier`
   - Wrong picks: 0 points
2. For each pikanteria answer:
   - Compare player answer vs correct answer
   - Correct: `points = odds × 1`
3. Pre-tournament bonuses calculated when admin marks the tournament winner and top scorer in the admin panel (a dedicated one-time action, separate from daily result entry)
4. Write computed points to `scores` table
5. Leaderboard re-read from `scores` aggregated by player — Supabase Realtime pushes update to all connected clients

---

## Deployment

- **Hosting:** Vercel (free Hobby plan) — auto-deploys from GitHub
- **Database:** Supabase (free plan) — stays active throughout the tournament due to daily user activity
- **Domain:** `mondial-bets-2026.vercel.app` (free) or custom domain if desired later
- **Environment variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

---

## Out of Scope

- Push notifications (WhatsApp group serves this role)
- Payment processing (handled via PayBox externally)
- Automatic odds fetching from Winner (admin enters manually)
- Match schedule auto-population (admin creates match days manually)
