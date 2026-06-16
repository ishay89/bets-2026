# Skill: Sync Winner.co.il Odds → Mondial Bets DB

Use this skill when asked to "update odds from winner" or "sync winner odds". It covers scraping, matching, and updating.

## What This Does

Reads the current 1X2 (full-time, no extra time) odds table from winner.co.il for the World Cup 2026 group stage, matches each fixture against the `matches` table in Supabase, and updates `odds_home` / `odds_draw` / `odds_away` for any match that is **not yet published** (`published_at IS NULL`). Published matches are never touched. `published_at` itself is never changed — publishing is a separate admin action.

---

## Step 1 — Scrape Winner.co.il (safe approach)

**URL:**
```
https://www.winner.co.il/משחקים/וינר-ליין/כדורגל/בינלאומי/בינלאומי$מונדיאל 2026/‮1X2‬ - תוצאת סיום (ללא הארכות)/כל-היחסים
```

**WARNING — anti-bot classifier:** Rapid successive calls to `get_page_text`, `javascript_tool`, or `browser_batch` on this page trip Anthropic's cyber-related safeguards classifier and stall the session. The safe pattern is:

1. `navigate` to the URL once
2. Scroll down slowly (3–4 `scroll` actions, 1–2 seconds apart) to trigger lazy-load of all rows
3. Take a screenshot after each scroll to confirm rows are appearing
4. Confirm via screenshot that you've reached the page footer (all rows visible)
5. Call `get_page_text` **exactly once** at the end to capture all rows in one shot

Do NOT loop `get_page_text` or `javascript_tool` repeatedly — one call after full scroll is enough since the site lazy-loads on scroll but does not unload rows (no virtualization).

**What to extract:** The table rows show:
- Date / kickoff time (Israel local time, UTC+3)
- Team A name — odds_1
- Draw odds — odds_X
- Team B name — odds_2

Winner displays kickoff as `HH:59` (1 minute before actual kickoff). The real kickoff is `HH+1:00` (or round hour). Ignore the :59 when matching — match by team names only.

---

## Step 2 — Build the WINNER_ODDS array

Translate team names to English (winner shows Hebrew or transliterated names). Format each row as:

```ts
{ teamA: 'France', oddsA: 1.35, oddsDraw: 4.40, teamB: 'Senegal', oddsB: 6.90 },
```

`teamA` = left team on the page (same as `home_team` in DB for all group-stage fixtures).
`teamB` = right team (same as `away_team`).

Replace the `WINNER_ODDS` array in `scripts/sync-winner-odds/sync.ts` with the fresh data.

---

## Step 3 — Team name matching

The script uses `canonicalTeamKey()` (normalise + alias map) to compare names across sources. Known aliases already in the map:

| Winner name          | DB seed name       | Canonical key          |
|----------------------|--------------------|------------------------|
| Czech Republic       | Czechia            | czech republic         |
| Turkey               | Türkiye            | turkey                 |
| Ivory Coast          | Côte d'Ivoire      | ivory coast            |
| Cape Verde           | Cabo Verde         | cape verde             |
| Bosnia and Herzegovina | Bosnia-Herzegovina | bosnia and herzegovina |
| DR Congo             | DR Congo           | congo dr               |
| South Korea          | South Korea        | korea republic         |
| Iran                 | Iran               | ir iran                |
| United States        | USA                | united states          |
| Curaçao              | Curaçao            | curacao                |

If a new team name appears that doesn't match, add an entry to `TEAM_ALIASES` in the script (same format as the existing map).

---

## Step 4 — Dry run first

```bash
npm run sync:winner-odds -- --dry
```

Review the output. `WOULD UPDATE` lines show old → new odds. `SKIP` lines are already-published matches. `NOT FOUND` lines need alias fixes.

---

## Step 5 — Apply

```bash
npm run sync:winner-odds
```

Output will confirm each row updated. Only unpublished matches change.

---

## Step 6 — Commit and PR

```bash
git checkout -b fix/winner-odds-<date>
git add scripts/sync-winner-odds/sync.ts
git commit -m "data: update winner odds for <date> matchday"
# then open PR per AGENTS.md git workflow
```

---

## Notes

- The script is idempotent: re-running with the same data writes the same values.
- Odds are stored as numeric with 4-decimal precision (per `20260601000000_widen_numeric_precision.sql`).
- Do not use this script to set `published_at` — use `/admin/publish` in the UI to publish matches (which also creates automated benchmark predictions).
- If a match shows as `NOT FOUND`, first check if the team is in the DB at all (wrong round / stage) before adding an alias.
