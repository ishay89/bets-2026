import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  saveMatchPrediction,
  savePikanteriaAnswer,
  type SaveResult,
} from './prediction-saves'

function rpcClient(result: { data: unknown; error: unknown }) {
  return {
    rpc: vi.fn(async () => result),
  }
}

describe('prediction save RPC wrappers', () => {
  test('saves a match pick through the atomic RPC', async () => {
    const client = rpcClient({
      data: { ok: true, status: 'updated', record_id: 'prediction-1', message: null },
      error: null,
    })

    const result = await saveMatchPrediction(client, 'match-1', 'X')

    expect(client.rpc).toHaveBeenCalledWith('save_match_prediction', {
      p_match_id: 'match-1',
      p_pick: 'X',
    })
    expect(result).toEqual<SaveResult>({
      ok: true,
      status: 'updated',
      recordId: 'prediction-1',
    })
  })

  test('returns locked match saves as handled errors', async () => {
    const client = rpcClient({
      data: { ok: false, status: 'locked', record_id: null, message: 'Match is locked' },
      error: null,
    })

    const expected = {
      ok: false,
      status: 'locked',
      message: 'Match is locked',
    } satisfies SaveResult

    await expect(saveMatchPrediction(client, 'match-1', '1')).resolves.toEqual(expected)
  })

  test('converts RPC failures to handled errors so optimistic UI can roll back', async () => {
    const client = rpcClient({
      data: null,
      error: { message: 'audit insert failed' },
    })

    const expected = {
      ok: false,
      status: 'error',
      message: 'Could not save prediction. Please try again.',
    } satisfies SaveResult

    await expect(saveMatchPrediction(client, 'match-1', '2')).resolves.toEqual(expected)
  })

  test('saves a pikanteria answer through the atomic RPC', async () => {
    const client = rpcClient({
      data: { ok: true, status: 'created', record_id: 'answer-1', message: null },
      error: null,
    })

    const result = await savePikanteriaAnswer(client, 'pika-1', '1')

    expect(client.rpc).toHaveBeenCalledWith('save_pikanteria_answer', {
      p_pikanteria_id: 'pika-1',
      p_pick: '1',
    })
    expect(result).toEqual<SaveResult>({
      ok: true,
      status: 'created',
      recordId: 'answer-1',
    })
  })
})

describe('atomic prediction save migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/012_atomic_prediction_saves.sql'),
    'utf8',
  )

  test('creates transactional RPCs for match and pikanteria prediction saves', () => {
    expect(sql).toContain('create or replace function public.save_match_prediction')
    expect(sql).toContain('create or replace function public.save_pikanteria_answer')
    expect(sql).toMatch(/language plpgsql\s+security definer\s+set search_path = public/)
  })

  test('writes prediction rows and audit events inside the same function body', () => {
    expect(sql).toMatch(/insert into public\.predictions[\s\S]+insert into public\.user_prediction_audit_events/)
    expect(sql).toMatch(/update public\.predictions[\s\S]+insert into public\.user_prediction_audit_events/)
    expect(sql).toMatch(/insert into public\.pikanteria_answers[\s\S]+insert into public\.user_prediction_audit_events/)
    expect(sql).toMatch(/update public\.pikanteria_answers[\s\S]+insert into public\.user_prediction_audit_events/)
  })

  test('tightens direct RLS writes so locks are enforced below the UI layer', () => {
    expect(sql).toContain('drop policy if exists "predictions_write_own"')
    expect(sql).toContain('drop policy if exists "predictions_update_own"')
    expect(sql).toContain('drop policy if exists "pik_answers_write_own"')
    expect(sql).toContain('drop policy if exists "pik_answers_update_own"')
    expect(sql).toMatch(/now\(\) < m\.kickoff_time - interval '5 minutes'/)
    expect(sql).toMatch(/now\(\) < md\.lock_time/)
  })
})

describe('independent bet locks migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260602174444_independent_bet_locks.sql'),
    'utf8',
  )

  test('adds an independent pikanteria lock flag', () => {
    expect(sql).toMatch(/alter table public\.pikanteria[\s\S]+add column if not exists locked boolean not null default false/)
  })

  test('removes legacy match-day lock checks from active guards', () => {
    expect(sql).not.toMatch(/md\.locked|day_locked/)
    expect(sql).toMatch(/m\.locked|match_locked/)
  })

  test('uses question-level pikanteria locks for saves, policies, and crowd reveal', () => {
    expect(sql).toMatch(/pk\.locked as pikanteria_locked/)
    expect(sql).toMatch(/if v_item\.pikanteria_locked then/)
    expect(sql).toMatch(/and not pk\.locked/)
    expect(sql).toMatch(/where pk\.published_at is not null\s+and pk\.locked/)
  })
})
