export const GIPHY_RESULT_LIMIT = 12
export const GIPHY_RATING = 'pg-13'
export const GIPHY_BUNDLE = 'messaging_non_clips'

type GiphyImage = {
  url?: string
  width?: string
  height?: string
}

export type GiphyApiGif = {
  id: string
  title?: string
  images: {
    fixed_width?: GiphyImage
    downsized_medium?: GiphyImage
    original?: GiphyImage
  }
}

export type GiphyBoardMedia = {
  provider: 'giphy'
  providerId: string
  url: string
  previewUrl: string
  title: string
  width: number | null
  height: number | null
}

function parseDimension(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function buildGiphySearchUrl(apiKey: string, query: string): string {
  const trimmedQuery = query.trim()
  const endpoint = trimmedQuery ? 'search' : 'trending'
  const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`)

  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('limit', String(GIPHY_RESULT_LIMIT))
  url.searchParams.set('rating', GIPHY_RATING)
  url.searchParams.set('bundle', GIPHY_BUNDLE)

  if (trimmedQuery) {
    url.searchParams.set('q', trimmedQuery)
  }

  return url.toString()
}

export function normalizeGiphyGif(gif: GiphyApiGif): GiphyBoardMedia | null {
  const original = gif.images.original ?? gif.images.downsized_medium ?? gif.images.fixed_width
  const preview = gif.images.fixed_width ?? gif.images.downsized_medium ?? gif.images.original

  if (!original?.url || !preview?.url) return null

  return {
    provider: 'giphy',
    providerId: gif.id,
    url: original.url,
    previewUrl: preview.url,
    title: gif.title?.trim() || 'GIPHY GIF',
    width: parseDimension(original.width),
    height: parseDimension(original.height),
  }
}
