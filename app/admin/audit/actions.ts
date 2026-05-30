'use server'

import { createAdminClient, assertAdmin } from '@/lib/supabase/server'

export type AuditValue = Record<string, unknown> | null

export type AuditRow = {
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

export const PAGE_SIZE = 200

export async function fetchAuditEvents({
  from,
  to,
  offset = 0,
}: {
  from?: string
  to?: string
  offset?: number
}): Promise<AuditRow[]> {
  await assertAdmin()
  const supabase = createAdminClient()

  let query = supabase
    .from('user_prediction_audit_events')
    .select('*, users(display_name, email, is_monkey)')
    .order('committed_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (from) query = query.gte('committed_at', from)
  if (to) query = query.lte('committed_at', to)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as AuditRow[]
}
