import { assertAdmin } from '@/lib/supabase/server'
import { fetchAuditEvents } from './actions'
import AuditClient from './AuditClient'

export default async function AuditPage() {
  await assertAdmin()
  const initialEvents = await fetchAuditEvents({ offset: 0 })
  return <AuditClient initialEvents={initialEvents} />
}
