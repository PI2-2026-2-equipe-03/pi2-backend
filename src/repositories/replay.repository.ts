import { mapDbError, type Db } from './errors.js'

const COLS = `r.id_replay AS id, r.id_quadra AS "courtId", r.arquivo_url AS "fileUrl",
  r.data_geracao::text AS "recordingDate", r.hora_geracao AS "recordingTime", r.status,
  r.duracao_segundos AS duration, r.patrocinadores AS sponsors, r.criado_em AS "createdAt", r.expira_em AS "expiresAt"`

export type ReplayFilters = { courtId?: string; city?: string; date?: string; time?: string; limit?: number; offset?: number }

export async function criarReplay(db: Db, courtId: string, sponsors: unknown[] = []) {
    try {
        const { rows } = await db.query(
            `WITH t AS (SELECT clock_timestamp() AS stamp)
 INSERT INTO replay AS r (id_quadra, data_geracao, hora_geracao, status, duracao_segundos, patrocinadores, criado_em, expira_em)
 SELECT $1, stamp::date, stamp::time, 'pendente', 30, $2::jsonb, stamp, stamp + INTERVAL '168 hours' FROM t
 RETURNING ${COLS}`,
            [courtId, JSON.stringify(sponsors)])
        return rows[0]
    } catch (e) { mapDbError(e) }
}

export async function buscarReplayPorId(db: Db, id: string) {
    try {
        const { rows } = await db.query(`SELECT ${COLS} FROM replay r WHERE r.id_replay = $1`, [id])
        return rows[0] ?? null
    } catch (e) { mapDbError(e) }
}

export async function listarReplaysDisponiveis(db: Db, f: ReplayFilters = {}) {
    try {
        const { rows } = await db.query(
            `SELECT ${COLS}
       FROM replay r JOIN quadra q ON q.id_quadra = r.id_quadra JOIN arena a ON a.id_arena = q.id_arena
       WHERE r.status = 'disponivel' AND r.expira_em > now() AND r.arquivo_url IS NOT NULL
         AND ($1::uuid IS NULL OR r.id_quadra = $1)
         AND ($2::text IS NULL OR a.cidade ILIKE '%' || $2 || '%')
         AND ($3::date IS NULL OR r.data_geracao = $3)
         AND ($4::time IS NULL OR date_trunc('minute', r.hora_geracao::interval) = date_trunc('minute', $4::time::interval))
       ORDER BY r.data_geracao DESC, r.hora_geracao DESC, r.id_replay
       LIMIT $5 OFFSET $6`,
            [f.courtId ?? null, f.city ?? null, f.date ?? null, f.time ?? null, f.limit ?? 50, f.offset ?? 0])
        return rows
    } catch (e) { mapDbError(e) }
}

export async function listarReplaysPendentes(db: Db, limit = 50) {
    try {
        const { rows } = await db.query(
            `SELECT ${COLS} FROM replay r WHERE r.status = 'pendente' AND r.expira_em > now() ORDER BY r.criado_em LIMIT $1`, [limit])
        return rows
    } catch (e) { mapDbError(e) }
}

export async function marcarReplayDisponivel(db: Db, id: string, fileUrl: string) {
    try {
        const { rows } = await db.query(
            `UPDATE replay AS r SET status = 'disponivel', arquivo_url = $2
 WHERE r.id_replay = $1 AND r.status = 'pendente' AND r.expira_em > now()
 RETURNING ${COLS}`, [id, fileUrl])
        return rows[0] ?? null
    } catch (e) { mapDbError(e) }
}

// Uma única instrução: marca como excluído, enfileira a mídia e zera arquivo_url atomicamente.
export async function expirarReplaysVencidos(db: Db) {
    try {
        const result = await db.query(
            `WITH vencidos AS (
         SELECT id_replay, arquivo_url FROM replay
         WHERE expira_em <= now() AND status <> 'excluido' FOR UPDATE
       ), jobs AS (
         INSERT INTO media_deletion_job (id_replay, arquivo_url, motivo)
         SELECT id_replay, arquivo_url, 'Retenção de 168 horas' FROM vencidos WHERE arquivo_url IS NOT NULL
         ON CONFLICT (id_replay) DO NOTHING
       )
       UPDATE replay r SET status = 'excluido', arquivo_url = NULL
       FROM vencidos v WHERE r.id_replay = v.id_replay`)
        return result.rowCount ?? 0
    } catch (e) { mapDbError(e) }
}