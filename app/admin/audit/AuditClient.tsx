'use client'

import React, { useReducer, useTransition } from 'react'
import { formatAppDateTime } from '@/lib/time'
import { fetchAuditBetOptions, fetchAuditEvents, fetchAuditUsers } from './actions'
import { PAGE_SIZE, type AuditBetOption, type AuditEventType, type AuditRow, type AuditUser, type AuditValue } from './types'

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
  return formatAppDateTime(value)
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

type AuditState = {
  events: AuditRow[]
  users: AuditUser[]
  betOptions: AuditBetOption[]
  from: string
  to: string
  userId: string
  eventType: AuditEventType | ''
  entityRef: string
  activeFrom: string
  activeTo: string
  activeUserId: string
  activeEventType: AuditEventType | ''
  activeEntityRef: string
}

type AuditAction =
  | { type: 'SET_FROM'; value: string }
  | { type: 'SET_TO'; value: string }
  | { type: 'SET_USER'; value: string }
  | { type: 'SET_BET_FILTER'; eventType: AuditEventType | ''; entityRef: string }
  | { type: 'SET_EVENTS'; events: AuditRow[]; users: AuditUser[]; betOptions: AuditBetOption[]; from: string; to: string; userId: string; eventType: AuditEventType | ''; entityRef: string }
  | { type: 'APPEND_EVENTS'; events: AuditRow[]; users: AuditUser[]; betOptions: AuditBetOption[] }
  | { type: 'RESET'; events: AuditRow[]; users: AuditUser[]; betOptions: AuditBetOption[] }

function auditReducer(state: AuditState, action: AuditAction): AuditState {
  switch (action.type) {
    case 'SET_FROM':
      return { ...state, from: action.value }
    case 'SET_TO':
      return { ...state, to: action.value }
    case 'SET_USER':
      return { ...state, userId: action.value }
    case 'SET_BET_FILTER':
      return { ...state, eventType: action.eventType, entityRef: action.entityRef }
    case 'SET_EVENTS':
      return {
        ...state,
        events: action.events,
        users: action.users,
        betOptions: action.betOptions,
        activeFrom: action.from,
        activeTo: action.to,
        activeUserId: action.userId,
        activeEventType: action.eventType,
        activeEntityRef: action.entityRef,
      }
    case 'APPEND_EVENTS':
      return { ...state, events: [...state.events, ...action.events], users: action.users, betOptions: action.betOptions }
    case 'RESET':
      return {
        ...state,
        from: '',
        to: '',
        userId: '',
        eventType: '',
        entityRef: '',
        activeFrom: '',
        activeTo: '',
        activeUserId: '',
        activeEventType: '',
        activeEntityRef: '',
        events: action.events,
        users: action.users,
        betOptions: action.betOptions,
      }
    default:
      return state
  }
}

export default function AuditClient({
  initialEvents,
  users,
  betOptions,
}: {
  initialEvents: AuditRow[]
  users: AuditUser[]
  betOptions: AuditBetOption[]
}) {
  const [state, dispatch] = useReducer(auditReducer, {
    events: initialEvents,
    users,
    betOptions,
    from: '',
    to: '',
    userId: '',
    eventType: '',
    entityRef: '',
    activeFrom: '',
    activeTo: '',
    activeUserId: '',
    activeEventType: '',
    activeEntityRef: '',
  })
  const {
    events,
    users: currentUsers,
    betOptions: currentBetOptions,
    from,
    to,
    userId,
    eventType,
    entityRef,
    activeFrom,
    activeTo,
    activeUserId,
    activeEventType,
    activeEntityRef,
  } = state
  const [isPending, startTransition] = useTransition()
  const [isLoadingMore, startLoadMore] = useTransition()

  const hasMore = events.length > 0 && events.length % PAGE_SIZE === 0

  function handleSearch() {
    startTransition(async () => {
      const [results, nextUsers, nextBetOptions] = await Promise.all([
        fetchAuditEvents({
          from: from || undefined,
          to: to || undefined,
          userId: userId || undefined,
          eventType: eventType || undefined,
          entityRef: entityRef || undefined,
          offset: 0,
        }),
        fetchAuditUsers(),
        fetchAuditBetOptions(),
      ])
      dispatch({
        type: 'SET_EVENTS',
        events: results,
        users: nextUsers,
        betOptions: nextBetOptions,
        from,
        to,
        userId,
        eventType,
        entityRef,
      })
    })
  }

  function handleReset() {
    startTransition(async () => {
      const [results, nextUsers, nextBetOptions] = await Promise.all([
        fetchAuditEvents({ offset: 0 }),
        fetchAuditUsers(),
        fetchAuditBetOptions(),
      ])
      dispatch({ type: 'RESET', events: results, users: nextUsers, betOptions: nextBetOptions })
    })
  }

  function handleLoadMore() {
    startLoadMore(async () => {
      const [results, nextUsers, nextBetOptions] = await Promise.all([
        fetchAuditEvents({
          from: activeFrom || undefined,
          to: activeTo || undefined,
          userId: activeUserId || undefined,
          eventType: activeEventType || undefined,
          entityRef: activeEntityRef || undefined,
          offset: events.length,
        }),
        fetchAuditUsers(),
        fetchAuditBetOptions(),
      ])
      dispatch({ type: 'APPEND_EVENTS', events: results, users: nextUsers, betOptions: nextBetOptions })
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

      {/* User + bet + date/time filter */}
      <div className="rounded-xl p-4 flex flex-wrap items-end gap-3" style={panelStyle}>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-user" className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)' }}>Player</label>
          <select
            id="audit-user"
            value={userId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => dispatch({ type: 'SET_USER', value: e.target.value })}
            style={inputStyle}
          >
            <option value="">All players</option>
            {currentUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[240px]">
          <label htmlFor="audit-bet" className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)' }}>Bet</label>
          <select
            id="audit-bet"
            value={eventType && entityRef ? `${eventType}:${entityRef}` : ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              if (!e.target.value) {
                dispatch({ type: 'SET_BET_FILTER', eventType: '', entityRef: '' })
                return
              }
              const [nextEventType, nextEntityRef] = e.target.value.split(':')
              dispatch({
                type: 'SET_BET_FILTER',
                eventType: (nextEventType ?? '') as AuditEventType,
                entityRef: nextEntityRef ?? '',
              })
            }}
            style={inputStyle}
          >
            <option value="">All bets</option>
            {(['Matches', 'Pikanteria', 'Futures'] as const).map((group) => {
              const options = currentBetOptions.filter((option) => option.group === group)
              if (options.length === 0) return null
              return (
                <optgroup key={group} label={group}>
                  {options.map((option) => (
                    <option key={`${option.eventType}:${option.entityRef}`} value={`${option.eventType}:${option.entityRef}`}>
                      {option.detail ? `${option.label} - ${option.detail}` : option.label}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-from" className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)' }}>From ET</label>
          <input
            id="audit-from"
            type="datetime-local"
            value={from}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => dispatch({ type: 'SET_FROM', value: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-to" className="text-[10px] font-semibold" style={{ color: 'var(--color-muted)' }}>To ET</label>
          <input
            id="audit-to"
            type="datetime-local"
            value={to}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => dispatch({ type: 'SET_TO', value: e.target.value })}
            style={inputStyle}
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={isPending}
          className="px-4 py-1.5 rounded-lg text-[12px] font-bold"
          style={{ background: 'var(--color-amber)', color: '#000', opacity: isPending ? 0.6 : 1 }}
        >
          {isPending ? 'Loading...' : 'Search'}
        </button>
        {(activeFrom || activeTo || activeUserId || activeEventType || activeEntityRef) && (
          <button
            type="button"
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
            <div className="p-3 flex justify-center" style={{ borderTop: '1px solid var(--border-base)' }}>
              <button
                type="button"
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
