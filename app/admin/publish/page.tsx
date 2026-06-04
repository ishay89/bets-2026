import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { parseUUID, parseOdds, parsePikanteriaOutcomes } from '@/lib/validation'
import {
  buildAutomatedMatchRows,
  buildAutomatedPikaRows,
  type AutomatedUser,
} from '@/lib/monkey'
import { setPikanteriaPublishedAt } from '@/lib/publishing'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { PicanteriaBuilder } from '@/components/pikanteria-builder'

type AdminClient = ReturnType<typeof createAdminClient>

// Automated benchmark players (those with an automation_strategy).
async function getAutomatedUsers(supabase: AdminClient): Promise<AutomatedUser[]> {
  const { data } = await supabase
    .from('users')
    .select('id, automation_strategy')
    .not('automation_strategy', 'is', null)
    .returns<AutomatedUser[]>()
  return data ?? []
}

// A database trigger keeps match_days.published_at + lock_time in sync whenever
// an item's published_at flips, so these actions only flip the item flag and
// (where relevant) generate the per-item automated benchmark picks.

async function publishMatch(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const date = formData.get('date') as string

  const odds = {
    odds_home: parseOdds(formData.get('odds_home'), 'odds_home'),
    odds_draw: parseOdds(formData.get('odds_draw'), 'odds_draw'),
    odds_away: parseOdds(formData.get('odds_away'), 'odds_away'),
  }

  await supabase
    .from('matches')
    .update({ ...odds, published_at: new Date().toISOString() })
    .eq('id', matchId)

  // Automated benchmark picks for this one match.
  const users = await getAutomatedUsers(supabase)
  if (users.length) {
    const rows = buildAutomatedMatchRows(users, [{ id: matchId, ...odds }], date)
    await supabase.from('predictions').upsert(rows, { onConflict: 'user_id,match_id' })
  }

  revalidatePath('/predict')
  redirect(`/admin/publish?date=${date}`)
}

async function unpublishMatch(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const date = formData.get('date') as string

  // Refuse to hide an already-scored match — its points are on the leaderboard.
  const { data: match } = await supabase.from('matches').select('result').eq('id', matchId).single()
  if (match?.result != null) {
    redirect(`/admin/publish?date=${date}&notice=scored`)
  }

  await supabase.from('matches').update({ published_at: null }).eq('id', matchId)

  revalidatePath('/predict')
  redirect(`/admin/publish?date=${date}`)
}

async function publishExistingPikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const date = formData.get('date') as string

  await setPikanteriaPublishedAt(supabase, pikanteriaId, new Date().toISOString())

  const users = await getAutomatedUsers(supabase)
  if (users.length) {
    const { data: pika } = await supabase
      .from('pikanteria')
      .select('odds_1, odds_2, odds_x')
      .eq('id', pikanteriaId)
      .single()
    if (pika) {
      const rows = buildAutomatedPikaRows(users, [{
        id: pikanteriaId,
        odds_1: Number(pika.odds_1),
        odds_2: Number(pika.odds_2),
        odds_x: pika.odds_x == null ? null : Number(pika.odds_x),
      }], date)
      await supabase.from('pikanteria_answers').upsert(rows, { onConflict: 'user_id,pikanteria_id' })
    }
  }

  revalidatePath('/predict')
  redirect(`/admin/publish?date=${date}`)
}

async function unpublishPikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const date = formData.get('date') as string

  // Refuse to hide an already-resolved question (one with a result entered).
  const { data: pika } = await supabase
    .from('pikanteria')
    .select('result')
    .eq('id', pikanteriaId)
    .single()
  if (pika?.result != null) {
    redirect(`/admin/publish?date=${date}&notice=scored`)
  }

  await setPikanteriaPublishedAt(supabase, pikanteriaId, null)

  revalidatePath('/predict')
  redirect(`/admin/publish?date=${date}`)
}

async function publishNewPikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const matchDayId = parseUUID(formData.get('match_day_id'), 'match_day_id')
  const date = formData.get('date') as string

  const q = (formData.get('pik_q_1') as string | null)?.trim()
  if (!q) redirect(`/admin/publish?date=${date}`)

  let outcomes
  try {
    outcomes = parsePikanteriaOutcomes(formData)
  } catch {
    redirect(`/admin/publish?date=${date}&notice=options`)
  }

  const { data: newId, error } = await supabase.rpc('insert_pikanteria', {
    p_match_day_id: matchDayId,
    p_question: q,
    p_label_1: outcomes.label_1,
    p_odds_1: outcomes.odds_1,
    p_label_2: outcomes.label_2,
    p_odds_2: outcomes.odds_2,
    p_label_x: outcomes.label_x,
    p_odds_x: outcomes.odds_x,
  })
  if (error || !newId) redirect(`/admin/publish?date=${date}&notice=options`)

  const pikanteriaId = newId as string
  await setPikanteriaPublishedAt(supabase, pikanteriaId, new Date().toISOString())

  const users = await getAutomatedUsers(supabase)
  if (users.length) {
    const rows = buildAutomatedPikaRows(users, [{
      id: pikanteriaId,
      odds_1: outcomes.odds_1,
      odds_2: outcomes.odds_2,
      odds_x: outcomes.odds_x,
    }], date)
    await supabase.from('pikanteria_answers').upsert(rows, { onConflict: 'user_id,pikanteria_id' })
  }

  revalidatePath('/predict')
  redirect(`/admin/publish?date=${date}`)
}

const inputBase = {
  background: 'var(--color-bg)',
  border: '1px solid var(--border-base)',
  color: 'var(--color-text)',
}
const cls = 'rounded-lg px-3 py-2 text-sm w-full outline-none focus:ring-1'

function StatusBadge({ published }: { published: boolean }) {
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={published
        ? { color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }
        : { color: 'var(--color-muted)', background: 'var(--color-bg)', border: '1px solid var(--border-base)' }}>
      {published ? '● Live' : '○ Draft'}
    </span>
  )
}

export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; notice?: string }>
}) {
  const { date, notice } = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const selectedDate = date ?? today

  type DayMatch = {
    id: string; home_team: string; away_team: string
    kickoff_time: string; odds_home: number; odds_draw: number; odds_away: number
    result: string | null; published_at: string | null
  }
  type DayPika = {
    id: string; question: string; published_at: string | null
    label_1: string; label_2: string; label_x: string | null
    odds_1: number; odds_2: number; odds_x: number | null
    result: string | null
  }
  type Day = { id: string; stage: string; date: string }

  let day: Day | null = null
  let matches: DayMatch[] = []
  let pikanteria: DayPika[] = []

  if (date) {
    const supabase = createAdminClient()
    const { data: matchDay } = await supabase
      .from('match_days')
      .select('id, stage, date')
      .eq('date', date)
      .maybeSingle()

    if (matchDay) {
      day = matchDay as Day
      const [{ data: matchRows }, { data: pikaRows }] = await Promise.all([
        supabase
          .from('matches')
          .select('id, home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away, result, published_at')
          .eq('match_day_id', matchDay.id)
          .order('kickoff_time'),
        supabase
          .from('pikanteria')
          .select('id, question, published_at, label_1, label_2, label_x, odds_1, odds_2, odds_x, result')
          .eq('match_day_id', matchDay.id)
          .order('created_at'),
      ])
      matches = (matchRows ?? []) as DayMatch[]
      pikanteria = (pikaRows ?? []) as DayPika[]
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>📋 Publish Matches</div>
        <div className="text-muted text-xs">Publish individual matches and pikanteria - players only see published items</div>
      </div>

      {/* Date picker — GET form loads the day */}
      <form method="GET" className="rounded-xl p-4 space-y-4"
        style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
        <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
          Select Date
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <label htmlFor="publish-date-picker" className="text-muted text-xs">Date</label>
            <input id="publish-date-picker" type="date" name="date" defaultValue={selectedDate}
              required style={inputBase} className={cls} />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
            Load
          </button>
        </div>
      </form>

      {notice === 'scored' && (
        <div className="rounded-xl p-4" style={{ background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
            Can&apos;t unpublish an item that&apos;s already scored
          </div>
          <div className="text-xs text-muted mt-1">Its points are already on the leaderboard. Re-score or reset it first.</div>
        </div>
      )}
      {notice === 'options' && (
        <div className="rounded-xl p-4" style={{ background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-amber)' }}>
            A pikanteria question needs at least 2 valid options
          </div>
        </div>
      )}

      {!date && (
        <div className="text-center py-8 text-muted text-sm">
          Pick a date and click Load to see the scheduled matches
        </div>
      )}

      {date && !day && (
        <div className="rounded-xl p-4"
          style={{ background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-amber)' }}>
            No match day found for {date}
          </div>
          <div className="text-xs text-muted mt-1">
            No fixtures were seeded for this date.
          </div>
        </div>
      )}

      {day && (
        <div className="space-y-6">
          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }}>
            <div className="text-lg">📅</div>
            <div>
              <div className="text-sm font-bold text-text">{day.date} - {day.stage}</div>
              <div className="text-xs text-muted">
                {matches.filter(m => m.published_at).length}/{matches.length} matches live
                {pikanteria.length > 0 && ` · ${pikanteria.filter(p => p.published_at).length}/${pikanteria.length} pikanteria live`}
              </div>
            </div>
          </div>

          {/* Match cards — each is its own publish/unpublish form */}
          {matches.map(match => {
            const published = match.published_at != null
            const kickoffLabel = new Date(match.kickoff_time).toLocaleTimeString([], {
              hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
            }) + ' UTC'
            return (
              <form key={match.id} action={published ? unpublishMatch : publishMatch}
                className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                <input type="hidden" name="match_id" value={match.id} />
                <input type="hidden" name="date" value={day!.date} />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-text">{match.home_team} vs {match.away_team}</span>
                    <StatusBadge published={published} />
                  </div>
                  <div className="text-xs text-muted">{kickoffLabel}</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['home', 'draw', 'away'] as const).map(k => (
                    <div key={k} className="space-y-1">
                      <label htmlFor={`publish_odds_${k}_${match.id}`} className="text-muted text-xs capitalize">Odds {k}</label>
                      <input
                        id={`publish_odds_${k}_${match.id}`}
                        aria-label={`Odds ${k}`}
                        type="number" step="0.01" name={`odds_${k}`}
                        required
                        defaultValue={(k === 'home' ? match.odds_home : k === 'draw' ? match.odds_draw : match.odds_away).toFixed(2)}
                        disabled={published}
                        style={{ ...inputBase, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}
                        className={`${cls} disabled:opacity-50`}
                      />
                    </div>
                  ))}
                </div>
                <button type="submit" className="w-full py-2 rounded-lg font-bold text-sm"
                  style={published
                    ? { background: 'var(--color-danger-soft)', color: 'var(--color-danger)', border: '1px solid var(--border-danger)' }
                    : { background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
                  {published ? '↩ Unpublish' : '🚀 Publish match'}
                </button>
              </form>
            )
          })}

          {/* Existing pikanteria — each its own publish/unpublish form */}
          {pikanteria.length > 0 && (
            <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
              🌶️ Pikanteria
            </div>
          )}
          {pikanteria.map(pika => {
            const published = pika.published_at != null
            const outcomes = [
              { key: '1', label: pika.label_1, odds: pika.odds_1 },
              ...(pika.label_x != null && pika.odds_x != null ? [{ key: 'X', label: pika.label_x, odds: pika.odds_x }] : []),
              { key: '2', label: pika.label_2, odds: pika.odds_2 },
            ]
            return (
              <form key={pika.id} action={published ? unpublishPikanteria : publishExistingPikanteria}
                className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                <input type="hidden" name="pikanteria_id" value={pika.id} />
                <input type="hidden" name="date" value={day!.date} />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text">{pika.question}</span>
                  <StatusBadge published={published} />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {outcomes.map(o => (
                    <span key={o.key} className="text-xs rounded-lg px-2 py-1" style={inputBase}>
                      <span className="text-muted">{o.key}</span> {o.label} <span className="text-muted" style={{ fontFamily: 'var(--font-mono)' }}>{Number(o.odds).toFixed(2)}</span>
                    </span>
                  ))}
                </div>
                <button type="submit" className="w-full py-2 rounded-lg font-bold text-sm"
                  style={published
                    ? { background: 'var(--color-danger-soft)', color: 'var(--color-danger)', border: '1px solid var(--border-danger)' }
                    : { background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
                  {published ? '↩ Unpublish' : '🚀 Publish question'}
                </button>
              </form>
            )
          })}

          {/* Add a new pikanteria and publish it */}
          <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
            Add a pikanteria question
          </div>
          <form action={publishNewPikanteria} className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <input type="hidden" name="match_day_id" value={day.id} />
            <input type="hidden" name="date" value={day.date} />
            <div className="space-y-1">
              <label htmlFor="publish-new-pik-question" className="text-muted text-xs">Question</label>
              <input id="publish-new-pik-question" type="text" name="pik_q_1" placeholder="e.g. Will Mbappé score?"
                style={inputBase} className={cls} />
            </div>
            <PicanteriaBuilder />
            <button type="submit" className="w-full py-2 rounded-lg font-bold text-sm"
              style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
              🚀 Add &amp; publish question
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
