'use client'

import React, { useState, useTransition } from 'react'
import { fetchAuditEvents, PAGE_SIZE, type AuditRow, type AuditValue } from './actions'

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
  if (row.event_type === 'match_prediction') return asText(value.pick) || 'None'
  if (row.event_type === 'pikanteria_answer') {
    const label = asText(value.label)
    const odds = asText(value.odds)
    return odds ? `${label} (${odds})` : label || 'None'
  }
  const winner = asText(value.winner_team)
  const scorer = asText(value.top_scorer)
  return [winner && `Winner: ${winner}`, scorer && `Scorer: ${scorer}`].filter(Boolean).join(' | ') || 'None'
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

const typeLabels: Record<AuditRow['event_type'], string> = {
  match_prediction: 'Match',
  pikanteria_answer: 'Pikanteria',
  pre_tournament_pick: 'Pre-tournament',
}

const panelStyle = {
  background: 'var(--color-panel)',
  border: '1px solid var(--border-base)',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-elev)',
  border: '1px solid var(--border-base)',
  color: 'var(--color-text)',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
}

export default function AuditClient({ initialEvents }: { initialEvents: AuditRow[] }) {
  const [events, setEvents] = useState<AuditRow[]>(initialEvents)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [activeFrom, setActiveFrom] = useState('')
  const [activeTo, setActiveTo] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isLoadingMore, startLoadMore] = useTransition()

  const hasMore = events.length > 0 && events.length % PAGE_SIZE === 0

  function handleSearch() {
    startTransition(async () => {
      const results = await fetchAuditEvents({ from: from || undefined, to: to || undefined, offset: 0 })
      setEvents(results)
      setActiveFrom(from)
      setActiveTo(to)
    })
  }

  function handleReset() {
    setFrom('')
    setTo('')
    startTransition(async () => {
      const results = await fetchAuditEvents({ offset: 0 })
      setEvents(results)
      setActiveFrom('')
      setActiveTo('')
    })
  }

  function handleLoadMore() {
    startLoadMore(async () => {
      const results = await fetchAuditEvents({
        from: activeFrom || undefined,
        to: activeTo || undefined,
        offset: events.length,
      })
      setEvents((prev: AuditRow[]) => [...prev, ...results])
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-black text-lg" style={{ color: 'var(--color-amber)' }}>
            User Audit
          </div>
          <div className="text-muted text-xs mt-0.5">Latest user prediction commits</div>
        </div>
        <div
          className="text-[11px] font-bold px-2 py-1 rounded-lg"
          style={{ color: 'var(--color-muted)', background: 'var(--color-elev)' }}
        >
          {events.length} events
        </div>
      </div>

      {/* Date/time filter */}
      <div className="rounded-xl p-4 flex flex-wrap items-end gap-3" style={panelStyle}>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)' }}>From</label>
          <input
            type="datetime-local"
            value={from}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)' }}>To</label>
          <input
            type="datetime-local"
            value={to}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={isPending}
          className="px-4 py-1.5 rounded-lg text-[12px] font-bold"
          style={{ background: 'var(--color-amber)', color: '#000', opacity: isPending ? 0.6 : 1 }}
        >
          {isPending ? 'Loading...' : 'Search'}
        </button>
        {(activeFrom || activeTo) && (
          <button
            onClick={handleReset}
            disabled={isPending}
            className="px-3 py-1.5 rounded-lg text-[12px]"
            style={{ background: 'var(--color-elev)', color: 'var(--color-muted)', opacity: isPending ? 0.6 : 1 }}
          >
            Reset
          </button>
        )}
      </div>

      {events.length === 0 && (
        <div className="rounded-xl p-8 text-center" style={panelStyle}>
          <div className="text-muted text-sm">No audit events found.</div>
        </div>
      )}

      {events.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={panelStyle}>
          <table className="w-full">
            <thead>
              <tr>
                {['Time', 'Player', 'Type', 'Context', 'Change'].map((heading) => (
                  <th
                    key={heading}
                    className="text-left text-[11px] font-semibold px-3 py-2"
                    style={{ color: 'var(--color-muted)', borderBottom: '1px solid var(--border-base)' }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td
                    className="px-3 py-2 align-top text-[12px] whitespace-nowrap"
                    style={{ color: 'var(--color-sub)', borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    {formatTimestamp(event.committed_at)}
                  </td>
                  <td
                    className="px-3 py-2 align-top text-[12px]"
                    style={{ color: 'var(--color-text)', borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    <div className="font-semibold">{event.users.display_name}</div>
                    <div className="text-[10px] text-muted">{event.users.email}</div>
                  </td>
                  <td className="px-3 py-2 align-top" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="text-[11px] font-bold" style={{ color: 'var(--color-amber)' }}>
                      {typeLabels[event.event_type]}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted">{event.action}</div>
                  </td>
                  <td
                    className="px-3 py-2 align-top text-[12px]"
                    style={{ color: 'var(--color-text)', borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    {contextLabel(event)}
                  </td>
                  <td
                    className="px-3 py-2 align-top text-[12px]"
                    style={{ color: 'var(--color-text)', borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    <span className="text-muted">{valueLabel(event, event.old_value)}</span>
                    <span className="mx-2" style={{ color: 'var(--color-amber)' }}>{'->'}</span>
                    <span className="font-semibold">{valueLabel(event, event.new_value)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasMore && (
            <div className="px-3 py-3 flex justify-center" style={{ borderTop: '1px solid var(--border-base)' }}>
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-6 py-2 rounded-lg text-[12px] font-bold"
                style={{ background: 'var(--color-elev)', color: 'var(--color-text)', opacity: isLoadingMore ? 0.6 : 1 }}
              >
                {isLoadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
