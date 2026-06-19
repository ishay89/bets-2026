'use client'

import Image from 'next/image'
import { ChangeEvent, FormEvent, useEffect, useReducer, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  buildGiphySearchUrl,
  normalizeGiphyGif,
  type GiphyApiGif,
  type GiphyBoardMedia,
} from '@/lib/board-media'
import { getAvatar } from '@/lib/display'
import { formatAppDateTime } from '@/lib/time'
import type { AutomationStrategy } from '@/lib/types'

const IMAGE_BUCKET = 'message-board-images'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
const UPLOAD_INPUT_ACCEPT = 'image/*,video/*'
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const ACCEPTED_UPLOAD_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES]
export const RECAP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

interface BoardAuthor {
  display_name: string
  is_monkey: boolean
  automation_strategy: AutomationStrategy | null
  avatar_emoji: string | null
}

export interface BoardPost {
  id: string
  user_id: string
  body: string | null
  image_path: string | null
  uploaded_media_type: string | null
  media_provider: 'giphy' | 'cloudflare_r2' | null
  media_provider_id: string | null
  media_url: string | null
  media_preview_url: string | null
  media_title: string | null
  media_width: number | null
  media_height: number | null
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
  currentUserId: string
  currentUserIsAdmin: boolean
  giphyApiKey: string
}

type BoardFeedState = {
  posts: BoardPost[]
  body: string
  previewUrl: string | null
  previewMediaType: string | null
  selectedGif: GiphyBoardMedia | null
  gifQuery: string
  gifResults: GiphyBoardMedia[]
  isGifPickerOpen: boolean
  isSearchingGifs: boolean
  error: string | null
  isPosting: boolean
  deletingPostId: string | null
}

type BoardFeedAction =
  | { type: 'postsLoaded'; posts: BoardPost[] }
  | { type: 'bodyChanged'; body: string }
  | { type: 'previewChanged'; previewUrl: string | null; mediaType: string | null }
  | { type: 'selectedGifChanged'; selectedGif: GiphyBoardMedia | null }
  | { type: 'gifQueryChanged'; gifQuery: string }
  | { type: 'gifResultsLoaded'; gifResults: GiphyBoardMedia[] }
  | { type: 'gifPickerChanged'; isGifPickerOpen: boolean }
  | { type: 'searchingGifsChanged'; isSearchingGifs: boolean }
  | { type: 'errorChanged'; error: string | null }
  | { type: 'postingChanged'; isPosting: boolean }
  | { type: 'deletingChanged'; deletingPostId: string | null }

function boardFeedReducer(state: BoardFeedState, action: BoardFeedAction): BoardFeedState {
  switch (action.type) {
    case 'postsLoaded':
      return { ...state, posts: action.posts }
    case 'bodyChanged':
      return { ...state, body: action.body }
    case 'previewChanged':
      return { ...state, previewUrl: action.previewUrl, previewMediaType: action.mediaType }
    case 'selectedGifChanged':
      return { ...state, selectedGif: action.selectedGif }
    case 'gifQueryChanged':
      return { ...state, gifQuery: action.gifQuery }
    case 'gifResultsLoaded':
      return { ...state, gifResults: action.gifResults }
    case 'gifPickerChanged':
      return { ...state, isGifPickerOpen: action.isGifPickerOpen }
    case 'searchingGifsChanged':
      return { ...state, isSearchingGifs: action.isSearchingGifs }
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

function getUploadUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return `${baseUrl}/storage/v1/object/public/${IMAGE_BUCKET}/${path}`
}

function isVideoMediaType(mediaType: string | null): boolean {
  return mediaType?.startsWith('video/') ?? false
}

type R2UploadResponse = {
  method: 'PUT'
  uploadUrl: string
  publicUrl: string
  key: string
  headers: {
    'Content-Type': string
  }
}

async function uploadVideoToR2(file: File): Promise<R2UploadResponse> {
  const signingResponse = await fetch('/api/board/r2-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    }),
  })

  const upload = await signingResponse.json() as R2UploadResponse | { error?: string }
  if (!signingResponse.ok) {
    throw new Error('error' in upload && upload.error ? upload.error : 'Could not prepare video upload.')
  }

  const r2Upload = upload as R2UploadResponse
  const uploadResponse = await fetch(r2Upload.uploadUrl, {
    method: r2Upload.method,
    headers: r2Upload.headers,
    body: file,
  })
  if (!uploadResponse.ok) {
    throw new Error('Could not upload video.')
  }

  return r2Upload
}

export function BoardFeed({ initialPosts, currentUserId, currentUserIsAdmin, giphyApiKey }: Props) {
  const [state, dispatch] = useReducer(boardFeedReducer, {
    posts: initialPosts,
    body: '',
    previewUrl: null,
    previewMediaType: null,
    selectedGif: null,
    gifQuery: '',
    gifResults: [],
    isGifPickerOpen: false,
    isSearchingGifs: false,
    error: null,
    isPosting: false,
    deletingPostId: null,
  })
  const {
    posts,
    body,
    previewUrl,
    previewMediaType,
    selectedGif,
    gifQuery,
    gifResults,
    isGifPickerOpen,
    isSearchingGifs,
    error,
    isPosting,
    deletingPostId,
  } = state
  const uploadRef = useRef<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refreshPosts() {
    const supabase = createClient()
    const { data } = await supabase
      .from('message_board_posts')
      .select('id, user_id, body, image_path, uploaded_media_type, media_provider, media_provider_id, media_url, media_preview_url, media_title, media_width, media_height, created_at, users(display_name, is_monkey, automation_strategy, avatar_emoji)')
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<BoardPost[]>()

    if (data) dispatch({ type: 'postsLoaded', posts: data })
  }

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('message-board-posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_board_posts' }, refreshPosts)
      .subscribe()

    return () => { void channel.unsubscribe() }
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function clearUpload() {
    uploadRef.current = null
    dispatch({ type: 'previewChanged', previewUrl: null, mediaType: null })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function clearGif() {
    dispatch({ type: 'selectedGifChanged', selectedGif: null })
  }

  async function searchGifs(query = gifQuery) {
    if (!giphyApiKey) {
      dispatch({ type: 'errorChanged', error: 'GIPHY is not configured yet.' })
      return
    }

    dispatch({ type: 'errorChanged', error: null })
    dispatch({ type: 'searchingGifsChanged', isSearchingGifs: true })

    try {
      const response = await fetch(buildGiphySearchUrl(giphyApiKey, query))
      if (!response.ok) throw new Error('Could not search GIPHY.')
      const payload = await response.json() as { data?: GiphyApiGif[] }
      const gifs = (payload.data ?? [])
        .map(normalizeGiphyGif)
        .filter((gif): gif is GiphyBoardMedia => gif !== null)
      dispatch({ type: 'gifResultsLoaded', gifResults: gifs })
    } catch (gifError) {
      dispatch({
        type: 'errorChanged',
        error: gifError instanceof Error ? gifError.message : 'Could not search GIPHY.',
      })
    } finally {
      dispatch({ type: 'searchingGifsChanged', isSearchingGifs: false })
    }
  }

  function openGifPicker() {
    dispatch({ type: 'gifPickerChanged', isGifPickerOpen: !isGifPickerOpen })
    if (!isGifPickerOpen && gifResults.length === 0) {
      void searchGifs('')
    }
  }

  function selectGif(gif: GiphyBoardMedia) {
    clearUpload()
    dispatch({ type: 'selectedGifChanged', selectedGif: gif })
    dispatch({ type: 'gifPickerChanged', isGifPickerOpen: false })
  }

  function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    dispatch({ type: 'errorChanged', error: null })

    if (!file) {
      clearUpload()
      return
    }
    if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
      dispatch({ type: 'errorChanged', error: 'Choose a JPG, PNG, WebP, GIF, MP4, WebM, or MOV file.' })
      clearUpload()
      return
    }
    if (ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size > MAX_IMAGE_BYTES) {
      dispatch({ type: 'errorChanged', error: 'Images must be 5 MB or smaller.' })
      clearUpload()
      return
    }
    if (ACCEPTED_VIDEO_TYPES.includes(file.type) && file.size > MAX_VIDEO_BYTES) {
      dispatch({ type: 'errorChanged', error: 'Videos must be 100 MB or smaller.' })
      clearUpload()
      return
    }

    uploadRef.current = file
    clearGif()
    dispatch({ type: 'previewChanged', previewUrl: URL.createObjectURL(file), mediaType: file.type })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedBody = body.trim()
    const upload = uploadRef.current
    if (!trimmedBody && !upload && !selectedGif) {
      dispatch({ type: 'errorChanged', error: 'Write a message or add a photo/video.' })
      return
    }

    dispatch({ type: 'errorChanged', error: null })
    dispatch({ type: 'postingChanged', isPosting: true })
    const supabase = createClient()
    let uploadPath: string | null = null
    let r2Upload: R2UploadResponse | null = null

    try {
      if (upload) {
        if (isVideoMediaType(upload.type)) {
          r2Upload = await uploadVideoToR2(upload)
        } else {
          const extension = upload.name.split('.').pop()?.toLowerCase() ?? 'jpg'
          uploadPath = `${currentUserId}/${crypto.randomUUID()}.${extension}`
          const { error: uploadError } = await supabase.storage
            .from(IMAGE_BUCKET)
            .upload(uploadPath, upload, { contentType: upload.type })
          if (uploadError) throw uploadError
        }
      }

      const { error: insertError } = await supabase
        .from('message_board_posts')
        .insert({
          user_id: currentUserId,
          body: trimmedBody || null,
          image_path: uploadPath,
          uploaded_media_type: upload?.type ?? null,
          media_provider: r2Upload ? 'cloudflare_r2' : selectedGif?.provider ?? null,
          media_provider_id: r2Upload?.key ?? selectedGif?.providerId ?? null,
          media_url: r2Upload?.publicUrl ?? selectedGif?.url ?? null,
          media_preview_url: selectedGif?.previewUrl ?? null,
          media_title: selectedGif?.title ?? null,
          media_width: selectedGif?.width ?? null,
          media_height: selectedGif?.height ?? null,
        })
      if (insertError) throw insertError

      dispatch({ type: 'bodyChanged', body: '' })
      clearUpload()
      clearGif()
      await refreshPosts()
    } catch (postError) {
      if (uploadPath) {
        await supabase.storage.from(IMAGE_BUCKET).remove([uploadPath])
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
    <div className="space-y-4">
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

        {(previewUrl || selectedGif) && (
          <div className="relative overflow-hidden rounded-[10px]" style={{ border: '1px solid var(--border-base)' }}>
            {previewUrl && isVideoMediaType(previewMediaType) ? (
              <video src={previewUrl} controls aria-label="Selected video upload preview"
                className="max-h-56 w-full object-contain" style={{ background: 'var(--color-elev)' }}>
                <track kind="captions" />
              </video>
            ) : (
              <Image src={previewUrl ?? selectedGif?.previewUrl ?? ''} alt={selectedGif?.title ?? 'Selected upload preview'} width={900} height={600}
                unoptimized className="max-h-56 w-full object-contain" style={{ background: 'var(--color-elev)' }} />
            )}
            {selectedGif && (
              <div className="absolute bottom-2 left-2 rounded-full px-2 py-1 text-[10px] font-extrabold text-white"
                style={{ background: 'rgba(0, 0, 0, 0.65)' }}>
                via GIPHY
              </div>
            )}
            <button type="button" onClick={() => { clearUpload(); clearGif() }}
              className="absolute right-2 top-2 rounded-full px-2 py-1 text-[11px] font-bold text-white"
              style={{ background: 'rgba(0, 0, 0, 0.65)' }}>
              Remove
            </button>
          </div>
        )}

        {error && <div className="text-[12px] font-semibold" style={{ color: 'var(--color-danger)' }}>{error}</div>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-lg px-3 py-2 text-[12px] font-bold"
              style={{ color: 'var(--color-sub)', background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}>
              Add photo/video
              <input ref={fileInputRef} type="file" accept={UPLOAD_INPUT_ACCEPT}
                onChange={handleUploadChange} className="sr-only" />
            </label>
            {giphyApiKey && (
              <button type="button" onClick={openGifPicker}
                className="rounded-lg px-3 py-2 text-[12px] font-bold"
                style={{ color: 'var(--color-sub)', background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}>
                Add GIF
              </button>
            )}
          </div>
          <button type="submit" disabled={isPosting}
            className="rounded-lg px-4 py-2 text-[12px] font-extrabold text-white disabled:opacity-50"
            style={{ background: 'var(--color-accent)' }}>
            {isPosting ? 'Posting...' : 'Post'}
          </button>
        </div>

        {isGifPickerOpen && (
          <div className="space-y-3 rounded-[10px] p-3" style={{ background: 'var(--color-elev)', border: '1px solid var(--border-base)' }}>
            <div className="flex gap-2">
              <input
                value={gifQuery}
                onChange={(event) => dispatch({ type: 'gifQueryChanged', gifQuery: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void searchGifs()
                  }
                }}
                placeholder="Search GIPHY"
                className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[13px] text-text outline-none"
                style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}
              />
              <button type="button" onClick={() => void searchGifs()} disabled={isSearchingGifs}
                className="rounded-lg px-3 py-2 text-[12px] font-extrabold text-white disabled:opacity-50"
                style={{ background: 'var(--color-accent)' }}>
                {isSearchingGifs ? 'Searching...' : 'Search'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {gifResults.map((gif) => (
                <button key={gif.providerId} type="button" onClick={() => selectGif(gif)}
                  className="overflow-hidden rounded-lg text-left"
                  style={{ background: 'var(--color-panel)', border: '1px solid var(--border-base)' }}>
                  <Image src={gif.previewUrl} alt={gif.title} width={200} height={160}
                    unoptimized className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
            <div className="text-right text-[10px] font-extrabold uppercase tracking-[1px] text-muted">
              Powered by GIPHY
            </div>
          </div>
        )}
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
        {posts.map((post, index) => (
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
              isVideoMediaType(post.uploaded_media_type) ? (
                <video src={getUploadUrl(post.image_path)} controls preload={index === 0 ? "metadata" : "none"}
                  aria-label={`Video post by ${post.users.display_name}`}
                  className="max-h-[32rem] w-full object-contain"
                  style={{ background: 'var(--color-elev)' }}>
                  <track kind="captions" />
                </video>
              ) : (
                <Image src={getUploadUrl(post.image_path)} alt={`Post by ${post.users.display_name}`}
                  width={900} height={700} unoptimized priority={index === 0} className="max-h-[32rem] w-full object-contain"
                  style={{ background: 'var(--color-elev)' }} />
              )
            )}
            {post.media_provider === 'cloudflare_r2' && post.media_url && (
              <video src={post.media_url} controls preload={index === 0 ? "metadata" : "none"}
                aria-label={`Video post by ${post.users.display_name}`}
                className="max-h-[32rem] w-full object-contain"
                style={{ background: 'var(--color-elev)' }}>
                <track kind="captions" />
              </video>
            )}
            {post.media_provider === 'giphy' && post.media_url && (
              <div>
                <Image src={post.media_url} alt={post.media_title ?? `GIF posted by ${post.users.display_name}`}
                  width={post.media_width ?? 900} height={post.media_height ?? 700}
                  unoptimized priority={index === 0} className="max-h-[32rem] w-full object-contain"
                  style={{ background: 'var(--color-elev)' }} />
                <div className="px-3 py-2 text-right text-[10px] font-extrabold uppercase tracking-[1px] text-muted">
                  Powered by GIPHY
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
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

export function AiRecapFeed({ posts: initialPosts, initialWindowStart }: { posts: AiSocialPost[]; initialWindowStart: string }) {
  const [posts, setPosts] = useState(initialPosts)
  const [hasMore, setHasMore] = useState(true)
  const windowStartRef = useRef(initialWindowStart)
  const isLoadingRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  async function loadMore() {
    if (isLoadingRef.current) return
    isLoadingRef.current = true

    const windowEnd = windowStartRef.current
    const nextWindowStart = new Date(new Date(windowEnd).getTime() - RECAP_WINDOW_MS).toISOString()
    const supabase = createClient()
    const { data, error } = await supabase
      .from('ai_social_posts')
      .select('id, title, body, created_at')
      .gte('created_at', nextWindowStart)
      .lt('created_at', windowEnd)
      .order('created_at', { ascending: false })
      .returns<AiSocialPost[]>()

    if (error || !data || data.length === 0) {
      setHasMore(false)
    } else {
      windowStartRef.current = nextWindowStart
      setPosts((prev) => [...prev, ...data])
    }
    isLoadingRef.current = false
  }

  useEffect(() => {
    if (!hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect()
          void loadMore()
        }
      },
      { rootMargin: '200px' },
    )
    if (sentinelRef.current) observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, posts.length])

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

      {hasMore && <div ref={sentinelRef} aria-hidden />}
    </>
  )
}
