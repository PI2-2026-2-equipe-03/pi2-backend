import { mapDbError, type Db } from './errors.js'

export type RecordingLogInput = {
  courtId: string; cameraId?: string | null; replayId?: string | null
  origin?: 'botoeira' | 'api'; result: 'sucesso' | 'falha'; errorMessage?: string | null
}

const COLS = `id::text AS id, id_quadra AS "courtId", id_camera AS "cameraId", id_replay AS "replayId",
  origem AS origin, resultado AS result, erro_mensagem AS "errorMessage", criado_em AS "createdAt"`

export async function registrarGravacao(db: Db, l: RecordingLogInput) {
  try {
    const { rows } = await db.query(
      `INSERT INTO gravacao_log (id_quadra, id_camera, id_replay, origem, resultado, erro_mensagem)
       VALUES ($1, $2, $3, COALESCE($4, 'botoeira'), $5, $6) RETURNING ${COLS}`,
      [l.courtId, l.cameraId ?? null, l.replayId ?? null, l.origin ?? null, l.result, l.errorMessage ?? null])
    return rows[0]
  } catch (e) { mapDbError(e) }
}

export async function listarLogsPorQuadra(db: Db, courtId: string, opts: { result?: 'sucesso' | 'falha'; limit?: number; offset?: number } = {}) {
  try {
    const { rows } = await db.query(
      `SELECT ${COLS} FROM gravacao_log
       WHERE id_quadra = $1 AND ($2::text IS NULL OR resultado = $2)
       ORDER BY criado_em DESC, id DESC LIMIT $3 OFFSET $4`,
      [courtId, opts.result ?? null, opts.limit ?? 50, opts.offset ?? 0])
    return rows
  } catch (e) { mapDbError(e) }
}

export async function listarLogsPorReplay(db: Db, replayId: string) {
  try {
    const { rows } = await db.query(`SELECT ${COLS} FROM gravacao_log WHERE id_replay = $1 ORDER BY criado_em DESC`, [replayId])
    return rows
  } catch (e) { mapDbError(e) }
}