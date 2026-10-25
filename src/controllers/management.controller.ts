import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/require-auth.js'
import { HttpError, parse, uuid } from '../http/errors.js'
import { docOnly } from '../schemas/doc-only.js'
import {
  errorSchema,
  sponsorBodySchema,
  sponsorResponseSchema,
  adminMetricsSchema,
  managerMetricsSchema,
  managerRequestBodySchema,
  managerRequestParamsSchema,
  managerRequestStatusSchema,
  managerRequestResponseSchema,
} from '../schemas/api.js'
const security: { [key: string]: string[] }[] = [
  { bearerAuth: [] },
  { cookieAuth: [] },
]

const sponsorSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do patrocinador').max(150),
  imageUrl: z.string().max(500).refine(value => /^\/uploads\/[A-Za-z0-9/_.-]+$/.test(value) || z.url({ protocol: /^https?$/ }).safeParse(value).success, 'Informe uma URL HTTP(S) ou caminho /uploads/ válido'),
  duration: z.number().int().positive().max(30),
  value: z.number().nonnegative().max(99999999.99).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use no máximo duas casas decimais'),
  courtIds: z.array(uuid).min(1, 'Selecione ao menos uma quadra').max(100).refine(ids => new Set(ids).size === ids.length, 'Não repita quadras'),
}).strict()

export async function managementController(app: FastifyInstance) {
  app.post('/sponsors', {
  ...docOnly, preHandler: requireAuth,
  schema: {
    tags: ['sponsors'], summary: 'Cadastrar patrocinador', security,
    body: sponsorBodySchema,
    response: { 201: sponsorResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema },
  },
}, async (request, reply) => {
    const data = parse(sponsorSchema, request.body)
    const client = await app.pg.connect()
    try {
      await client.query('BEGIN')
      const manager = await client.query(`SELECT ga.id_usuario FROM gestor_arena ga JOIN usuario_auth ua ON ua.id_usuario=ga.id_usuario WHERE ua.id_auth=$1`, [request.authUser!.id])
      if (!manager.rowCount) throw new HttpError(403, 'Apenas gestores podem cadastrar patrocinadores')
      const managerId = manager.rows[0].id_usuario
      const courts = await client.query(`SELECT q.id_quadra, a.id_gestor FROM quadra q JOIN arena a ON a.id_arena=q.id_arena
        WHERE q.id_quadra=ANY($1::uuid[]) ORDER BY q.id_quadra FOR UPDATE OF q`, [data.courtIds])
      if (courts.rowCount !== data.courtIds.length) throw new HttpError(404, 'Uma ou mais quadras não foram encontradas')
      if (courts.rows.some(court => court.id_gestor !== managerId)) throw new HttpError(403, 'Você só pode vincular patrocinadores às suas quadras')
      const result = await client.query(`INSERT INTO patrocinador(id_gestor,nome,foto_url,duracao,valor) VALUES($1,$2,$3,$4,$5)
        RETURNING id_patrocinador AS id,nome AS name,foto_url AS "imageUrl",duracao AS duration,valor::float8 AS value`,
        [managerId,data.name,data.imageUrl,data.duration,data.value])
      await client.query(`INSERT INTO quadra_patrocinador(id_quadra,id_patrocinador) SELECT unnest($1::uuid[]),$2::uuid`, [data.courtIds,result.rows[0].id])
      await client.query('COMMIT')
      return reply.code(201).send({ ...result.rows[0], courtIds: data.courtIds })
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  })

  app.get('/admin/metrics', {
  ...docOnly, preHandler: requireAuth,
  schema: {
    tags: ['metrics'], summary: 'Métricas do administrador', security,
    response: { 200: adminMetricsSchema, 401: errorSchema, 403: errorSchema },
  },
}, async request => {
    const admin = await app.pg.query(`SELECT 1 FROM administrador ad JOIN usuario_auth ua ON ua.id_usuario=ad.id_usuario WHERE ua.id_auth=$1`, [request.authUser!.id])
    if (!admin.rowCount) throw new HttpError(403, 'Apenas administradores podem consultar estas métricas')
    const counts = await app.pg.query(`SELECT
      (SELECT count(DISTINCT "userId")::int FROM "session" WHERE "expiresAt">now()) AS "activeUsers",
      (SELECT count(*)::int FROM quadra) AS "totalCourts",
      (SELECT count(*)::int FROM replay WHERE status<>'excluido' AND expira_em>now()) AS "totalReplays"`)
    const accessed = await app.pg.query(`SELECT q.id_quadra AS "courtId",q.nome AS name,count(e.id)::int AS accesses
      FROM quadra q JOIN replay r ON r.id_quadra=q.id_quadra JOIN replay_download_event e ON e.id_replay=r.id_replay
      GROUP BY q.id_quadra ORDER BY accesses DESC,q.id_quadra LIMIT 5`)
    return { ...counts.rows[0], mostAccessedCourts: accessed.rows }
  })

  app.get('/manager/metrics', {
  ...docOnly, preHandler: requireAuth,
  schema: {
    tags: ['metrics'], summary: 'Métricas do gestor', security,
    response: { 200: managerMetricsSchema, 401: errorSchema, 403: errorSchema },
  },
}, async request => {
    const manager = await app.pg.query(`SELECT ga.id_usuario FROM gestor_arena ga JOIN usuario_auth ua ON ua.id_usuario=ga.id_usuario WHERE ua.id_auth=$1`, [request.authUser!.id])
    if (!manager.rowCount) throw new HttpError(403, 'Apenas gestores podem consultar estas métricas')
    const managerId = manager.rows[0].id_usuario
    const counts = await app.pg.query(`SELECT
      (SELECT count(*)::int FROM replay r JOIN quadra q ON q.id_quadra=r.id_quadra JOIN arena a ON a.id_arena=q.id_arena
        WHERE a.id_gestor=$1 AND r.status<>'excluido' AND r.expira_em>now()) AS "totalReplays",
      (SELECT count(*)::int FROM patrocinador WHERE id_gestor=$1) AS "totalSponsors"`, [managerId])
    const courts = await app.pg.query(`SELECT q.id_quadra AS id,q.nome AS name,count(r.id_replay)::int AS replays
      FROM quadra q JOIN arena a ON a.id_arena=q.id_arena LEFT JOIN replay r ON r.id_quadra=q.id_quadra AND r.status<>'excluido' AND r.expira_em>now()
      WHERE a.id_gestor=$1 GROUP BY q.id_quadra ORDER BY q.id_quadra`, [managerId])
    const peaks = await app.pg.query(`SELECT to_char(e.criado_em AT TIME ZONE 'America/Fortaleza','HH24:00') AS hour,count(*)::int AS accesses
      FROM replay_download_event e JOIN replay r ON r.id_replay=e.id_replay JOIN quadra q ON q.id_quadra=r.id_quadra JOIN arena a ON a.id_arena=q.id_arena
      WHERE a.id_gestor=$1 GROUP BY hour ORDER BY accesses DESC,hour LIMIT 5`, [managerId])
    return { ...counts.rows[0], peakHours: peaks.rows, courts: courts.rows }
  })



  app.patch('/manager-requests/:id', {
    ...docOnly,
    preHandler: requireAuth,
    schema: {
      tags: ['manager-requests'],
      summary: 'Aprovar ou rejeitar solicitação de gestor',
      security,
      params: managerRequestParamsSchema,
      body: managerRequestStatusSchema,
      response: {
        200: managerRequestResponseSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
    },
  }, async (request, reply) => {
    const { id } = parse(managerRequestParamsSchema, request.params)
    const { status } = parse(managerRequestStatusSchema, request.body)
    const client = await app.pg.connect()

    try {
      await client.query('BEGIN')

      const admin = await client.query(
        `SELECT ad.id_usuario
         FROM administrador ad
         JOIN usuario_auth ua ON ua.id_usuario = ad.id_usuario
         WHERE ua.id_auth = $1`,
        [request.authUser!.id],
      )

      if (!admin.rowCount) {
        throw new HttpError(
          403,
          'Apenas administradores podem analisar solicitações',
        )
      }

      const found = await client.query(
        `SELECT *
         FROM manager_request
         WHERE id = $1
         FOR UPDATE`,
        [id],
      )

      if (!found.rowCount) {
        throw new HttpError(404, 'Solicitação não encontrada', 'NOT_FOUND')
      }

      const managerRequest = found.rows[0]

      if (managerRequest.status !== 'PENDING') {
        throw new HttpError(
          409,
          'Esta solicitação já foi analisada',
          'CONFLICT',
        )
      }

      if (status === 'APPROVED') {
        const address = [
          managerRequest.logradouro,
          managerRequest.bairro,
          managerRequest.cep,
          `${managerRequest.cidade} - ${managerRequest.estado}`,
        ].join(', ')

        await client.query(
          `INSERT INTO gestor_arena (
            id_usuario, razao_social, cpf, cnpj, endereco
          )
          VALUES ($1, $2, $3, $4, $5)`,
          [
            managerRequest.id_usuario,
            managerRequest.razao_social,
            managerRequest.cpf,
            managerRequest.cnpj,
            address,
          ],
        )
      }

      const result = await client.query(
        `UPDATE manager_request
         SET status = $1,
             analisado_em = now(),
             analisado_por = $2
         WHERE id = $3
         RETURNING id, id_usuario AS "userId", status`,
        [status, admin.rows[0].id_usuario, id],
      )

      await client.query('COMMIT')

      return reply.code(200).send({
        id: Number(result.rows[0].id),
        userId: result.rows[0].userId,
        status: result.rows[0].status,
        message: status === 'APPROVED'
          ? 'Solicitação aprovada com sucesso.'
          : 'Solicitação rejeitada com sucesso.',
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })
  app.post('/manager-requests', {
    ...docOnly,
    preHandler: requireAuth,
    schema: {
      tags: ['manager-requests'],
      summary: 'Solicitar cadastro como gestor de arena',
      security,
      body: managerRequestBodySchema,
      response: {
        201: managerRequestResponseSchema,
        400: errorSchema,
        401: errorSchema,
        409: errorSchema,
      },
    },
  }, async (request, reply) => {
    const data = parse(managerRequestBodySchema, request.body)
    const client = await app.pg.connect()

    try {
      await client.query('BEGIN')

      const user = await client.query(
        `SELECT id_usuario
         FROM usuario_auth
         WHERE id_auth = $1
         FOR SHARE`,
        [request.authUser!.id],
      )

      if (!user.rowCount) {
        throw new HttpError(401, 'Não foi possível identificar o usuário autenticado')
      }

      const userId = user.rows[0].id_usuario

      const existingManager = await client.query(
        `SELECT 1
         FROM gestor_arena
         WHERE id_usuario = $1
            OR cpf = $2
            OR ($3::char(14) IS NOT NULL AND cnpj = $3)
         LIMIT 1`,
        [userId, data.cpf, data.cnpj ?? null],
      )

      if (existingManager.rowCount) {
        throw new HttpError(
          409,
          'Este usuário ou documento já está vinculado a um gestor',
          'CONFLICT',
        )
      }

      const result = await client.query(
        `INSERT INTO manager_request (
          id_usuario, cpf, cnpj, razao_social, quantidade_quadra,
          logradouro, bairro, cep, cidade, estado
        )
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        WHERE NOT EXISTS (
          SELECT 1
          FROM manager_request
          WHERE id_usuario = $1 AND status = 'PENDING'
        )
        RETURNING id, id_usuario AS "userId", status`,
        [
          userId,
          data.cpf,
          data.cnpj ?? null,
          data.companyName,
          data.courtQuantity,
          data.address.street,
          data.address.neighborhood,
          data.address.zipCode,
          data.address.city,
          data.address.state.toUpperCase(),
        ],
      )

      if (!result.rowCount) {
        throw new HttpError(
          409,
          'Você já possui uma solicitação pendente',
          'CONFLICT',
        )
      }

      await client.query('COMMIT')

      return reply.code(201).send({
        id: Number(result.rows[0].id),
        userId: result.rows[0].userId,
        status: result.rows[0].status,
        message: 'Solicitação enviada. Aguarde a análise dos administradores.',
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })
}
