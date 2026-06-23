import { createAdminClient, assertAdmin } from '@/lib/supabase/server'
import Link from 'next/link'
import { isMatchLocked, isPikanteriaLocked } from '@/lib/lock'
import { formatAppDate, formatAppDateTime } from '@/lib/time'
import type { Pick } from '@/lib/types'
import { stageLabel } from '@/lib/display'
import { TEAMS, SCORERS } from '@/lib/pre-tournament'
import {
  adminPickTargetUsers,
  filterAdminPickDays,
  selectAdminPickTargetUser,
  type AdminPickTargetUser,
} from '@/lib/admin-picks'
import {
  getPublishedMatchDaysWithAll,
  getUserPredictions,
  getUserPikanteriaAnswers,
  type FullMatchDay,
} from '@/lib/data'
import {
  saveAdminMatchPick,
  saveAdminPikanteriaPick,
  saveAdminFutures,
  generateBotFutures,
} from './actions'

const NOTICES: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  saved: { text: '✓ Pick saved', tone: 'ok' },
  unchanged: { text: 'No change — pick already set', tone: 'ok' },
  locked: { text: 'That section is locked and cannot be changed', tone: 'warn' },
  scored: { text: 'That bet is already scored and cannot be changed here', tone: 'warn' },
  invalid: { text: 'Invalid pick', tone: 'warn' },
  not_found: { text: 'Bet not found or unpublished', tone: 'warn' },
}

function noticeContent(notice: string | undefined) {
  if (!notice) return null
  const bots = notice.match(/^bots-(\d+)-(\d+)$/)
  if (bots) return { text: `🤖 Bot futures: created ${bots[1]}, skipped ${bots[2]}`, tone: 'ok' as const }
  return NOTICES[notice] ?? null
}

export default async function AdminPicksPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; notice?: string }>
}) {
  const { user: userId, notice } = await searchParams
  await assertAdmin()
  const supabase = createAdminClient()

  const { data: userRows, error: usersError } = await supabase
    .from('users')
    .select('id, display_name, email, status, is_monkey')
    .order('display_name', { ascending: true })
  if (usersError) throw usersError

  const targetUsers = adminPickTargetUsers((userRows ?? []) as AdminPickTargetUser[])
  const targetUser = selectAdminPickTargetUser(targetUsers, userId)

  const [matchDaysRaw, predictions, answers, { data: futuresPick }, { data: futuresSettings }, botRows] =
    targetUser ? await Promise.all([
      getPublishedMatchDaysWithAll(supabase),
      getUserPredictions(supabase, targetUser.id),
      getUserPikanteriaAnswers(supabase, targetUser.id),
      supabase
        .from('pre_tournament_picks')
        .select('winner_team, top_scorer')
        .eq('user_id', targetUser.id)
        .maybeSingle(),
      supabase
        .from('tournament_settings')
        .select('futures_locked, futures_published')
        .eq('id', true)
        .maybeSingle(),
      supabase
        .from('users')
        .select('id, display_name, pre_tournament_picks(winner_team, top_scorer)')
        .not('automation_strategy', 'is', null)
        .order('display_name'),
    ]) : [
      [],
      [],
      [],
      { data: null },
      { data: null },
      { data: [] },
    ]

  const futuresLocked = futuresSettings?.futures_locked ?? false
  const futuresPublished = futuresSettings?.futures_published ?? true

  const predictionMap: Record<string, Pick> = Object.fromEntries(
    predictions.map(p => [p.match_id, p.pick as Pick])
  )
  const answerMap: Record<string, Pick> = Object.fromEntries(
    answers.map(a => [a.pikanteria_id, a.pick as Pick])
  )

  const openDays = filterAdminPickDays(matchDaysRaw as FullMatchDay[])
  const futuresOpen = futuresPublished && !futuresLocked
  const noticeBox = noticeContent(notice)

  const bots = (botRows.data ?? []).map(bot => {
    const pick = Array.isArray(bot.pre_tournament_picks)
      ? bot.pre_tournament_picks[0]
      : bot.pre_tournament_picks
    return { id: bot.id, name: bot.display_name, pick: pick ?? null }
  })

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">
      <div>
        <Link href="/admin" className="text-muted hover:text-amber transition-colors text-xs">
          ← Admin
        </Link>
        <div className="font-display font-black text-lg mt-1" style={{ color: 'var(--color-amber)' }}>
          👥 Pick for Users
        </div>
        <div className="text-muted text-xs mt-0.5">
          Enter bets on behalf of approved players and AI accounts.
        </div>
      </div>

      {noticeBox && (
        <div className="rounded-xl px-4 py-2.5 text-xs font-semibold"
          style={noticeBox.tone === 'ok'
            ? { color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }
            : { color: 'var(--color-danger)', background: 'var(--color-danger-soft)', border: '1px solid var(--border-danger)' }}>
          {noticeBox.text}
        </div>
      )}

      <form action="/admin/ai-picks" className="rounded-xl p-4 grid gap-2"
        style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
        <label className="text-muted text-[11px] font-bold uppercase tracking-wide" htmlFor="admin-pick-user">
          User
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select id="admin-pick-user" name="user" defaultValue={targetUser?.id ?? ''}
            className="min-w-0 rounded-lg px-3 py-2 text-sm font-semibold"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--border-base)' }}>
            {targetUsers.length === 0 ? (
              <option value="">No approved users</option>
            ) : targetUsers.map(user => (
              <option key={user.id} value={user.id}>
                {user.display_name}{user.email ? ` · ${user.email}` : ''}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg px-4 py-2 text-sm font-bold"
            style={{ color: 'var(--color-bg)', background: 'var(--color-amber)' }}>
            Load
          </button>
        </div>
      </form>

      {!targetUser && (
        <div className="text-center py-10">
          <div className="text-text font-semibold">No approved users available</div>
          <div className="text-muted text-sm mt-1">Approve a player before entering picks.</div>
        </div>
      )}

      {targetUser && <div className="space-y-2">
        <div className="text-muted text-[11px] font-bold uppercase tracking-wide px-1">
          🏆 Futures — {targetUser.display_name}
        </div>
        {futuresOpen ? (
          <form action={saveAdminFutures} className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <input type="hidden" name="user_id" value={targetUser.id} />
            <label className="block text-xs space-y-1">
              <span className="text-muted font-semibold">🥇 Tournament Winner</span>
              <select name="winner" required defaultValue={futuresPick?.winner_team ?? ''}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--border-base)' }}>
                <option value="" disabled>Select team…</option>
                {TEAMS.map(t => (
                  <option key={t.name} value={t.name}>{t.name} ({t.odds})</option>
                ))}
              </select>
            </label>
            <label className="block text-xs space-y-1">
              <span className="text-muted font-semibold">⚽ Top Scorer</span>
              <select name="scorer" required defaultValue={futuresPick?.top_scorer ?? ''}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--border-base)' }}>
                <option value="" disabled>Select scorer…</option>
                {SCORERS.map(s => (
                  <option key={s.name} value={s.name}>{s.name} ({s.odds})</option>
                ))}
              </select>
            </label>
            <button type="submit"
              className="w-full rounded-lg py-2 text-sm font-bold"
              style={{ color: 'var(--color-bg)', background: 'var(--color-amber)' }}>
              Save futures for {targetUser.display_name}
            </button>
          </form>
        ) : (
          <div className="rounded-xl px-4 py-3 text-xs text-muted"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            🔒 Futures are {futuresPublished ? 'locked' : 'not published'}
            {futuresPick ? ` — ${targetUser.display_name} picked ${futuresPick.winner_team} / ${futuresPick.top_scorer}` : ` — ${targetUser.display_name} has no pick`}
          </div>
        )}
      </div>}

      {targetUser && openDays.length === 0 && (
        <div className="text-center py-10">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-text font-semibold">Nothing published to pick</div>
          <div className="text-muted text-sm mt-1">No published, unscored bets right now.</div>
        </div>
      )}

      {targetUser && openDays.map(({ day, openMatches, openPikanteria }) => (
        <div key={day.id} className="space-y-2">
          <div className="flex items-center gap-2 pt-1">
            <span className="text-sm font-bold text-text">{formatAppDate(day.date)}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>
              {stageLabel(day.stage)}
            </span>
          </div>

          {openMatches.map(match => {
            const locked = isMatchLocked(match)
            return (
              <div key={match.id} className="rounded-xl px-4 py-3 space-y-2"
                style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                <div>
                  <div className="font-semibold text-[13px] text-text">
                    {match.home_team} vs {match.away_team}
                  </div>
                  <div className="text-muted text-[11px] mt-0.5 flex items-center gap-2">
                    <span>
                      {formatAppDateTime(match.kickoff_time, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
                      })} Jerusalem
                    </span>
                    {locked && <LockBadge />}
                  </div>
                </div>
                <form action={saveAdminMatchPick} className="grid grid-cols-3 gap-2">
                  <input type="hidden" name="user_id" value={targetUser.id} />
                  <input type="hidden" name="match_id" value={match.id} />
                  <PickChip name="pick" value="1" label="1" odds={match.odds_home} active={predictionMap[match.id] === '1'} />
                  <PickChip name="pick" value="X" label="X" odds={match.odds_draw} active={predictionMap[match.id] === 'X'} />
                  <PickChip name="pick" value="2" label="2" odds={match.odds_away} active={predictionMap[match.id] === '2'} />
                </form>
              </div>
            )
          })}

          {openPikanteria.map(item => {
            const locked = isPikanteriaLocked(item)
            return (
              <div key={item.id} className="rounded-xl px-4 py-3 space-y-2"
                style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span>🌶️</span>
                    <span className="font-semibold text-[13px] text-text">{item.question}</span>
                  </div>
                  {locked && <LockBadge />}
                </div>
                <form action={saveAdminPikanteriaPick}
                  className={`grid gap-2 ${item.odds_x != null ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <input type="hidden" name="user_id" value={targetUser.id} />
                  <input type="hidden" name="pikanteria_id" value={item.id} />
                  <PickChip name="pick" value="1" label={item.label_1} odds={item.odds_1} active={answerMap[item.id] === '1'} />
                  {item.odds_x != null && (
                    <PickChip name="pick" value="X" label={item.label_x ?? 'X'} odds={item.odds_x} active={answerMap[item.id] === 'X'} />
                  )}
                  <PickChip name="pick" value="2" label={item.label_2} odds={item.odds_2} active={answerMap[item.id] === '2'} />
                </form>
              </div>
            )
          })}
        </div>
      ))}

      <div className="space-y-2 pt-2">
        <div className="text-muted text-[11px] font-bold uppercase tracking-wide px-1">
          🎰 Benchmark Bot Futures
        </div>
        <div className="rounded-xl p-4 space-y-2"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          {bots.map(bot => (
            <div key={bot.id} className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text">{bot.name}</span>
              {bot.pick ? (
                <span style={{ color: 'var(--color-accent)' }}>
                  ✓ {bot.pick.winner_team} / {bot.pick.top_scorer}
                </span>
              ) : (
                <span style={{ color: 'var(--color-danger)' }}>✗ Missing</span>
              )}
            </div>
          ))}
          {!futuresLocked && (
            <form action={generateBotFutures} className="pt-1">
              <input type="hidden" name="user_id" value={targetUser?.id ?? ''} />
              <button type="submit"
                className="w-full rounded-lg py-2 text-sm font-bold"
                style={{ color: 'var(--color-bg)', background: 'var(--color-amber)' }}>
                Generate bot futures (fills missing only)
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function LockBadge() {
  return (
    <span className="inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: 'var(--color-amber)', background: 'var(--color-amber-soft)', border: '1px solid var(--border-warn)' }}>
      Locked
    </span>
  )
}

function PickChip({
  name, value, label, odds, active,
}: {
  name: string; value: string; label: string; odds: number; active: boolean
}) {
  return (
    <button type="submit" name={name} value={value}
      className="rounded-lg px-2 py-2 text-center transition-colors"
      style={active
        ? { color: 'var(--color-accent)', background: 'var(--color-accent-soft)', border: '1px solid var(--border-accent)' }
        : { color: 'var(--color-text)', background: 'var(--color-bg)', border: '1px solid var(--border-base)' }}>
      <div className="text-[11px] font-bold truncate">{label}</div>
      <div className="text-[10px] text-muted">{odds}</div>
    </button>
  )
}
