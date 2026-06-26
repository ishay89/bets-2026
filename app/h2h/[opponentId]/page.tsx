export const metadata = { title: 'H2H | Mondial Bets 2026', description: 'Head-to-head comparison' }

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { createAdminClient, createClient, createClientWithToken } from '@/lib/supabase/server'
import { BottomNav } from '@/components/bottom-nav'
import { isMatchLocked } from '@/lib/lock'
import { buildH2H, pickAgreement, type H2HMatch, type H2HRound, type H2HRoundResult, type RoundWinner } from '@/lib/h2h'
import { getAvatar, getAutomationLabel, getFlagUrl, isAutomated, stageLabel } from '@/lib/display'
import { getLeaderboardEntries, getMatchDaysWithUserData, type HistoryMatchDay } from '@/lib/data'
import { formatAppDate } from '@/lib/time'

// Same cache key as /leaderboard, so this reuses that entry — totals are
// identical for every viewer.
const getCachedLeaderboardEntries = unstable_cache(
  () => getLeaderboardEntries(createAdminClient()),
  ['leaderboard-entries'],
  { revalidate: 300, tags: ['leaderboard'] },
)

// Cached PER VIEWER (keyed on their access token), not shared globally — this
// still runs through the viewer's own RLS scope (token-built client, no admin
// bypass), so the database keeps doing the real filtering of unlocked rows.
// It still kills the original fan-out: this fetch takes no opponentId, so one
// session's burst of prefetched H2H/profile pages all hit this single entry
// instead of re-querying per page.
const getCachedMatchDaysForViewer = unstable_cache(
  (_viewerId: string, accessToken: string) =>
    getMatchDaysWithUserData(createClientWithToken(accessToken)),
  ['match-days-user-data'],
  { revalidate: 60, tags: ['match-days'] },
)

// Caches the DERIVED view model, not just the raw fetch — Vercel's Active CPU
// billing excludes I/O wait (the DB round-trip above), so the actual billed
// cost per request is buildRoundsVM/buildH2H's loop over every match day.
// Without this, that loop re-runs on every request even when
// getCachedMatchDaysForViewer hits. nowBucket rounds down to the minute so the
// key stays stable within the same 60s window as the underlying data;
// rounding down only ever delays a lock transition by up to 60s, never
// reveals a pick early.
const getCachedH2HViewModel = unstable_cache(
  async (viewerId: string, opponentId: string, accessToken: string, nowBucket: number) => {
    const days = await getCachedMatchDaysForViewer(viewerId, accessToken)
    return computeH2HViewModel(days, viewerId, opponentId, nowBucket)
  },
  ['h2h-view-model'],
  { revalidate: 60, tags: ['match-days'] },
)

// View-model carried alongside each H2HMatch for rendering.
type RowVM = {
  h2h: H2HMatch
  kind: 'match' | 'pika'
  label: string // "Home vs Away" or pikanteria question
  homeTeam?: string
  awayTeam?: string
  resultLabel: string | null // actual result token (e.g. "1"/"X"/"2", or correct option label)
  myLabel: string | null
  theirLabel: string | null
}

type RoundVM = {
  matchDayId: string
  date: string
  stage: string
  rows: RowVM[]
}

const PICK_LABELS: Record<string, string> = { '1': '1', X: 'X', '2': '2' }

// Module-level helper keeps the impure Date.now() out of the component body,
// satisfying the react-compiler purity lint rule (see app/admin/players/[userId]).
function nowMs(): number {
  return Date.now()
}

// Pure transform: turn the raw match days into the render view-models plus the
// per-round H2H input. Kept at module scope so the component body stays small.
function buildRoundsVM(
  days: HistoryMatchDay[],
  myId: string,
  opponentId: string,
  now: number,
): { roundsVM: RoundVM[]; h2hRounds: H2HRound[] } {
  const roundsVM: RoundVM[] = []
  const h2hRounds: H2HRound[] = []

  for (const day of days) {
    const rows: RowVM[] = []

    const matches = (day.matches ?? []).toSorted(
      (a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime(),
    )

    for (const m of matches) {
      const locked = isMatchLocked(m, now)
      const predByUser = new Map(m.predictions.map(p => [p.user_id, p]))
      const myPred = predByUser.get(myId)
      const theirPred = predByUser.get(opponentId)
      // Decided purely by lock state, not by row presence. RLS already keeps
      // an unlocked opponent row out of a normal viewer's query, but admin
      // RLS can read unlocked rows too (see app/u/[userId]) — this redundant
      // check is what keeps an admin viewer from seeing an open H2H pick.
      const theirHidden = !locked
      const resolved = m.result !== null

      const h2h: H2HMatch = {
        id: m.id,
        resolved,
        mine: {
          pick: myPred?.pick ?? null,
          points: myPred?.points ?? 0,
          correct: resolved && myPred ? myPred.pick === m.result : null,
        },
        theirs: {
          pick: theirHidden ? null : (theirPred?.pick ?? null),
          points: theirPred?.points ?? 0,
          correct: resolved && theirPred ? theirPred.pick === m.result : null,
          hidden: theirHidden,
        },
      }
      rows.push({
        h2h,
        kind: 'match',
        label: `${m.home_team} vs ${m.away_team}`,
        homeTeam: m.home_team,
        awayTeam: m.away_team,
        resultLabel: m.result !== null ? PICK_LABELS[m.result] : null,
        myLabel: myPred ? PICK_LABELS[myPred.pick] : null,
        theirLabel: theirHidden ? null : (theirPred ? PICK_LABELS[theirPred.pick] : null),
      })
    }

    for (const pk of day.pikanteria ?? []) {
      const labelFor = (pick: string | null | undefined): string | null => {
        if (pick === '1') return pk.label_1
        if (pick === '2') return pk.label_2
        if (pick === 'X') return pk.label_x
        return null
      }
      const ansByUser = new Map(pk.pikanteria_answers.map(a => [a.user_id, a]))
      const myAns = ansByUser.get(myId)
      const theirAns = ansByUser.get(opponentId)
      const theirHidden = !pk.locked
      const resolved = pk.result !== null

      const h2h: H2HMatch = {
        id: pk.id,
        resolved,
        mine: {
          pick: myAns?.pick ?? null,
          points: myAns?.points ?? 0,
          correct: resolved && myAns ? myAns.pick === pk.result : null,
        },
        theirs: {
          pick: theirHidden ? null : (theirAns?.pick ?? null),
          points: theirAns?.points ?? 0,
          correct: resolved && theirAns ? theirAns.pick === pk.result : null,
          hidden: theirHidden,
        },
      }
      rows.push({
        h2h,
        kind: 'pika',
        label: pk.question,
        resultLabel: labelFor(pk.result),
        myLabel: labelFor(myAns?.pick),
        theirLabel: theirHidden ? null : labelFor(theirAns?.pick),
      })
    }

    if (rows.length === 0) continue
    roundsVM.push({ matchDayId: day.id, date: day.date, stage: day.stage, rows })
    h2hRounds.push({ matchDayId: day.id, items: rows.map(r => r.h2h) })
  }

  return { roundsVM, h2hRounds }
}

// Combines buildRoundsVM + buildH2H so both pure transforms ride in the same
// cache entry above.
function computeH2HViewModel(days: HistoryMatchDay[], myId: string, opponentId: string, now: number) {
  const { roundsVM, h2hRounds } = buildRoundsVM(days, myId, opponentId, now)
  const { rounds: roundResults, summary } = buildH2H(h2hRounds, myId, opponentId)
  return { roundsVM, roundResults, summary }
}

export default async function H2HComparePage({
  params,
}: {
  params: Promise<{ opponentId: string }>
}) {
  const [{ opponentId }, supabase] = await Promise.all([params, createClient()])
  const { data: { user } } = await supabase.auth.getUser()
  const myId = user?.id ?? ''

  if (opponentId === myId) redirect('/h2h')

  // getSession() only to grab the access token for the per-viewer cache below
  // — getUser() above remains the authoritative identity check.
  const { data: { session } } = await supabase.auth.getSession()

  const now = nowMs()
  const nowBucket = Math.floor(now / 60_000) * 60_000

  // Totals from the leaderboard view (consistent with standings) + identity.
  // Nested payload — mirror history. Cached per viewer through their own RLS
  // scope; computeH2HViewModel also strips the opponent's unlocked picks via
  // theirHidden, as a redundant guard against admin RLS seeing more.
  const [entries, { roundsVM, roundResults, summary }] = await Promise.all([
    getCachedLeaderboardEntries(),
    session
      ? getCachedH2HViewModel(myId, opponentId, session.access_token, nowBucket)
      : getMatchDaysWithUserData(supabase).then(days => computeH2HViewModel(days, myId, opponentId, now)),
  ])
  const me = entries.find(e => e.id === myId) ?? null
  const them = entries.find(e => e.id === opponentId) ?? null
  if (!them) notFound()

  const roundResultById = new Map(roundResults.map(r => [r.matchDayId, r]))

  // Totals: prefer the leaderboard view (consistent with standings); fall back
  // to the per-round aggregate if a row is missing.
  const myTotal = me?.total_points ?? summary.myTotal
  const theirTotal = them.total_points
  const iLead = myTotal > theirTotal
  const deadHeat = myTotal === theirTotal
  const gap = Math.round(Math.abs(myTotal - theirTotal) * 100) / 100

  const themAutomated = isAutomated(them)
  const themLabel = getAutomationLabel(them)

  return (
    <div className="min-h-screen bg-bg">
      <RivalryHeader />

      <main className="px-4 pb-28 space-y-4">
        <VersusHero
          myName={me?.display_name ?? 'You'}
          myAvatar={me ? getAvatar(me) : '🙂'}
          myTotal={myTotal}
          theirName={them.display_name}
          theirAvatar={getAvatar(them)}
          theirTotal={theirTotal}
          iLead={iLead}
          deadHeat={deadHeat}
          themAutomated={themAutomated}
          themLabel={themLabel}
        />

        <RivalryStats summary={summary} iLead={iLead} deadHeat={deadHeat} gap={gap} />

        <ByRoundSection roundsVM={roundsVM} roundResultById={roundResultById} />
      </main>

      <BottomNav />
    </div>
  )
}

function RivalryHeader() {
  return (
    <div className="px-4 pt-4 pb-3 flex items-center justify-between">
      <div>
        <div
          className="text-[12px]"
          style={{
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--color-accent)',
          }}
        >
          Head to head
        </div>
        <div className="font-display text-[22px] font-extrabold text-text tracking-tight">Rivalry</div>
      </div>
      <Link
        href="/h2h"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          letterSpacing: '0.04em',
          color: 'var(--color-sub)',
          textDecoration: 'none',
        }}
      >
        Switch →
      </Link>
    </div>
  )
}

function VersusHero({
  myName,
  myAvatar,
  myTotal,
  theirName,
  theirAvatar,
  theirTotal,
  iLead,
  deadHeat,
  themAutomated,
  themLabel,
}: {
  myName: string
  myAvatar: string
  myTotal: number
  theirName: string
  theirAvatar: string
  theirTotal: number
  iLead: boolean
  deadHeat: boolean
  themAutomated: boolean
  themLabel: string | null
}) {
  return (
    <div
      className="pitch-stripes rounded-2xl p-5 relative overflow-hidden"
      style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'var(--hero-glow)' }} />
      <div className="relative z-10 flex items-stretch">
        <HeroSide
          name={myName}
          avatar={myAvatar}
          total={myTotal}
          isLeader={iLead || deadHeat}
          borderColor="var(--color-accent)"
        />
        <div className="flex items-center justify-center px-2">
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'var(--color-dim)',
            }}
          >
            VS
          </span>
        </div>
        <HeroSide
          name={theirName}
          avatar={theirAvatar}
          total={theirTotal}
          isLeader={!iLead || deadHeat}
          borderColor="var(--color-silver)"
          automated={themAutomated}
          automationLabel={themLabel}
        />
      </div>
    </div>
  )
}

function RivalryStats({
  summary,
  iLead,
  deadHeat,
  gap,
}: {
  summary: ReturnType<typeof buildH2H>['summary']
  iLead: boolean
  deadHeat: boolean
  gap: number
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <StatTile
        label="Rounds won"
        value={`${summary.roundsWon.me}–${summary.roundsWon.them}`}
      />
      <StatTile
        label="Agreement"
        value={summary.agreements + summary.disagreements === 0 ? '-' : `${summary.agreementRate}%`}
      />
      <StatTile
        label="Lead"
        value={deadHeat ? 'DEAD HEAT' : `${iLead ? '+' : '−'}${gap.toFixed(2)}`}
        valueColor={
          deadHeat
            ? 'var(--color-muted)'
            : iLead
              ? 'var(--color-accent)'
              : 'var(--color-danger)'
        }
        small={deadHeat}
      />
    </div>
  )
}

function ByRoundSection({
  roundsVM,
  roundResultById,
}: {
  roundsVM: RoundVM[]
  roundResultById: Map<string, H2HRoundResult>
}) {
  return (
    <>
      <div
        className="px-0.5"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
        }}
      >
        By round
      </div>

      {roundsVM.length === 0 && (
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
        >
          <div className="text-3xl mb-2">⚽</div>
          <div className="text-sub text-[13px] font-semibold">
            No rounds played yet. Check back after kickoff.
          </div>
        </div>
      )}

      {roundsVM.map(round => (
        <RoundCard key={round.matchDayId} round={round} result={roundResultById.get(round.matchDayId)} />
      ))}
    </>
  )
}

function HeroSide({
  name,
  avatar,
  total,
  isLeader,
  borderColor,
  automated = false,
  automationLabel = null,
}: {
  name: string
  avatar: string
  total: number
  isLeader: boolean
  borderColor: string
  automated?: boolean
  automationLabel?: string | null
}) {
  return (
    <div className="flex-1 flex flex-col items-center text-center" style={{ opacity: automated ? 0.6 : 1 }}>
      <div
        className="flex items-center justify-center rounded-full"
        style={{ width: 52, height: 52, background: 'var(--color-elev)', border: `2px solid ${borderColor}`, fontSize: 26 }}
      >
        {avatar}
      </div>
      <div
        className="mt-2 truncate max-w-full"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--color-text)',
          fontStyle: automated ? 'italic' : 'normal',
        }}
      >
        {name}
      </div>
      {automationLabel && (
        <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 1 }}>{automationLabel}</div>
      )}
      <div
        className="mt-1"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: isLeader ? 'var(--color-accent)' : 'var(--color-sub)',
        }}
      >
        {total.toFixed(2)}
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  valueColor = 'var(--color-text)',
  small = false,
}: {
  label: string
  value: string
  valueColor?: string
  small?: boolean
}) {
  return (
    <div className="rounded-[10px] p-3" style={{ background: 'var(--color-elev)' }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: small ? 12 : 16,
          fontWeight: 700,
          color: valueColor,
          lineHeight: 1.3,
        }}
      >
        {value}
      </div>
      <div
        className="mt-1"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
        }}
      >
        {label}
      </div>
    </div>
  )
}

const WINNER_CHIP_CONFIG: Record<RoundWinner, { text: string; color: string; bg: string; border: string }> = {
  me: { text: 'You won', color: 'var(--color-accent)', bg: 'var(--color-accent-soft)', border: 'var(--border-accent)' },
  them: { text: 'They won', color: 'var(--color-sub)', bg: 'var(--color-elev)', border: 'var(--border-base)' },
  tie: { text: 'Tie', color: 'var(--color-amber)', bg: 'var(--color-amber-soft)', border: 'var(--border-warn)' },
  pending: { text: 'Pending', color: 'var(--color-muted)', bg: 'transparent', border: 'var(--border-base)' },
}

const WINNER_CHIP_BASE_STYLE = {
  fontFamily: 'var(--font-display)',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
}

function WinnerChip({ winner }: { winner: RoundWinner }) {
  const c = WINNER_CHIP_CONFIG[winner]
  return (
    <span
      className="px-2.5 py-1 rounded-full"
      style={{
        ...WINNER_CHIP_BASE_STYLE,
        color: c.color,
        background: c.bg,
        border: `1px solid ${c.border}`,
      }}
    >
      {c.text}
    </span>
  )
}

function RoundCard({ round, result }: { round: RoundVM; result: H2HRoundResult | undefined }) {
  const winner: RoundWinner = result?.winner ?? 'pending'
  const myPts = result?.myPoints ?? 0
  const theirPts = result?.theirPoints ?? 0
  return (
    <div
      className="rounded-[14px] overflow-hidden"
      style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
    >
      {/* Round header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--color-text)' }}>{formatAppDate(round.date)}</div>
          <div
            className="mt-0.5"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 12,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
            }}
          >
            {stageLabel(round.stage)}
          </div>
        </div>
        <WinnerChip winner={winner} />
      </div>

      {/* Round point totals */}
      <div
        className="flex items-center justify-center gap-3 px-4 py-2"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            fontWeight: 700,
            color: winner === 'me' ? 'var(--color-accent)' : 'var(--color-text)',
          }}
        >
          {myPts.toFixed(2)}
        </span>
        <span style={{ color: 'var(--color-dim)', fontSize: 12 }}>vs</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            fontWeight: 700,
            color: winner === 'them' ? 'var(--color-accent)' : 'var(--color-text)',
          }}
        >
          {theirPts.toFixed(2)}
        </span>
      </div>

      {/* Per-item rows */}
      <div className="px-3 py-2 space-y-1">
        {round.rows.map(row => (
          <CompareRow key={row.h2h.id} row={row} />
        ))}
      </div>
    </div>
  )
}

function PickBadge({
  label,
  correct,
  hidden = false,
}: {
  label: string | null
  correct: boolean | null
  hidden?: boolean
}) {
  if (hidden) {
    return (
      <span
        className="inline-flex items-center justify-center rounded text-[12px] font-bold px-2 py-0.5"
        style={{ background: 'var(--color-elev)', border: '1px solid var(--border-base)', color: 'var(--color-muted)' }}
        title="Locks at kickoff"
      >
        🔒
      </span>
    )
  }
  if (label == null) {
    return <span className="text-[12px]" style={{ color: 'var(--color-muted)' }}>-</span>
  }
  const color =
    correct === true ? 'var(--color-accent)' : correct === false ? 'var(--color-danger)' : 'var(--color-text)'
  const border =
    correct === true ? 'var(--border-accent)' : correct === false ? 'var(--border-danger)' : 'var(--border-base)'
  const bg =
    correct === true ? 'var(--color-accent-soft)' : correct === false ? 'var(--color-danger-soft)' : 'var(--color-elev)'
  return (
    <span
      className="inline-flex items-center justify-center rounded text-[12px] font-bold px-2 py-0.5 max-w-[88px] truncate"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      {label}
    </span>
  )
}

function CompareRow({ row }: { row: RowVM }) {
  const { h2h } = row
  const agree = pickAgreement(h2h.mine.pick, h2h.theirs.pick, h2h.theirs.hidden) === 'agree'
  const isPika = row.kind === 'pika'

  return (
    <div
      className="rounded-[10px]"
      style={{
        padding: '8px 10px',
        borderTop: '1px solid var(--border-subtle)',
        borderLeft: agree ? '3px solid var(--color-accent)' : '3px solid transparent',
      }}
    >
      {/* Item label */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {isPika ? (
          <span className="text-[12px] truncate" style={{ color: 'var(--color-amber)' }}>
            🌶️ {row.label}
          </span>
        ) : (
          <div className="flex items-center gap-1 min-w-0" style={{ color: 'var(--color-sub)' }}>
            {row.homeTeam && getFlagUrl(row.homeTeam) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getFlagUrl(row.homeTeam)!} alt={row.homeTeam} width={16} height={11} style={{ borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
            )}
            <span className="text-[12px] truncate">{row.homeTeam} vs {row.awayTeam}</span>
            {row.awayTeam && getFlagUrl(row.awayTeam) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getFlagUrl(row.awayTeam)!} alt={row.awayTeam} width={16} height={11} style={{ borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
            )}
          </div>
        )}
      </div>

      {/* 3-column compare */}
      <div className="grid grid-cols-3 items-center gap-2">
        {/* Mine */}
        <div className="flex items-center gap-1.5 justify-start">
          <PickBadge label={row.myLabel} correct={h2h.mine.correct} />
          {h2h.mine.points > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent)' }}>
              +{h2h.mine.points.toFixed(2)}
            </span>
          )}
        </div>

        {/* Actual result */}
        <div className="text-center">
          {h2h.resolved ? (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--color-text)',
              }}
            >
              {row.resultLabel ?? '-'}
            </span>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-muted)' }}>
              pending
            </span>
          )}
        </div>

        {/* Theirs */}
        <div className="flex items-center gap-1.5 justify-end">
          {h2h.theirs.points > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent)' }}>
              +{h2h.theirs.points.toFixed(2)}
            </span>
          )}
          <PickBadge label={row.theirLabel} correct={h2h.theirs.correct} hidden={h2h.theirs.hidden} />
        </div>
      </div>
    </div>
  )
}
