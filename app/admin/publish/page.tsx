import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import { parseUUID, parseOdds, parseNonEmpty, parsePikanteriaOutcomes } from '@/lib/validation'
import type { PikanteriaOutcomes } from '@/lib/validation'
import {
  buildAutomatedMatchRows,
  buildAutomatedPikaRows,
} from '@/lib/monkey'
import { getAutomatedUsers } from '@/lib/data'
import { appDateKey, formatAppTime } from '@/lib/time'
import { setPikanteriaPublishedAt, setUnscoredMatchLocksForDay } from '@/lib/publishing'
import { getAdminDayMatchLockState, getAdminMatchLockState } from '@/lib/admin-lock-state'
import { matchLockMs } from '@/lib/lock'
import { persistDueMatchLocks } from '@/lib/match-lock-persistence'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { PicanteriaBuilder } from '@/components/pikanteria-builder'

type AdminClient = ReturnType<typeof createAdminClient>

type DayMatch = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string
  odds_home: number
  odds_draw: number
  odds_away: number
  result: string | null
  published_at: string | null
  locked: boolean
  unlock_override: boolean
}

type DayPika = {
  id: string
  question: string
  published_at: string | null
  locked: boolean
  label_1: string
  label_2: string
  label_x: string | null
  odds_1: number
  odds_2: number
  odds_x: number | null
  result: string | null
}

type Day = { id: string; stage: string; date: string }

function publishPath(date: string, notice?: string) {
  const params = new URLSearchParams({ date })
  if (notice) params.set('notice', notice)
  return `/admin/publish?${params.toString()}`
}

function parsePikanteriaEditForm(formData: FormData, date: string) {
  try {
    return {
      question: parseNonEmpty(formData.get('question'), 'question'),
      outcomes: parsePikanteriaOutcomes(formData),
    }
  } catch {
  }
  redirect(publishPath(date, 'options'))
}

function parseNewPikanteriaOutcomes(formData: FormData, date: string): PikanteriaOutcomes {
  try {
    return parsePikanteriaOutcomes(formData)
  } catch {
  }
  redirect(publishPath(date, 'options'))
}

async function ensureMatchIsUnscored(supabase: AdminClient, matchId: string, date: string) {
  const { data: match } = await supabase
    .from('matches')
    .select('result')
    .eq('id', matchId)
    .single()

  if (match?.result != null) {
    redirect(publishPath(date, 'scored'))
  }
}

async function ensureMatchCanUnpublish(supabase: AdminClient, matchId: string, date: string) {
  const { data: match } = await supabase
    .from('matches')
    .select('result, locked, kickoff_time')
    .eq('id', matchId)
    .single()

  if (match?.result != null) {
    redirect(publishPath(date, 'scored'))
  }
  if (match && getAdminMatchLockState(match).locked) {
    redirect(publishPath(date, 'locked'))
  }
}

async function ensurePikanteriaIsUnscored(supabase: AdminClient, pikanteriaId: string, date: string) {
  const { data: pika } = await supabase
    .from('pikanteria')
    .select('result')
    .eq('id', pikanteriaId)
    .single()

  if (pika?.result != null) {
    redirect(publishPath(date, 'scored'))
  }
}

async function ensurePikanteriaCanUnpublish(supabase: AdminClient, pikanteriaId: string, date: string) {
  const { data: pika } = await supabase
    .from('pikanteria')
    .select('result, locked')
    .eq('id', pikanteriaId)
    .single()

  if (pika?.result != null) {
    redirect(publishPath(date, 'scored'))
  }
  if (pika?.locked) {
    redirect(publishPath(date, 'locked'))
  }
}

async function publishPikanteriaWithAutomatedRows(
  supabase: AdminClient,
  pikanteriaId: string,
  odds: { odds_1: number; odds_2: number; odds_x: number | null },
) {
  await setPikanteriaPublishedAt(supabase, pikanteriaId, new Date().toISOString())

  const users = await getAutomatedUsers(supabase)
  if (!users.length) return

  const rows = buildAutomatedPikaRows(users, [{
    id: pikanteriaId,
    odds_1: odds.odds_1,
    odds_2: odds.odds_2,
    odds_x: odds.odds_x,
  }])
  await supabase.from('pikanteria_answers').upsert(rows, { onConflict: 'user_id,pikanteria_id' })
}

// A database trigger keeps match_days.published_at + lock_time in sync whenever
// an item's published_at flips, so these actions only flip the item flag and
// (where relevant) generate the per-item automated benchmark picks.

async function publishMatch(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const date = parseNonEmpty(formData.get('date'), 'date')
  await ensureMatchIsUnscored(supabase, matchId, date)

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
    const rows = buildAutomatedMatchRows(users, [{ id: matchId, ...odds }])
    await supabase.from('predictions').upsert(rows, { onConflict: 'user_id,match_id' })
  }

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function saveMatchOdds(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const date = parseNonEmpty(formData.get('date'), 'date')
  await ensureMatchIsUnscored(supabase, matchId, date)

  await supabase
    .from('matches')
    .update({
      odds_home: parseOdds(formData.get('odds_home'), 'odds_home'),
      odds_draw: parseOdds(formData.get('odds_draw'), 'odds_draw'),
      odds_away: parseOdds(formData.get('odds_away'), 'odds_away'),
    })
    .eq('id', matchId)

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function unpublishMatch(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const date = parseNonEmpty(formData.get('date'), 'date')
  await ensureMatchCanUnpublish(supabase, matchId, date)

  await supabase.from('matches').update({ published_at: null }).eq('id', matchId)

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function toggleFuturesLock(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const date = parseNonEmpty(formData.get('date'), 'date')
  const locked = formData.get('futures_locked') === 'true'

  // Upsert (not update): if the singleton settings row is missing, an update
  // matches zero rows and silently no-ops, so the lock toggle never persists.
  await supabase
    .from('tournament_settings')
    .upsert({ id: true, futures_locked: !locked }, { onConflict: 'id' })

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function toggleFuturesPublish(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const date = parseNonEmpty(formData.get('date'), 'date')
  const published = formData.get('futures_published') === 'true'

  await supabase
    .from('tournament_settings')
    .upsert({ id: true, futures_published: !published }, { onConflict: 'id' })

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function toggleMatchLock(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const matchId = parseUUID(formData.get('match_id'), 'match_id')
  const date = parseNonEmpty(formData.get('date'), 'date')
  const currentlyLocked = formData.get('locked') === 'true'

  const { data: match } = await supabase
    .from('matches')
    .select('result, kickoff_time')
    .eq('id', matchId)
    .single()

  if (!match || match.result != null) {
    redirect(publishPath(date, 'scored'))
  }

  if (currentlyLocked) {
    // Unlock. When we're already inside the time-lock window, record an unlock
    // override so the match stays open instead of immediately re-locking.
    const withinWindow = Date.now() >= matchLockMs(match.kickoff_time)
    await supabase
      .from('matches')
      .update({ locked: false, unlock_override: withinWindow })
      .eq('id', matchId)
  } else {
    // Lock. Clear any override so the manual lock takes effect.
    await supabase
      .from('matches')
      .update({ locked: true, unlock_override: false })
      .eq('id', matchId)
  }

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function toggleDayMatchLocks(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const matchDayId = parseUUID(formData.get('match_day_id'), 'match_day_id')
  const date = parseNonEmpty(formData.get('date'), 'date')
  const locked = formData.get('locked') === 'true'

  await setUnscoredMatchLocksForDay(supabase, matchDayId, !locked)

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function savePikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const date = parseNonEmpty(formData.get('date'), 'date')
  await ensurePikanteriaIsUnscored(supabase, pikanteriaId, date)

  const { question, outcomes } = parsePikanteriaEditForm(formData, date)

  const { error } = await supabase.rpc('update_pikanteria', {
    p_pikanteria_id: pikanteriaId,
    p_question: question,
    p_label_1: outcomes.label_1,
    p_odds_1: outcomes.odds_1,
    p_label_2: outcomes.label_2,
    p_odds_2: outcomes.odds_2,
    p_label_x: outcomes.label_x,
    p_odds_x: outcomes.odds_x,
  })
  if (error) redirect(publishPath(date, 'options'))

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function saveAndPublishPikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const date = parseNonEmpty(formData.get('date'), 'date')
  await ensurePikanteriaIsUnscored(supabase, pikanteriaId, date)

  const { question, outcomes } = parsePikanteriaEditForm(formData, date)

  const { error } = await supabase.rpc('update_pikanteria', {
    p_pikanteria_id: pikanteriaId,
    p_question: question,
    p_label_1: outcomes.label_1,
    p_odds_1: outcomes.odds_1,
    p_label_2: outcomes.label_2,
    p_odds_2: outcomes.odds_2,
    p_label_x: outcomes.label_x,
    p_odds_x: outcomes.odds_x,
  })
  if (error) redirect(publishPath(date, 'options'))

  await publishPikanteriaWithAutomatedRows(supabase, pikanteriaId, outcomes)

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function unpublishPikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const date = parseNonEmpty(formData.get('date'), 'date')
  await ensurePikanteriaCanUnpublish(supabase, pikanteriaId, date)

  await setPikanteriaPublishedAt(supabase, pikanteriaId, null)

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function deleteDraftPikanteria(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const date = parseNonEmpty(formData.get('date'), 'date')

  // Only unpublished, unscored drafts can be deleted. A published or scored
  // question must be unpublished/reset first so player answers are never
  // orphaned (answers cascade-delete with the question regardless).
  const { data: pika } = await supabase
    .from('pikanteria')
    .select('published_at, result')
    .eq('id', pikanteriaId)
    .single()
  if (!pika || pika.published_at != null || pika.result != null) {
    redirect(publishPath(date, 'scored'))
  }

  await supabase.from('pikanteria').delete().eq('id', pikanteriaId)

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function togglePikanteriaLock(formData: FormData) {
  'use server'
  await assertAdmin()
  const supabase = createAdminClient()

  const pikanteriaId = parseUUID(formData.get('pikanteria_id'), 'pikanteria_id')
  const date = parseNonEmpty(formData.get('date'), 'date')
  const locked = formData.get('locked') === 'true'
  await ensurePikanteriaIsUnscored(supabase, pikanteriaId, date)

  await supabase.from('pikanteria').update({ locked: !locked }).eq('id', pikanteriaId)

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function createPikanteria(formData: FormData, publishNow: boolean) {
  await assertAdmin()
  const supabase = createAdminClient()

  const matchDayId = parseUUID(formData.get('match_day_id'), 'match_day_id')
  const date = parseNonEmpty(formData.get('date'), 'date')

  const q = (formData.get('pik_q_1') as string | null)?.trim()
  if (!q) redirect(publishPath(date))

  const outcomes = parseNewPikanteriaOutcomes(formData, date)

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
  if (error || !newId) redirect(publishPath(date, 'options'))

  const pikanteriaId = newId as string
  if (publishNow) {
    await publishPikanteriaWithAutomatedRows(supabase, pikanteriaId, outcomes)
  }

  revalidatePath('/predict')
  revalidatePath('/admin/publish')
  redirect(publishPath(date))
}

async function publishNewPikanteria(formData: FormData) {
  'use server'
  await createPikanteria(formData, true)
}

async function addDraftPikanteria(formData: FormData) {
  'use server'
  await createPikanteria(formData, false)
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
      {published ? 'Live' : 'Draft'}
    </span>
  )
}

function LockBadge({ locked }: { locked: boolean }) {
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={locked
        ? { color: 'var(--color-danger)', background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }
        : { color: 'var(--color-muted)', background: 'var(--color-bg)', border: '1px solid var(--border-base)' }}>
      {locked ? 'Locked' : 'Open'}
    </span>
  )
}

function ScoredBadge() {
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ color: 'var(--color-amber)', background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }}>
      Scored
    </span>
  )
}

function countPublishedItems(items: { published_at: string | null }[]) {
  let count = 0
  for (const item of items) {
    if (item.published_at) count += 1
  }
  return count
}

function FuturesControls({
  selectedDate,
  futuresPublished,
  futuresLocked,
}: {
  selectedDate: string
  futuresPublished: boolean
  futuresLocked: boolean
}) {
  return (
    <div className="rounded-xl p-3 space-y-3"
      style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-text">Winner &amp; Top Scorer</div>
          <div className="text-xs text-muted">
            {futuresPublished
              ? 'Published - players can see and make futures picks'
              : 'Unpublished - hidden from players on /predict'}
          </div>
        </div>
        <form action={toggleFuturesPublish}>
          <input type="hidden" name="date" value={selectedDate} />
          <input type="hidden" name="futures_published" value={String(futuresPublished)} />
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap"
            style={{
              background: futuresPublished ? 'var(--color-danger-soft)' : 'var(--color-accent-soft)',
              color: futuresPublished ? 'var(--color-danger)' : 'var(--color-accent)',
              border: `1px solid ${futuresPublished ? 'var(--border-danger)' : 'var(--border-accent)'}`,
            }}>
            {futuresPublished ? 'Unpublish' : 'Publish'}
          </button>
        </form>
      </div>
      <div className="flex items-center justify-between gap-3 pt-3"
        style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="min-w-0">
          <div className="text-xs text-muted">
            {futuresLocked
              ? 'Manually locked - users cannot change futures picks'
              : 'Open - users can change futures picks'}
          </div>
        </div>
        <form action={toggleFuturesLock}>
          <input type="hidden" name="date" value={selectedDate} />
          <input type="hidden" name="futures_locked" value={String(futuresLocked)} />
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap"
            style={{
              background: futuresLocked ? 'var(--color-accent-soft)' : 'var(--color-danger-soft)',
              color: futuresLocked ? 'var(--color-accent)' : 'var(--color-danger)',
              border: `1px solid ${futuresLocked ? 'var(--border-accent)' : 'var(--border-danger)'}`,
            }}>
            {futuresLocked ? 'Unlock' : 'Lock'}
          </button>
        </form>
      </div>
    </div>
  )
}

function DateSelector({ selectedDate }: { selectedDate: string }) {
  return (
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
  )
}

function NoticeMessages({ notice }: { notice?: string }) {
  return (
    <>
      {notice === 'scored' && (
        <div className="rounded-xl p-4" style={{ background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
            Can&apos;t change an item that&apos;s already scored
          </div>
          <div className="text-xs text-muted mt-1">Reset its result first if the odds, visibility, or lock state need to change.</div>
        </div>
      )}
      {notice === 'locked' && (
        <div className="rounded-xl p-4" style={{ background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
            Can&apos;t unpublish a locked item
          </div>
          <div className="text-xs text-muted mt-1">Unlock it first if it needs to be hidden from players.</div>
        </div>
      )}
      {notice === 'options' && (
        <div className="rounded-xl p-4" style={{ background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--color-amber)' }}>
            A pikanteria question needs at least 2 valid outcomes
          </div>
        </div>
      )}
    </>
  )
}

function NoDayNotice({ selectedDate }: { selectedDate: string }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }}>
      <div className="text-sm font-semibold" style={{ color: 'var(--color-amber)' }}>
        No match day found for {selectedDate}
      </div>
      <div className="text-xs text-muted mt-1">
        No fixtures were seeded for this date.
      </div>
    </div>
  )
}

function DaySummary({
  day,
  matches,
  pikanteria,
}: {
  day: Day
  matches: DayMatch[]
  pikanteria: DayPika[]
}) {
  const lockState = getAdminDayMatchLockState(matches, pikanteria)

  return (
    <div className="rounded-xl p-3 flex items-center justify-between gap-3"
      style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }}>
      <div className="min-w-0">
        <div className="text-sm font-bold text-text">{day.date} - {day.stage}</div>
        <div className="text-xs text-muted">
          {countPublishedItems(matches)}/{matches.length} matches live
          {pikanteria.length > 0 && ` · ${countPublishedItems(pikanteria)}/${pikanteria.length} pikanteria live`}
        </div>
      </div>
      <form action={toggleDayMatchLocks} className="shrink-0">
        <input type="hidden" name="match_day_id" value={day.id} />
        <input type="hidden" name="date" value={day.date} />
        <input type="hidden" name="locked" value={String(lockState.toggleInputLockedValue)} />
        <button type="submit" disabled={!lockState.canToggle} className="px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap disabled:opacity-50"
          style={{
            background: lockState.allLocked ? 'var(--color-accent-soft)' : 'var(--color-danger-soft)',
            color: lockState.allLocked ? 'var(--color-accent)' : 'var(--color-danger)',
            border: `1px solid ${lockState.allLocked ? 'var(--border-accent)' : 'var(--border-danger)'}`,
          }}>
          {lockState.toggleLabel}
        </button>
      </form>
    </div>
  )
}

function MatchCard({ match, date }: { match: DayMatch; date: string }) {
  const published = match.published_at != null
  const scored = match.result != null
  const lockState = getAdminMatchLockState(match)
  const kickoffLabel = `${formatAppTime(match.kickoff_time)} Jerusalem`

  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-sm text-text">{match.home_team} vs {match.away_team}</div>
          <div className="text-xs text-muted">{kickoffLabel}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <StatusBadge published={published} />
          <LockBadge locked={lockState.locked} />
          {scored && <ScoredBadge />}
        </div>
      </div>

      <form action={saveMatchOdds} className="space-y-3">
        <input type="hidden" name="match_id" value={match.id} />
        <input type="hidden" name="date" value={date} />
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
                disabled={scored}
                style={{ ...inputBase, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}
                className={`${cls} disabled:opacity-50`}
              />
            </div>
          ))}
        </div>
        <div className={!published ? 'grid grid-cols-2 gap-2' : ''}>
          <button type="submit" disabled={scored} className="w-full py-2 rounded-lg font-bold text-sm disabled:opacity-50"
            style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
            Save odds
          </button>
          {!published && (
            <button type="submit" formAction={publishMatch} disabled={scored} className="w-full py-2 rounded-lg font-bold text-sm disabled:opacity-50"
              style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--border-accent)' }}>
              Save &amp; publish
            </button>
          )}
        </div>
      </form>

      <div className="grid grid-cols-2 gap-2">
        <form action={toggleMatchLock}>
          <input type="hidden" name="match_id" value={match.id} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="locked" value={String(lockState.toggleInputLockedValue)} />
          <button
            type="submit"
            disabled={!lockState.canToggle}
            title={
              lockState.overridden
                ? 'Manually forced open past the kickoff deadline'
                : lockState.timeLocked
                  ? 'Past the kickoff deadline — unlocking overrides the time lock'
                  : undefined
            }
            className="w-full py-2 rounded-lg text-xs font-bold disabled:opacity-50"
            style={{
              background: lockState.locked ? 'var(--color-accent-soft)' : 'var(--color-danger-soft)',
              color: lockState.locked ? 'var(--color-accent)' : 'var(--color-danger)',
              border: `1px solid ${lockState.locked ? 'var(--border-accent)' : 'var(--border-danger)'}`,
            }}>
            {lockState.toggleLabel}
          </button>
        </form>

        {published ? (
          <form action={unpublishMatch}>
            <input type="hidden" name="match_id" value={match.id} />
            <input type="hidden" name="date" value={date} />
            <button type="submit" disabled={!lockState.canUnpublish} className="w-full py-2 rounded-lg text-xs font-bold disabled:opacity-50"
              style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)', border: '1px solid var(--border-danger)' }}>
              Unpublish
            </button>
          </form>
        ) : (
          <div className="rounded-lg px-3 py-2 text-xs text-muted text-center"
            style={{ border: '1px solid var(--border-base)', background: 'var(--color-bg)' }}>
            Draft
          </div>
        )}
      </div>
    </div>
  )
}

function PikanteriaCard({ pika, date }: { pika: DayPika; date: string }) {
  const published = pika.published_at != null
  const scored = pika.result != null
  const outcomes = [
    { key: '1', label: pika.label_1, odds: pika.odds_1 },
    ...(pika.label_x != null && pika.odds_x != null ? [{ key: 'X', label: pika.label_x, odds: pika.odds_x }] : []),
    { key: '2', label: pika.label_2, odds: pika.odds_2 },
  ]

  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm font-semibold text-text">{pika.question}</div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <StatusBadge published={published} />
          <LockBadge locked={pika.locked} />
          {scored && <ScoredBadge />}
        </div>
      </div>

      {scored ? (
        <>
          <div className="flex gap-2 flex-wrap">
            {outcomes.map(o => (
              <span key={o.key} className="text-xs rounded-lg px-2 py-1" style={inputBase}>
                <span className="text-muted">{o.key}</span> {o.label} <span className="text-muted" style={{ fontFamily: 'var(--font-mono)' }}>{Number(o.odds).toFixed(2)}</span>
              </span>
            ))}
          </div>
          <div className="text-xs text-muted">Reset this result before editing, unpublishing, or changing the lock.</div>
        </>
      ) : (
        <>
          <form action={savePikanteria} className="space-y-3">
            <input type="hidden" name="pikanteria_id" value={pika.id} />
            <input type="hidden" name="date" value={date} />
            <div className="space-y-1">
              <label htmlFor={`pika_question_${pika.id}`} className="text-muted text-xs">Question</label>
              <input
                type="text"
                id={`pika_question_${pika.id}`}
                aria-label="Question"
                name="question"
                defaultValue={pika.question}
                style={inputBase}
                className={cls}
              />
            </div>
            <PicanteriaBuilder defaults={{
              label1: pika.label_1, odds1: Number(pika.odds_1).toFixed(2),
              label2: pika.label_2, odds2: Number(pika.odds_2).toFixed(2),
              labelX: pika.label_x, oddsX: pika.odds_x == null ? null : Number(pika.odds_x).toFixed(2),
            }} />
            <div className={published ? '' : 'grid grid-cols-2 gap-2'}>
              <button type="submit" className="w-full py-2 rounded-lg font-bold text-sm"
                style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
                Save question
              </button>
              {!published && (
                <button type="submit" formAction={saveAndPublishPikanteria} className="w-full py-2 rounded-lg font-bold text-sm"
                  style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--border-accent)' }}>
                  Save & publish
                </button>
              )}
            </div>
          </form>

          <div className="grid grid-cols-2 gap-2">
            <form action={togglePikanteriaLock}>
              <input type="hidden" name="pikanteria_id" value={pika.id} />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="locked" value={String(pika.locked)} />
              <button type="submit" className="w-full py-2 rounded-lg text-xs font-bold"
                style={{
                  background: pika.locked ? 'var(--color-accent-soft)' : 'var(--color-danger-soft)',
                  color: pika.locked ? 'var(--color-accent)' : 'var(--color-danger)',
                  border: `1px solid ${pika.locked ? 'var(--border-accent)' : 'var(--border-danger)'}`,
                }}>
                {pika.locked ? 'Unlock' : 'Lock'}
              </button>
            </form>

            {published ? (
              <form action={unpublishPikanteria}>
                <input type="hidden" name="pikanteria_id" value={pika.id} />
                <input type="hidden" name="date" value={date} />
                <button type="submit" disabled={pika.locked} className="w-full py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                  style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)', border: '1px solid var(--border-danger)' }}>
                  Unpublish
                </button>
              </form>
            ) : (
              <form action={deleteDraftPikanteria}>
                <input type="hidden" name="pikanteria_id" value={pika.id} />
                <input type="hidden" name="date" value={date} />
                <button type="submit" className="w-full py-2 rounded-lg text-xs font-bold"
                  style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)', border: '1px solid var(--border-danger)' }}>
                  Delete draft
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function NewPikanteriaForm({ day }: { day: Day }) {
  return (
    <>
      <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
        Add a pikanteria question
      </div>
      <form action={publishNewPikanteria} className="rounded-xl p-4 space-y-3"
        style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
        <input type="hidden" name="match_day_id" value={day.id} />
        <input type="hidden" name="date" value={day.date} />
        <div className="space-y-1">
          <label htmlFor="publish-new-pik-question" className="text-muted text-xs">Question</label>
          <input id="publish-new-pik-question" type="text" name="pik_q_1" placeholder="e.g. Will Mbappe score?"
            style={inputBase} className={cls} />
        </div>
        <PicanteriaBuilder />
        <div className="grid grid-cols-2 gap-2">
          <button type="submit" formAction={addDraftPikanteria} className="w-full py-2 rounded-lg font-bold text-sm"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--border-base)' }}>
            Add draft
          </button>
          <button type="submit" className="w-full py-2 rounded-lg font-bold text-sm"
            style={{ background: 'var(--color-amber)', color: 'var(--color-bg)' }}>
            Add &amp; publish
          </button>
        </div>
      </form>
    </>
  )
}

function DayWorkbench({
  day,
  matches,
  pikanteria,
}: {
  day: Day
  matches: DayMatch[]
  pikanteria: DayPika[]
}) {
  return (
    <div className="space-y-6">
      <DaySummary day={day} matches={matches} pikanteria={pikanteria} />

      {matches.map(match => <MatchCard key={match.id} match={match} date={day.date} />)}

      {pikanteria.length > 0 && (
        <div className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--color-amber)' }}>
          Pikanteria
        </div>
      )}
      {pikanteria.map(pika => <PikanteriaCard key={pika.id} pika={pika} date={day.date} />)}

      <NewPikanteriaForm day={day} />
    </div>
  )
}

export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; notice?: string }>
}) {
  const { date, notice } = await searchParams
  const today = appDateKey()
  const selectedDate = date ?? today

  const supabase = createAdminClient()
  await persistDueMatchLocks(supabase)

  // Read the lock and publish flags independently so a missing row (or a column
  // that predates a migration) can't break the other control. A combined read
  // that errors would null out both, leaving the Lock button stuck on "Lock".
  const [{ data: lockRow }, { data: publishRow }] = await Promise.all([
    supabase.from('tournament_settings').select('futures_locked').eq('id', true).maybeSingle(),
    supabase.from('tournament_settings').select('futures_published').eq('id', true).maybeSingle(),
  ])

  let day: Day | null = null
  let matches: DayMatch[] = []
  let pikanteria: DayPika[] = []

  const { data: matchDay } = await supabase
    .from('match_days')
    .select('id, stage, date')
    .eq('date', selectedDate)
    .maybeSingle()

  if (matchDay) {
    day = matchDay as Day
    const [{ data: matchRows }, { data: pikaRows }] = await Promise.all([
      supabase
        .from('matches')
        .select('id, home_team, away_team, kickoff_time, odds_home, odds_draw, odds_away, result, published_at, locked, unlock_override')
        .eq('match_day_id', matchDay.id)
        .order('kickoff_time'),
      supabase
        .from('pikanteria')
        .select('id, question, published_at, locked, label_1, label_2, label_x, odds_1, odds_2, odds_x, result')
        .eq('match_day_id', matchDay.id)
        .order('created_at'),
    ])
    matches = (matchRows ?? []) as DayMatch[]
    pikanteria = (pikaRows ?? []) as DayPika[]
  }

  const futuresLocked = lockRow?.futures_locked ?? false
  const futuresPublished = publishRow?.futures_published ?? true

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>Publish &amp; Edit Bets</div>
        <div className="text-muted text-xs">Manage odds, publishing, and locks from one admin screen</div>
      </div>

      <FuturesControls
        selectedDate={selectedDate}
        futuresPublished={futuresPublished}
        futuresLocked={futuresLocked}
      />

      <DateSelector selectedDate={selectedDate} />

      <NoticeMessages notice={notice} />

      {!day && <NoDayNotice selectedDate={selectedDate} />}

      {day && <DayWorkbench day={day} matches={matches} pikanteria={pikanteria} />}
    </div>
  )
}
