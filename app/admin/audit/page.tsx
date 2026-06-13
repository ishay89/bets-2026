import { assertAdmin } from '@/lib/supabase/server'
import { fetchAuditBetOptions, fetchAuditEvents, fetchAuditUsers } from './actions'
import AuditClient from './AuditClient'

export default async function AuditPage() {
  await assertAdmin()
  const [initialEvents, users, betOptions] = await Promise.all([
    fetchAuditEvents({ offset: 0 }),
    fetchAuditUsers(),
    fetchAuditBetOptions(),
  ])
  return <AuditClient initialEvents={initialEvents} users={users} betOptions={betOptions} />
}
