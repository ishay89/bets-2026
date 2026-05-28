export type AuditJson = Record<string, unknown>

export type AuditEventType =
  | 'match_prediction'
  | 'pikanteria_answer'
  | 'pre_tournament_pick'

export type AuditAction = 'create' | 'update'

export type AuditInsert = {
  user_id: string
  event_type: AuditEventType
  action: AuditAction
  entity_id?: string | null
  entity_ref: string
  old_value: AuditJson | null
  new_value: AuditJson
  metadata?: AuditJson
}

type SupabaseInsertClient = {
  from: (table: 'user_prediction_audit_events') => {
    insert: (row: AuditInsert & { metadata: AuditJson }) => PromiseLike<{ error: unknown }>
  }
}

export function shouldWriteAuditEvent(oldValue: AuditJson | null, newValue: AuditJson) {
  if (oldValue === null) return true
  return JSON.stringify(sortJson(oldValue)) !== JSON.stringify(sortJson(newValue))
}

export async function writeAuditEvent(supabase: SupabaseInsertClient, event: AuditInsert) {
  const { error } = await supabase.from('user_prediction_audit_events').insert({
    ...event,
    entity_id: event.entity_id ?? null,
    metadata: event.metadata ?? {},
  })

  if (error) {
    throw error
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortJson(nested)])
  )
}
