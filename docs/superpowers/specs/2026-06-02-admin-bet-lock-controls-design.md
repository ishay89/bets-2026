# Admin Bet Lock Controls Design

## Goal

Give admins explicit, independent lock controls for each bet category:

- winner and top-scorer futures
- individual matches
- individual pikanteria questions

Remove match-day locking from active behavior so locking one match does not lock
other matches or pikanteria questions.

## Behavior

### Futures

`tournament_settings.futures_locked` is the only authority for winner and
top-scorer pick locking.

The admin edit page keeps the existing `Lock Futures` / `Unlock Futures`
control. Unlocking futures remains effective after matches begin or individual
matches are locked. Player save actions and the predict page read only the
explicit futures setting.

### Matches

Each match keeps its existing `matches.locked` flag and admin lock control.
Match predictions also continue to lock automatically five minutes before that
match's kickoff.

The application, RPC, RLS, crowd-reveal, H2H, and admin player-status paths stop
using `match_days.locked` when evaluating match locks.

### Pikanteria

Add `pikanteria.locked boolean not null default false`.

Each pikanteria question gets its own `Lock` / `Unlock` control on the admin edit
page. A pikanteria answer is blocked only when that question is manually locked.
It does not inherit match-day lock state or `match_days.lock_time`.

Crowd picks for a pikanteria question become visible only after that specific
question is locked.

## Database Compatibility

Keep the existing `match_days.locked` column in the database to avoid a
destructive schema migration. New code stops reading or writing it for lock
decisions.

A new migration:

- adds `pikanteria.locked`
- replaces match prediction save RPC checks so they ignore `match_days.locked`
- replaces pikanteria save RPC checks so they use `pikanteria.locked`
- replaces direct-write RLS policies with the same rules
- replaces crowd-pick RPC reveal rules with the same rules

## Admin UI

On `/admin/edit`:

- retain the futures lock card
- remove the match-day lock button
- retain each match's lock button
- add a lock/unlock button to each unresolved pikanteria editor

The page must query pikanteria `locked` state so controls reflect the persisted
value.

## Application Updates

- Simplify `isMatchLocked()` to consider the match flag and kickoff deadline.
- Simplify futures locking to the tournament setting only.
- Update predict-page pikanteria cards to use each question's `locked` flag.
- Remove active day-lock checks from H2H visibility and admin player-status
  calculations.
- Update shared types and query shapes for `pikanteria.locked`.

## Error Handling

Existing handled save errors remain unchanged:

- a locked match save returns `Match is locked`
- a locked pikanteria save returns `Pikanteria answers are locked`
- a futures save throws `Pre-tournament picks are locked`

Admin toggle actions continue to require `assertAdmin()` and revalidate
`/predict`.

## Testing

Use test-first changes for the new behavior:

- update lock helper tests to prove day state no longer locks matches
- add migration assertions proving active SQL uses match-level locks for
  matches and pikanteria-level locks for pikanteria
- run the targeted Vitest files, then the full test suite, lint, and production
  build

