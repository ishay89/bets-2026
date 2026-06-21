---
description: Recommend and optionally upsert Claude-only predictions for currently published open matches and pikanteria
---

Invoke the `claude-open-bet-predictions` skill now and follow it exactly.

Use the live Supabase project as the source of truth, include Claude's leaderboard position, odds, and any relevant latest team news in the recommendation, keep the approval gate before DB writes, and verify afterward that only Claude rows were updated with the approved values.

$ARGUMENTS
