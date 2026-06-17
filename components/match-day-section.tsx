'use client'
import { BetCard, type BetOption } from './bet-card'
import { LockTimer } from './lock-timer'
import type { FullMatchDay } from '@/lib/data'
import type { Pick, Match, Pikanteria } from '@/lib/types'
import type { SaveResult } from '@/lib/prediction-saves'
import type { PlayerRevealRow } from '@/lib/prediction-reveals'
import type { CrowdTally } from '@/lib/crowd'
import { toPct, matchInsight } from '@/lib/crowd'
import { isMatchLocked, isPikanteriaLocked, matchLockMs } from '@/lib/lock'
import { formatAppDate } from '@/lib/time'

export const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter Finals',
  sf: 'Semi Finals', '3rd': 'Third Place', final: 'Final',
}

export function matchOptions(match: Match): BetOption[] {
  return [
    { pick: '1', label: match.home_team, odds: match.odds_home },
    { pick: 'X', label: 'Draw', odds: match.odds_draw },
    { pick: '2', label: match.away_team, odds: match.odds_away },
  ]
}

export function pikaOptions(item: Pikanteria): BetOption[] {
  const opts: BetOption[] = [{ pick: '1', label: item.label_1, odds: item.odds_1 }]
  if (item.odds_x != null && item.label_x != null) {
    opts.push({ pick: 'X', label: item.label_x, odds: item.odds_x })
  }
  opts.push({ pick: '2', label: item.label_2, odds: item.odds_2 })
  return opts
}

export interface MatchDaySectionProps {
  matchDay: FullMatchDay
  today: string
  predictionMap: Record<string, Pick>
  answerMap: Record<string, Pick>
  crowdTally: Record<string, CrowdTally>
  crowdPikTally: Record<string, CrowdTally>
  userId: string
  onSavePick: (id: string, pick: Pick) => Promise<SaveResult>
  onSaveAnswer: (id: string, pick: Pick) => Promise<SaveResult>
  onRevealMatch: (id: string) => Promise<PlayerRevealRow[]>
  onRevealPikanteria: (id: string) => Promise<PlayerRevealRow[]>
  showTopDivider?: boolean
}

export function MatchDaySection({
  matchDay, today, predictionMap, answerMap, crowdTally, crowdPikTally,
  userId, onSavePick, onSaveAnswer, onRevealMatch, onRevealPikanteria, showTopDivider,
}: MatchDaySectionProps) {
  const isToday = matchDay.date === today
  const stageLabel = STAGE_LABELS[matchDay.stage] ?? matchDay.stage
  const pikaItems = matchDay.pikanteria
  const sortedMatches = [...matchDay.matches].sort(
    (a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
  )
  const dateLabel = formatAppDate(matchDay.date)
  const allMatchesLocked = sortedMatches.length > 0 && sortedMatches.every(m => isMatchLocked(m))
  const earliestLockTime = sortedMatches.length > 0
    ? new Date(Math.min(...sortedMatches.map(m => matchLockMs(m.kickoff_time)))).toISOString()
    : matchDay.lock_time

  return (
    <div className="space-y-3">
      {showTopDivider && (
        <div className="border-t" style={{ borderColor: 'var(--border-subtle)' }} />
      )}

      <div className="flex items-center justify-between pt-1">
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
            {stageLabel}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--color-text)' }}>{dateLabel}</span>
            {isToday && (
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', padding: '2px 7px', borderRadius: 9999, background: 'var(--color-accent)', color: '#fff' }}>
                TODAY
              </span>
            )}
          </div>
        </div>

        {sortedMatches.length > 0 && (allMatchesLocked ? (
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 10px', borderRadius: 9999, background: 'var(--color-danger-soft)', color: 'var(--color-danger)', border: '1px solid var(--border-danger)' }}>
            🔒 Locked
          </div>
        ) : (
          <LockTimer lockTime={earliestLockTime} />
        ))}
      </div>

      {sortedMatches.map(match => {
        const tally = crowdTally[match.id] ?? { '1': 0, X: 0, '2': 0, total: 0 }
        return (
          <BetCard
            key={`${match.id}:${predictionMap[match.id] ?? 'none'}`}
            id={match.id}
            variant="match"
            options={matchOptions(match)}
            result={match.result}
            homeTeam={match.home_team}
            awayTeam={match.away_team}
            kickoffTime={match.kickoff_time}
            stageLabel={stageLabel}
            currentPick={predictionMap[match.id] ?? null}
            isLocked={isMatchLocked(match)}
            onSave={onSavePick}
            crowd={toPct(tally)}
            crowdTotal={tally.total}
            insight={matchInsight({
              tally,
              odds: { '1': match.odds_home, X: match.odds_draw, '2': match.odds_away },
              myPick: predictionMap[match.id] ?? null,
            })}
            myUserId={userId}
            onReveal={onRevealMatch}
            liveStatus={match.live_status}
            liveScoreHome={match.live_score_home}
            liveScoreAway={match.live_score_away}
          />
        )
      })}

      {pikaItems.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <span className="text-lg">🌶️</span>
            <span className="text-[10px] font-bold uppercase tracking-[1.2px]"
              style={{ color: 'var(--color-amber)' }}>
              Pikanteria · {pikaItems.length} side bets
            </span>
          </div>
          {pikaItems.map(item => {
            const tally = crowdPikTally[item.id] ?? { '1': 0, X: 0, '2': 0, total: 0 }
            return (
              <BetCard
                key={`${item.id}:${answerMap[item.id] ?? 'none'}`}
                id={item.id}
                variant="pika"
                question={item.question}
                options={pikaOptions(item)}
                result={item.result}
                currentPick={answerMap[item.id] ?? null}
                isLocked={isPikanteriaLocked(item)}
                onSave={onSaveAnswer}
                crowd={toPct(tally)}
                crowdTotal={tally.total}
                myUserId={userId}
                onReveal={onRevealPikanteria}
              />
            )
          })}
        </>
      )}
    </div>
  )
}
