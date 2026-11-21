// Armazenamento dos vídeos no Cloudflare R2 (API compatível com S3).
// O bucket é privado: o banco guarda a chave do objeto e a leitura usa URL temporária.
import {
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { HttpError } from '../http/errors.js'

type Settings = { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string }

let cached: { signature: string; client: S3Client } | undefined

function settings(): Settings | null {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null
  return {
    endpoint: S3_ENDPOINT, region: S3_REGION || 'auto', bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY,
  }
}

function connect() {
  const s = settings()
  if (!s) throw new Error('Armazenamento não configurado (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)')
  const signature = JSON.stringify(s)
  if (cached?.signature !== signature) {
    cached = {
      signature,
      client: new S3Client({
        endpoint: s.endpoint, region: s.region, forcePathStyle: true,
        credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey },
      }),
    }
  }
  return { client: cached.client, bucket: s.bucket }
}

function ttl(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export const uploadUrlTtlSeconds = () => ttl('UPLOAD_URL_TTL_SECONDS', 600)

// Objeto mutável para permitir substituir as operações nos testes (vi.spyOn).
export const storage = {
  isConfigured() {
    return settings() !== null
  },

  async presignPut(key: string, contentType: string) {
    const { client, bucket } = connect()
    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType })
    const url = await getSignedUrl(client, command, { expiresIn: uploadUrlTtlSeconds() })
    return { url, method: 'PUT' as const, headers: { 'Content-Type': contentType } }
  },

  async exists(key: string): Promise<{ ok: boolean; size?: number }> {
    const { client, bucket } = connect()
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      return { ok: true, size: head.ContentLength }
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status === 404 || (error as Error).name === 'NotFound') return { ok: false }
      throw error
    }
  },

  // DeleteObject é idempotente: objeto ausente não gera erro.
  async remove(key: string) {
    const { client, bucket } = connect()
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  },

  async presignGet(key: string, downloadName?: string) {
    const { client, bucket } = connect()
    const command = new GetObjectCommand({
      Bucket: bucket, Key: key,
      ...(downloadName ? { ResponseContentDisposition: `attachment; filename="${downloadName}"` } : {}),
    })
    return getSignedUrl(client, command, { expiresIn: ttl('DOWNLOAD_URL_TTL_SECONDS', 3600) })
  },
}

/** Chaves do vídeo e da miniatura: replays/<arena>/<quadra>/<AAAA>/<MM>/<DD>/<replay>.(mp4|jpg) */
export function replayObjectKeys(r: { arenaId: string; courtId: string; recordingDate: string; replayId: string }) {
  const [year, month, day] = r.recordingDate.split('-')
  const base = `replays/${r.arenaId}/${r.courtId}/${year}/${month}/${day}/${r.replayId}`
  return { video: `${base}.mp4`, thumb: `${base}.jpg` }
}

export function thumbKeyOf(videoKey: string) {
  return videoKey.replace(/\.mp4$/, '.jpg')
}

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value)

/** Chave do objeto no bucket a partir de arquivo_url; null para URLs externas (legado). */
export function toObjectKey(arquivoUrl: string | null) {
  if (!arquivoUrl) return null
  return isAbsoluteUrl(arquivoUrl) ? null : arquivoUrl
}

/** Converte arquivo_url em link utilizável: URLs absolutas (legado) passam direto, chaves viram URL temporária. */
export async function toMediaUrl(arquivoUrl: string, downloadName?: string): Promise<string>
export async function toMediaUrl(arquivoUrl: string | null, downloadName?: string): Promise<string | null>
export async function toMediaUrl(arquivoUrl: string | null, downloadName?: string) {
  if (!arquivoUrl) return null
  if (isAbsoluteUrl(arquivoUrl)) return arquivoUrl
  if (!storage.isConfigured()) throw new HttpError(503, 'Armazenamento de vídeos indisponível', 'STORAGE_UNAVAILABLE')
  return storage.presignGet(arquivoUrl, downloadName)
}
