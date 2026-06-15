type PersistDueMatchLocksClient = {
  rpc(functionName: 'persist_due_match_locks'): PromiseLike<{
    data: unknown
    error: { message?: string } | null
  }>
}

export async function persistDueMatchLocks(supabase: PersistDueMatchLocksClient): Promise<number> {
  const { data, error } = await supabase.rpc('persist_due_match_locks')
  if (error) {
    throw new Error(`Failed to persist due match locks: ${error.message ?? 'Unknown Supabase error'}`)
  }

  return typeof data === 'number' ? data : Number(data ?? 0)
}

type PersistDuePikanteriaLocksClient = {
  rpc(functionName: 'persist_due_pikanteria_locks'): PromiseLike<{
    data: unknown
    error: { message?: string } | null
  }>
}

export async function persistDuePikanteriaLocks(supabase: PersistDuePikanteriaLocksClient): Promise<number> {
  const { data, error } = await supabase.rpc('persist_due_pikanteria_locks')
  if (error) {
    throw new Error(`Failed to persist due pikanteria locks: ${error.message ?? 'Unknown Supabase error'}`)
  }

  return typeof data === 'number' ? data : Number(data ?? 0)
}
