# Design: Publish Match Day from Pre-Seeded Draft

**Date:** 2026-05-27  
**Status:** Approved

## Problem

The current `/admin/publish` page requires the admin to manually type all match data (home team, away team, kickoff time, odds) from scratch. But the World Cup 2026 fixture data (teams + kickoff times + estimated odds) is already seeded in the DB as draft match days (`published_at IS NULL`). The publish flow should leverage this data — the admin only needs to confirm/edit odds and add Pikanteria, then publish.

## Goal

When the admin picks a date on `/admin/publish`, the page auto-loads the matching draft match day from the DB, pre-fills teams (read-only) and odds (editable), and lets the admin publish with one submit.

## Non-Goals

- Creating match days from scratch (knockout rounds where teams aren't known yet will be handled separately)
- Client-side dynamic loading (no JS fetch, no React state)
- New DB migrations

---

## Design

### Approach: URL-param driven RSC (server-side)

The date picker is a GET form. Submitting it appends `?date=YYYY-MM-DD` to the URL. The page is a React Server Component that reads the search param, queries the DB, and renders the pre-filled form. This matches the pattern used by every other admin page in the codebase.

### Data Flow

1. Admin opens `/admin/publish` — date picker defaults to today, form body is empty
2. Admin picks a date, clicks **Load**
3. GET form appends `?date=2026-06-11` → full page re-render (RSC)
4. Server queries `match_days` where `date = selected_date AND published_at IS NULL`, joins `matches`
5. **If draft found**: renders match cards with teams + kickoff time as read-only display, odds inputs pre-filled
6. **If no draft**: shows an info notice — "No draft found for 2026-06-11"
7. Admin edits odds if needed, optionally adds Pikanteria questions, clicks **Publish**
8. Server action runs:
   - `UPDATE matches SET odds_home, odds_draw, odds_away` for each match in the draft
   - `UPDATE match_days SET published_at = now(), lock_time = (30 min before earliest kickoff)`
   - `INSERT pikanteria` rows (if any questions provided)
   - Insert monkey picks for matches + pikanteria (unchanged from current)
9. Redirect to `/admin/results`

### UI Layout

```
[ Date picker ] [ Load button ]

── when draft loaded ──────────────────────────────

Match Day: June 11, 2026 — Group Stage

┌─ Match 1 ─────────────────────────────────────┐
│ Mexico  vs  South Africa   |  15:00 UTC        │
│ Odds Home [2.10]  Draw [3.20]  Away [3.40]     │
└────────────────────────────────────────────────┘
┌─ Match 2 ──────────────────────────────────────┐
│ ...                                            │
└────────────────────────────────────────────────┘

── Pikanteria (optional) ─────────────────────────
┌─ Question 1 ──────────────────────────────────┐
│ [text input]  Yes Odds [   ]  No Odds [   ]   │
└────────────────────────────────────────────────┘
...

[ 🚀 Publish Match Day ]
```

### Files Changed

- **`app/admin/publish/page.tsx`** — rewrite:
  - Accept `searchParams: { date?: string }` prop
  - Add DB fetch for draft match day + matches when date param present
  - Render teams/kickoff as static text, odds as pre-filled inputs
  - Modify `publishMatchDay` server action to UPDATE existing draft instead of INSERT new

### Server Action Signature Change

**Before**: Reads all fields from form, inserts new `match_day` + `matches`.  
**After**: Reads `match_day_id` (hidden input) + odds fields, updates existing records, sets `published_at`.

The pikanteria INSERT path and monkey pick logic remain unchanged.

### Edge Cases

- **Date with no draft**: Show info notice, no form rendered
- **Date already published**: Query filters `published_at IS NULL`, so a published day won't load — show "already published" message
- **Odds left blank**: `parseFloat` of empty string returns `NaN` — add validation (required attribute on odds inputs)
