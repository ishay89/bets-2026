'use client'

import Image from 'next/image'
import { ChangeEvent, FormEvent, useEffect, useReducer, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAvatar } from '@/lib/display'
import { formatAppDateTime } from '@/lib/time'
import type { AutomationStrategy } from '@/lib/types'

const IMAGE_BUCKET = 'message-board-images'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

interface BoardAuthor {
  display_name: string
  is_monkey: boolean
  automation_strategy: AutomationStrategy | null
}

export interface BoardPost {
  id: string
  user_id: string
  body: string | null
  image_path: string | null
  created_at: string
  users: BoardAuthor
}

export interface AiSocialPost {
  id: string
  title: string
  body: string
  created_at: string
}

interface Props {
  initialPosts: BoardPost[]
  initialAiPosts: AiSocialPost[]
  currentUserId: string
  currentUserIsAdmin: boolean
}

type BoardFeedState = {
  posts: BoardPost[]
  aiPosts: AiSocialPost[]
  body: string
  previewUrl: string | null
  error: string | null
  isPosting: boolean
  deletingPostId: string | null
}

type BoardFeedAction =
  | { type: 'postsLoaded'; posts: BoardPost[] }
  | { type: 'aiPostsLoaded'; aiPosts: AiSocialPost[] }
  | { type: 'bodyChanged'; body: string }
  | { type: 'previewChanged'; previewUrl: string | null }
  | { type: 'errorChanged'; error: string | null }
  | { type: 'postingChanged'; isPosting: boolean }
  | { type: 'deletingChanged'; deletingPostId: string | null }

function boardFeedReducer(state: BoardFeedState, action: BoardFeedAction): BoardFeedState {
  switch (action.type) {
    case 'postsLoaded':
      return { ...state, posts: action.posts }
    case 'aiPostsLoaded':
      return { ...state, aiPosts: action.aiPosts }
    case 'bodyChanged':
      return { ...state, body: action.body }
    case 'previewChanged':
      return { ...state, previewUrl: action.previewUrl }
    case 'errorChanged':
      return { ...state, error: action.error }
    case 'postingChanged':
      return { ...state, isPosting: action.isPosting }
    case 'deletingChanged':
      return { ...state, deletingPostId: action.deletingPostId }
  }
}

function formatPostTime(createdAt: string): string {
  return formatAppDateTime(createdAt, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function getImageUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${path}`
}

export function BoardFeed({ initialPosts, initialAiPosts, currentUserId, currentUserIsAdmin }: Props) {
  const [state, dispatch] = useReducer(boardFeedReducer, {
    posts: initialPosts,
    aiPosts: initialAiPosts,
    body: '',
    previewUrl: null,
    error: null,
    isPosting: false,
    deletingPostId: null,
  })
  const { posts, aiPosts, body, previewUrl, error, isPosting, deletingPostId } = state
  const imageRef = useRef<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refreshPosts() {
    const supabase = createClient()
    const { data } = await supabase
      .from('message_board_posts')
      .select('id, user_id, body, image_path, created_at, users(display_name, is_monkey, automation_strategy)')
      .order('created_at', { ascending: false })
      .limit(100)
      .returns<BoardPost[]>()

    if (data) dispatch({ type: 'postsLoaded', posts: data })
  }

  async function refreshAiPosts() {
    const supabase = createClient()
    const { data } = await supabase
      .from('ai_social_posts')
      .select('id, title, body, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<AiSocialPost[]>()

    if (data) dispatch({ type: 'aiPostsLoaded', aiPosts: data })
  }

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('message-board-posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_board_posts' }, refreshPosts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_social_posts' }, refreshAiPosts)
      .subscribe()

    return () => { void channel.unsubscribe() }
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function clearImage() {
    imageRef.current = null
    dispatch({ type: 'previewChanged', previewUrl: null })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    dispatch({ type: 'errorChanged', error: null })

    if (!file) {
      clearImage()
      return
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      dispatch({ type: 'errorChanged', error: 'Choose a JPG, PNG, WebP, or GIF image.' })
      clearImage()
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      dispatch({ type: 'errorChanged', error: 'Images must be 5 MB or smaller.' })
      clearImage()
      return
    }

    imageRef.current = file
    dispatch({ type: 'previewChanged', previewUrl: URL.createObjectURL(file) })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedBody = body.trim()
    const image = imageRef.current
    if (!trimmedBody && !image) {
      dispatch({ type: 'errorChanged', error: 'Write a message or add an image.' })
      return
    }

    dispatch({ type: 'errorChanged', error: null })
    dispatch({ type: 'postingChanged', isPosting: true })
    const supabase = createClient()
    let imagePath: string | null = null

    try {
      if (image) {
        const extension = image.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        imagePath = `${currentUserId}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage
          .from(IMAGE_BUCKET)
          .upload(imagePath, image, { contentType: image.type })
        if (uploadError) throw uploadError
      }

      const { error: insertError } = await supabase
        .from('message_board_posts')
        .insert({ user_id: currentUserId, body: trimmedBody || null, image_path: imagePath })
      if (insertError) throw insertError

      dispatch({ type: 'bodyChanged', body: '' })
      clearImage()
      await refreshPosts()
    } catch (postError) {
      if (imagePath) {
        await supabase.storage.from(IMAGE_BUCKET).remove([imagePath])
      }
      dispatch({
        type: 'errorChanged',
        error: postError instanceof Error ? postError.message : 'Could not publish your post.',
      })
    } finally {
      dispatch({ type: 'postingChanged', isPosting: false })
    }
  }

  async function handleDelete(post: BoardPost) {
    if (!window.confirm('Delete this post?')) return

    dispatch({ type: 'errorChanged', error: null })
    dispatch({ type: 'deletingChanged', deletingPostId: post.id })
    const supabase = createClient()

    try {
      const { error: deleteError } = await supabase
        .from('message_board_posts')
        .delete()
        .eq('id', post.id)
      if (deleteError) throw deleteError

      if (post.image_path) {
        await supabase.storage
          .from(IMAGE_BUCKET)
          .remove([post.image_path])
      }

      await refreshPosts()
    } catch (deleteError) {
      dispatch({
        type: 'errorChanged',
        error: deleteError instanceof Error ? deleteError.message : 'Could not delete your post.',
      })
    } finally {
      dispatch({ type: 'deletingChanged', deletingPostId: null })
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <section className="space-y-4">
        <BoardTitle>User Board</BoardTitle>
      <form onSubmit={handleSubmit} className="rounded-[14px] p-3 space-y-3"
        style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
        <textarea
          value={body}
          onChange={(event) => dispatch({ type: 'bodyChanged', body: event.target.value })}
          aria-label="Message board post"
          maxLength={1000}
          rows={3}
          placeholder="Talk your talk..."
          className="w-full resize-none rounded-[10px] px-3 py-2.5 text-[14px] text-text outline-none"
          style={{ background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}
        />

        {previewUrl && (
          <div className="relative overflow-hidden rounded-[10px]" style={{ border: '1px solid var(--border-base)' }}>
            <Image src={previewUrl} alt="Selected upload preview" width={900} height={600}
              unoptimized className="max-h-56 w-full object-contain" style={{ background: 'var(--color-elev)' }} />
            <button type="button" onClick={clearImage}
              className="absolute right-2 top-2 rounded-full px-2 py-1 text-[11px] font-bold text-white"
              style={{ background: 'rgba(0, 0, 0, 0.65)' }}>
              Remove
            </button>
          </div>
        )}

        {error && <div className="text-[12px] font-semibold" style={{ color: 'var(--color-danger)' }}>{error}</div>}

        <div className="flex items-center justify-between gap-3">
          <label className="cursor-pointer rounded-lg px-3 py-2 text-[12px] font-bold"
            style={{ color: 'var(--color-sub)', background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}>
            Add image
            <input ref={fileInputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')}
              onChange={handleImageChange} className="sr-only" />
          </label>
          <button type="submit" disabled={isPosting}
            className="rounded-lg px-4 py-2 text-[12px] font-extrabold text-white disabled:opacity-50"
            style={{ background: 'var(--color-accent)' }}>
            {isPosting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>

      <div className="text-[10px] font-bold uppercase tracking-[1.2px] px-0.5 text-muted">
        Latest posts
      </div>

      {posts.length === 0 && (
        <div className="rounded-[14px] py-10 text-center text-[13px] text-sub"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          No posts yet. Start the conversation.
        </div>
      )}

      <div className="space-y-3">
        {posts.map((post) => (
          <article key={post.id} className="rounded-[14px] overflow-hidden"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center gap-2.5 px-3 pt-3">
              <div className="size-9 shrink-0 rounded-full flex items-center justify-center text-lg"
                style={{ background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}>
                {getAvatar(post.users)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-extrabold text-text">{post.users.display_name}</div>
                <div className="text-[10px] font-semibold text-muted">{formatPostTime(post.created_at)}</div>
              </div>
              {(post.user_id === currentUserId || currentUserIsAdmin) && (
                <button type="button" onClick={() => handleDelete(post)}
                  disabled={deletingPostId === post.id}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold disabled:opacity-50"
                  style={{ color: 'var(--color-danger)', background: 'var(--color-danger-soft)' }}>
                  {deletingPostId === post.id ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>

            {post.body && <p className="whitespace-pre-wrap break-words px-3 py-3 text-[14px] leading-5 text-sub">{post.body}</p>}
            {post.image_path && (
              <Image src={getImageUrl(post.image_path)} alt={`Post by ${post.users.display_name}`}
                width={900} height={700} unoptimized className="max-h-[32rem] w-full object-contain"
                style={{ background: 'var(--color-elev)' }} />
            )}
          </article>
        ))}
      </div>
      </section>

      <section className="space-y-4">
        <BoardTitle>AI Recaps</BoardTitle>
        <AiRecapFeed posts={aiPosts} />
      </section>
    </div>
  )
}

function BoardTitle({ children }: {
  children: React.ReactNode
}) {
  return (
    <div className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-muted">
      {children}
    </div>
  )
}

function AiRecapFeed({ posts }: { posts: AiSocialPost[] }) {
  return (
    <>
      {posts.length === 0 && (
        <div className="rounded-[14px] py-10 text-center text-[13px] text-sub"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
          No AI recaps yet. The press box is gathering material.
        </div>
      )}

      <div className="space-y-3">
        {posts.map((post) => (
          <article key={post.id} className="rounded-[14px] px-4 py-3"
            style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="text-[15px] font-extrabold text-text">{post.title}</div>
              <div className="shrink-0 text-[10px] font-semibold text-muted">{formatPostTime(post.created_at)}</div>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-5 text-sub">{post.body}</p>
          </article>
        ))}
      </div>
    </>
  )
}
