type SupabaseError = { message?: string } | null

type PublishClient = {
  from(table: 'pikanteria'): {
    update(values: { published_at: string | null }): {
      eq(column: 'id', value: string): {
        select(columns: 'match_day_id'): {
          single(): PromiseLike<{ data: unknown; error: SupabaseError }>
        }
      }
    }
  }
  rpc(
    fn: 'recompute_match_day_publish',
    args: { p_match_day_id: string },
  ): PromiseLike<{ error: SupabaseError }>
}

function errorMessage(error: SupabaseError): string {
  return error?.message ?? 'Unknown Supabase error'
}

export async function setPikanteriaPublishedAt(
  supabase: PublishClient,
  pikanteriaId: string,
  publishedAt: string | null,
): Promise<{ matchDayId: string }> {
  const { data, error } = await supabase
    .from('pikanteria')
    .update({ published_at: publishedAt })
    .eq('id', pikanteriaId)
    .select('match_day_id')
    .single()

  if (error) {
    throw new Error(`Failed to update pikanteria publication: ${errorMessage(error)}`)
  }

  const matchDayId = (data as { match_day_id?: string } | null)?.match_day_id
  if (!matchDayId) {
    throw new Error('Failed to update pikanteria publication: missing match day')
  }

  const { error: syncError } = await supabase.rpc('recompute_match_day_publish', {
    p_match_day_id: matchDayId,
  })
  if (syncError) {
    throw new Error(`Failed to sync match day publication: ${errorMessage(syncError)}`)
  }

  return { matchDayId }
}
