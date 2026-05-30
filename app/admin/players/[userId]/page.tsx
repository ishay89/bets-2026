import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { isMatchLocked } from '@/lib/lock'
import type { Match, MatchDay, Pikanteria, PicanteriaOption, Pick, User } from '@/lib/types'

type FullMatchDay = MatchDay & {
  matches: Match[]
  pikanteria: (Pikanteria & { pikanteria_options: PicanteriaOption[] })[]
}

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter Finals',
  sf: 'Semi Finals', '3rd': 'Third Place', final: 'Final',
}

const PICK_LABELS: Record<Pick, string> = { '1': 'Home', X: 'Draw', '2': 'Away' }

// Module-level helpers avoid calling Date.now() directly in the component body,
// which would trigger the react-compiler purity lint rule.
function isPikLocked(day: MatchDay): boolean {
  return day.locked || Date.now() >= new Date(day.lock_time).getTime()
}

function filterOpenDays(matchDays: FullMatchDay[]) {
  return matchDays
    .map(day => {
      const openMatches = (day.matches ?? [])
        .filter(m => !isMatchLocked(m, day.locked))
        .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
      const openPikanteria = isPikLocked(day) ? [] : (day.pikanteria ?? [])
      return { day, openMatches, openPikanteria }
    })
    .filter(d => d.openMatches.length > 0 || d.openPikanteria.length > 0)
}

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  await assertAdmin()
  const supabase = createAdminClient()

  const [{ data: userRow }, { data: matchDaysRaw }, { data: predictions }, { data: answers }] =
    await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      supabase
        .from('match_days')
        .select('*, matches(*), pikanteria(*, pikanteria_options(*))')
        .not('published_at', 'is', null)
        .order('date', { ascending: true }),
      supabase.from('predictions').select('match_id, pick').eq('user_id', userId),
      supabase.from('pikanteria_answers').select('pikanteria_id, option_id').eq('user_id', userId),
    ])

  if (!userRow) notFound()
  const user = userRow as User

  const predictionMap: Record<string, Pick> = Object.fromEntries(
    (predictions ?? []).map(p => [p.match_id, p.pick as Pick])
  )
  const answerMap: Record<string, string> = Object.fromEntries(
    (answers ?? []).map(a => [a.pikanteria_id, a.option_id as string])
  )

  const matchDays = (matchDaysRaw ?? []) as FullMatchDay[]
  const openDays = filterOpenDays(matchDays)

  const totalBets = openDays.reduce((n, d) => n + d.openMatches.length + d.openPikanteria.length, 0)
  const submittedBets = openDays.reduce((n, d) => {
    const m = d.openMatches.filter(match => predictionMap[match.id]).length
    const p = d.openPikanteria.filter(item => answerMap[item.id]).length
    return n + m + p
  }, 0)

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">
      <div>
        <Link href="/admin/players" className="text-muted hover:text-amber transition-colors text-xs">
          ← Players
        </Link>
        <div className="font-black text-lg mt-1" style={{ color: 'var(--color-amber)' }}>
          {user.display_name}
        </div>
        <div className="text-muted text-[11px]">{user.email}</div>
        <div className="text-xs mt-2" style={{ color: submittedBets === totalBets ? 'var(--color-accent)' : 'var(--color-text)' }}>
          {submittedBets} / {totalBets} open bets submitted
        </div>
      </div>

      {openDays.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-text font-semibold">No open bets right now</div>
          <div className="text-muted text-sm mt-1">Nothing is currently open for predictions.</div>
        </div>
      )}

      {openDays.map(({ day, openMatches, openPikanteria }) => {
        const dateLabel = new Date(day.date + 'T12:00:00Z').toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        })
        return (
          <div key={day.id} className="space-y-2">
            <div className="flex items-center gap-2 pt-1">
              <span className="text-sm font-bold text-text">{dateLabel}</span>
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
                {STAGE_LABELS[day.stage] ?? day.stage}
              </span>
            </div>

            {openMatches.map(match => {
              const pick = predictionMap[match.id]
              return (
                <div key={match.id}
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13px] text-text truncate">
                      {match.home_team} vs {match.away_team}
                    </div>
                    <div className="text-muted text-[11px] mt-0.5">
                      {new Date(match.kickoff_time).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <StatusBadge submitted={!!pick} label={pick ? `${pick} · ${PICK_LABELS[pick]}` : undefined} />
                </div>
              )
            })}

            {openPikanteria.map(item => {
              const optionId = answerMap[item.id]
              const option = (item.pikanteria_options ?? []).find(o => o.id === optionId)
              return (
                <div key={item.id}
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span>🌶️</span>
                      <span className="font-semibold text-[13px] text-text truncate">{item.question}</span>
                    </div>
                  </div>
                  <StatusBadge submitted={!!optionId} label={option?.label} />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function StatusBadge({ submitted, label }: { submitted: boolean; label?: string }) {
  if (submitted) {
    return (
      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-3 truncate max-w-[45%]"
        style={{ color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }}>
        ✓ {label}
      </span>
    )
  }
  return (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-3"
      style={{ color: 'var(--color-danger)', background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
      ✗ Missing
    </span>
  )
}
