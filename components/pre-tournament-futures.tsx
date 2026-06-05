import { TEAMS, SCORERS } from '@/lib/pre-tournament'
import {
  savePreTournamentPick,
  saveWinnerPick,
  saveScorerPick,
} from '@/app/predict/pre-tournament-actions'

const FLAGS: Record<string, string> = {
  France: '🇫🇷', Spain: '🇪🇸', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', Argentina: '🇦🇷',
  Brazil: '🇧🇷', Portugal: '🇵🇹', Germany: '🇩🇪', Netherlands: '🇳🇱',
  Norway: '🇳🇴', Belgium: '🇧🇪', Colombia: '🇨🇴', Japan: '🇯🇵',
  Morocco: '🇲🇦', Uruguay: '🇺🇾', USA: '🇺🇸', Switzerland: '🇨🇭',
  Mexico: '🇲🇽', Croatia: '🇭🇷', Turkey: '🇹🇷', Ecuador: '🇪🇨',
  Senegal: '🇸🇳', Sweden: '🇸🇪', Austria: '🇦🇹', Paraguay: '🇵🇾',
  Canada: '🇨🇦', 'Bosnia & Herzegovina': '🇧🇦', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Ivory Coast': '🇨🇮', Egypt: '🇪🇬', 'Czech Republic': '🇨🇿',
  Algeria: '🇩🇿', Ghana: '🇬🇭', 'South Korea': '🇰🇷',
}

type FuturesPick = {
  winner_team: string
  winner_odds: number
  top_scorer: string
  top_scorer_odds: number
} | null

const inputStyle = {
  background: 'var(--color-bg)',
  border: '1px solid var(--border-base)',
  color: 'var(--color-text)',
}

export function PreTournamentFutures({ pick, isLocked }: { pick: FuturesPick; isLocked: boolean }) {
  const cls = 'rounded-lg px-3 py-2 text-sm w-full'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-lg">🏆</span>
        <span className="text-[12px] font-bold uppercase tracking-[1.2px]"
          style={{ color: 'var(--color-gold)' }}>
          Futures · Champion & top scorer
        </span>
      </div>

      {isLocked && (
        <div className="rounded-lg px-4 py-3"
          style={{ background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
          <span className="text-[12px] font-bold" style={{ color: 'var(--color-danger)' }}>
            🔒 Pre-tournament picks are locked
          </span>
        </div>
      )}

      {/* Existing picks: each shown with its own independent edit form */}
      {pick && (
        <>
          {/* Winner section */}
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[1.2px] mb-2 px-0.5"
              style={{ color: 'var(--color-muted)' }}>Your champion · 1.5× bonus</div>
            <div className="superstar-panel p-[18px]">
              <div className="relative flex items-center gap-4">
                <div className="size-14 rounded-full flex items-center justify-center text-3xl"
                  style={{ background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}>
                  {FLAGS[pick.winner_team] ?? '🏆'}
                </div>
                <div className="flex-1">
                  <div className="text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: 'var(--color-gold)' }}>
                    🏆 Winner
                  </div>
                  <div className="text-[22px] font-extrabold tracking-tight text-text">{pick.winner_team}</div>
                  <div className="text-[11px] text-sub mt-1">
                    Win: <strong style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-mono)' }}>
                      {(pick.winner_odds * 1.5).toFixed(2)} pts
                    </strong> · Runner-up: <strong style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-mono)' }}>
                      {(pick.winner_odds * 0.75).toFixed(2)} pts
                    </strong>
                  </div>
                </div>
              </div>
            </div>
            {!isLocked && (
              <form action={saveWinnerPick} className="mt-3 space-y-2">
                <select name="winner" defaultValue={pick.winner_team} required style={inputStyle} className={cls}>
                  {TEAMS.map(t => (
                    <option key={t.name} value={t.name}>
                      {FLAGS[t.name] ?? ''} {t.name} - {t.odds.toFixed(2)}
                    </option>
                  ))}
                </select>
                <button type="submit"
                  className="w-full py-2 rounded-lg font-black text-sm"
                  style={{ background: 'var(--color-accent)', color: '#000' }}>
                  Update Champion ✓
                </button>
              </form>
            )}
          </div>

          {/* Scorer section */}
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[1.2px] mb-2 px-0.5"
              style={{ color: 'var(--color-muted)' }}>Top scorer · fixed bonus</div>
            <div className="bet-card p-4">
              <div className="flex items-center gap-4">
                <div className="ball-mark size-16 rounded-lg shrink-0" aria-hidden="true" />
                <div className="flex-1">
                  <div className="text-[18px] font-extrabold tracking-tight text-text">{pick.top_scorer}</div>
                  <div className="text-[11px] text-sub mt-1">
                    Bonus: <strong style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>
                      {pick.top_scorer_odds.toFixed(2)} pts
                    </strong>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-[22px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                    {pick.top_scorer_odds.toFixed(2)}
                  </div>
                  <div className="text-[12px] font-bold uppercase tracking-wide text-muted">Odds</div>
                </div>
              </div>
            </div>
            {!isLocked && (
              <form action={saveScorerPick} className="mt-3 space-y-2">
                <select name="scorer" defaultValue={pick.top_scorer} required style={inputStyle} className={cls}>
                  {SCORERS.map(s => (
                    <option key={s.name} value={s.name}>{s.name} - {s.odds.toFixed(2)}</option>
                  ))}
                </select>
                <button type="submit"
                  className="w-full py-2 rounded-lg font-black text-sm"
                  style={{ background: 'var(--color-accent)', color: '#000' }}>
                  Update Scorer ✓
                </button>
              </form>
            )}
          </div>
        </>
      )}

      {/* Initial combined form (no existing pick yet) */}
      {!pick && !isLocked && (
        <form action={savePreTournamentPick} className="space-y-4">
          <div className="text-[12px] font-bold uppercase tracking-[1.2px] px-0.5" style={{ color: 'var(--color-muted)' }}>
            Make your picks
          </div>

          <div className="bet-card p-4 space-y-2">
            <label htmlFor="winner" className="text-sm font-semibold text-text block">🏆 Tournament Winner</label>
            <select id="winner" name="winner" defaultValue="" required style={inputStyle} className={cls}>
              <option value="">Select a team…</option>
              {TEAMS.map(t => (
                <option key={t.name} value={t.name}>
                  {FLAGS[t.name] ?? ''} {t.name} - {t.odds.toFixed(2)}
                </option>
              ))}
            </select>
            <p className="text-muted text-xs">Win: odds ×1.5 · Runner-up: odds ×0.75</p>
          </div>

          <div className="bet-card p-4 space-y-2">
            <label htmlFor="scorer" className="text-sm font-semibold text-text block">⚽ Top Scorer</label>
            <select id="scorer" name="scorer" defaultValue="" required style={inputStyle} className={cls}>
              <option value="">Select a player…</option>
              {SCORERS.map(s => (
                <option key={s.name} value={s.name}>{s.name} - {s.odds.toFixed(2)}</option>
              ))}
            </select>
          </div>

          <button type="submit"
            className="w-full py-3 rounded-lg font-black text-sm"
            style={{ background: 'var(--color-accent)', color: '#000' }}>
            Save Picks ✓
          </button>
        </form>
      )}
    </div>
  )
}
