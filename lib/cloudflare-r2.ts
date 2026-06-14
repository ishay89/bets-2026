import { createHmac, createHash } from 'node:crypto'

const R2_REGION = 'auto'
const R2_SERVICE = 's3'
const R2_ALGORITHM = 'AWS4-HMAC-SHA256'

type BuildR2ObjectKeyInput = {
  userId: string
  fileName: string
  randomId: string
}

type BuildR2PublicUrlInput = {
  publicBaseUrl: string
  key: string
}

type CreateR2UploadRequestInput = {
  accountId: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
  key: string
  contentType: string
  now?: Date
  expiresInSeconds?: number
}

export type R2SignedUploadRequest = {
  method: 'PUT'
  uploadUrl: string
  publicUrl: string
  headers: {
    'Content-Type': string
  }
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function formatDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '')
}

function formatAmzDate(date: Date): string {
  return `${formatDateStamp(date)}T${date.toISOString().slice(11, 19).replaceAll(':', '')}Z`
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function encodeRfc3986(value: string): string {
  return encodePathSegment(value)
}

function encodeObjectKey(key: string): string {
  return key.split('/').map(encodePathSegment).join('/')
}

function getSigningKey(secretAccessKey: string, dateStamp: string): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const regionKey = hmac(dateKey, R2_REGION)
  const serviceKey = hmac(regionKey, R2_SERVICE)
  return hmac(serviceKey, 'aws4_request')
}

function getFileExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.trim().toLowerCase()
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : 'mp4'
}

export function buildR2ObjectKey({ userId, fileName, randomId }: BuildR2ObjectKeyInput): string {
  return `message-board/${userId}/${randomId}.${getFileExtension(fileName)}`
}

export function buildR2PublicUrl({ publicBaseUrl, key }: BuildR2PublicUrlInput): string {
  return `${publicBaseUrl.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`
}

export async function createR2UploadRequest({
  accountId,
  bucketName,
  accessKeyId,
  secretAccessKey,
  publicBaseUrl,
  key,
  contentType,
  now = new Date(),
  expiresInSeconds = 300,
}: CreateR2UploadRequestInput): Promise<R2SignedUploadRequest> {
  const dateStamp = formatDateStamp(now)
  const amzDate = formatAmzDate(now)
  const credentialScope = `${dateStamp}/${R2_REGION}/${R2_SERVICE}/aws4_request`
  const host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`
  const encodedKey = encodeObjectKey(key)
  const signedHeaders = 'content-type;host'
  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': R2_ALGORITHM,
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  })
  const canonicalQueryString = [...queryParams.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join('&')
  const canonicalRequest = [
    'PUT',
    `/${encodedKey}`,
    canonicalQueryString,
    `content-type:${contentType}\n`,
    `host:${host}\n`,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const stringToSign = [
    R2_ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const signature = createHmac('sha256', getSigningKey(secretAccessKey, dateStamp))
    .update(stringToSign)
    .digest('hex')

  queryParams.set('X-Amz-Signature', signature)

  return {
    method: 'PUT',
    uploadUrl: `https://${host}/${encodedKey}?${queryParams.toString()}`,
    publicUrl: buildR2PublicUrl({ publicBaseUrl, key }),
    headers: {
      'Content-Type': contentType,
    },
  }
}
