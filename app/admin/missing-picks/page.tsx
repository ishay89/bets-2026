import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import Link from 'next/link'
import { getPublishedMatchDaysWithAll } from '@/lib/data'
import {
  computeAllPlayersMissingPicks,
  computeMissingPicksViewState,
  type MissingPicksSummary,
} from '@/lib/missing-picks'

export const metadata = { title: 'Missing Picks | Admin' }

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter Finals',
  sf: 'Semi Finals', '3rd': 'Third Place', final: 'Final',
}

function throwQueryError(label: string, error: { message: string } | null) {
  if (error) {
    throw new Error(`Failed to load missing-picks ${label}: ${error.message}`)
  }
}

export default async function MissingPicksPage() {
  await assertAdmin()
  const supabase = createAdminClient()

  const [matchDays, predictionsResult, answersResult, futuresPicksResult, playersResult, tournamentSettingsResult] =
    await Promise.all([
      getPublishedMatchDaysWithAll(supabase),
      supabase.from('predictions').select('user_id, match_id'),
      supabase.from('pikanteria_answers').select('user_id, pikanteria_id'),
      supabase.from('pre_tournament_picks').select('user_id, winner_team, top_scorer'),
      supabase.from('users').select('id, display_name').eq('status', 'approved').eq('is_monkey', false),
      supabase.from('tournament_settings').select('futures_locked, futures_published').eq('id', true).single(),
    ])

  const { data: predictions, error: predictionsError } = predictionsResult
  const { data: answers, error: answersError } = answersResult
  const { data: futuresPicks, error: futuresPicksError } = futuresPicksResult
  const { data: players, error: playersError } = playersResult
  const { data: tournamentSettings, error: tournamentSettingsError } = tournamentSettingsResult

  throwQueryError('predictions', predictionsError)
  throwQueryError('pikanteria answers', answersError)
  throwQueryError('futures picks', futuresPicksError)
  throwQueryError('players', playersError)
  throwQueryError('tournament settings', tournamentSettingsError)

  const futuresOpen = (tournamentSettings?.futures_published ?? true) && !(tournamentSettings?.futures_locked ?? false)

  const summary = computeAllPlayersMissingPicks({
    matchDays,
    players: players ?? [],
    predictions: predictions ?? [],
    answers: answers ?? [],
    futuresPicks: futuresPicks ?? [],
    futuresOpen,
  })

  const { hasOpenItems, hasMissingPicks } = computeMissingPicksViewState(summary)

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">
      <div>
        <Link href="/admin" className="text-muted hover:text-amber transition-colors text-xs">
          ← Admin
        </Link>
        <div className="font-black text-lg mt-1" style={{ color: 'var(--color-amber)' }}>
          🔔 Missing Picks
        </div>
        <div className="text-muted text-xs">Who still needs to submit before bets lock</div>
      </div>

      {!hasMissingPicks && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-text font-semibold">Everyone&apos;s caught up</div>
          <div className="text-muted text-sm mt-1">
            {hasOpenItems ? 'All currently open predictions are submitted.' : 'Nothing is currently open for predictions.'}
          </div>
        </div>
      )}

      {hasMissingPicks && (
        <>
          <DaySummarySection summary={summary} />
          <PlayerBreakdownSection summary={summary} />
        </>
      )}
    </div>
  )
}

function DaySummarySection({ summary }: { summary: MissingPicksSummary }) {
  return (
    <div className="space-y-2">
      <div className="text-muted text-[11px] font-bold uppercase tracking-wide px-1">Open match days</div>
      {summary.days.map(d => {
        const dateLabel = new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        })
        return (
          <div key={d.matchDayId} className="rounded-xl px-4 py-3"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-text">{dateLabel}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
                {STAGE_LABELS[d.stage] ?? d.stage}
              </span>
            </div>
            <div className="text-muted text-[11px] mt-1">
              {d.submittedCount} / {d.totalSlots} submitted · {d.missingCount} missing
            </div>
          </div>
        )
      })}
      {summary.futures && (
        <div className="rounded-xl px-4 py-3"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          <div className="flex items-center gap-1.5">
            <span>🏆</span>
            <span className="text-sm font-bold text-text">Tournament Winner & Top Scorer</span>
          </div>
          <div className="text-muted text-[11px] mt-1">
            {summary.futures.completedCount} / {summary.futures.totalPlayers} completed
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerBreakdownSection({ summary }: { summary: MissingPicksSummary }) {
  return (
    <div className="space-y-2">
      <div className="text-muted text-[11px] font-bold uppercase tracking-wide px-1">Players</div>
      {summary.players.map(row => (
        <Link key={row.player.id} href={`/admin/players/${row.player.id}`}
          className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-[13px] text-text truncate">{row.player.display_name}</span>
            <FuturesBadge missing={row.futuresMissing} />
          </div>
          <MissingCountBadge count={row.missingCount} />
        </Link>
      ))}
    </div>
  )
}

function FuturesBadge({ missing }: { missing: boolean }) {
  const styles = missing
    ? { color: 'var(--color-danger)', background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }
    : { color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }
  return (
    <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0" style={styles}>
      {missing ? '🏆 ✗' : '🏆 ✓'}
    </span>
  )
}

function MissingCountBadge({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-3"
        style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }}>
        ✓ all done
      </span>
    )
  }
  return (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-3"
      style={{ color: 'var(--color-danger)', background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
      {count} missing
    </span>
  )
}
