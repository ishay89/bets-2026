---
description: Recommend and optionally upsert Codex-only predictions for currently published open matches and pikanteria
---

Invoke the `codex-open-bet-predictions` skill now and follow it exactly.

Use the live Supabase project as the source of truth, include Codex's leaderboard position, odds, and any relevant latest team news in the recommendation, keep the approval gate before DB writes, and verify afterward that only Codex rows were updated with the approved values.

$ARGUMENTS
