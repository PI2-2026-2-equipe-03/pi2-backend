import type { FastifyInstance } from 'fastify'

type Replay = {
  id: number
  arenaId: number
  courtId: number
  createdAt: string
  durationSeconds: number
  fileName: string
  downloadUrl: string
}

const replays: Replay[] = [
  {
    id: 1,
    arenaId: 1,
    courtId: 2,
    createdAt: '2026-09-30T14:00:00Z',
    durationSeconds: 30,
    fileName: 'replay-1.mp4',
    downloadUrl: '/mock/replays/replay-1.mp4',
  },
  {
    id: 2,
    arenaId: 1,
    courtId: 3,
    createdAt: '2026-09-30T15:00:00Z',
    durationSeconds: 30,
    fileName: 'replay-2.mp4',
    downloadUrl: '/mock/replays/replay-2.mp4',
  },
]

export async function replaysController(app: FastifyInstance) {
  // Gerar um novo replay
  app.post('/replays', async (request, reply) => {
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
  app.get('/replays', async (_request, reply) => {
  try {
    const result = await app.pg.query(`
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
      WHERE r.status <> 'excluido'
      ORDER BY
        r.data_geracao DESC,
        r.hora_geracao DESC
    `)

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
  app.get('/replays/:id/download', async (request, reply) => {
    try {
      const { id } = request.params as {
        id: string
      }

      const replayId = Number(id)

      if (!Number.isInteger(replayId)) {
        return reply.status(400).send({
          error: {
            message: 'ID do replay inválido',
          },
        })
      }

      const replay = replays.find((item) => item.id === replayId)

      if (!replay) {
        return reply.status(404).send({
          error: {
            message: 'Replay não encontrado',
          },
        })
      }

      return reply.status(200).send({
        data: {
          id: replay.id,
          fileName: replay.fileName,
          downloadUrl: replay.downloadUrl,
        },
      })
    } catch {
      return reply.status(500).send({
        error: {
          message: 'Erro interno do servidor',
        },
      })
    }
  })
}
