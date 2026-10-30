import { mapDbError, type Db } from './errors.js'

export type ReplayMetadata = {
  replayId: string; cameraId?: string | null; sizeBytes?: number | null
  resolution?: string | null; format?: string; codec?: string | null; checksum?: string | null
}

const COLS = `id_replay AS "replayId", id_camera AS "cameraId", tamanho_bytes::float8 AS "sizeBytes",
  resolucao AS resolution, formato AS format, codec, checksum_sha256 AS checksum, criado_em AS "createdAt"`

export async function salvarMetadados(db: Db, m: ReplayMetadata) {
  try {
    const { rows } = await db.query(
      `INSERT INTO replay_metadado (id_replay, id_camera, tamanho_bytes, resolucao, formato, codec, checksum_sha256)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'mp4'), $6, $7)
       ON CONFLICT (id_replay) DO UPDATE SET
         id_camera = EXCLUDED.id_camera, tamanho_bytes = EXCLUDED.tamanho_bytes, resolucao = EXCLUDED.resolucao,
         formato = EXCLUDED.formato, codec = EXCLUDED.codec, checksum_sha256 = EXCLUDED.checksum_sha256
       RETURNING ${COLS}`,
      [m.replayId, m.cameraId ?? null, m.sizeBytes ?? null, m.resolution ?? null, m.format ?? null, m.codec ?? null, m.checksum ?? null])
    return rows[0]
  } catch (e) { mapDbError(e) }
}

export async function buscarMetadadosPorReplay(db: Db, replayId: string) {
  try {
    const { rows } = await db.query(`SELECT ${COLS} FROM replay_metadado WHERE id_replay = $1`, [replayId])
    return rows[0] ?? null
  } catch (e) { mapDbError(e) }
}