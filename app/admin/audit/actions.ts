'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PAGE_SIZE, type AuditRow } from './types'

export async function fetchAuditEvents({
  from,
  to,
  offset = 0,
}: {
  from?: string
  to?: string
  offset?: number
}): Promise<AuditRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('users').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/')

  const admin = createAdminClient()

  let query = admin
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
