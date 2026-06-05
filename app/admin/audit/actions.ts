'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PAGE_SIZE, type AuditRow, type AuditUser } from './types'

async function assertAuditAdmin() {
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
  await assertAuditAdmin()

  const admin = createAdminClient()

  let query = admin
    .from('user_prediction_audit_events')
    .select('*, users(display_name, email, is_monkey)')
    .order('committed_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (from) query = query.gte('committed_at', from)
  if (to) query = query.lte('committed_at', to)
  if (userId) query = query.eq('user_id', userId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as AuditRow[]
}

export async function fetchAuditUsers(): Promise<AuditUser[]> {
  await assertAuditAdmin()

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('user_prediction_audit_events')
    .select('user_id, users(display_name, email)')
    .order('committed_at', { ascending: false })

  if (error) throw error

  const seen = new Map<string, AuditUser>()
  const rows = (data ?? []) as unknown as { user_id: string; users: { display_name: string; email: string } | null }[]
  for (const row of rows) {
    if (!row.users || seen.has(row.user_id)) continue
    seen.set(row.user_id, {
      id: row.user_id,
      display_name: row.users.display_name,
      email: row.users.email,
    })
  }

  return [...seen.values()].sort((a, b) => a.display_name.localeCompare(b.display_name))
}
