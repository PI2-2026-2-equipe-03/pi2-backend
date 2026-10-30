import { authPool } from '../lib/auth.js'

type ResultadoExclusao =
  | { ok: true }
  | { ok: false; erro: 'nao_encontrado' | 'sem_permissao' | 'ja_excluido' }

export async function excluirReplay(
  authUserId: string,
  replayId: string,
  motivo: string,
): Promise<ResultadoExclusao> {
  const client = await authPool.connect()

  try {
    await client.query('BEGIN')

    // Trava o replay para duas exclusões simultâneas não duplicarem a auditoria
    const replay = await client.query(
      `
      SELECT r.status, a.id_gestor
      FROM replay r
      JOIN quadra q ON q.id_quadra = r.id_quadra
      JOIN arena a ON a.id_arena = q.id_arena
      WHERE r.id_replay = $1
      FOR UPDATE OF r
      `,
      [replayId],
    )

    if (replay.rowCount === 0) {
      await client.query('ROLLBACK')
      return { ok: false, erro: 'nao_encontrado' }
    }

    const usuario = await client.query(
      `SELECT id_usuario FROM usuario_auth WHERE id_auth = $1`,
      [authUserId],
    )
    const idUsuario: string | undefined = usuario.rows[0]?.id_usuario

    if (!idUsuario) {
      await client.query('ROLLBACK')
      return { ok: false, erro: 'sem_permissao' }
    }

    const admin = await client.query(
      `SELECT 1 FROM administrador WHERE id_usuario = $1`,
      [idUsuario],
    )
    const ehAdmin = (admin.rowCount ?? 0) > 0
    const ehGestorDaQuadra = replay.rows[0].id_gestor === idUsuario

    if (!ehAdmin && !ehGestorDaQuadra) {
      await client.query('ROLLBACK')
      return { ok: false, erro: 'sem_permissao' }
    }

    if (replay.rows[0].status === 'excluido') {
      await client.query('ROLLBACK')
      return { ok: false, erro: 'ja_excluido' }
    }

    await client.query(
      `UPDATE replay SET status = 'excluido' WHERE id_replay = $1`,
      [replayId],
    )

    await client.query(
      `
      INSERT INTO auditoria_exclusao_replay (id_usuario, id_replay, motivo)
      VALUES ($1, $2, $3)
      `,
      [idUsuario, replayId, motivo],
    )

    await client.query('COMMIT')
    return { ok: true }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}