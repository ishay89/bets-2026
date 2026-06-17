# Mondial Bets 2026 Styling Guide

## Direction

Mondial Bets should feel like a private World Cup betting app for friends: sharp, competitive, football-first, and polished enough to share in the group chat.

Use the current visual language ("Clean Pitch"):
- Light, airy pitch-day look by default, with a Night Pitch dark companion theme.
- Strong display typography (Oswald) with compact mobile betting surfaces.
- Soccer ball, host flags, odds chips, pitch stripes, podiums, and slip-like cards.
- Friendly betting-pool copy: "picks", "slip", "standings", "locks", "pot", "danger zone".

## Same experience for everyone

The app's look is identical for every player. It does not change based on a player's tournament-winner pick, team affiliation, or any other personal data — there is no dynamic per-user theming. `lib/team-theme.ts` and the `data-team` attribute have been removed; do not reintroduce them.

## Color Usage

Use `--color-accent` for selected bets, primary actions, live chips, and active navigation — the same green for every player.

Use `--color-gold`, `--color-silver`, and `--color-bronze` for rank and prize semantics.

## Components

Keep mobile screens dense and scannable:
- Match cards should show kickoff, teams, selected pick, and odds without extra explanation.
- Leaderboards should favor quick rank/points scanning.
- Pre-tournament pages are where champion theme changes start, so revalidate the root layout after saving a pick.

Cards should stay at `8px` to `16px` radius depending on existing local pattern. Avoid decorative nested cards.
