import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { HttpError, parse, uuid, replayParams } from "../http/errors.js";
import { docOnly } from "../schemas/doc-only.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { requireRole } from "../middlewares/require-role.js";
import {
    data, errorSchema, messageSchema, cameraSchema, camerasQuerySchema,
    cameraCreateBodySchema, cameraUpdateBodySchema,
} from "../schemas/api.js";

const security: { [key: string]: string[] }[] = [{ bearerAuth: [] }, { cookieAuth: [] }];
const status = z.enum(["ativa", "inativa", "manutencao"]);
const querySchema = z.object({ quadraId: uuid.optional(), status: status.optional() }).strict();
const createSchema = z.object({
    quadraId: uuid, identificador: z.string().trim().min(1).max(100), status: status.optional(),
}).strict();
const updateSchema = z.object({
    identificador: z.string().trim().min(1).max(100).optional(), status: status.optional(),
}).strict().refine(v => Object.keys(v).length > 0, "Informe ao menos um campo");

const COLS = `c.id_camera AS id, c.id_quadra AS "quadraId", c.identificador, c.status`;
const permissao = `
  EXISTS(SELECT 1 FROM usuario_auth ua WHERE ua.id_usuario = a.id_gestor AND ua.id_auth = $2) AS owner,
  EXISTS(SELECT 1 FROM usuario_auth ua JOIN administrador ad ON ad.id_usuario = ua.id_usuario WHERE ua.id_auth = $2) AS admin`;
const FROM = `camera c JOIN quadra q ON q.id_quadra = c.id_quadra JOIN arena a ON a.id_arena = q.id_arena`;
const erros = { 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema };
const idParams = replayParams;
const pre = { preHandler: [requireAuth, requireRole("CLI", "ADM")] };

export async function camerasController(app: FastifyInstance) {
    const r = app.withTypeProvider<ZodTypeProvider>();

    async function carregar(id: string, authId: string) {
        const found = await app.pg.query(
            `SELECT ${permissao} FROM ${FROM} WHERE c.id_camera = $1`, [id, authId]);
        if (!found.rowCount) throw new HttpError(404, "Câmera não encontrada");
        if (!found.rows[0].owner && !found.rows[0].admin)
            throw new HttpError(403, "Você não tem permissão para gerenciar esta câmera");
    }

    r.get("/cameras", {
        ...docOnly, ...pre,
        schema: { tags: ["cameras"], summary: "Listar câmeras", security, querystring: camerasQuerySchema,
            response: { 200: data(z.array(cameraSchema)), ...erros } },
    }, async request => {
        const { quadraId, status: st } = parse(camerasQuerySchema, request.query);
        const result = await app.pg.query(
            `SELECT ${COLS} FROM ${FROM}
             WHERE ($1::uuid IS NULL OR c.id_quadra = $1) AND ($2::text IS NULL OR c.status = $2)
               AND (EXISTS(SELECT 1 FROM usuario_auth ua JOIN administrador ad ON ad.id_usuario = ua.id_usuario WHERE ua.id_auth = $3)
                 OR EXISTS(SELECT 1 FROM usuario_auth ua WHERE ua.id_usuario = a.id_gestor AND ua.id_auth = $3))
             ORDER BY c.identificador, c.id_camera`,
            [quadraId ?? null, st ?? null, request.authUser!.id]);
        return { data: result.rows };
    });

    r.get("/cameras/:id", {
        ...docOnly, ...pre,
        schema: { tags: ["cameras"], summary: "Consultar câmera", security, params: idParams,
            response: { 200: data(cameraSchema), ...erros } },
    }, async request => {
        const { id } = parse(replayParams, request.params);
        await carregar(id, request.authUser!.id);
        const result = await app.pg.query(`SELECT ${COLS} FROM camera c WHERE c.id_camera = $1`, [id]);
        return { data: result.rows[0] };
    });

    r.post("/cameras", {
        ...docOnly, ...pre,
        schema: { tags: ["cameras"], summary: "Cadastrar câmera", security, body: cameraCreateBodySchema,
            response: { 201: data(cameraSchema), ...erros } },
    }, async (request, reply) => {
        const { quadraId, identificador, status: st } = parse(cameraCreateBodySchema, request.body);
        const found = await app.pg.query(
            `SELECT ${permissao} FROM quadra q JOIN arena a ON a.id_arena = q.id_arena WHERE q.id_quadra = $1`,
            [quadraId, request.authUser!.id]);
        if (!found.rowCount) throw new HttpError(404, "Quadra não encontrada");
        if (!found.rows[0].owner && !found.rows[0].admin)
            throw new HttpError(403, "Você não tem permissão para gerenciar esta quadra");
        const result = await app.pg.query(
            `INSERT INTO camera (id_quadra, identificador, status) VALUES ($1, $2, COALESCE($3, 'ativa'))
             RETURNING id_camera AS id, id_quadra AS "quadraId", identificador, status`,
            [quadraId, identificador, st ?? null]);
        return reply.code(201).send({ data: result.rows[0] });
    });

    r.patch("/cameras/:id", {
        ...docOnly, ...pre,
        schema: { tags: ["cameras"], summary: "Editar câmera", security, params: idParams, body: cameraUpdateBodySchema,
            response: { 200: data(cameraSchema), ...erros } },
    }, async request => {
        const { id } = parse(replayParams, request.params);
        const body = parse(cameraUpdateBodySchema, request.body);
        await carregar(id, request.authUser!.id);
        const result = await app.pg.query(
            `UPDATE camera c SET identificador = COALESCE($2, identificador), status = COALESCE($3, status)
             WHERE c.id_camera = $1 RETURNING ${COLS}`,
            [id, body.identificador ?? null, body.status ?? null]);
        return { data: result.rows[0] };
    });

    r.delete("/cameras/:id", {
        ...docOnly, ...pre,
        schema: { tags: ["cameras"], summary: "Excluir câmera", security, params: idParams,
            response: { 200: messageSchema, ...erros } },
    }, async request => {
        const { id } = parse(replayParams, request.params);
        await carregar(id, request.authUser!.id);
        await app.pg.query("DELETE FROM camera WHERE id_camera = $1", [id]);
        return { message: "Câmera excluída com sucesso" };
    });
}