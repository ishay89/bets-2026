'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { appDateTimeLocalToIso } from '@/lib/time'
import { redirect } from 'next/navigation'
import { PAGE_SIZE, type AuditRow, type AuditUser } from './types'

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
  offset = 0,
}: {
  from?: string
  to?: string
  userId?: string
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

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as AuditRow[]
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
