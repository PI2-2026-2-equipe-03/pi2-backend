import { authPool } from '../lib/auth.js'

const INTERVALO_SEGUNDOS = 30

type ResultadoCriacao =
  | { ok: true; replay: Record<string, unknown> }
  | { ok: false; erro: 'quadra_nao_encontrada' }
  | { ok: false; erro: 'sem_permissao' }
  | { ok: false; erro: 'intervalo_minimo'; segundosRestantes: number }

export async function criarReplay(
  authUserId: string,
  courtId: string,
): Promise<ResultadoCriacao> {
  const client = await authPool.connect()

  try {
    await client.query('BEGIN')

    const quadra = await client.query(
      `
      SELECT a.id_gestor
      FROM quadra q
      JOIN arena a ON a.id_arena = q.id_arena
      WHERE q.id_quadra = $1
      `,
      [courtId],
    )

    if (quadra.rowCount === 0) {
      await client.query('ROLLBACK')
      return { ok: false, erro: 'quadra_nao_encontrada' }
    }

    const usuario = await client.query(
      `SELECT id_usuario FROM usuario_auth WHERE id_auth = $1`,
      [authUserId],
    )
    const idUsuario: string | undefined = usuario.rows[0]?.id_usuario

    if (!idUsuario || quadra.rows[0].id_gestor !== idUsuario) {
      await client.query('ROLLBACK')
      return { ok: false, erro: 'sem_permissao' }
    }

    // Um acionamento por vez na mesma quadra (evita dois cliques simultâneos)
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
      [courtId],
    )

    const recente = await client.query(
      `
      SELECT CEIL(
        EXTRACT(EPOCH FROM (criado_em + make_interval(secs => $2) - now()))
      )::int AS restantes
      FROM replay
      WHERE id_quadra = $1
        AND criado_em > now() - make_interval(secs => $2)
      ORDER BY criado_em DESC
      LIMIT 1
      `,
      [courtId, INTERVALO_SEGUNDOS],
    )

    if ((recente.rowCount ?? 0) > 0) {
      await client.query('ROLLBACK')
      return {
        ok: false,
        erro: 'intervalo_minimo',
        segundosRestantes: Math.max(1, recente.rows[0].restantes),
      }
    }

    const novo = await client.query(
      `
      INSERT INTO replay (id_quadra, data_geracao, hora_geracao, status)
      VALUES ($1, CURRENT_DATE, CURRENT_TIME, 'pendente')
      RETURNING
        id_replay AS "id",
        id_quadra AS "courtId",
        arquivo_url AS "downloadUrl",
        criado_em AS "createdAt",
        status,
        expira_em AS "expiresAt"
      `,
      [courtId],
    )

    await client.query('COMMIT')
    return { ok: true, replay: novo.rows[0] }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}