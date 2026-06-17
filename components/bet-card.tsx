'use client'
import { useReducer, useRef, useTransition } from 'react'
import dynamic from 'next/dynamic'
import type { Pick } from '@/lib/types'
import type { Insight } from '@/lib/crowd'
import type { SaveResult } from '@/lib/prediction-saves'
import type { PlayerRevealRow } from '@/lib/prediction-reveals'
import { formatAppTime } from '@/lib/time'
import { getFlag } from '@/lib/display'
import { CrowdInsight } from './crowd-insight'

const PredictionRevealSheet = dynamic(
  () => import('./prediction-reveal-sheet').then(m => ({ default: m.PredictionRevealSheet })),
  { ssr: false },
)

/** A single selectable outcome. `label` is the human text; `pick` is the 1/X/2 slot. */
export interface BetOption {
  pick: Pick
  label: string
  odds: number
}

type Variant = 'match' | 'pika'

interface Props {
  id: string
  variant: Variant
  /** Outcomes in display order. Two entries (1, 2) for a two-way pikanteria; three otherwise. */
  options: BetOption[]
  result: Pick | null
  currentPick: Pick | null
  isLocked: boolean
  onSave: (id: string, pick: Pick) => Promise<SaveResult>
  /** Crowd-pick percentages keyed by pick, revealed only once the item is locked. */
  crowd?: Partial<Record<Pick, number>> | null
  crowdTotal?: number

  // Player reveal — after lock, fetch who picked what (server action).
  myUserId?: string
  onReveal?: (id: string) => Promise<PlayerRevealRow[]>

  // Match-only presentation
  homeTeam?: string
  awayTeam?: string
  kickoffTime?: string
  stageLabel?: string
  insight?: Insight | null

  // Live score — written by the background sync; display-only, no scoring impact.
  liveStatus?: 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | null
  liveScoreHome?: number | null
  liveScoreAway?: number | null

  // Pikanteria-only presentation
  question?: string
}

// The selected-button highlight follows the item theme: green for matches,
// amber (spicy) for pikanteria. The correct/wrong verdict stays green/red for
// both — that's win/lose, independent of theme.
const THEME: Record<Variant, { accent: string; accentSoft: string; borderAccent: string; shadow: string }> = {
  match: {
    accent: 'var(--color-accent)', accentSoft: 'var(--color-accent-soft)',
    borderAccent: 'var(--border-accent)', shadow: '0 4px 16px color-mix(in srgb, var(--color-accent) 35%, transparent)',
  },
  pika: {
    accent: 'var(--color-amber)', accentSoft: 'var(--color-amber-soft)',
    borderAccent: 'var(--border-warn)', shadow: '0 4px 14px rgba(245,166,35,0.35)',
  },
}

const MATCH_SEG_COLOR: Record<Pick, string> = {
  '1': 'var(--color-accent)', X: 'var(--color-dim)', '2': 'var(--color-amber)',
}
const PIKA_SEG_COLORS = ['var(--color-amber)', 'var(--color-dim)', 'var(--color-silver)']
const VERDICT_FONT_STYLE = { fontFamily: 'var(--font-display)', letterSpacing: '0.04em' as const }

type BetCardState = {
  optimisticPick: Pick | null
  error: string | null
  saving: boolean
  revealRows: PlayerRevealRow[] | null
  revealLoading: boolean
  revealError: boolean
  sheetOpen: boolean
}

type BetCardAction =
  | { type: 'selectionStarted'; pick: Pick }
  | { type: 'selectionRejected'; previous: Pick | null; message: string }
  | { type: 'selectionFinished' }
  | { type: 'revealStarted' }
  | { type: 'revealLoaded'; rows: PlayerRevealRow[] }
  | { type: 'revealFailed' }
  | { type: 'sheetClosed' }

function betCardReducer(state: BetCardState, action: BetCardAction): BetCardState {
  switch (action.type) {
    case 'selectionStarted':
      return { ...state, optimisticPick: action.pick, error: null, saving: true }
    case 'selectionRejected':
      return { ...state, optimisticPick: action.previous, error: action.message }
    case 'selectionFinished':
      return { ...state, saving: false }
    case 'revealStarted':
      return { ...state, revealLoading: true, revealError: false }
    case 'revealLoaded':
      return { ...state, revealRows: action.rows, sheetOpen: true, revealLoading: false }
    case 'revealFailed':
      return { ...state, revealError: true, revealLoading: false }
    case 'sheetClosed':
      return { ...state, sheetOpen: false }
  }
}

export function BetCard(props: Props) {
  const {
    id, variant, options, result, currentPick, isLocked, onSave,
    crowd, crowdTotal = 0, myUserId, onReveal,
    homeTeam, awayTeam, kickoffTime, stageLabel, insight, question,
    liveStatus, liveScoreHome, liveScoreAway,
  } = props
  const theme = THEME[variant]

  const oddsByPick: Partial<Record<Pick, number>> = {}
  for (const o of options) oddsByPick[o.pick] = o.odds

  // Optimistic overlay instead of copying the prop into state. On a successful
  // save, keep the optimistic pick visible until the keyed server refresh
  // remounts the card with the new authoritative prop.
  const [state, dispatch] = useReducer(betCardReducer, {
    optimisticPick: null,
    error: null,
    saving: false,
    revealRows: null,
    revealLoading: false,
    revealError: false,
    sheetOpen: false,
  })
  const selected = state.optimisticPick ?? currentPick

  const hasResult = result !== null
  const isCorrect = hasResult && selected !== null && selected === result
  const isWrong = hasResult && selected !== null && selected !== result
  const [pending, startTransition] = useTransition()
  const inFlightRef = useRef(false)

  async function handleReveal() {
    if (!onReveal || state.sheetOpen) return
    dispatch({ type: 'revealStarted' })
    try {
      const rows = await onReveal(id)
      dispatch({ type: 'revealLoaded', rows })
    } catch {
      dispatch({ type: 'revealFailed' })
    }
  }

  const labelFor = (pick: Pick | null): string | null =>
    pick === null ? null : (options.find(o => o.pick === pick)?.label ?? pick)

  function handleSelect(pick: Pick) {
    if (isLocked || inFlightRef.current || selected === pick) return
    const previous = state.optimisticPick
    inFlightRef.current = true
    dispatch({ type: 'selectionStarted', pick })
    startTransition(async () => {
      try {
        const result = await onSave(id, pick)
        if (!result.ok) {
          dispatch({ type: 'selectionRejected', previous, message: result.message })
        }
      } catch {
        dispatch({
          type: 'selectionRejected',
          previous,
          message: variant === 'pika'
            ? 'Could not save pikanteria answer. Please try again.'
            : 'Could not save prediction. Please try again.',
        })
      } finally {
        inFlightRef.current = false
        dispatch({ type: 'selectionFinished' })
      }
    })
  }

  return (
    <div
      className={variant === 'match' ? 'pitch-stripes rounded-2xl overflow-hidden' : 'rounded-2xl overflow-hidden'}
      style={{
        background: isCorrect
          ? 'color-mix(in srgb, var(--color-accent) 40%, var(--color-panel))'
          : isWrong
            ? 'color-mix(in srgb, var(--color-danger) 14%, var(--color-panel))'
            : 'var(--color-panel)',
        border: isCorrect
          ? '2px solid color-mix(in srgb, var(--color-accent) 65%, transparent)'
          : isWrong
            ? '1px solid var(--border-danger)'
            : variant === 'pika' ? '1px solid var(--border-warn)' : '1px solid var(--border-base)',
        boxShadow: isCorrect
          ? '0 4px 32px color-mix(in srgb, var(--color-accent) 55%, transparent)'
          : isWrong
            ? '0 4px 24px rgba(220,38,38,0.22)'
            : 'var(--shadow-card)',
      }}
    >
      {variant === 'match' ? (
        <MatchHeader
          kickoff={formatAppTime(kickoffTime!)}
          stageLabel={stageLabel ?? ''}
          isCorrect={isCorrect}
          isWrong={isWrong}
          selectedLabel={labelFor(selected)}
          isLocked={isLocked}
          liveStatus={liveStatus}
        />
      ) : (
        <PikaHeader
          isCorrect={isCorrect}
          isWrong={isWrong}
          selectedLabel={labelFor(selected)}
          isLocked={isLocked}
        />
      )}

      {variant === 'match' ? (
        <TeamsRow
          homeTeam={homeTeam!} awayTeam={awayTeam!} result={result} selected={selected}
          liveStatus={liveStatus} liveScoreHome={liveScoreHome} liveScoreAway={liveScoreAway}
        />
      ) : (
        <QuestionBlock question={question ?? ''} result={result} resultLabel={labelFor(result)} />
      )}

      <PickButtons
        variant={variant}
        options={options}
        selected={selected}
        result={result}
        theme={theme}
        isLocked={isLocked}
        disabled={isLocked || pending || state.saving}
        onSelect={handleSelect}
      />

      <ErrorMessage error={state.error} />

      <CrowdSection
        variant={variant}
        isLocked={isLocked}
        crowd={crowd}
        crowdTotal={crowdTotal}
        insight={insight}
        options={options}
        selected={selected}
        theme={theme}
        onReveal={onReveal && myUserId ? handleReveal : undefined}
        revealLoading={state.revealLoading}
        revealError={state.revealError}
      />

      {state.sheetOpen && state.revealRows !== null && myUserId && (
        <PredictionRevealSheet
          title={variant === 'match' ? `${homeTeam} vs ${awayTeam} · Picks` : (question ?? 'Picks')}
          rows={state.revealRows.map(row => ({ ...row, odds: oddsByPick[row.pick as Pick] ?? null }))}
          myUserId={myUserId}
          optionLabels={variant === 'pika' ? Object.fromEntries(options.map(o => [o.pick, o.label])) : undefined}
          result={result}
          onClose={() => dispatch({ type: 'sheetClosed' })}
        />
      )}
    </div>
  )
}

function VerdictChip({
  isCorrect, isWrong, selectedLabel, isLocked,
}: {
  isCorrect: boolean; isWrong: boolean; selectedLabel: string | null; isLocked: boolean
}) {
  const base = 'text-[12px] px-2 py-0.5 rounded-full font-bold'
  if (isCorrect) {
    return <span className={base} style={{ color: '#fff', background: 'var(--color-accent)', border: '1px solid transparent', ...VERDICT_FONT_STYLE }}>✓ Correct</span>
  }
  if (isWrong) {
    return <span className={base} style={{ color: '#fff', background: 'var(--color-danger)', border: '1px solid var(--border-danger)', ...VERDICT_FONT_STYLE }}>✗ Wrong</span>
  }
  if (selectedLabel) {
    return <span className={base} style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)', ...VERDICT_FONT_STYLE }}>✓ {selectedLabel}</span>
  }
  return (
    <span className="text-[12px] px-2 py-0.5 rounded-full"
      style={{ color: 'var(--color-muted)', background: 'var(--color-elev)', border: '1px solid var(--border-base)', ...VERDICT_FONT_STYLE }}>
      {isLocked ? '🔒 Locked' : 'Pick'}
    </span>
  )
}

function MatchHeader({
  kickoff, stageLabel, isCorrect, isWrong, selectedLabel, isLocked, liveStatus,
}: {
  kickoff: string; stageLabel: string; isCorrect: boolean; isWrong: boolean
  selectedLabel: string | null; isLocked: boolean
  liveStatus?: 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | null
}) {
  const isLive    = liveStatus === 'IN_PLAY'
  const isHalfTime = liveStatus === 'PAUSED'

  return (
    <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {isLive ? (
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(220,38,38,0.15)', color: 'var(--color-danger)', border: '1px solid rgba(220,38,38,0.3)', letterSpacing: '0.06em' }}>
          ● LIVE
        </span>
      ) : isHalfTime ? (
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
          style={{ background: 'var(--color-elev)', color: 'var(--color-sub)', border: '1px solid var(--border-base)', letterSpacing: '0.06em' }}>
          ⏸ HT
        </span>
      ) : (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-muted)', letterSpacing: '0.04em' }}>
          {kickoff}
        </span>
      )}
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-sub)' }}>
        {stageLabel}
      </span>
      <VerdictChip isCorrect={isCorrect} isWrong={isWrong} selectedLabel={selectedLabel} isLocked={isLocked} />
    </div>
  )
}

function PikaHeader({
  isCorrect, isWrong, selectedLabel, isLocked,
}: {
  isCorrect: boolean; isWrong: boolean; selectedLabel: string | null; isLocked: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2"
      style={{ background: 'var(--color-amber-soft)', borderBottom: '1px solid var(--border-warn)' }}>
      <span className="flex items-center gap-2">
        <span style={{ fontSize: 14 }}>🌶️</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-amber)', fontWeight: 600 }}>
          Pikanteria
        </span>
      </span>
      <VerdictChip isCorrect={isCorrect} isWrong={isWrong} selectedLabel={selectedLabel} isLocked={isLocked} />
    </div>
  )
}

function QuestionBlock({
  question, result, resultLabel,
}: {
  question: string; result: Pick | null; resultLabel: string | null
}) {
  return (
    <div className="px-4 pt-3 pb-1">
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.45 }}>
        {question}
      </p>
      {result !== null && (
        <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gold)', background: 'var(--color-amber-soft)' }}>
          Result: {resultLabel ?? result}
        </div>
      )}
    </div>
  )
}

function TeamsRow({
  homeTeam, awayTeam, result, selected, liveStatus, liveScoreHome, liveScoreAway,
}: {
  homeTeam: string; awayTeam: string; result: Pick | null; selected: Pick | null
  liveStatus?: 'TIMED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | null
  liveScoreHome?: number | null
  liveScoreAway?: number | null
}) {
  const showLiveScore = (liveStatus === 'IN_PLAY' || liveStatus === 'PAUSED')
    && liveScoreHome !== null && liveScoreHome !== undefined
    && liveScoreAway !== null && liveScoreAway !== undefined

  return (
    <div className="flex items-center justify-around px-4 py-5">
      <TeamBlock name={homeTeam} selected={selected === '1'} />
      <div className="flex flex-col items-center gap-1">
        {showLiveScore ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '0.04em', lineHeight: 1 }}>
            {liveScoreHome} – {liveScoreAway}
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--color-dim)', letterSpacing: '0.04em' }}>
            VS
          </div>
        )}
        {result && (
          <div className="text-[12px] font-bold px-2 py-0.5 rounded"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-gold)', background: 'var(--color-amber-soft)' }}>
            {result}
          </div>
        )}
      </div>
      <TeamBlock name={awayTeam} selected={selected === '2'} />
    </div>
  )
}

function PickButtons({
  variant, options, selected, result, theme, isLocked, disabled, onSelect,
}: {
  variant: Variant
  options: BetOption[]
  selected: Pick | null
  result: Pick | null
  theme: typeof THEME[Variant]
  isLocked: boolean
  disabled: boolean
  onSelect: (pick: Pick) => void
}) {
  return (
    <div className={`grid gap-2 px-4 pb-4 ${variant === 'match' ? 'grid-cols-3' : ''}`}
      style={variant === 'pika' ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}>
      {options.map(({ pick, label, odds }) => {
        const sel = selected === pick
        const isWinner = result !== null && result === pick
        return (
          <button
            key={pick}
            type="button"
            onClick={() => onSelect(pick)}
            disabled={disabled}
            className="flex flex-col items-center rounded-xl py-3 transition-all duration-150"
            style={{
              background: sel ? theme.accent : 'var(--color-elev)',
              color: sel ? '#fff' : 'var(--color-text)',
              border: isWinner && !sel
                ? '1px solid var(--border-accent)'
                : sel ? '1px solid transparent' : '1px solid var(--border-base)',
              opacity: isLocked ? 0.55 : 1,
              cursor: isLocked || disabled ? 'not-allowed' : 'pointer',
              transform: sel ? 'scale(1.03)' : 'scale(1)',
              boxShadow: sel ? theme.shadow : 'none',
            }}
          >
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: variant === 'match' ? 20 : 14,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: pick === 'X' && variant === 'match' ? 0 : '0.03em',
              textAlign: 'center',
            }}>
              {variant === 'match' ? pick : label}
            </span>
            <span className="mt-0.5" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: sel ? 0.7 : 0.55 }}>
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
    <div role="alert" className="px-4 pb-3 text-[12px] font-semibold" style={{ color: 'var(--color-danger)' }}>
      {error}
    </div>
  )
}

function CrowdSection({
  variant, isLocked, crowd, crowdTotal, insight, options, selected, theme,
  onReveal, revealLoading, revealError,
}: {
  variant: Variant
  isLocked: boolean
  crowd?: Partial<Record<Pick, number>> | null
  crowdTotal: number
  insight?: Insight | null
  options: BetOption[]
  selected: Pick | null
  theme: typeof THEME[Variant]
  onReveal?: () => void
  revealLoading?: boolean
  revealError?: boolean
}) {
  const segColor = (pick: Pick, i: number) =>
    variant === 'match' ? MATCH_SEG_COLOR[pick] : PIKA_SEG_COLORS[i % PIKA_SEG_COLORS.length]

  if (!isLocked) {
    return (
      <div className="px-4 pb-3" style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
        Crowd revealed at lock
      </div>
    )
  }

  const hasCrowd = !!crowd && crowdTotal > 0

  return (
    <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
      {hasCrowd && (
        <>
          <div className="flex items-center justify-between mb-2 gap-2">
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>
              Crowd · {crowdTotal} {crowdTotal === 1 ? 'pick' : 'picks'}
            </span>
            {insight && <CrowdInsight insight={insight} />}
          </div>

          <div className="flex w-full rounded-full overflow-hidden" style={{ height: 8, background: 'var(--color-elev)' }}>
            {options.map(({ pick }, i) =>
              (crowd![pick] ?? 0) > 0 ? (
                <div key={pick} style={{ width: `${crowd![pick]}%`, background: segColor(pick, i), opacity: selected === pick ? 1 : 0.8 }} />
              ) : null
            )}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {options.map(({ pick, label }) => (
              <span key={pick} style={{
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: selected === pick ? theme.accent : 'var(--color-muted)',
                fontWeight: selected === pick ? 700 : 400,
              }}>
                {crowd![pick] ?? 0}% · {variant === 'match' ? pick : label}
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
          className={`w-full rounded-[10px] px-3 py-1.5 text-[12px] font-bold uppercase disabled:cursor-not-allowed ${hasCrowd ? 'mt-2.5' : ''}`}
          style={{
            fontFamily: 'var(--font-display)',
            color: revealError ? 'var(--color-danger)' : theme.accent,
            background: revealError ? 'var(--color-danger-soft)' : theme.accentSoft,
            border: revealError ? '1px solid var(--border-danger)' : `1px solid ${theme.borderAccent}`,
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
      <div className="size-12 rounded-full flex items-center justify-center text-2xl"
        style={{
          background: selected ? 'var(--color-accent-soft)' : 'var(--color-elev)',
          border: selected ? '2px solid var(--border-accent)' : '2px solid var(--border-base)',
          boxShadow: selected ? '0 0 12px color-mix(in srgb, var(--color-accent) 25%, transparent)' : 'none',
          transform: selected ? 'scale(1.08)' : 'scale(1)',
          transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.15s',
        }}>
        <span style={{ fontSize: 24, display: 'block' }}>{getFlag(name)}</span>
      </div>
      <div className="text-center leading-tight"
        style={{
          fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: selected ? 'var(--color-accent)' : 'var(--color-sub)', fontWeight: selected ? 700 : 500,
        }}>
        {name}
      </div>
    </div>
  )
}
