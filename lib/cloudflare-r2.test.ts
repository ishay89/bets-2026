import { describe, expect, it } from 'vitest'
import {
  buildR2ObjectKey,
  buildR2PublicUrl,
  createR2UploadRequest,
} from './cloudflare-r2'

describe('Cloudflare R2 board uploads', () => {
  it('builds stable board object keys under the user folder', () => {
    expect(buildR2ObjectKey({
      userId: 'user-1',
      fileName: 'Match Clip.MP4',
      randomId: 'upload-1',
    })).toBe('message-board/user-1/upload-1.mp4')
  })

  it('builds public URLs without duplicating slashes', () => {
    expect(buildR2PublicUrl({
      publicBaseUrl: 'https://cdn.example.com/board/',
      key: 'message-board/user-1/upload-1.mp4',
    })).toBe('https://cdn.example.com/board/message-board/user-1/upload-1.mp4')
  })

  it('creates a signed PUT request for a video upload', async () => {
    const request = await createR2UploadRequest({
      accountId: 'account-1',
      bucketName: 'bets-media',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      publicBaseUrl: 'https://cdn.example.com',
      key: 'message-board/user-1/upload-1.mp4',
      contentType: 'video/mp4',
      now: new Date('2026-06-14T17:00:00.000Z'),
      expiresInSeconds: 300,
    })

    expect(request.method).toBe('PUT')
    expect(request.headers).toEqual({ 'Content-Type': 'video/mp4' })
    expect(request.publicUrl).toBe('https://cdn.example.com/message-board/user-1/upload-1.mp4')
    expect(request.uploadUrl).toContain('https://bets-media.account-1.r2.cloudflarestorage.com/message-board/user-1/upload-1.mp4')
    expect(request.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256')
    expect(request.uploadUrl).toContain('X-Amz-Expires=300')
    expect(request.uploadUrl).toContain('X-Amz-Signature=')
  })
})
