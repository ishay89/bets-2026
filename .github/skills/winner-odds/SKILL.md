---
name: winner-odds
description: This skill should be used when the user asks to "הבא תוצאות מונדיאל", "עדכן מתחים", "scrape winner odds", "עדכן את ה-odds", "תביא את הסיכויים ממונדיאל", "fetch World Cup odds from winner", "update match odds", "pull odds from winner.co.il", or says anything about fetching/syncing/updating odds from winner.co.il into the database.
version: 0.1.0
---

# Winner Odds Scraper — World Cup 2026

Scrape the 1X2 full-time (no extra time) odds for World Cup 2026 matches from winner.co.il and update eligible matches in the Supabase database.

## Eligibility filter

Only update matches that satisfy **all three**:
- `published_at IS NULL` — not yet published
- `locked = false` — not locked
- `result IS NULL` — no result entered yet

## Workflow

### Step 1 — Get eligible matches from DB

Use `mcp__plugin_supabase_supabase__execute_sql` to fetch candidates:

```sql
SELECT m.id, m.home_team, m.away_team, m.kickoff_time, m.odds_home, m.odds_draw, m.odds_away
FROM matches m
JOIN match_days md ON m.match_day_id = md.id
WHERE m.published_at IS NULL
  AND m.locked = false
  AND m.result IS NULL
ORDER BY m.kickoff_time;
```

If the result is empty, stop and report "No eligible matches to update."

### Step 2 — Scrape winner.co.il via Chrome

Use Chrome browser tools in this exact sequence:

1. **Get tab context** — call `mcp__claude-in-chrome__tabs_context_mcp` with `createIfEmpty: true`.
2. **Navigate** to the league page **without** a `/היום/` (today) segment in the path — the today-scoped URL defaults the main grid to "group winner" outright bets, not match 1X2 odds:
   ```
   https://www.winner.co.il/%D7%9E%D7%A9%D7%97%D7%A7%D7%99%D7%9D/%D7%95%D7%95%D7%99%D7%A0%D7%A8-%D7%9C%D7%99%D7%99%D7%9F/%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99/%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99$%D7%9E%D7%95%D7%A0%D7%93%D7%99%D7%90%D7%9C%202026
   ```
   On a fresh load of this URL, the main grid (`.market-list-container`) already carries the `isAllDaysTab` class and its `.market.market-01` elements are the World Cup 1X2 full-time markets by default — no "All Days" click or market filter click is needed (the page's old `.filter-container` / `.filter-container-selected` filter UI now only controls a 3-item "Expert Tips" widget, not the main grid, and clicking around in it left the grid showing matches from unrelated foreign leagues mixed in by kickoff time). Scrape immediately after load, before clicking anything else on the page.
3. **Scrape all markets and verify they're Mondial 2026, not contaminated by other leagues** via JS (wrapped in an IIFE so repeated runs in the same console don't collide on `const`/`let` names):
   ```js
   (function() {
     const clean = s => s.replace(/[‎‏‪-‮]/g, '').trim();
     const markets = document.querySelectorAll('.market.market-01');
     const rows = [];
     const seen = new Set();
     for (const market of markets) {
       const outcomes = market.querySelectorAll('.outcome-container');
       if (outcomes.length < 3) continue;
       // League/market-type check: each market's own innerText carries its league name and
       // market-type label inline (there is no separate breadcrumb ancestor element on the
       // current page). Require both the league name and the exact 1X2-full-time market type,
       // since other Mondial 2026 sub-markets (e.g. player goal-matchup props) also mention
       // "מונדיאל 2026" but aren't the main 1X2 market and can have a misleading "X" outcome.
       const full = clean(market.innerText);
       if (!full.includes('מונדיאל 2026')) continue;
       if (!full.includes('1X2 - תוצאת סיום')) continue;
       const lines = el => clean(el.innerText).split('\n').map(s => s.trim()).filter(Boolean);
       const h = lines(outcomes[0]), x = lines(outcomes[1]), a = lines(outcomes[2]);
       // Safety check: middle outcome must be labelled "X" (confirms 1X2 market)
       if (x[0] !== 'X') continue;
       const key = h[0] + '|' + a[0];
       if (seen.has(key)) continue; // dedupe vs Expert Tips widget duplicates
       seen.add(key);
       rows.push({ home_he: h[0], home_odds: parseFloat(h[1]),
                   draw_odds: parseFloat(x[1]),
                   away_odds: parseFloat(a[1]), away_he: a[0] });
     }
     return JSON.stringify(rows);
   })();
   ```
   If `rows` looks suspiciously short (fewer matches than expected from Step 1) that's normal — winner.co.il only opens betting lines progressively as kickoff approaches, not for all matches at once. Only update what's actually scraped.

### Step 3 — Match Hebrew names to DB rows

Use the team name mapping in `references/team-names.md` to translate each scraped Hebrew team name to the English name used in the DB.

For each scraped match:
1. Translate `home_he` → English home team name
2. Translate `away_he` → English away team name
3. Find the DB row where `home_team` and `away_team` match (case-insensitive)

If a scraped match has no corresponding DB row, skip it and log it as unmatched.

### Step 4 — Update odds in DB

For each matched pair (scraped odds ↔ DB row), run:

```sql
UPDATE matches
SET odds_home = <home_odds>,
    odds_draw = <draw_odds>,
    odds_away = <away_odds>
WHERE id = '<match_id>'
  AND published_at IS NULL
  AND locked = false
  AND result IS NULL;
```

Run each update individually via `mcp__plugin_supabase_supabase__execute_sql`.

### Step 5 — Report

Print a summary table:

```
✓ Updated  | Home team           | Away team           | 1     | X     | 2
-----------+---------------------+---------------------+-------+-------+------
✓          | Mexico              | South Africa        | 1.40  | 4.00  | 6.80
...

Skipped (no DB match): [list any unmatched scraped games]
```

## Additional Resources

- **`references/team-names.md`** — Hebrew ↔ English team name mapping for all World Cup 2026 nations
