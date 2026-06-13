export type AuditValue = Record<string, unknown> | null

export type AuditEventType = 'match_prediction' | 'pikanteria_answer' | 'pre_tournament_pick'

export type AuditRow = {
  id: string
  user_id: string
  event_type: AuditEventType
  action: 'create' | 'update'
  entity_ref: string
  old_value: AuditValue
  new_value: AuditValue
  metadata: Record<string, unknown>
  committed_at: string
  users: { display_name: string; email: string; is_monkey: boolean }
}

export type AuditUser = {
  id: string
  display_name: string
  email: string
}

export type AuditBetOption = {
  eventType: AuditEventType
  entityRef: string
  label: string
  detail: string
  group: 'Matches' | 'Pikanteria' | 'Futures'
}

export const PAGE_SIZE = 200
