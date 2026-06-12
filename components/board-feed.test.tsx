import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AiRecapFeed, BoardFeed, type AiSocialPost } from './board-feed'

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
})

describe('AiRecapFeed', () => {
  it('renders AI recap posts separately from the user board', () => {
    const markup = renderToStaticMarkup(<AiRecapFeed posts={aiPosts} />)

    expect(markup).toContain('Opening line')
    expect(markup).toContain('Codex recap body')
  })
})
