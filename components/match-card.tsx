'use client'
import { useState, useTransition } from 'react'
import type { Match, Pick } from '@/lib/types'

const FLAGS: Record<string, string> = {
  France: '🇫🇷', Spain: '🇪🇸', Brazil: '🇧🇷', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Argentina: '🇦🇷', Netherlands: '🇳🇱', Portugal: '🇵🇹', Germany: '🇩🇪',
  Italy: '🇮🇹', Belgium: '🇧🇪', Croatia: '🇭🇷', Uruguay: '🇺🇾',
  Mexico: '🇲🇽', USA: '🇺🇸', Canada: '🇨🇦', Japan: '🇯🇵',
  'South Korea': '🇰🇷', Morocco: '🇲🇦',
}

interface Props {
  match: Match
  currentPick: Pick | null
  isLocked: boolean
  stageLabel: string
  onSave: (matchId: string, pick: Pick) => Promise<void>
}

export function MatchCard({ match, currentPick, isLocked, stageLabel, onSave }: Props) {
  const [selected, setSelected] = useState<Pick | null>(currentPick)
  const [pending, startTransition] = useTransition()

  function handleSelect(pick: Pick) {
    if (isLocked) return
    setSelected(pick)
    startTransition(() => onSave(match.id, pick))
  }

  const kickoff = new Date(match.kickoff_time).toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  })

  const options: [Pick, number][] = [
    ['1', match.odds_home],
    ['X', match.odds_draw],
    ['2', match.odds_away],
  ]

  return (
    <div className="rounded-[14px] p-4"
      style={{ background: 'var(--color-panel)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold uppercase tracking-wide"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-muted)' }}>
          {kickoff} · {stageLabel}
        </div>
        {selected && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              color: 'var(--color-accent)',
              background: 'var(--color-accent-soft)',
              border: '1px solid var(--color-accent-line)',
            }}>
            Picked: {selected}
          </span>
        )}
      </div>

      {/* Teams */}
      <div className="flex items-center justify-around mb-4">
        <div className="flex flex-col items-center gap-1.5 min-w-[56px]">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-2xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ transform: 'scale(1.2)', display: 'block' }}>
              {FLAGS[match.home_team] ?? '🏳️'}
            </span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-sub)' }}>
            {match.home_team.slice(0, 3).toUpperCase()}
          </div>
        </div>
        <div className="text-[14px] font-bold" style={{ color: 'var(--color-dim)', letterSpacing: 1 }}>VS</div>
        <div className="flex flex-col items-center gap-1.5 min-w-[56px]">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-2xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ transform: 'scale(1.2)', display: 'block' }}>
              {FLAGS[match.away_team] ?? '🏳️'}
            </span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-sub)' }}>
            {match.away_team.slice(0, 3).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Pick buttons */}
      <div className="flex gap-1.5">
        {options.map(([pick, odds]) => {
          const sel = selected === pick
          return (
            <button
              key={pick}
              onClick={() => handleSelect(pick)}
              disabled={isLocked || pending}
              className="flex-1 flex flex-col items-center gap-0.5 rounded-[10px] py-3 transition-all"
              style={{
                background: sel ? 'var(--color-accent)' : 'var(--color-elev)',
                color: sel ? '#000' : 'var(--color-text)',
                border: sel ? 'none' : '1px solid rgba(255,255,255,0.06)',
                opacity: isLocked ? 0.5 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
              }}
            >
              <span className="font-extrabold text-[14px]">{pick}</span>
              <span className="text-[11px] font-semibold opacity-75"
                style={{ fontFamily: 'var(--font-mono)' }}>
                {odds.toFixed(2)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
