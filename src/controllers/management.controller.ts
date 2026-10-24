import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/require-auth.js'
import { HttpError, parse, uuid } from '../http/errors.js'
import { docOnly } from '../schemas/doc-only.js'
import { errorSchema, sponsorBodySchema, sponsorResponseSchema, adminMetricsSchema, managerMetricsSchema } from '../schemas/api.js'

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
}
