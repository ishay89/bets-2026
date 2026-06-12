'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isValidAvatarEmoji } from '@/lib/display'

/**
 * Persist the signed-in player's chosen avatar emoji. Passing an empty value
 * clears it and restores the name-derived default. The value must be one of the
 * selectable AVATAR_EMOJIS; anything else is rejected.
 *
 * Writes go through the user-session client so the `users_update_own` RLS policy
 * scopes the change to the caller's own row.
 */
export async function updateAvatarEmoji(emoji: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const next = emoji === '' ? null : emoji
  if (next !== null && !isValidAvatarEmoji(next)) {
    throw new Error('Invalid avatar emoji')
  }

  const { error } = await supabase
    .from('users')
    .update({ avatar_emoji: next })
    .eq('id', user.id)
  if (error) throw error

  revalidatePath('/profile')
  revalidatePath('/leaderboard')
  revalidatePath('/board')
}
