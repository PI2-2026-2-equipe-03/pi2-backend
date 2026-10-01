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
      const { arenaId, courtId } = request.body as {
        arenaId?: number
        courtId?: number
      }

      if (!arenaId || !courtId) {
        return reply.status(400).send({
          error: {
            message: 'arenaId e courtId são obrigatórios',
          },
        })
      }

      const replay: Replay = {
        id: replays.length + 1,
        arenaId,
        courtId,
        createdAt: new Date().toISOString(),
        durationSeconds: 30,
        fileName: `replay-${replays.length + 1}.mp4`,
        downloadUrl: `/mock/replays/replay-${replays.length + 1}.mp4`,
      }

      replays.push(replay)

      return reply.status(201).send({
        data: replay,
      })
    } catch {
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
      return reply.status(200).send({
        data: replays,
      })
    } catch {
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
