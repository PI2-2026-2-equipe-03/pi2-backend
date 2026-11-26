import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireAuth } from '../middlewares/require-auth.js'
import { requireRole } from '../middlewares/require-role.js'
import { HttpError, parse, uuid } from '../http/errors.js'
import { docOnly } from '../schemas/doc-only.js'
import { data, errorSchema, messageSchema, sponsorResponseSchema, sponsorUpdateBodySchema, sponsorBodySchema } from '../schemas/api.js'

const sponsorSchema = z.object({
    name: z.string().trim().min(2, 'Informe o nome do patrocinador').max(150),
    imageUrl: z.string().max(500).refine(value => /^\/uploads\/[A-Za-z0-9/_.-]+$/.test(value) || z.url({ protocol: /^https?$/ }).safeParse(value).success, 'Informe uma URL HTTP(S) ou caminho /uploads/ válido'),
    duration: z.number().int().positive().max(30),
    value: z.number().nonnegative().max(99999999.99).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Use no máximo duas casas decimais'),
    courtIds: z.array(uuid).min(1, 'Selecione ao menos uma quadra').max(100).refine(ids => new Set(ids).size === ids.length, 'Não repita quadras'),
}).strict()

const security: { [key: string]: string[] }[] = [{ bearerAuth: [] }, { cookieAuth: [] }]
const paramsSchema = z.object({ id: uuid })
const updateSchema = sponsorSchema.partial().strict()
    .refine(v => Object.keys(v).length > 0, 'Informe ao menos um campo')

const COLS = `p.id_patrocinador AS id, p.nome AS name, p.foto_url AS "imageUrl", p.duracao AS duration,
  p.valor::float8 AS value,
  COALESCE((SELECT array_agg(qp.id_quadra ORDER BY qp.id_quadra) FROM quadra_patrocinador qp
            WHERE qp.id_patrocinador = p.id_patrocinador), '{}') AS "courtIds"`

async function quemSou(app: FastifyInstance, authId: string) {
    const r = await app.pg.query(
        `SELECT ua.id_usuario AS id, p.codigo FROM usuario_auth ua
     JOIN usuario u ON u.id_usuario = ua.id_usuario
     JOIN perfil p ON p.id_perfil = u.id_perfil WHERE ua.id_auth = $1`, [authId])
    return r.rows[0] as { id: string; codigo: 'ADM' | 'CLI' | 'USR' }
}

export async function sponsorsController(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>()
    const erros = { 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema }
    const pre = { ...docOnly, preHandler: [requireAuth, requireRole('CLI', 'ADM')] }

    r.get('/sponsors', {
        ...pre,
        schema: {
            tags: ['sponsors'], summary: 'Listar patrocinadores', security,
            response: { 200: data(z.array(sponsorResponseSchema)), 401: errorSchema, 403: errorSchema }
        },
    }, async request => {
        const me = await quemSou(app, request.authUser!.id)
        const result = await app.pg.query(
            `SELECT ${COLS} FROM patrocinador p
       WHERE ($1::uuid IS NULL OR p.id_gestor = $1) ORDER BY p.nome, p.id_patrocinador`,
            [me.codigo === 'ADM' ? null : me.id])
        return { data: result.rows }
    })

    r.get('/sponsors/:id', {
        ...pre,
        schema: {
            tags: ['sponsors'], summary: 'Consultar patrocinador', security,
            params: z.object({ id: z.guid() }), response: { 200: sponsorResponseSchema, ...erros }
        },
    }, async request => {
        const { id } = parse(paramsSchema, request.params)
        const me = await quemSou(app, request.authUser!.id)
        const result = await app.pg.query(`SELECT ${COLS}, p.id_gestor FROM patrocinador p WHERE p.id_patrocinador = $1`, [id])
        if (!result.rowCount) throw new HttpError(404, 'Patrocinador não encontrado')
        const { id_gestor, ...sponsor } = result.rows[0]
        if (me.codigo === 'CLI' && id_gestor !== me.id) throw new HttpError(403, 'Você não tem permissão para acessar este patrocinador')
        return sponsor
    })

    r.post('/sponsors', {
        ...docOnly, preHandler: [requireAuth, requireRole('CLI', 'ADM')],
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
                [managerId, data.name, data.imageUrl, data.duration, data.value])
            await client.query(`INSERT INTO quadra_patrocinador(id_quadra,id_patrocinador) SELECT unnest($1::uuid[]),$2::uuid`, [data.courtIds, result.rows[0].id])
            await client.query('COMMIT')
            return reply.code(201).send({ ...result.rows[0], courtIds: data.courtIds })
        } catch (error) { await client.query('ROLLBACK'); throw error }
        finally { client.release() }
    })

    r.patch('/sponsors/:id', {
        ...pre,
        schema: {
            tags: ['sponsors'], summary: 'Editar patrocinador', security,
            params: z.object({ id: z.guid() }), body: sponsorUpdateBodySchema,
            response: { 200: sponsorResponseSchema, ...erros }
        },
    }, async request => {
        const { id } = parse(paramsSchema, request.params)
        const body = parse(updateSchema, request.body)
        const me = await quemSou(app, request.authUser!.id)
        const client = await app.pg.connect()
        try {
            await client.query('BEGIN')
            const found = await client.query('SELECT id_gestor FROM patrocinador WHERE id_patrocinador = $1 FOR UPDATE', [id])
            if (!found.rowCount) throw new HttpError(404, 'Patrocinador não encontrado')
            const gestorId = found.rows[0].id_gestor
            if (me.codigo === 'CLI' && gestorId !== me.id) throw new HttpError(403, 'Você não tem permissão para gerenciar este patrocinador')

            if (body.courtIds) {
                const courts = await client.query(
                    `SELECT q.id_quadra, a.id_gestor FROM quadra q JOIN arena a ON a.id_arena = q.id_arena
           WHERE q.id_quadra = ANY($1::uuid[]) ORDER BY q.id_quadra FOR UPDATE OF q`, [body.courtIds])
                if (courts.rowCount !== body.courtIds.length) throw new HttpError(404, 'Uma ou mais quadras não foram encontradas')
                if (courts.rows.some(c => c.id_gestor !== gestorId)) throw new HttpError(403, 'Você só pode vincular patrocinadores às quadras do gestor')
                await client.query('DELETE FROM quadra_patrocinador WHERE id_patrocinador = $1', [id])
                await client.query('INSERT INTO quadra_patrocinador(id_quadra, id_patrocinador) SELECT unnest($1::uuid[]), $2::uuid', [body.courtIds, id])
            }

            await client.query(
                `UPDATE patrocinador SET nome = COALESCE($2, nome), foto_url = COALESCE($3, foto_url),
           duracao = COALESCE($4, duracao), valor = COALESCE($5, valor) WHERE id_patrocinador = $1`,
                [id, body.name ?? null, body.imageUrl ?? null, body.duration ?? null, body.value ?? null])
            const result = await client.query(`SELECT ${COLS} FROM patrocinador p WHERE p.id_patrocinador = $1`, [id])
            await client.query('COMMIT')
            return result.rows[0]
        } catch (error) { await client.query('ROLLBACK'); throw error }
        finally { client.release() }
    })

    r.delete('/sponsors/:id', {
        ...pre,
        schema: {
            tags: ['sponsors'], summary: 'Excluir patrocinador', security,
            params: z.object({ id: z.guid() }), response: { 200: messageSchema, ...erros }
        },
    }, async request => {
        const { id } = parse(paramsSchema, request.params)
        const me = await quemSou(app, request.authUser!.id)
        const found = await app.pg.query('SELECT id_gestor FROM patrocinador WHERE id_patrocinador = $1', [id])
        if (!found.rowCount) throw new HttpError(404, 'Patrocinador não encontrado')
        if (me.codigo === 'CLI' && found.rows[0].id_gestor !== me.id) throw new HttpError(403, 'Você não tem permissão para gerenciar este patrocinador')
        await app.pg.query('DELETE FROM patrocinador WHERE id_patrocinador = $1', [id])
        return { message: 'Patrocinador excluído com sucesso' }
    })
}