# Design: Pikanteria N-Option Flexible Bets

**Date:** 2026-05-27  
**Status:** Approved

## Problem

The current Pikanteria system is hard-coded to yes/no (two answers with fixed `odds_yes`, `odds_no`, and `result boolean`). The admin wants to create richer bets — over/under, 3-way outcomes, "who scores first?", etc. — without being constrained to exactly two answers.

## Goal

Generalize Pikanteria from a fixed yes/no format to N custom-labeled options (minimum 2, no hard max). The admin builds the options dynamically in the publish form. Players see all options as radio buttons and pick one. The admin marks the correct option when entering results.

## Non-Goals

- Changing how match predictions (1X2) work
- Supporting multi-select answers (players still pick exactly one option)
- A separate "custom bets" section — this replaces and extends Pikanteria in-place

---

## Design

### 1. Data Model

#### `pikanteria` table — simplified

Remove: `odds_yes`, `odds_no`, `result`  
Keep: `id`, `match_day_id`, `question`, `created_at`

The question text is still on this table. Options live in a child table.

#### New `pikanteria_options` table

```sql
create table public.pikanteria_options (
  id          uuid primary key default gen_random_uuid(),
  pikanteria_id uuid not null references public.pikanteria(id) on delete cascade,
  label       text not null,           -- "Yes", "No", "Over 2.5", "Mbappé", etc.
  odds        numeric(5,2) not null,
  is_correct  boolean not null default false,  -- set by admin at result entry
  sort_order  int not null default 0,          -- preserves admin's ordering
  created_at  timestamptz not null default now()
);
```

#### `pikanteria_answers` table — updated

Remove: `answer boolean`  
Add: `option_id uuid not null references public.pikanteria_options(id) on delete cascade`  
Keep: `pikanteria_id` (used for the `unique(user_id, pikanteria_id)` constraint — one answer per question per player)

#### Migration

New file: `supabase/migrations/005_pikanteria_options.sql`

- Alter `pikanteria`: drop `odds_yes`, `odds_no`, `result`
- Create `pikanteria_options`
- Alter `pikanteria_answers`: drop `answer`, add `option_id`
- Add RLS policy on `pikanteria_options`: SELECT true (readable by all authenticated users)

No data migration needed — no live pikanteria rows exist in the DB.

---

### 2. TypeScript Types (`lib/types.ts`)

```ts
// Remove odds_yes, odds_no, result from Pikanteria
export interface Pikanteria {
  id: string
  match_day_id: string
  question: string
  created_at: string
  options: PicanteriaOption[]   // joined when fetching
}

// New
export interface PicanteriaOption {
  id: string
  pikanteria_id: string
  label: string
  odds: number
  is_correct: boolean
  sort_order: number
}

// Replace answer: boolean with option_id: string
export interface PicanteriaAnswer {
  id: string
  user_id: string
  pikanteria_id: string
  option_id: string
  points: number | null
}
```

---

### 3. Admin Publish Form (`app/admin/publish/page.tsx` + new component)

#### New `components/pikanteria-builder.tsx` (client component)

A `'use client'` component that manages dynamic option slots in local React state. The admin:
- Sees the question text input
- Starts with 2 option slots (label + odds each)
- Clicks **+ Add option** to append a new slot
- Clicks **×** to remove a slot (disabled when only 2 remain)

When rendered inside the server-side `<form>`, the component writes hidden + visible inputs so the server action can read them:

```
pik_q_1                  — question text
pik_opt_count_1          — number of options (e.g. "3"), hidden
pik_opt_label_1_1        — label for option 1 of question 1
pik_opt_odds_1_1         — odds for option 1 of question 1
pik_opt_label_1_2        — label for option 2
pik_opt_odds_1_2
pik_opt_label_1_3        — label for option 3
pik_opt_odds_1_3
```

Up to 3 pikanteria questions per day (same as before). Each starts with 2 blank option slots.

#### Updated server action `publishMatchDay`

Reads the pikanteria section by looping question slots (i = 1..3) then option slots (j = 1..count):

```ts
for (let i = 1; i <= 3; i++) {
  const question = formData.get(`pik_q_${i}`)?.trim()
  if (!question) continue
  const count = parseInt(formData.get(`pik_opt_count_${i}`) as string)
  // INSERT pikanteria row
  // INSERT pikanteria_options rows (j = 1..count)
}
```

---

### 4. Player Predict Page (`app/predict/page.tsx` + `components/pikanteria-card.tsx`)

`pikanteria-card.tsx` currently shows two radio buttons (Yes / No). Updated to:
- Accept `options: PicanteriaOption[]` instead of fixed yes/no props
- Render one radio button per option, labeled with `option.label` and `option.odds`
- Radio input `name` is `pik_${pikanteria.id}`, value is `option.id`

Player answer submission stores `option_id` (the UUID of the chosen option).

---

### 5. Admin Results Page (`app/admin/results/page.tsx`)

Currently shows yes/no radios for each pikanteria question. Updated to:
- Fetch `pikanteria_options` alongside pikanteria rows
- Render N radio buttons (one per option) for the admin to pick the correct one
- On submit: `UPDATE pikanteria_options SET is_correct = true WHERE id = chosen_id`
- Score all answers: find answers where `option_id = chosen_id`, award `option.odds × 1` points

Scoring call stays: `calcPicanteriaPoints(option.odds, ans.option_id === correctOption.id)`

---

### 6. Monkey Picks (`lib/monkey.ts`)

`monkeyPikanteriaPick` currently returns `boolean`. Updated signature:

```ts
function monkeyPikanteriaPick(options: PicanteriaOption[], seed: string): string
// Returns the id of a randomly chosen option (seeded by pikanteria id + date)
```

---

### 7. Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/005_pikanteria_options.sql` | New migration |
| `lib/types.ts` | Update Pikanteria, PicanteriaOption, PicanteriaAnswer |
| `lib/monkey.ts` | Update monkeyPikanteriaPick signature + return type |
| `lib/scoring.test.ts` | Update pikanteria tests to use new types |
| `components/pikanteria-builder.tsx` | New client component for admin publish form |
| `app/admin/publish/page.tsx` | Use PicanteriaBuilder, update server action |
| `components/pikanteria-card.tsx` | Render N options instead of yes/no |
| `app/predict/page.tsx` | Pass options[] to pikanteria-card, submit option_id |
| `app/admin/results/page.tsx` | N-option result entry, update scoring logic |
