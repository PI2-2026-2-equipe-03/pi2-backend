import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { parse, uuid } from "../http/errors.js";
import { docOnly } from "../schemas/doc-only.js";
import { data, errorSchema, quadraSchema, quadrasQuerySchema } from "../schemas/api.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { HttpError, replayParams } from "../http/errors.js";
import { messageSchema, quadraCreateBodySchema, quadraUpdateBodySchema } from "../schemas/api.js";

const security: { [key: string]: string[] }[] = [{ bearerAuth: [] }, { cookieAuth: [] }];
const createSchema = z.object({ arenaId: uuid, nome: z.string().trim().min(1).max(100) }).strict();
const updateSchema = z.object({
    nome: z.string().trim().min(1).max(100).optional(),
    disponivel: z.boolean().optional(),
}).strict().refine(v => Object.keys(v).length > 0, 'Informe ao menos um campo');

const COLS = `q.id_quadra AS id, q.id_arena AS "arenaId", q.nome, q.disponivel`;
const permissao = `
  EXISTS(SELECT 1 FROM usuario_auth ua WHERE ua.id_usuario = a.id_gestor AND ua.id_auth = $2) AS owner,
  EXISTS(SELECT 1 FROM usuario_auth ua JOIN administrador ad ON ad.id_usuario = ua.id_usuario WHERE ua.id_auth = $2) AS admin`;

export async function quadrasController(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>();

    r.get("/courts",
        {
            ...docOnly,
            schema: {
                tags: ["quadras"],
                summary: "Listar quadras",
                querystring: quadrasQuerySchema,
                response: {
                    200: data(z.array(quadraSchema)),
                    400: errorSchema,
                    500: errorSchema,
                },
            },
        },
        async (request, reply) => {
            const { arenaId, disponivel } = parse(
                z.object({ arenaId: uuid.optional(), disponivel: z.enum(["true", "false"]).optional() }).strict(),
                request.query
            );

            const filtroArena = arenaId ?? null;
            const filtroDisponivel =
                disponivel === undefined ? null : disponivel === "true";

            try {
                const result = await app.pg.query(
                    `
          SELECT
            id_quadra AS id,
            id_arena AS "arenaId",
            nome,
            disponivel
          FROM quadra
          WHERE
            ($1::uuid IS NULL OR id_arena = $1::uuid)
            AND
            ($2::boolean IS NULL OR disponivel = $2::boolean)
          ORDER BY nome ASC, id_quadra ASC
          `,
                    [filtroArena, filtroDisponivel]
                );

                return reply.code(200).send({ data: result.rows });
            } catch (error) {
                request.log.error(error, "Erro ao listar quadras");
                return reply.code(500).send({
                    error: { message: "Erro interno ao consultar quadras" },
                });
            }
        }
    );

    r.get("/courts/:id", {
        ...docOnly,
        schema: {
            tags: ["quadras"], summary: "Consultar quadra", params: z.object({ id: z.guid() }),
            response: { 200: data(quadraSchema), 400: errorSchema, 404: errorSchema }
        },
    }, async request => {
        const { id } = parse(replayParams, request.params);
        const result = await app.pg.query(`SELECT ${COLS} FROM quadra q WHERE q.id_quadra = $1`, [id]);
        if (!result.rowCount) throw new HttpError(404, "Quadra não encontrada");
        return { data: result.rows[0] };
    });

    r.post("/courts", {
        ...docOnly, preHandler: [requireAuth, requireRole("CLI", "ADM")],
        schema: {
            tags: ["quadras"], summary: "Cadastrar quadra", security, body: quadraCreateBodySchema,
            response: { 201: data(quadraSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema }
        },
    }, async (request, reply) => {
        const { arenaId, nome } = parse(createSchema, request.body);
        const arena = await app.pg.query(
            `SELECT ${permissao} FROM arena a WHERE a.id_arena = $1`, [arenaId, request.authUser!.id]);
        if (!arena.rowCount) throw new HttpError(404, "Arena não encontrada");
        if (!arena.rows[0].owner && !arena.rows[0].admin) throw new HttpError(403, "Você não tem permissão para gerenciar esta arena");
        const result = await app.pg.query(
            `INSERT INTO quadra (id_arena, nome) VALUES ($1, $2)
     RETURNING id_quadra AS id, id_arena AS "arenaId", nome, disponivel`, [arenaId, nome]);
        return reply.code(201).send({ data: result.rows[0] });
    });

    r.patch("/courts/:id", {
        ...docOnly, preHandler: [requireAuth, requireRole("CLI", "ADM")],
        schema: {
            tags: ["quadras"], summary: "Editar quadra", security, params: z.object({ id: z.guid() }), body: quadraUpdateBodySchema,
            response: { 200: data(quadraSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema }
        },
    }, async request => {
        const { id } = parse(replayParams, request.params);
        const body = parse(updateSchema, request.body);
        const found = await app.pg.query(
            `SELECT ${permissao} FROM quadra q JOIN arena a ON a.id_arena = q.id_arena WHERE q.id_quadra = $1`,
            [id, request.authUser!.id]);
        if (!found.rowCount) throw new HttpError(404, "Quadra não encontrada");
        if (!found.rows[0].owner && !found.rows[0].admin) throw new HttpError(403, "Você não tem permissão para gerenciar esta quadra");
        const result = await app.pg.query(
            `UPDATE quadra q SET nome = COALESCE($2, nome), disponivel = COALESCE($3, disponivel)
     WHERE q.id_quadra = $1 RETURNING ${COLS}`,
            [id, body.nome ?? null, body.disponivel ?? null]);
        return { data: result.rows[0] };
    });

    r.delete("/courts/:id", {
        ...docOnly, preHandler: [requireAuth, requireRole("CLI", "ADM")],
        schema: {
            tags: ["quadras"], summary: "Excluir quadra", security, params: z.object({ id: z.guid() }),
            response: { 200: messageSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema }
        },
    }, async request => {
        const { id } = parse(replayParams, request.params);
        const found = await app.pg.query(
            `SELECT ${permissao}, EXISTS(SELECT 1 FROM replay r WHERE r.id_quadra = q.id_quadra) AS has_replays
     FROM quadra q JOIN arena a ON a.id_arena = q.id_arena WHERE q.id_quadra = $1`,
            [id, request.authUser!.id]);
        if (!found.rowCount) throw new HttpError(404, "Quadra não encontrada");
        if (!found.rows[0].owner && !found.rows[0].admin) throw new HttpError(403, "Você não tem permissão para gerenciar esta quadra");
        if (found.rows[0].has_replays) throw new HttpError(409, "A quadra possui replays. Marque-a como indisponível em vez de excluir", "CONFLICT");
        await app.pg.query("DELETE FROM quadra WHERE id_quadra = $1", [id]);
        return { message: "Quadra excluída com sucesso" };
    });
}