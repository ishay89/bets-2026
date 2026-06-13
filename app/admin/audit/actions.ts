'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { appDateTimeLocalToIso } from '@/lib/time'
import { redirect } from 'next/navigation'
import { PAGE_SIZE, type AuditBetOption, type AuditEventType, type AuditRow, type AuditUser } from './types'

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/')
}

export async function fetchAuditEvents({
  from,
  to,
  userId,
  eventType,
  entityRef,
  offset = 0,
}: {
  from?: string
  to?: string
  userId?: string
  eventType?: AuditEventType
  entityRef?: string
  offset?: number
}): Promise<AuditRow[]> {
  await requireAuth()

  const admin = createAdminClient()

  let query = admin
    .from('user_prediction_audit_events')
    .select('*, users(display_name, email, is_monkey)')
    .order('committed_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  const fromIso = appDateTimeLocalToIso(from)
  const toIso = appDateTimeLocalToIso(to)

  if (fromIso) query = query.gte('committed_at', fromIso)
  if (toIso) query = query.lte('committed_at', toIso)
  if (userId) query = query.eq('user_id', userId)
  if (eventType) query = query.eq('event_type', eventType)
  if (entityRef) query = query.eq('entity_ref', entityRef)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as AuditRow[]
}

type MatchBetRow = {
  id: string
  home_team: string
  away_team: string
  kickoff_time: string | null
  match_days: { date: string; stage: string } | { date: string; stage: string }[] | null
}

type PikanteriaBetRow = {
  id: string
  question: string
  match_days: { date: string; stage: string } | { date: string; stage: string }[] | null
}

export async function fetchAuditBetOptions(): Promise<AuditBetOption[]> {
  await requireAuth()

  const admin = createAdminClient()

  const [matchesResult, pikanteriaResult] = await Promise.all([
    admin
      .from('matches')
      .select('id, home_team, away_team, kickoff_time, match_days(date, stage)')
      .order('kickoff_time', { ascending: true }),
    admin
      .from('pikanteria')
      .select('id, question, match_days(date, stage)')
      .order('created_at', { ascending: true }),
  ])

  if (matchesResult.error) throw matchesResult.error
  if (pikanteriaResult.error) throw pikanteriaResult.error

  const matchOptions = ((matchesResult.data ?? []) as MatchBetRow[]).map((match) => {
    const matchDay = Array.isArray(match.match_days) ? match.match_days[0] : match.match_days
    return {
      eventType: 'match_prediction' as const,
      entityRef: match.id,
      label: `${match.home_team} vs ${match.away_team}`,
      detail: [matchDay?.date, matchDay?.stage].filter(Boolean).join(' - '),
      group: 'Matches' as const,
    }
  })

  const pikanteriaOptions = ((pikanteriaResult.data ?? []) as PikanteriaBetRow[]).map((item) => {
    const matchDay = Array.isArray(item.match_days) ? item.match_days[0] : item.match_days
    return {
      eventType: 'pikanteria_answer' as const,
      entityRef: item.id,
      label: item.question,
      detail: [matchDay?.date, matchDay?.stage].filter(Boolean).join(' - '),
      group: 'Pikanteria' as const,
    }
  })

  return [
    ...matchOptions,
    ...pikanteriaOptions,
    {
      eventType: 'pre_tournament_pick',
      entityRef: 'pre_tournament',
      label: 'Pre-tournament futures',
      detail: 'Winner and top scorer',
      group: 'Futures',
    },
  ]
}

export async function fetchAuditUsers(): Promise<AuditUser[]> {
  await requireAuth()

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('users')
    .select('id, display_name, email')
    .order('display_name', { ascending: true })

  if (error) throw error

  return ((data ?? []) as AuditUser[]).sort((a, b) => a.display_name.localeCompare(b.display_name))
}
