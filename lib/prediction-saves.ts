import type { Pick } from './types'

export type SaveStatus =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'locked'
  | 'not_found'
  | 'invalid'
  | 'error'

export type SaveResult =
  | { ok: true; status: Extract<SaveStatus, 'created' | 'updated' | 'unchanged'>; recordId: string }
  | { ok: false; status: Exclude<SaveStatus, 'created' | 'updated' | 'unchanged'>; message: string }

type RpcError = unknown
type RpcResponse = { data: unknown; error: RpcError }
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResponse>
}

type RpcSaveRow = {
  ok?: unknown
  status?: unknown
  record_id?: unknown
  message?: unknown
}

const GENERIC_MATCH_ERROR = 'Could not save prediction. Please try again.'
const GENERIC_PIKA_ERROR = 'Could not save pikanteria answer. Please try again.'

export async function saveMatchPrediction(
  supabase: RpcClient,
  matchId: string,
  pick: Pick,
): Promise<SaveResult> {
  const { data, error } = await supabase.rpc('save_match_prediction', {
    p_match_id: matchId,
    p_pick: pick,
  })

  return normalizeRpcSaveResult(data, error, GENERIC_MATCH_ERROR)
}

export async function savePikanteriaAnswer(
  supabase: RpcClient,
  pikanteriaId: string,
  pick: Pick,
): Promise<SaveResult> {
  const { data, error } = await supabase.rpc('save_pikanteria_answer', {
    p_pikanteria_id: pikanteriaId,
    p_pick: pick,
  })

  return normalizeRpcSaveResult(data, error, GENERIC_PIKA_ERROR)
}

function normalizeRpcSaveResult(
  data: unknown,
  error: RpcError,
  genericMessage: string,
): SaveResult {
  if (error) {
    return { ok: false, status: 'error', message: genericMessage }
  }

  const row = normalizeRow(data)
  if (!row) {
    return { ok: false, status: 'error', message: genericMessage }
  }

  if (row.ok === true) {
    const status = typeof row.status === 'string' ? row.status : 'updated'
    const recordId = typeof row.record_id === 'string' ? row.record_id : ''

    if (
      recordId
      && (status === 'created' || status === 'updated' || status === 'unchanged')
    ) {
      return { ok: true, status, recordId }
    }

    return { ok: false, status: 'error', message: genericMessage }
  }

  const status = typeof row.status === 'string' ? row.status : 'error'
  const message = typeof row.message === 'string' && row.message.trim()
    ? row.message
    : genericMessage

  if (status === 'locked' || status === 'not_found' || status === 'invalid') {
    return { ok: false, status, message }
  }

  return { ok: false, status: 'error', message: genericMessage }
}

function normalizeRow(data: unknown): RpcSaveRow | null {
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== 'object') return null
  return value as RpcSaveRow
}
