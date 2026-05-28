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

const PICK_LABELS: Record<Pick, string> = { '1': 'Home', X: 'Draw', '2': 'Away' }

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
    <div className="bet-card p-4">
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
              border: '1px solid var(--border-accent)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.06em',
            }}
          >
            ✓ {PICK_LABELS[selected]}
          </span>
        ) : (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{
              color: 'var(--color-muted)',
              background: 'var(--color-elev)',
              border: '1px solid var(--border-base)',
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.06em',
            }}
          >
            {isLocked ? '🔒 Locked' : 'Pick'}
          </span>
        )}
      </div>

      {/* Teams */}
      <div className="flex items-center justify-around mb-4">
        <div className="flex flex-col items-center gap-1.5 min-w-[56px]">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-2xl"
            style={{ background: 'rgba(246,248,232,0.06)', border: '1px solid rgba(246,248,232,0.1)' }}>
            <span style={{ transform: 'scale(1.2)', display: 'block' }}>
              {FLAGS[match.home_team] ?? '🏳️'}
            </span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-sub)' }}>
            {match.home_team.slice(0, 3).toUpperCase()}
          </div>
        </div>
        <div className="ball-mark w-10 h-10 rounded-lg shrink-0" aria-label="versus" />
        <div className="flex flex-col items-center gap-1.5 min-w-[56px]">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-2xl"
            style={{ background: 'rgba(246,248,232,0.06)', border: '1px solid rgba(246,248,232,0.1)' }}>
            <span style={{ transform: 'scale(1.2)', display: 'block' }}>
              {FLAGS[match.away_team] ?? '🏳️'}
            </span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-sub)' }}>
            {match.away_team.slice(0, 3).toUpperCase()}
          </div>
          {match.result && (
            <div
              className="text-[11px] font-bold px-2 py-0.5 rounded"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-gold)',
                background: 'var(--color-amber-soft)',
              }}
            >
              {match.result}
            </div>
          )}
        </div>

        <TeamBlock name={match.away_team} selected={selected === '2'} />
      </div>

      {/* Bet buttons (1X2) */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        {options.map(([pick, odds]) => {
          const sel = selected === pick
          return (
            <button
              key={pick}
              onClick={() => handleSelect(pick)}
              disabled={isLocked || pending}
              className="flex flex-col items-center rounded-xl py-3 transition-all duration-150"
              style={{
                background: sel ? 'var(--color-accent)' : 'var(--color-elev)',
                color: sel ? '#000' : 'var(--color-text)',
                border: sel ? 'none' : '1px solid rgba(246,248,232,0.09)',
                opacity: isLocked ? 0.5 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                transform: sel ? 'scale(1.03)' : 'scale(1)',
                boxShadow: sel ? '0 4px 16px rgba(0,217,126,0.35)' : 'none',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: pick === 'X' ? 0 : '0.03em',
                }}
              >
                {pick}
              </span>
              <span
                className="mt-0.5"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  opacity: sel ? 0.7 : 0.55,
                }}
              >
                {odds.toFixed(2)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TeamBlock({ name, selected }: { name: string; selected: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2" style={{ width: 80 }}>
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-all"
        style={{
          background: selected ? 'var(--color-accent-soft)' : 'var(--color-elev)',
          border: selected ? '2px solid var(--border-accent)' : '2px solid var(--border-base)',
          boxShadow: selected ? '0 0 12px rgba(0,217,126,0.25)' : 'none',
          transform: selected ? 'scale(1.08)' : 'scale(1)',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: 24, display: 'block' }}>{FLAGS[name] ?? '🏳️'}</span>
      </div>
      <div
        className="text-center leading-tight"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: selected ? 'var(--color-accent)' : 'var(--color-sub)',
          fontWeight: selected ? 700 : 500,
        }}
      >
        {name}
      </div>
    </div>
  )
}
