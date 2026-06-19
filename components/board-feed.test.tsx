import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AiRecapFeed, BoardFeed, type AiSocialPost } from './board-feed'

const videoPost = {
  id: 'post-1',
  user_id: 'user-2',
  body: 'Match-day clip',
  image_path: null,
  uploaded_media_type: 'video/mp4',
  media_provider: 'cloudflare_r2',
  media_provider_id: 'message-board/user-2/clip.mp4',
  media_url: 'https://cdn.example.com/message-board/user-2/clip.mp4',
  media_preview_url: null,
  media_title: null,
  media_width: null,
  media_height: null,
  created_at: '2026-06-12T12:00:00.000Z',
  users: {
    display_name: 'Ishay',
    is_monkey: false,
    automation_strategy: null,
    avatar_emoji: null,
  },
} as const

const aiPosts: AiSocialPost[] = [
  {
    id: 'recap-1',
    title: 'Opening line',
    body: 'Codex recap body',
    created_at: '2026-06-12T12:00:00.000Z',
  },
]

describe('BoardFeed', () => {
  it('renders user posts without AI recaps', () => {
    const markup = renderToStaticMarkup(
      <BoardFeed
        initialPosts={[]}
        currentUserId="user-1"
        currentUserIsAdmin={false}
        giphyApiKey="test-key"
      />,
    )

    expect(markup).toContain('User Board')
    expect(markup).not.toContain('AI Recaps')
    expect(markup).not.toContain('Opening line')
  })

  it('renders the GIPHY picker entrypoint when an API key is configured', () => {
    const markup = renderToStaticMarkup(
      <BoardFeed
        initialPosts={[]}
        currentUserId="user-1"
        currentUserIsAdmin={false}
        giphyApiKey="test-key"
      />,
    )

    expect(markup).toContain('Add GIF')
  })

  it('offers one local upload control for photos and videos', () => {
    const markup = renderToStaticMarkup(
      <BoardFeed
        initialPosts={[]}
        currentUserId="user-1"
        currentUserIsAdmin={false}
        giphyApiKey=""
      />,
    )

    expect(markup).toContain('Add photo/video')
    expect(markup).toContain('accept="image/*,video/*"')
  })

  it('renders uploaded videos with playback controls', () => {
    const markup = renderToStaticMarkup(
      <BoardFeed
        initialPosts={[videoPost]}
        currentUserId="user-1"
        currentUserIsAdmin={false}
        giphyApiKey=""
      />,
    )

    expect(markup).toContain('<video')
    expect(markup).toContain('controls=""')
    expect(markup).toContain('aria-label="Video post by Ishay"')
    expect(markup).toContain('src="https://cdn.example.com/message-board/user-2/clip.mp4"')
  })
})

describe('AiRecapFeed', () => {
  it('renders AI recap posts separately from the user board', () => {
    const markup = renderToStaticMarkup(
      <AiRecapFeed posts={aiPosts} initialWindowStart="2026-06-09T12:00:00.000Z" />,
    )

    expect(markup).toContain('Opening line')
    expect(markup).toContain('Codex recap body')
  })
})
