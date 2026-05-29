'use client'
import { useState, useTransition } from 'react'
import type { Match, Pick } from '@/lib/types'
import type { CrowdPct, Insight } from '@/lib/crowd'
import { CrowdInsight } from './crowd-insight'

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
  /** Crowd-pick percentages, revealed only once the match is locked. */
  crowd?: CrowdPct | null
  crowdTotal?: number
  insight?: Insight | null
}

const PICK_LABELS: Record<Pick, string> = { '1': 'Home', X: 'Draw', '2': 'Away' }
const SEG_COLOR: Record<Pick, string> = {
  '1': 'var(--color-accent)', X: 'var(--color-dim)', '2': 'var(--color-amber)',
}

export function MatchCard({ match, currentPick, isLocked, stageLabel, onSave, crowd, crowdTotal = 0, insight }: Props) {
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
    <div
      className="pitch-stripes rounded-2xl overflow-hidden"
      style={{
        background: 'var(--color-panel)',
        border: '1px solid var(--border-base)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-muted)',
            letterSpacing: '0.04em',
          }}
        >
          {kickoff}
        </span>

        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-sub)',
          }}
        >
          {stageLabel}
        </span>

        {selected ? (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-bold"
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
      <div className="flex items-center justify-around px-4 py-5">
        <TeamBlock name={match.home_team} selected={selected === '1'} />

        <div className="flex flex-col items-center gap-1">
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--color-dim)',
              letterSpacing: 3,
            }}
          >
            VS
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
                border: sel ? '1px solid transparent' : '1px solid var(--border-base)',
                opacity: isLocked ? 0.55 : 1,
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

      {/* Crowd picks — revealed only after lock */}
      {isLocked && crowd && crowdTotal > 0 ? (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <div className="flex items-center justify-between mb-2 gap-2">
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 9,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--color-muted)',
              }}
            >
              Crowd · {crowdTotal} {crowdTotal === 1 ? 'pick' : 'picks'}
            </span>
            {insight && <CrowdInsight insight={insight} />}
          </div>

          <div
            className="flex w-full rounded-full overflow-hidden"
            style={{ height: 8, background: 'var(--color-elev)' }}
          >
            {options.map(([pick]) =>
              crowd[pick] > 0 ? (
                <div
                  key={pick}
                  style={{
                    width: `${crowd[pick]}%`,
                    background: SEG_COLOR[pick],
                    opacity: selected === pick ? 1 : 0.8,
                  }}
                />
              ) : null
            )}
          </div>

          <div className="flex justify-between mt-1.5">
            {options.map(([pick]) => (
              <span
                key={pick}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: selected === pick ? 'var(--color-accent)' : 'var(--color-muted)',
                  fontWeight: selected === pick ? 700 : 400,
                }}
              >
                {crowd[pick]}% · {pick}
              </span>
            ))}
          </div>
        </div>
      ) : !isLocked ? (
        <div
          className="px-4 pb-3"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 9,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
          }}
        >
          Crowd revealed at lock
        </div>
      ) : null}
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
