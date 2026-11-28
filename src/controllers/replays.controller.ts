import type { FastifyInstance } from 'fastify'
import { requireRole } from '../middlewares/require-role.js'
import { z } from 'zod'
import { requireAuth } from '../middlewares/require-auth.js'
import { HttpError, parse, replayParams, uuid } from '../http/errors.js'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { docOnly } from '../schemas/doc-only.js'
import {
    data, errorSchema, messageSchema, replayCreateBodySchema, replayDeleteBodySchema, replayDetailSchema,
    replayDownloadSchema, replayFiltersSchema, replayListItemSchema, replaySchema,
} from '../schemas/api.js'
import { createReplay, REPLAY_FIELDS as fields, REPLAY_INTERVAL_SECONDS } from '../services/replay-creation.js'
import { toMediaUrl } from '../services/storage.js'

const createSchema = z.object({ courtId: uuid }).strict()
const deleteSchema = z.object({ reason: z.string().trim().min(3, 'Informe o motivo da exclusão (3 a 500 caracteres)').max(500) }).strict()
const filtersSchema = z.object({
    courtId: uuid.optional(),
    city: z.string().trim().max(100).optional(),
    date: z.iso.date({ error: 'Informe uma data válida no formato AAAA-MM-DD' }).optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário válido (HH:MM)').optional(),
}).strict()

export async function replaysController(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>()
    const security: { [key: string]: string[] }[] = [
        { bearerAuth: [] },
        { cookieAuth: [] },
    ]

    r.post('/replays', {
        ...docOnly, preHandler: [requireAuth, requireRole('CLI', 'ADM')],
        schema: {
            tags: ['replays'], summary: 'Gerar replay', security,
            body: replayCreateBodySchema,
            response: { 201: data(replaySchema), 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 422: errorSchema },
        },
    }, async (request, reply) => {
        const { courtId } = parse(createSchema, request.body)
        const result = await createReplay(app.pg, {
            courtId,
            canAccess: court => court.ownerAuthId === request.authUser!.id,
        })
        if (!result.ok) {
            switch (result.reason) {
                case 'court_not_found': throw new HttpError(404, 'Quadra não encontrada')
                case 'forbidden': throw new HttpError(403, 'Você não tem permissão para gerenciar esta quadra')
                case 'court_unavailable': throw new HttpError(422, 'Quadra indisponível para gerar replay')
                case 'min_interval': throw new HttpError(409, `Aguarde ${REPLAY_INTERVAL_SECONDS} segundos entre solicitações de replay`)
            }
        }
        return reply.code(201).send({ data: result.replay })
    })

    r.get('/replays', {
        ...docOnly, preHandler: requireAuth,
        schema: {
            tags: ['replays'], summary: 'Listar replays disponíveis', security,
            querystring: replayFiltersSchema,
            response: { 200: data(z.array(replayListItemSchema)), 400: errorSchema, 401: errorSchema },
        },
    }, async request => {
        const filters = parse(filtersSchema, request.query)
        // RN-08: todo usuário com cadastro e sessão válidos pode consultar vídeos disponíveis.
        const result = await app.pg.query(`SELECT ${fields}, q.nome AS "courtName", a.nome AS "arenaName", a.cidade AS city
      FROM replay r JOIN quadra q ON q.id_quadra=r.id_quadra JOIN arena a ON a.id_arena=q.id_arena
      WHERE r.status='disponivel' AND r.expira_em > now() AND r.arquivo_url IS NOT NULL
        AND ($1::uuid IS NULL OR r.id_quadra=$1)
        AND ($2::text IS NULL OR a.cidade ILIKE '%' || $2 || '%')
        AND ($3::date IS NULL OR r.data_geracao=$3)
        AND ($4::time IS NULL OR date_trunc('minute', r.hora_geracao::interval)=date_trunc('minute', $4::time::interval))
      ORDER BY r.data_geracao DESC, r.hora_geracao DESC, r.id_replay`,
            [filters.courtId ?? null, filters.city || null, filters.date ?? null, filters.time ?? null])
        const rows = await Promise.all(result.rows.map(async row => ({ ...row, downloadUrl: await toMediaUrl(row.downloadUrl) })))
        return { data: rows }
    })

    r.get('/replays/:id', {
        ...docOnly, preHandler: requireAuth,
        schema: {
            tags: ['replays'],
            summary: 'Consultar detalhes de um replay',
            security,
            params: z.object({ id: z.guid() }),
            response: {
                200: data(replayDetailSchema),
                400: errorSchema,
                401: errorSchema,
                404: errorSchema,
            },
        },
    }, async request => {
        const { id } = parse(replayParams, request.params)

        const result = await app.pg.query(`
            SELECT
                r.id_replay AS id,
                q.id_quadra AS "courtId",
                q.nome AS "courtName",
                a.cidade AS city,
                (r.data_geracao + r.hora_geracao) AT TIME ZONE 'America/Fortaleza' AS "recordedAt",
                r.duracao_segundos AS duration,
                r.arquivo_url AS "videoUrl",
                r.expira_em AS "expiresAt"
            FROM replay r
            JOIN quadra q ON q.id_quadra = r.id_quadra
            JOIN arena a ON a.id_arena = q.id_arena
            WHERE r.id_replay = $1
              AND r.status = 'disponivel'
              AND r.arquivo_url IS NOT NULL
              AND r.expira_em > now()
        `, [id])

        if (!result.rowCount) {
            throw new HttpError(404, 'Replay não encontrado ou expirado')
        }

        const replay = result.rows[0]

        return {
            data: {
                id: replay.id,
                court: {
                    id: replay.courtId,
                    name: replay.courtName,
                },
                city: replay.city,
                recordedAt: new Date(replay.recordedAt).toISOString(),
                duration: replay.duration,
                videoUrl: await toMediaUrl(replay.videoUrl),
                expiresAt: new Date(replay.expiresAt).toISOString(),
            },
        }
    })
    r.get('/replays/:id/download', {
        ...docOnly, preHandler: requireAuth,
        schema: {
            tags: ['replays'], summary: 'Obter link de download', security,
            params: z.object({ id: z.guid() }),
            response: { 200: data(replayDownloadSchema), 400: errorSchema, 401: errorSchema, 404: errorSchema, 422: errorSchema },
        },
    }, async request => {
        const { id } = parse(replayParams, request.params)
        const result = await app.pg.query(`SELECT id_replay AS id, arquivo_url AS "downloadUrl", status
      FROM replay WHERE id_replay=$1 AND status <> 'excluido' AND expira_em > now()`, [id])
        if (!result.rowCount) throw new HttpError(404, 'Replay não encontrado ou expirado')
        const replay = result.rows[0]
        if (replay.status !== 'disponivel' || !replay.downloadUrl) throw new HttpError(422, 'Replay ainda não está disponível para download')
        const fileName = `replay-${id}.mp4`
        const downloadUrl = await toMediaUrl(replay.downloadUrl, fileName)
        await app.pg.query('INSERT INTO replay_download_event(id_replay,id_auth) VALUES($1,$2)', [id, request.authUser!.id])
        return { data: { id: replay.id, downloadUrl, fileName, format: 'MP4' as const } }
    })

    r.delete('/replays/:id', {
        ...docOnly,  preHandler: [requireAuth, requireRole('CLI', 'ADM')],
        schema: {
            tags: ['replays'], summary: 'Excluir replay', security,
            params: z.object({ id: z.guid() }),
            body: replayDeleteBodySchema,
            response: { 200: messageSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
        },
    }, async (request, reply) => {
        const { id } = parse(replayParams, request.params)
        const { reason } = parse(deleteSchema, request.body)
        const client = await app.pg.connect()
        try {
            await client.query('BEGIN')
            const result = await client.query(`SELECT r.status, r.expira_em,
        EXISTS(SELECT 1 FROM usuario_auth ua WHERE ua.id_usuario=a.id_gestor AND ua.id_auth=$2) AS owner,
        EXISTS(SELECT 1 FROM usuario_auth ua JOIN administrador ad ON ad.id_usuario=ua.id_usuario WHERE ua.id_auth=$2) AS admin
        FROM replay r JOIN quadra q ON q.id_quadra=r.id_quadra JOIN arena a ON a.id_arena=q.id_arena
        WHERE r.id_replay=$1 FOR UPDATE OF r`, [id, request.authUser!.id])
            const replay = result.rows[0]
            if (!replay || replay.status === 'excluido' || new Date(replay.expira_em) <= new Date()) throw new HttpError(404, 'Replay não encontrado ou expirado')
            if (!replay.owner && !replay.admin) throw new HttpError(403, 'Apenas o proprietário da quadra ou um administrador pode excluir o replay')
            await client.query(`INSERT INTO media_deletion_job(id_replay,arquivo_url,motivo) SELECT id_replay,arquivo_url,$2 FROM replay WHERE id_replay=$1 AND arquivo_url IS NOT NULL ON CONFLICT(id_replay) DO NOTHING`, [id, reason])
            await client.query(`UPDATE replay SET status='excluido', arquivo_url=NULL WHERE id_replay=$1`, [id])
            await client.query(`INSERT INTO replay_auditoria(id_replay,id_auth,motivo) VALUES($1,$2,$3)`, [id, request.authUser!.id, reason])
            await client.query('COMMIT')
            return reply.code(200).send({ message: 'Replay excluído com sucesso' })
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        } finally { client.release() }
    })
}
