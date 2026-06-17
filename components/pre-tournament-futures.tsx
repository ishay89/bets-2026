'use client'
import { useState } from 'react'
import { TEAMS, SCORERS } from '@/lib/pre-tournament'
import {
  savePreTournamentPick,
  saveWinnerPick,
  saveScorerPick,
} from '@/app/predict/pre-tournament-actions'
import type { FuturesReveal } from '@/lib/prediction-reveals'
import { PredictionRevealSheet } from '@/components/prediction-reveal-sheet'

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

type RevealTarget = 'winner' | 'scorer'

export function PreTournamentFutures({
  pick,
  isLocked,
  myUserId,
  onReveal,
}: {
  pick: FuturesPick
  isLocked: boolean
  myUserId?: string
  onReveal?: () => Promise<FuturesReveal>
}) {
  const cls = 'rounded-lg px-3 py-2 text-sm w-full'

  // Player reveal — after lock, fetch what everyone picked once, cache it, and
  // open the relevant sheet (champion or top scorer).
  const [reveal, setReveal] = useState<FuturesReveal | null>(null)
  const [loading, setLoading] = useState<RevealTarget | null>(null)
  const [revealError, setRevealError] = useState(false)
  const [sheet, setSheet] = useState<RevealTarget | null>(null)
  const canReveal = isLocked && !!onReveal && !!myUserId

  async function openSheet(target: RevealTarget) {
    if (!onReveal || loading) return
    setRevealError(false)
    let data = reveal
    if (!data) {
      setLoading(target)
      try {
        data = await onReveal()
        setReveal(data)
      } catch {
        setRevealError(true)
        setLoading(null)
        return
      }
      setLoading(null)
    }
    setSheet(target)
  }

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
                  style={{ background: 'var(--color-accent)', color: '#fff' }}>
                  Update Champion ✓
                </button>
              </form>
            )}
            {canReveal && (
              <RevealButton
                label="See everyone's champion"
                loading={loading === 'winner'}
                error={revealError}
                onClick={() => openSheet('winner')}
              />
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
                  style={{ background: 'var(--color-accent)', color: '#fff' }}>
                  Update Scorer ✓
                </button>
              </form>
            )}
            {canReveal && (
              <RevealButton
                label="See everyone's top scorer"
                loading={loading === 'scorer'}
                error={revealError}
                onClick={() => openSheet('scorer')}
              />
            )}
          </div>
        </>
      )}

      {sheet && reveal && myUserId && (
        <PredictionRevealSheet
          title={sheet === 'winner' ? '🏆 Champion · Picks' : '⚽ Top scorer · Picks'}
          rows={sheet === 'winner' ? reveal.winner : reveal.scorer}
          myUserId={myUserId}
          onClose={() => setSheet(null)}
        />
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
            style={{ background: 'var(--color-accent)', color: '#fff' }}>
            Save Picks ✓
          </button>
        </form>
      )}

      {/* Locked without a pick: still let the player see what everyone else chose. */}
      {!pick && canReveal && (
        <div className="space-y-2">
          <RevealButton
            label="See everyone's champion"
            loading={loading === 'winner'}
            error={revealError}
            onClick={() => openSheet('winner')}
          />
          <RevealButton
            label="See everyone's top scorer"
            loading={loading === 'scorer'}
            error={revealError}
            onClick={() => openSheet('scorer')}
          />
        </div>
      )}
    </div>
  )
}

function RevealButton({
  label, loading, error, onClick,
}: {
  label: string; loading: boolean; error: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="mt-3 w-full rounded-[10px] px-3 py-2 text-[12px] font-bold uppercase disabled:cursor-not-allowed"
      style={{
        fontFamily: 'var(--font-display)',
        color: error ? 'var(--color-danger)' : 'var(--color-gold)',
        background: error ? 'var(--color-danger-soft)' : 'var(--color-amber-soft)',
        border: error ? '1px solid var(--border-danger)' : '1px solid var(--border-warn)',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? '…' : error ? 'Could not load picks' : `👁 ${label}`}
    </button>
  )
}
