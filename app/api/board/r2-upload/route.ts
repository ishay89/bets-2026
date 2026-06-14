import { NextResponse, type NextRequest } from 'next/server'
import {
  buildR2ObjectKey,
  createR2UploadRequest,
} from '@/lib/cloudflare-r2'
import { createClient } from '@/lib/supabase/server'

const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

type UploadRequestBody = {
  fileName?: unknown
  contentType?: unknown
  size?: unknown
}

function getR2Config() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL

  if (!accountId || !bucketName || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    return null
  }

  return {
    accountId,
    bucketName,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = getR2Config()
  if (!config) {
    return NextResponse.json({ error: 'Cloudflare R2 is not configured.' }, { status: 503 })
  }

  const body = await request.json() as UploadRequestBody
  const fileName = typeof body.fileName === 'string' ? body.fileName : ''
  const contentType = typeof body.contentType === 'string' ? body.contentType : ''
  const size = typeof body.size === 'number' ? body.size : 0

  if (!fileName.trim()) {
    return NextResponse.json({ error: 'Missing file name.' }, { status: 400 })
  }
  if (!ACCEPTED_VIDEO_TYPES.includes(contentType)) {
    return NextResponse.json({ error: 'Unsupported video type.' }, { status: 400 })
  }
  if (size <= 0 || size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: 'Videos must be 50 MB or smaller.' }, { status: 400 })
  }

  const key = buildR2ObjectKey({
    userId: user.id,
    fileName,
    randomId: crypto.randomUUID(),
  })
  const upload = await createR2UploadRequest({
    ...config,
    key,
    contentType,
  })

  return NextResponse.json({
    ...upload,
    key,
  })
}
