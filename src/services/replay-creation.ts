import type { Pool } from 'pg'

// Regras de criação compartilhadas entre o app (POST /replays) e o agente da arena.
export const REPLAY_INTERVAL_SECONDS = 30

export const REPLAY_FIELDS = `r.id_replay AS id, r.id_quadra AS "courtId", r.arquivo_url AS "downloadUrl",
  r.data_geracao::text AS "recordingDate", r.hora_geracao AS "recordingTime",
  r.criado_em AS "createdAt", r.expira_em AS "expiresAt", r.status,
  r.duracao_segundos AS duration, r.patrocinadores AS sponsors`

export type CourtAccess = { arenaId: string; ownerAuthId: string | null }

// Datas vêm do pg como Date e são serializadas em ISO 8601 na resposta.
export type CreatedReplay = {
  id: string; courtId: string; downloadUrl: string | null; recordingDate: string; recordingTime: string
  createdAt: string; expiresAt: string; status: 'pendente' | 'disponivel' | 'excluido'; duration: number
  sponsors: { id: string; name: string; imageUrl: string | null }[]
}

export type CreateReplayResult =
  | { ok: true; created: boolean; replay: CreatedReplay }
  | { ok: false; reason: 'court_not_found' | 'forbidden' | 'court_unavailable' | 'min_interval' }

export type CreateReplayInput = {
  courtId: string
  /** Horário do clique informado pelo agente; sem ele, usa o relógio do banco. */
  pressedAt?: Date
  /** Regra de acesso de quem solicita (dono da quadra no app, mesma arena no agente). */
  canAccess: (court: CourtAccess) => boolean
}

export async function createReplay(pool: Pool, input: CreateReplayInput): Promise<CreateReplayResult> {
  const stamp = input.pressedAt?.toISOString() ?? null
  const client = await pool.connect()
  const reject = async (reason: Extract<CreateReplayResult, { ok: false }>['reason']) => {
    await client.query('ROLLBACK')
    return { ok: false as const, reason }
  }

  try {
    await client.query('BEGIN')
    // Trava a quadra: serializa acionamentos simultâneos da mesma quadra.
    const court = await client.query(
      `SELECT q.disponivel, q.id_arena AS "arenaId", ua.id_auth AS "ownerAuthId"
         FROM quadra q JOIN arena a ON a.id_arena = q.id_arena
         LEFT JOIN usuario_auth ua ON ua.id_usuario = a.id_gestor
        WHERE q.id_quadra = $1 FOR UPDATE OF q`,
      [input.courtId],
    )
    if (!court.rowCount) return await reject('court_not_found')
    const { disponivel, ...access } = court.rows[0]
    if (!input.canAccess(access)) return await reject('forbidden')
    if (!disponivel) return await reject('court_unavailable')

    // Reenvio do mesmo clique (resposta perdida na rede): devolve o replay já criado.
    if (stamp) {
      const existing = await client.query(
        `SELECT ${REPLAY_FIELDS} FROM replay r
          WHERE r.id_quadra = $1 AND r.criado_em = $2::timestamptz AND r.status = 'pendente'`,
        [input.courtId, stamp],
      )
      if (existing.rowCount) {
        await client.query('COMMIT')
        return { ok: true, created: false, replay: existing.rows[0] }
      }
    }

    const recent = await client.query(
      `SELECT 1 FROM replay
        WHERE id_quadra = $1
          AND criado_em > COALESCE($2::timestamptz, clock_timestamp()) - make_interval(secs => $3)
          AND criado_em < COALESCE($2::timestamptz, clock_timestamp()) + make_interval(secs => $3)
        LIMIT 1`,
      [input.courtId, stamp, REPLAY_INTERVAL_SECONDS],
    )
    if (recent.rowCount) return await reject('min_interval')

    const sponsors = await client.query(
      `SELECT p.id_patrocinador AS id, p.nome AS name, p.foto_url AS "imageUrl"
         FROM patrocinador p JOIN quadra_patrocinador qp ON qp.id_patrocinador = p.id_patrocinador
        WHERE qp.id_quadra = $1 ORDER BY p.id_patrocinador`,
      [input.courtId],
    )
    const inserted = await client.query(
      `WITH recorded AS (SELECT COALESCE($3::timestamptz, clock_timestamp()) AS stamp)
       INSERT INTO replay AS r
         (id_quadra, data_geracao, hora_geracao, status, duracao_segundos, patrocinadores, criado_em, expira_em)
       SELECT $1, stamp::date, stamp::time, 'pendente', 30, $2::jsonb, stamp, stamp + INTERVAL '168 hours' FROM recorded
       RETURNING ${REPLAY_FIELDS}`,
      [input.courtId, JSON.stringify(sponsors.rows), stamp],
    )
    await client.query('COMMIT')
    return { ok: true, created: true, replay: inserted.rows[0] }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
