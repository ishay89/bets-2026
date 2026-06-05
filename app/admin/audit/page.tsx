import { assertAdmin } from '@/lib/supabase/server'
import { fetchAuditEvents, fetchAuditUsers } from './actions'
import AuditClient from './AuditClient'

export default async function AuditPage() {
  await assertAdmin()
  const [initialEvents, users] = await Promise.all([
    fetchAuditEvents({ offset: 0 }),
    fetchAuditUsers(),
  ])
  return <AuditClient initialEvents={initialEvents} users={users} />
}
