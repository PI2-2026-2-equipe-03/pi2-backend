import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middlewares/require-auth.js'
import { podeBaixarReplay } from '../services/replay-authorization.js'
import { criarReplay } from '../services/replay-creation.js'
import { excluirReplay } from '../services/replay-deletion.js'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function replaysController(app: FastifyInstance) {
    // Gerar um novo replay (RN-02 e RN-08)
  app.post(
    '/replays',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const authUserId = request.authUser?.id

        if (!authUserId) {
          return reply.code(401).send({ message: 'Usuário não autenticado' })
        }

        const body = request.body as { courtId?: unknown } | undefined
        const courtId = body?.courtId

        if (courtId === undefined || courtId === null || courtId === '') {
          return reply.code(400).send({ message: 'courtId é obrigatório' })
        }

        if (typeof courtId !== 'string' || !UUID_REGEX.test(courtId)) {
          return reply.code(400).send({ message: 'ID da quadra inválido' })
        }

        const resultado = await criarReplay(authUserId, courtId)

        if (!resultado.ok) {
          if (resultado.erro === 'quadra_nao_encontrada') {
            return reply.code(404).send({ message: 'Quadra não encontrada' })
          }

          if (resultado.erro === 'sem_permissao') {
            return reply.code(403).send({
              message: 'Você não tem permissão para gerenciar esta quadra',
            })
          }

          return reply.code(409).send({
            message: `Já existe um replay desta quadra nos últimos 30 segundos. Tente novamente em ${resultado.segundosRestantes} s.`,
            retryAfter: resultado.segundosRestantes,
          })
        }

        return reply.code(201).send({ data: resultado.replay })
      } catch (error) {
        app.log.error(error)

        return reply.code(500).send({ message: 'Erro interno do servidor' })
      }
    },
  )
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
  // Excluir replay manualmente (RN-04)
  app.delete(
    '/replays/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string }
        const authUserId = request.authUser?.id

        if (!authUserId) {
          return reply.code(401).send({ message: 'Usuário não autenticado' })
        }

        if (!UUID_REGEX.test(id)) {
          return reply.code(400).send({ message: 'ID do replay inválido' })
        }

        const body = request.body as { motivo?: unknown } | undefined
        let motivo = 'Exclusão manual (sem motivo informado)'

        if (body?.motivo !== undefined) {
          if (typeof body.motivo !== 'string') {
            return reply.code(400).send({ message: 'O motivo deve ser um texto' })
          }

          const texto = body.motivo.trim()

          if (texto.length > 255) {
            return reply.code(422).send({
              message: 'O motivo deve ter no máximo 255 caracteres',
            })
          }

          if (texto.length > 0) motivo = texto
        }

        const resultado = await excluirReplay(authUserId, id, motivo)

        if (!resultado.ok) {
          if (resultado.erro === 'nao_encontrado') {
            return reply.code(404).send({ message: 'Replay não encontrado' })
          }

          if (resultado.erro === 'sem_permissao') {
            return reply.code(403).send({
              message: 'Você não tem permissão para excluir este replay',
            })
          }

          return reply.code(409).send({ message: 'Este replay já foi excluído' })
        }

        return reply.code(200).send({ message: 'Replay excluído com sucesso' })
      } catch (error) {
        app.log.error(error)

        return reply.code(500).send({ message: 'Erro interno do servidor' })
      }
    },
  )
  }
