import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  buildGiphySearchUrl,
  normalizeGiphyGif,
  type GiphyApiGif,
} from './board-media'

describe('GIPHY board media helpers', () => {
  test('builds a rated GIPHY search URL from user input', () => {
    const url = new URL(buildGiphySearchUrl('test-key', '  world cup banter  '))

    expect(url.origin).toBe('https://api.giphy.com')
    expect(url.pathname).toBe('/v1/gifs/search')
    expect(url.searchParams.get('api_key')).toBe('test-key')
    expect(url.searchParams.get('q')).toBe('world cup banter')
    expect(url.searchParams.get('limit')).toBe('12')
    expect(url.searchParams.get('rating')).toBe('pg-13')
    expect(url.searchParams.get('bundle')).toBe('messaging_non_clips')
  })

  test('builds a trending URL when the search box is empty', () => {
    const url = new URL(buildGiphySearchUrl('test-key', '   '))

    expect(url.pathname).toBe('/v1/gifs/trending')
    expect(url.searchParams.has('q')).toBe(false)
  })

  test('normalizes a GIPHY response item into board media', () => {
    const gif = {
      id: 'abc123',
      title: 'Goal celebration',
      images: {
        fixed_width: {
          url: 'https://media.giphy.com/media/abc/200w.gif',
          width: '200',
          height: '120',
        },
        original: {
          url: 'https://media.giphy.com/media/abc/giphy.gif',
          width: '480',
          height: '288',
        },
      },
    } satisfies GiphyApiGif

    expect(normalizeGiphyGif(gif)).toEqual({
      provider: 'giphy',
      providerId: 'abc123',
      url: 'https://media.giphy.com/media/abc/giphy.gif',
      previewUrl: 'https://media.giphy.com/media/abc/200w.gif',
      title: 'Goal celebration',
      width: 480,
      height: 288,
    })
  })
})

describe('message board GIPHY media migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260612120000_message_board_giphy_media.sql'),
    'utf8',
  )

  test('adds provider-backed media fields to message board posts', () => {
    expect(sql).toContain('add column if not exists media_provider text')
    expect(sql).toContain('add column if not exists media_url text')
    expect(sql).toContain('add column if not exists media_preview_url text')
    expect(sql).toContain('add column if not exists media_provider_id text')
  })

  test('allows text, uploaded images, or provider GIFs to satisfy post content', () => {
    expect(sql).toMatch(/drop constraint if exists message_board_posts_content_required/)
    expect(sql).toMatch(/nullif\(trim\(media_url\), ''\) is not null/)
    expect(sql).toMatch(/media_provider is null or media_provider in \('giphy'\)/)
  })
})
