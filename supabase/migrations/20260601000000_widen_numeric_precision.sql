-- Widen numeric precision for odds and points columns.
--
-- Odds:   numeric(5,2)  → numeric(8,4)  — max 9999.9999, 4 decimal places
-- Points: numeric(8,2)  → numeric(10,4) — max 999999.9999, 4 decimal places
-- Snapshots: numeric(10,2) → numeric(12,4) — cumulative totals with full precision

-- Match odds
alter table public.matches
  alter column odds_home type numeric(8,4),
  alter column odds_draw type numeric(8,4),
  alter column odds_away type numeric(8,4);

-- Pikanteria option odds
alter table public.pikanteria_options
  alter column odds type numeric(8,4);

-- Pre-tournament odds
alter table public.pre_tournament_picks
  alter column winner_odds     type numeric(8,4),
  alter column top_scorer_odds type numeric(8,4);

-- Prediction points
alter table public.predictions
  alter column points type numeric(10,4);

-- Pikanteria answer points
alter table public.pikanteria_answers
  alter column points type numeric(10,4);

-- Pre-tournament points
alter table public.pre_tournament_picks
  alter column winner_points     type numeric(10,4),
  alter column top_scorer_points type numeric(10,4);

-- Score snapshot columns
alter table public.score_snapshots
  alter column match_points              type numeric(12,4),
  alter column pikanteria_points         type numeric(12,4),
  alter column pre_tournament_winner_pts type numeric(12,4),
  alter column pre_tournament_scorer_pts type numeric(12,4),
  alter column day_points                type numeric(12,4),
  alter column cumulative_points         type numeric(12,4),
  alter column discrepancy               type numeric(12,4);
