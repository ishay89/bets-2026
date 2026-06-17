// Compact live-score strip for /board and /leaderboard.
// Shows currently active matches (IN_PLAY or PAUSED) in a minimal row layout.
// Purely presentational — receives pre-fetched data from the server component.

export interface LiveMatchRow {
  id: string
  home_team: string
  away_team: string
  live_status: 'IN_PLAY' | 'PAUSED'
  live_score_home: number | null
  live_score_away: number | null
}

export function LiveScoreStrip({ matches }: { matches: LiveMatchRow[] }) {
  if (matches.length === 0) return null
  return (
    <div className="px-4 pb-3 space-y-2">
      {matches.map(m => (
        <div
          key={m.id}
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{
            background: 'var(--color-panel)',
            border: '1px solid var(--border-base)',
          }}
        >
          {m.live_status === 'PAUSED' ? (
            <span
              className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--color-elev)', color: 'var(--color-sub)', border: '1px solid var(--border-base)', letterSpacing: '0.06em' }}
            >
              ⏸ HT
            </span>
          ) : (
            <span
              className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(220,38,38,0.15)', color: 'var(--color-danger)', border: '1px solid rgba(220,38,38,0.3)', letterSpacing: '0.06em' }}
            >
              ● LIVE
            </span>
          )}

          <span
            className="flex-1 text-right truncate"
            style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-sub)' }}
          >
            {m.home_team}
          </span>

          <span
            className="shrink-0 tabular-nums"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--color-text)', minWidth: 40, textAlign: 'center' }}
          >
            {m.live_score_home ?? '–'} – {m.live_score_away ?? '–'}
          </span>

          <span
            className="flex-1 truncate"
            style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-sub)' }}
          >
            {m.away_team}
          </span>
        </div>
      ))}
    </div>
  )
}
