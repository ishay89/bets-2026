# Admin Bet Lock Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace match-day locking with independent admin controls for futures, matches, and pikanteria questions.

**Architecture:** Keep match lock timing in `lib/lock.ts`, make futures locking depend only on `tournament_settings.futures_locked`, and add `pikanteria.locked`. A forward-only Supabase migration replaces active RPC and RLS lock guards and crowd reveal rules while retaining the unused `match_days.locked` column for compatibility.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Supabase PostgreSQL migrations, Vitest

---

## Tasks

- [x] Update the match lock helper and prove legacy day state is ignored.
- [x] Add a forward migration for independent pikanteria locks and SQL guards.
- [x] Update application lock decisions and shared types.
- [x] Remove the admin day toggle and add per-question pikanteria toggles.
- [ ] Run full verification, commit, push, and open a PR.
