# Mondial Bets 2026 Styling Guide

## Brand Feel

Mondial Bets should feel like a private World Cup betting app made for friends: loud enough to screenshot in a group chat, clean enough to use every match day, and unmistakably football-first.

The direction is **stadium betting slip**:
- Dark pitch background, floodlights, lime field-line accents, gold payout moments.
- Compact mobile-first screens that feel like slips, tables, and match cards rather than marketing pages.
- Original soccer artwork only: use the local ball and striker/stadium illustrations instead of remote celebrity photos.

## Core Assets

- `/public/soccer-ball.svg` — ball mark for logos, empty states, and match dividers.
- `/public/superstar-striker.svg` — generic star-player hero artwork for login, home, and big tournament moments.
- `/public/stadium-lights.svg` — stadium atmosphere for headers and podium areas.

These are brand assets. Prefer reusing them before adding new decoration.

## Color Tokens

Use tokens from `app/globals.css`:
- `--color-bg` for the full app background.
- `--color-panel` and `--color-elev` for dark slip/card surfaces.
- `--color-accent` for primary actions and winning states.
- `--color-amber` and `--color-gold` for odds, futures, and prize moments.
- `--color-danger` for locked, penalty, and bottom-table states.

Do not create one-off blues or purples. If a new state is needed, add a named token.

## Components

Use the shared classes in `app/globals.css`:
- `.app-shell` for page roots.
- `.stadium-header` for top bars.
- `.stadium-panel` for leaderboard/podium areas.
- `.superstar-panel` for hero moments.
- `.bet-card` for match cards, pikanteria cards, and dark panels.
- `.ticket-card` for prize/pot/betting slip moments.
- `.ball-mark` for the soccer ball image treatment.
- `.odds-chip` for compact odds/status badges.

Cards should stay tight, scannable, and mobile-friendly. Avoid floating marketing sections.

## Copy Tone

Use friendly betting-pool language:
- "Today&apos;s slip"
- "Build my slip"
- "Friend table"
- "Private friends pool"
- "Group chat deadline"

Avoid generic product copy like "dashboard", "experience", or "platform" in player-facing screens.
