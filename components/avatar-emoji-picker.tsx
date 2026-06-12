'use client'

import { useState, useTransition } from 'react'
import { AVATAR_EMOJIS } from '@/lib/display'
import { updateAvatarEmoji } from '@/app/profile/actions'

interface Props {
  /** The avatar currently shown (custom emoji or name-derived fallback). */
  currentAvatar: string
  /** The player's saved custom emoji, or null when using the default. */
  savedEmoji: string | null
}

/**
 * The profile hero avatar, tappable to open an emoji picker. Choosing an emoji
 * saves it to the player's profile; "Reset" clears it back to the default.
 */
export function AvatarEmojiPicker({ currentAvatar, savedEmoji }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(savedEmoji)
  const [pending, startTransition] = useTransition()

  function choose(emoji: string) {
    const next = emoji === selected ? '' : emoji
    setSelected(next === '' ? null : next)
    startTransition(async () => {
      await updateAvatarEmoji(next)
    })
  }

  function reset() {
    setSelected(null)
    startTransition(async () => {
      await updateAvatarEmoji('')
    })
  }

  // What to show in the hero bubble: the live selection wins so the change feels
  // instant, otherwise the server-derived avatar.
  const shown = selected ?? currentAvatar

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Change your avatar emoji"
        className="relative size-14 rounded-full flex items-center justify-center text-2xl shrink-0 transition-transform active:scale-95"
        style={{ background: 'var(--color-elev)', border: '2px solid var(--color-accent)' }}
      >
        {shown}
        <span
          className="absolute -bottom-1 -right-1 size-5 rounded-full flex items-center justify-center text-[10px]"
          style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
        >
          ✎
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[20px] p-4 pb-8"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-[15px] font-extrabold text-text tracking-tight">Pick your emoji</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[13px] font-bold"
                style={{ color: 'var(--color-muted)' }}
              >
                Done
              </button>
            </div>

            <div className="grid grid-cols-8 gap-1.5">
              {AVATAR_EMOJIS.map(emoji => {
                const active = emoji === selected
                return (
                  <button
                    key={emoji}
                    type="button"
                    disabled={pending}
                    onClick={() => choose(emoji)}
                    className="aspect-square rounded-[10px] flex items-center justify-center text-[20px] transition-transform active:scale-90 disabled:opacity-50"
                    style={{
                      background: active ? 'var(--color-accent-soft)' : 'var(--color-elev)',
                      border: active ? '2px solid var(--color-accent)' : '1px solid var(--border-base)',
                    }}
                  >
                    {emoji}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              disabled={pending || selected === null}
              onClick={reset}
              className="mt-4 block w-full text-center text-[12px] font-bold py-2.5 rounded-xl transition-colors disabled:opacity-40"
              style={{ color: 'var(--color-muted)', border: '1px solid var(--border-base)', background: 'var(--color-elev)' }}
            >
              Reset to default
            </button>
          </div>
        </div>
      )}
    </>
  )
}
