import { createAdminClient, assertAdmin } from '@/lib/supabase/server'

type AuditValue = Record<string, unknown> | null

type AuditRow = {
  id: string
  user_id: string
  event_type: 'match_prediction' | 'pikanteria_answer' | 'pre_tournament_pick'
  action: 'create' | 'update'
  entity_ref: string
  old_value: AuditValue
  new_value: AuditValue
  metadata: Record<string, unknown>
  committed_at: string
  users: { display_name: string; email: string; is_monkey: boolean }
}

const typeLabels: Record<AuditRow['event_type'], string> = {
  match_prediction: 'Match',
  pikanteria_answer: 'Pikanteria',
  pre_tournament_pick: 'Pre-tournament',
}

function asText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function contextLabel(row: AuditRow) {
  if (row.event_type === 'match_prediction') {
    const home = asText(row.metadata.home_team)
    const away = asText(row.metadata.away_team)
    return home && away ? `${home} vs ${away}` : row.entity_ref
  }

  if (row.event_type === 'pikanteria_answer') {
    return asText(row.metadata.question) || row.entity_ref
  }

  return 'Pre-tournament'
}

function valueLabel(row: AuditRow, value: AuditValue) {
  if (!value) return 'None'

  if (row.event_type === 'match_prediction') {
    return asText(value.pick) || 'None'
  }

  if (row.event_type === 'pikanteria_answer') {
    const label = asText(value.label)
    const odds = asText(value.odds)
    return odds ? `${label} (${odds})` : label || 'None'
  }

  const winner = asText(value.winner_team)
  const scorer = asText(value.top_scorer)
  return [winner && `Winner: ${winner}`, scorer && `Scorer: ${scorer}`]
    .filter(Boolean)
    .join(' | ') || 'None'
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default async function AuditPage() {
  await assertAdmin()
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('user_prediction_audit_events')
    .select('*, users(display_name, email, is_monkey)')
    .order('committed_at', { ascending: false })
    .limit(200)

  const events = (data ?? []) as AuditRow[]

  const panelStyle = {
    background: 'var(--color-panel)',
    border: '1px solid rgba(255,255,255,0.06)',
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>
            User Audit
          </div>
          <div className="text-muted text-xs mt-0.5">
            Latest user prediction commits
          </div>
        </div>
        <div className="text-[11px] font-bold px-2 py-1 rounded-lg"
          style={{ color: 'var(--color-muted)', background: 'var(--color-elev)' }}>
          {events.length} events
        </div>
      </div>

      {events.length === 0 && (
        <div className="rounded-xl p-8 text-center" style={panelStyle}>
          <div className="text-muted text-sm">No user prediction audit events yet.</div>
        </div>
      )}

      {events.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={panelStyle}>
          <table className="w-full">
            <thead>
              <tr>
                {['Time', 'Player', 'Type', 'Context', 'Change'].map((heading) => (
                  <th key={heading}
                    className="text-left text-[11px] font-semibold px-3 py-2"
                    style={{ color: 'var(--color-muted)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="px-3 py-2 align-top text-[12px] whitespace-nowrap"
                    style={{ color: 'var(--color-sub)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {formatTimestamp(event.committed_at)}
                  </td>
                  <td className="px-3 py-2 align-top text-[12px]"
                    style={{ color: 'var(--color-text)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="font-semibold">{event.users.display_name}</div>
                    <div className="text-[10px] text-muted">{event.users.email}</div>
                  </td>
                  <td className="px-3 py-2 align-top"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="text-[11px] font-bold" style={{ color: 'var(--color-amber)' }}>
                      {typeLabels[event.event_type]}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted">{event.action}</div>
                  </td>
                  <td className="px-3 py-2 align-top text-[12px]"
                    style={{ color: 'var(--color-text)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {contextLabel(event)}
                  </td>
                  <td className="px-3 py-2 align-top text-[12px]"
                    style={{ color: 'var(--color-text)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-muted">{valueLabel(event, event.old_value)}</span>
                    <span className="mx-2" style={{ color: 'var(--color-amber)' }}>-&gt;</span>
                    <span className="font-semibold">{valueLabel(event, event.new_value)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
