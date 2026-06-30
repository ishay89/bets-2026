---
description: Choose and upsert Codex-only predictions for currently published open matches and pikanteria
---

Invoke the `codex-open-bet-predictions` skill now and follow it exactly.

Use the live Supabase project as the source of truth, include Codex's leaderboard position, odds, and any relevant latest team news in the decision. For normal open-item runs, choose and write Codex-only picks automatically without waiting for approval, then verify afterward that only Codex rows were updated with the chosen values.

Stop before DB writes only if `$ARGUMENTS` explicitly asks for read-only analysis, approval review, or no database changes.

$ARGUMENTS
