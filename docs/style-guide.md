# Mondial Bets 2026 Styling Guide

## Direction

Mondial Bets should feel like a private World Cup betting app for friends: sharp, competitive, football-first, and polished enough to share in the group chat.

Use the current visual language:
- Stadium-night dark mode and pitch-day light mode.
- Strong display typography with compact mobile betting surfaces.
- Soccer ball, host flags, odds chips, pitch stripes, podiums, and slip-like cards.
- Friendly betting-pool copy: "picks", "slip", "standings", "locks", "pot", "danger zone".

## Dynamic Winner Theme

After a player makes a pre-tournament champion pick, the app theme should borrow that team&apos;s colors.

Implementation rules:
- Team palettes live in `lib/team-theme.ts`.
- The root layout reads `pre_tournament_picks.winner_team` for the authenticated user.
- The chosen team is applied as CSS variables on `<html>`:
  - `--team-primary`
  - `--team-secondary`
  - `--color-accent`
  - `--color-accent-soft`
  - `--color-accent-line`
  - `--border-accent`
  - `--hero-glow`
- Use tokens, not hard-coded team colors, in components.
- If a user has no pick or an unsupported team, fall back to the default Mondial green/gold theme.

## Color Usage

Use `--color-accent` for the user&apos;s active champion identity: selected bets, primary actions, live chips, and active navigation.

Use `--team-secondary` only as a supporting color for small chips, gradients, and celebratory details. Do not turn whole screens into a national flag.

Use `--color-gold`, `--color-silver`, and `--color-bronze` for rank and prize semantics. These should not change with team themes.

## Components

Keep mobile screens dense and scannable:
- Match cards should show kickoff, teams, selected pick, and odds without extra explanation.
- Leaderboards should favor quick rank/points scanning.
- Pre-tournament pages are where champion theme changes start, so revalidate the root layout after saving a pick.

Cards should stay at `8px` to `16px` radius depending on existing local pattern. Avoid decorative nested cards.
