// Rotas usadas pelo agente local instalado em cada arena (agent-node).
// Os dados seguem em snake_case (contrato do agente); erros usam o formato padrão da API.
// O agente repete indefinidamente 409, 429 e 5xx; outros 4xx são tratados como definitivos.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { HttpError, parse, uuid } from '../http/errors.js'
import { assertAgentArena, requireAgent } from '../middlewares/require-agent.js'
import type { Db } from '../repositories/errors.js'
import { registrarGravacao } from '../repositories/recording-log.repository.js'
import { salvarMetadados } from '../repositories/replay-metadata.repository.js'
import { marcarReplayDisponivel } from '../repositories/replay.repository.js'
import { createReplay, type CreatedReplay } from '../services/replay-creation.js'
import { replayObjectKeys, storage, uploadUrlTtlSeconds } from '../services/storage.js'

const CLOCK_SKEW_MS = 5 * 60_000
const RETENTION_MS = 168 * 3600_000
const hidden = { schema: { hide: true } }

const idParams = z.object({ id: uuid })
const createSchema = z.object({
  id_quadra: uuid,
  pressed_at: z.iso.datetime({ offset: true, error: 'Informe pressed_at em ISO 8601' }),
})
const discardSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() }).nullish()

const AGENT_REPLAY_FIELDS = `r.id_replay, r.id_quadra, r.arquivo_url, r.data_geracao::text AS data_geracao,
  r.hora_geracao, r.status, r.criado_em, r.expira_em`

const toAgentReplay = (r: CreatedReplay) => ({
  id_replay: r.id, id_quadra: r.courtId, arquivo_url: r.downloadUrl, data_geracao: r.recordingDate,
  hora_geracao: r.recordingTime, status: r.status, criado_em: r.createdAt, expira_em: r.expiresAt,
})

type AgentReplay = {
  id: string; courtId: string; arenaId: string; status: string; recordingDate: string; expired: boolean
}

// Carrega o replay e confere se ele pertence à arena do agente.
async function loadReplay(db: Db, request: FastifyRequest, id: string): Promise<AgentReplay> {
  const { rows } = await db.query(
    `SELECT r.id_replay AS id, r.id_quadra AS "courtId", q.id_arena AS "arenaId", r.status,
            r.data_geracao::text AS "recordingDate", r.expira_em <= now() AS expired
       FROM replay r JOIN quadra q ON q.id_quadra = r.id_quadra
      WHERE r.id_replay = $1`,
    [id],
  )
  if (!rows[0]) throw new HttpError(404, 'Replay não encontrado', 'NOT_FOUND')
  assertAgentArena(request, rows[0].arenaId)
  return rows[0]
}

async function agentReplayRow(db: Db, id: string) {
  const { rows } = await db.query(`SELECT ${AGENT_REPLAY_FIELDS} FROM replay r WHERE r.id_replay = $1`, [id])
  return rows[0]
}

async function activeCameraId(db: Db, courtId: string): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT id_camera FROM camera WHERE id_quadra = $1 AND status = 'ativa' ORDER BY identificador LIMIT 1`,
    [courtId],
  )
  return rows[0]?.id_camera ?? null
}

function ensureStorage() {
  if (!storage.isConfigured()) throw new HttpError(503, 'Armazenamento não configurado no servidor', 'STORAGE_UNAVAILABLE')
}

const keysOf = (r: AgentReplay) =>
  replayObjectKeys({ arenaId: r.arenaId, courtId: r.courtId, recordingDate: r.recordingDate, replayId: r.id })

export async function agentController(app: FastifyInstance) {
  app.addHook('preHandler', requireAgent)

  // Quadras disponíveis da arena com a câmera ativa (identificador = canal do DVR).
  app.get('/api/agent/arenas/:id/config', hidden, async request => {
    const { id } = parse(idParams, request.params)
    assertAgentArena(request, id)
    const arena = await app.pg.query('SELECT id_arena, nome FROM arena WHERE id_arena = $1', [id])
    if (!arena.rowCount) throw new HttpError(404, 'Arena não encontrada', 'NOT_FOUND')
    const { rows } = await app.pg.query(
      `SELECT q.id_quadra, q.nome, c.id_camera, c.identificador
         FROM quadra q
         LEFT JOIN LATERAL (
           SELECT id_camera, identificador FROM camera
            WHERE id_quadra = q.id_quadra AND status = 'ativa'
            ORDER BY identificador LIMIT 1
         ) c ON true
        WHERE q.id_arena = $1 AND q.disponivel
        ORDER BY q.nome`,
      [id],
    )
    return {
      arena: arena.rows[0],
      quadras: rows.map(row => ({
        id_quadra: row.id_quadra,
        nome: row.nome,
        camera: row.id_camera ? { id_camera: row.id_camera, identificador: row.identificador } : null,
      })),
    }
  })

  // Cria o replay pendente com o horário do clique, aplicando as mesmas regras do app.
  app.post('/api/agent/replays', hidden, async (request, reply) => {
    const body = parse(createSchema, request.body)
    const pressedAt = new Date(body.pressed_at)
    if (pressedAt.getTime() > Date.now() + CLOCK_SKEW_MS) {
      throw new HttpError(422, 'Horário do clique (pressed_at) no futuro; confira o relógio do PC da arena', 'INVALID_PRESSED_AT')
    }
    if (pressedAt.getTime() <= Date.now() - RETENTION_MS) {
      throw new HttpError(422, 'Clique mais antigo que o prazo de retenção (168 h)', 'INVALID_PRESSED_AT')
    }

    const arenaId = request.agent!.arenaId
    const result = await createReplay(app.pg, {
      courtId: body.id_quadra,
      pressedAt,
      canAccess: court => court.arenaId === arenaId,
    })
    if (!result.ok) {
      switch (result.reason) {
        case 'court_not_found': throw new HttpError(404, 'Quadra não encontrada', 'NOT_FOUND')
        case 'forbidden': throw new HttpError(403, 'Quadra pertence a outra arena', 'FORBIDDEN')
        case 'court_unavailable': throw new HttpError(422, 'Quadra indisponível para gerar replay', 'COURT_UNAVAILABLE')
        case 'min_interval': throw new HttpError(422, 'Intervalo mínimo de 30 segundos entre replays da quadra', 'MIN_INTERVAL')
      }
    }
    return reply.code(result.created ? 201 : 200).send(toAgentReplay(result.replay))
  })

  // URLs PUT pré-assinadas: o agente envia o vídeo e a miniatura direto ao R2.
  app.post('/api/agent/replays/:id/upload-urls', hidden, async request => {
    const { id } = parse(idParams, request.params)
    const replay = await loadReplay(app.pg, request, id)
    if (replay.status !== 'pendente') throw new HttpError(409, `Replay já está '${replay.status}'`, 'CONFLICT')
    if (replay.expired) throw new HttpError(409, 'Replay expirado', 'CONFLICT')
    ensureStorage()
    const keys = keysOf(replay)
    const [video, thumb] = await Promise.all([
      storage.presignPut(keys.video, 'video/mp4'),
      storage.presignPut(keys.thumb, 'image/jpeg'),
    ])
    return {
      expira_em_segundos: uploadUrlTtlSeconds(),
      video: { key: keys.video, ...video },
      thumb: { key: keys.thumb, ...thumb },
    }
  })

  // Confere o vídeo no R2 e publica o replay. Idempotente para replays já disponíveis.
  app.post('/api/agent/replays/:id/complete', hidden, async request => {
    const { id } = parse(idParams, request.params)
    const replay = await loadReplay(app.pg, request, id)
    if (replay.status === 'disponivel') return agentReplayRow(app.pg, id)
    if (replay.status !== 'pendente') throw new HttpError(409, `Replay já está '${replay.status}'`, 'CONFLICT')
    if (replay.expired) throw new HttpError(409, 'Replay expirado', 'CONFLICT')
    ensureStorage()

    const keys = keysOf(replay)
    const video = await storage.exists(keys.video)
    if (!video.ok || !video.size) throw new HttpError(409, 'Vídeo ainda não está no armazenamento', 'CONFLICT')

    const client = await app.pg.connect()
    try {
      await client.query('BEGIN')
      const updated = await marcarReplayDisponivel(client, id, keys.video)
      if (!updated) throw new HttpError(409, 'Replay não está mais pendente', 'CONFLICT')
      const cameraId = await activeCameraId(client, replay.courtId)
      await salvarMetadados(client, { replayId: id, cameraId, sizeBytes: video.size, format: 'mp4' })
      await registrarGravacao(client, { courtId: replay.courtId, cameraId, replayId: id, origin: 'botoeira', result: 'sucesso' })
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return agentReplayRow(app.pg, id)
  })

  // Descarta o replay pendente quando o recorte falha no agente e registra a falha.
  app.delete('/api/agent/replays/:id', hidden, async (request, reply) => {
    const { id } = parse(idParams, request.params)
    const body = parse(discardSchema, request.body)
    const replay = await loadReplay(app.pg, request, id)
    if (replay.status !== 'pendente') throw new HttpError(404, 'Replay pendente não encontrado', 'NOT_FOUND')

    const client = await app.pg.connect()
    try {
      await client.query('BEGIN')
      const discarded = await client.query(
        `UPDATE replay SET status = 'excluido' WHERE id_replay = $1 AND status = 'pendente'`, [id])
      if (!discarded.rowCount) throw new HttpError(404, 'Replay pendente não encontrado', 'NOT_FOUND')
      const cameraId = await activeCameraId(client, replay.courtId)
      await registrarGravacao(client, {
        courtId: replay.courtId, cameraId, replayId: id, origin: 'botoeira', result: 'falha',
        errorMessage: body?.reason ?? 'Falha no recorte informada pelo agente',
      })
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    return reply.code(204).send()
  })
}
