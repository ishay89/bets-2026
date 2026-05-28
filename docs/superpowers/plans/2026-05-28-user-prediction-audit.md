# User Prediction Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-visible audit history for user prediction commits.

**Architecture:** Add one append-only Supabase audit table and a small server-side helper that logs only meaningful user prediction changes. Existing prediction tables remain the current state for scoring, while audit events become the historical commit log.

**Tech Stack:** Next.js 16 App Router Server Actions, React 19, Supabase Postgres/RLS, supabase-js, Vitest.

---

## File Structure

- Create `supabase/migrations/007_user_prediction_audit_events.sql` for the audit table, RLS, grants, and indexes.
- Create `lib/audit.ts` for value comparison and audit event insertion helpers.
- Create `lib/audit.test.ts` for helper tests.
- Modify `app/predict/page.tsx` to log match prediction and pikanteria answer commits.
- Modify `app/pre-tournament/page.tsx` to log pre-tournament pick commits.
- Create `app/admin/audit/page.tsx` for the admin audit view.
- Modify `app/admin/page.tsx` and `app/admin/layout.tsx` to link to the audit page.
- Modify `lib/types.ts` if shared audit row types are useful.

### Task 1: Audit Helper

**Files:**

- Create: `lib/audit.ts`
- Create: `lib/audit.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from 'vitest'
import { shouldWriteAuditEvent } from './audit'

describe('shouldWriteAuditEvent', () => {
  test('writes an audit event when there is no previous value', () => {
    expect(shouldWriteAuditEvent(null, { pick: '1' })).toBe(true)
  })

  test('writes an audit event when the value changes', () => {
    expect(shouldWriteAuditEvent({ pick: '1' }, { pick: 'X' })).toBe(true)
  })

  test('skips an audit event when the value is unchanged', () => {
    expect(shouldWriteAuditEvent({ pick: '1' }, { pick: '1' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/audit.test.ts`

Expected: FAIL because `lib/audit.ts` does not exist.

- [ ] **Step 3: Implement helper**

```ts
export type AuditJson = Record<string, unknown>

export function shouldWriteAuditEvent(oldValue: AuditJson | null, newValue: AuditJson) {
  if (oldValue === null) return true
  return JSON.stringify(sortJson(oldValue)) !== JSON.stringify(sortJson(newValue))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortJson(nested)])
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/audit.test.ts`

Expected: PASS.

### Task 2: Supabase Migration

**Files:**

- Create: `supabase/migrations/007_user_prediction_audit_events.sql`

- [ ] **Step 1: Add migration SQL**

```sql
create table public.user_prediction_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null check (event_type in ('match_prediction', 'pikanteria_answer', 'pre_tournament_pick')),
  action text not null check (action in ('create', 'update')),
  entity_id uuid,
  entity_ref text not null,
  old_value jsonb,
  new_value jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  committed_at timestamptz not null default now()
);

alter table public.user_prediction_audit_events enable row level security;

grant select, insert on public.user_prediction_audit_events to authenticated;

create index user_prediction_audit_events_committed_at_idx
  on public.user_prediction_audit_events (committed_at desc);

create index user_prediction_audit_events_user_id_committed_at_idx
  on public.user_prediction_audit_events (user_id, committed_at desc);

create index user_prediction_audit_events_event_type_committed_at_idx
  on public.user_prediction_audit_events (event_type, committed_at desc);
```

- [ ] **Step 2: Verify migration syntax when Supabase is available**

Run: `supabase db reset`

Expected: local database resets and applies migrations successfully.

### Task 3: Log User Prediction Commits

**Files:**

- Modify: `lib/audit.ts`
- Modify: `app/predict/page.tsx`
- Modify: `app/pre-tournament/page.tsx`

- [ ] **Step 1: Extend helper with an insert function**

Add a `writeAuditEvent` function that inserts into `user_prediction_audit_events` using a service-role client passed by the caller.

- [ ] **Step 2: Update match prediction save action**

Read the match, its match day, and the user's existing prediction before the upsert. Block if locked. Upsert the prediction. Log `match_prediction` only when `shouldWriteAuditEvent` returns true.

- [ ] **Step 3: Update pikanteria answer save action**

Read the pikanteria item, options, match day, and existing answer before the upsert. Block if locked. Upsert the answer. Log `pikanteria_answer` only for create/change.

- [ ] **Step 4: Update pre-tournament save action**

Read the existing pre-tournament row before the upsert. Block if locked. Upsert the pick. Log `pre_tournament_pick` only for create/change.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: PASS.

### Task 4: Admin Audit Page

**Files:**

- Create: `app/admin/audit/page.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Create page**

Fetch the latest audit events with joined `users(display_name, email, is_monkey)`, order by `committed_at` descending, and render a compact table/list.

- [ ] **Step 2: Add admin navigation**

Add `Audit` to the admin header and an `Audit Log` section card on `/admin`.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: PASS.

### Task 5: Final Verification

**Files:**

- All changed files.

- [ ] **Step 1: Run test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: PASS.
