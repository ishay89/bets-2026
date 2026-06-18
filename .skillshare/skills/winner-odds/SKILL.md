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
2. **Navigate** to:
   ```
   https://www.winner.co.il/%D7%9E%D7%A9%D7%97%D7%A7%D7%99%D7%9D/%D7%95%D7%95%D7%99%D7%A0%D7%A8-%D7%9C%D7%99%D7%99%D7%9F/%D7%94%D7%99%D7%95%D7%9D/%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99/%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99$%D7%9E%D7%95%D7%A0%D7%93%D7%99%D7%90%D7%9C%202026
   ```
3. **Click "All Days" and wait** via JS:
   ```js
   Array.from(document.querySelectorAll('.tab.nav-link'))
     .find(el => el.innerText?.trim() === 'כל הימים')?.click();
   await new Promise(r => setTimeout(r, 1500));
   'all days clicked';
   ```
4. **Click the correct 1X2 Full Time filter and verify**. The page has multiple 1X2 filters (full-time, first half, second half) — strip RTL bidi marks before matching and confirm the right one got selected:
   ```js
   const clean = s => s.replace(/[‎‏‪-‮]/g, '').trim();
   // Find: contains "1X2", "תוצאת סיום", "ללא הארכות", does NOT contain "מחצית"
   const target = Array.from(document.querySelectorAll('.filter-container'))
     .find(el => {
       const t = clean(el.innerText);
       return t.includes('1X2') && t.includes('תוצאת סיום') && t.includes('ללא הארכות') && !t.includes('מחצית');
     });
   if (!target) throw new Error('1X2 full-time filter not found');
   target.click();
   await new Promise(r => setTimeout(r, 1500));
   // Verify the right filter is now selected
   const selected = document.querySelector('.filter-container-selected');
   const selText = clean(selected?.innerText ?? '');
   if (!selText.includes('תוצאת סיום') || !selText.includes('ללא הארכות') || selText.includes('מחצית')) {
     throw new Error('Wrong filter selected after click: ' + selText);
   }
   'filter confirmed: ' + selText.slice(0, 60);
   ```
   **If the verification throws**, do not proceed — report the error and stop.
5. **Scrape all markets** via JS:
   ```js
   const clean = s => s.replace(/[‎‏‪-‮]/g, '').trim();
   const markets = document.querySelectorAll('.market.market-01');
   const rows = [];
   for (const market of markets) {
     const outcomes = market.querySelectorAll('.outcome-container');
     if (outcomes.length < 3) continue;
     const il = market.closest('.item-leagues');
     if (!il) continue; // skip mobile duplicates
     const lines = el => clean(el.innerText).split('\n').map(s => s.trim()).filter(Boolean);
     const h = lines(outcomes[0]), x = lines(outcomes[1]), a = lines(outcomes[2]);
     // Safety check: middle outcome must be labelled "X" (confirms 1X2 market)
     if (x[0] !== 'X') continue;
     rows.push({ home_he: h[0], home_odds: parseFloat(h[1]),
                 draw_odds: parseFloat(x[1]),
                 away_odds: parseFloat(a[1]), away_he: a[0] });
   }
   JSON.stringify(rows);
   ```

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
