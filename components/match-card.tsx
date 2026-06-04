'use client'
import { useRef, useState, useTransition } from 'react'
import type { Match, Pick } from '@/lib/types'
import type { CrowdPct, Insight } from '@/lib/crowd'
import type { SaveResult } from '@/lib/prediction-saves'
import { CrowdInsight } from './crowd-insight'
import type { PlayerRevealRow } from '@/lib/prediction-reveals'
import { PredictionRevealSheet } from './prediction-reveal-sheet'

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
  onSave: (matchId: string, pick: Pick) => Promise<SaveResult>
  crowd?: CrowdPct | null
  crowdTotal?: number
  insight?: Insight | null
  myUserId?: string
  onReveal?: (matchId: string) => Promise<PlayerRevealRow[]>
}

const PICK_LABELS: Record<Pick, string> = { '1': 'Home', X: 'Draw', '2': 'Away' }
const SEG_COLOR: Record<Pick, string> = {
  '1': 'var(--color-accent)', X: 'var(--color-dim)', '2': 'var(--color-amber)',
}

export function MatchCard({ match, currentPick, isLocked, stageLabel, onSave, crowd, crowdTotal = 0, insight, myUserId, onReveal }: Props) {
  // Optimistic overlay instead of copying the prop into state. `optimisticPick`
  // is null when no in-flight pick exists; the effective selection is the
  // in-flight value or the authoritative prop.
  const [optimisticPick, setOptimisticPick] = useState<Pick | null>(null)
  const selected = optimisticPick ?? currentPick

  const hasResult = match.result !== null
  const isCorrect = hasResult && selected !== null && selected === match.result
  const isWrong = hasResult && selected !== null && selected !== match.result
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pending, startTransition] = useTransition()
  const inFlightRef = useRef(false)

  const [revealRows, setRevealRows] = useState<PlayerRevealRow[] | null>(null)
  const [revealLoading, setRevealLoading] = useState(false)
  const [revealError, setRevealError] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  async function handleReveal() {
    if (!onReveal) return
    setRevealLoading(true)
    setRevealError(false)
    try {
      const rows = await onReveal(match.id)
      setRevealRows(rows)
      setSheetOpen(true)
    } catch {
      setRevealError(true)
    } finally {
      setRevealLoading(false)
    }
  }

  function handleSelect(pick: Pick) {
    if (isLocked || inFlightRef.current || selected === pick) return
    const previous = optimisticPick
    inFlightRef.current = true
    setSaving(true)
    setError(null)
    setOptimisticPick(pick)
    startTransition(async () => {
      try {
        const result = await onSave(match.id, pick)
        if (!result.ok) {
          setOptimisticPick(previous)
          setError(result.message)
        } else {
          setOptimisticPick(null)
        }
      } catch {
        setOptimisticPick(previous)
        setError('Could not save prediction. Please try again.')
      } finally {
        inFlightRef.current = false
        setSaving(false)
      }
    })
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
        background: isCorrect
          ? 'color-mix(in srgb, var(--color-accent) 40%, var(--color-panel))'
          : isWrong
            ? 'color-mix(in srgb, var(--color-danger) 14%, var(--color-panel))'
            : 'var(--color-panel)',
        border: isCorrect
          ? '2px solid rgba(0,217,126,0.65)'
          : isWrong
            ? '1px solid var(--border-danger)'
            : '1px solid var(--border-base)',
        boxShadow: isCorrect
          ? '0 4px 32px rgba(0,217,126,0.55)'
          : isWrong
            ? '0 4px 24px rgba(220,38,38,0.22)'
            : 'var(--shadow-card)',
      }}
    >
      <CardHeader
        kickoff={kickoff}
        stageLabel={stageLabel}
        isCorrect={isCorrect}
        isWrong={isWrong}
        selected={selected}
        isLocked={isLocked}
      />

      <TeamsRow
        homeTeam={match.home_team}
        awayTeam={match.away_team}
        result={match.result}
        selected={selected}
      />

      <PickButtons
        options={options}
        selected={selected}
        isLocked={isLocked}
        disabled={isLocked || pending || saving}
        onSelect={handleSelect}
      />

      <ErrorMessage error={error} />

      <CrowdSection
        isLocked={isLocked}
        crowd={crowd}
        crowdTotal={crowdTotal}
        insight={insight}
        options={options}
        selected={selected}
        onReveal={onReveal ? handleReveal : undefined}
        revealLoading={revealLoading}
        revealError={revealError}
      />

      {sheetOpen && revealRows !== null && myUserId && (
        <PredictionRevealSheet
          title={`${match.home_team} vs ${match.away_team} · Picks`}
          rows={revealRows}
          myUserId={myUserId}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}

function CardHeader({
  kickoff,
  stageLabel,
  isCorrect,
  isWrong,
  selected,
  isLocked,
}: {
  kickoff: string
  stageLabel: string
  isCorrect: boolean
  isWrong: boolean
  selected: Pick | null
  isLocked: boolean
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--color-muted)',
          letterSpacing: '0.04em',
        }}
      >
        {kickoff}
      </span>

      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--color-sub)',
        }}
      >
        {stageLabel}
      </span>

      {isCorrect ? (
        <span
          className="text-[12px] px-2 py-0.5 rounded-full font-bold"
          style={{
            color: '#000',
            background: 'var(--color-accent)',
            border: '1px solid transparent',
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.04em',
          }}
        >
          ✓ Correct
        </span>
      ) : isWrong ? (
        <span
          className="text-[12px] px-2 py-0.5 rounded-full font-bold"
          style={{
            color: '#fff',
            background: 'var(--color-danger)',
            border: '1px solid var(--border-danger)',
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.04em',
          }}
        >
          ✗ Wrong
        </span>
      ) : selected ? (
        <span
          className="text-[12px] px-2 py-0.5 rounded-full font-bold"
          style={{
            color: 'var(--color-accent)',
            background: 'var(--color-accent-soft)',
            border: '1px solid var(--border-accent)',
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.04em',
          }}
        >
          ✓ {PICK_LABELS[selected]}
        </span>
      ) : (
        <span
          className="text-[12px] px-2 py-0.5 rounded-full"
          style={{
            color: 'var(--color-muted)',
            background: 'var(--color-elev)',
            border: '1px solid var(--border-base)',
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.04em',
          }}
        >
          {isLocked ? '🔒 Locked' : 'Pick'}
        </span>
      )}
    </div>
  )
}

function TeamsRow({
  homeTeam,
  awayTeam,
  result,
  selected,
}: {
  homeTeam: string
  awayTeam: string
  result: Pick | null
  selected: Pick | null
}) {
  return (
    <div className="flex items-center justify-around px-4 py-5">
      <TeamBlock name={homeTeam} selected={selected === '1'} />

      <div className="flex flex-col items-center gap-1">
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--color-dim)',
            letterSpacing: '0.04em',
          }}
        >
          VS
        </div>
        {result && (
          <div
            className="text-[12px] font-bold px-2 py-0.5 rounded"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-gold)',
              background: 'var(--color-amber-soft)',
            }}
          >
            {result}
          </div>
        )}
      </div>

      <TeamBlock name={awayTeam} selected={selected === '2'} />
    </div>
  )
}

function PickButtons({
  options,
  selected,
  isLocked,
  disabled,
  onSelect,
}: {
  options: [Pick, number][]
  selected: Pick | null
  isLocked: boolean
  disabled: boolean
  onSelect: (pick: Pick) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2 px-4 pb-4">
      {options.map(([pick, odds]) => {
        const sel = selected === pick
        return (
          <button
            key={pick}
            type="button"
            onClick={() => onSelect(pick)}
            disabled={disabled}
            className="flex flex-col items-center rounded-xl py-3 transition-all duration-150"
            style={{
              background: sel ? 'var(--color-accent)' : 'var(--color-elev)',
              color: sel ? '#000' : 'var(--color-text)',
              border: sel ? '1px solid transparent' : '1px solid var(--border-base)',
              opacity: isLocked ? 0.55 : 1,
              cursor: isLocked || disabled ? 'not-allowed' : 'pointer',
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
                fontSize: 12,
                opacity: sel ? 0.7 : 0.55,
              }}
            >
              {odds.toFixed(2)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ErrorMessage({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div
      role="alert"
      className="px-4 pb-3 text-[12px] font-semibold"
      style={{ color: 'var(--color-danger)' }}
    >
      {error}
    </div>
  )
}

function CrowdSection({
  isLocked,
  crowd,
  crowdTotal,
  insight,
  options,
  selected,
  onReveal,
  revealLoading,
  revealError,
}: {
  isLocked: boolean
  crowd?: CrowdPct | null
  crowdTotal: number
  insight?: Insight | null
  options: [Pick, number][]
  selected: Pick | null
  onReveal?: () => void
  revealLoading?: boolean
  revealError?: boolean
}) {
  if (!isLocked) {
    return (
      <div
        className="px-4 pb-3"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
        }}
      >
        Crowd revealed at lock
      </div>
    )
  }

  return (
    <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
      {crowd && crowdTotal > 0 && (
        <>
          <div className="flex items-center justify-between mb-2 gap-2">
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 12,
                letterSpacing: '0.04em',
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

          <div className="flex justify-between mt-1.5 mb-2">
            {options.map(([pick]) => (
              <span
                key={pick}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: selected === pick ? 'var(--color-accent)' : 'var(--color-muted)',
                  fontWeight: selected === pick ? 700 : 400,
                }}
              >
                {crowd[pick]}% · {pick}
              </span>
            ))}
          </div>
        </>
      )}

      {onReveal && (
        <button
          type="button"
          onClick={onReveal}
          disabled={revealLoading}
          style={{
            width: '100%',
            padding: '6px 12px',
            borderRadius: 10,
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: revealError ? 'var(--color-danger)' : 'var(--color-accent)',
            background: revealError ? 'var(--color-danger-soft)' : 'var(--color-accent-soft)',
            border: revealError ? '1px solid var(--border-danger)' : '1px solid var(--border-accent)',
            cursor: revealLoading ? 'not-allowed' : 'pointer',
            opacity: revealLoading ? 0.6 : 1,
          }}
        >
          {revealLoading ? '…' : revealError ? 'Could not load picks' : '👁 Picks'}
        </button>
      )}
    </div>
  )
}

function TeamBlock({ name, selected }: { name: string; selected: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2" style={{ width: 80 }}>
      <div
        className="size-12 rounded-full flex items-center justify-center text-2xl"
        style={{
          background: selected ? 'var(--color-accent-soft)' : 'var(--color-elev)',
          border: selected ? '2px solid var(--border-accent)' : '2px solid var(--border-base)',
          boxShadow: selected ? '0 0 12px rgba(0,217,126,0.25)' : 'none',
          transform: selected ? 'scale(1.08)' : 'scale(1)',
          transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.15s',
        }}
      >
        <span style={{ fontSize: 24, display: 'block' }}>{FLAGS[name] ?? '🏳️'}</span>
      </div>
      <div
        className="text-center leading-tight"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12,
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
