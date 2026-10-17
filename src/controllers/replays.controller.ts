import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middlewares/require-auth.js'
import {podeGerenciarQuadra, podeBaixarReplay,} from '../services/replay-authorization.js'

export async function replaysController(app: FastifyInstance) {
  // Gerar um novo replay
  app.post(
  '/replays',
  { preHandler: requireAuth },
  async (request, reply) => {
  try {
    const { courtId } = request.body as {
      courtId?: string
    }

    if (!courtId) {
      return reply.status(400).send({
        error: {
          message: 'courtId é obrigatório',
        },
      })
    }

	const authUserId = request.authUser?.id

if (!authUserId) {
  return reply.status(401).send({
    message: 'Usuário não autenticado',
  })
}

const uuidValido =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

if (!uuidValido.test(courtId)) {
  return reply.status(400).send({
    message: 'ID da quadra inválido',
  })
}

const autorizado = await podeGerenciarQuadra(
  authUserId,
  courtId
)

if (!autorizado) {
  return reply.status(403).send({
    message: 'Você não tem permissão para gerenciar esta quadra',
  })
}

    const result = await app.pg.query(
      `
        INSERT INTO replay (
          id_quadra,
          data_geracao,
          hora_geracao,
          status
        )
        VALUES (
          $1,
          CURRENT_DATE,
          CURRENT_TIME,
          'pendente'
        )
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

    return reply.status(201).send({
      data: result.rows[0],
    })
  } catch (error) {
    app.log.error(error)

    return reply.status(500).send({
      error: {
        message: 'Erro interno do servidor',
      },
    })
  }
})

  // Listar replays
app.get(
  '/replays',
  { preHandler: requireAuth },
  async (request, reply) => {
  try {
	const authUserId = request.authUser?.id

if (!authUserId) {
  return reply.code(401).send({
    message: 'Usuário não autenticado',
  })
}
const result = await app.pg.query(
  `
  SELECT
    r.id_replay AS "id",
    r.id_quadra AS "courtId",
    r.arquivo_url AS "downloadUrl",
    r.data_geracao AS "recordingDate",
    r.hora_geracao AS "recordingTime",
    r.status,
    r.criado_em AS "createdAt",
    r.expira_em AS "expiresAt",
    q.nome AS "courtName",
    a.nome AS "arenaName",
    a.cidade AS "city"
  FROM replay r
  INNER JOIN quadra q
    ON q.id_quadra = r.id_quadra
  INNER JOIN arena a
    ON a.id_arena = q.id_arena
  INNER JOIN gestor_arena ga
    ON ga.id_usuario = a.id_gestor
  INNER JOIN usuario_auth ua
    ON ua.id_usuario = ga.id_usuario
  WHERE ua.id_auth = $1
    AND r.status <> 'excluido'
  ORDER BY
    r.data_geracao DESC,
    r.hora_geracao DESC
  `,
  [authUserId]
)
    return reply.status(200).send({
      data: result.rows,
    })
  } catch (error) {
    app.log.error(error)

    return reply.status(500).send({
      error: {
        message: 'Erro interno do servidor',
      },
    })
  }
})

  // Obter link de download
app.get(
  '/replays/:id/download',
  { preHandler: requireAuth },
  async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const authUserId = request.authUser?.id

      if (!authUserId) {
        return reply.code(401).send({
          message: 'Usuário não autenticado',
        })
      }

      const uuidValido =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

      if (!uuidValido.test(id)) {
        return reply.code(400).send({
          message: 'ID do replay inválido',
        })
      }

      const autorizado = await podeBaixarReplay(
        authUserId,
        id
      )

      if (!autorizado) {
        return reply.code(404).send({
          message: 'Replay não encontrado ou indisponível',
        })
      }

      const result = await app.pg.query(
        `
        SELECT
          id_replay AS "id",
          arquivo_url AS "downloadUrl"
        FROM replay
        WHERE id_replay = $1
          AND status = 'disponivel'
          AND expira_em > NOW()
        `,
        [id]
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({
          message: 'Replay não encontrado ou indisponível',
        })
      }

      return reply.code(200).send({
        data: result.rows[0],
      })
    } catch (error) {
      app.log.error(error)

      return reply.code(500).send({
        message: 'Erro interno do servidor',
      })
    }
  }
)
  }
