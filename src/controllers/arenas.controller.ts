import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { docOnly } from "../schemas/doc-only.js";
import { arenaSchema, arenasQuerySchema, data, errorSchema } from "../schemas/api.js";
import { HttpError, parse, uuid } from "../http/errors.js";
import { requireAuth } from "../middlewares/require-auth.js";
import { requireRole } from "../middlewares/require-role.js";
import { arenaCreateBodySchema, arenaUpdateBodySchema, messageSchema } from "../schemas/api.js";

const COLS = `id_arena AS id, id_gestor AS "clienteId", nome, cidade, endereco, foto_url AS "fotoUrl"`;
const security: { [key: string]: string[] }[] = [{ bearerAuth: [] }, { cookieAuth: [] }];
const paramsSchema = z.object({ id: uuid });
const fotoUrl = z.string().trim().max(500).nullable().optional();
const createSchema = z.object({
    nome: z.string().trim().min(2).max(150),
    cidade: z.string().trim().min(2).max(100),
    endereco: z.string().trim().min(2).max(255),
    fotoUrl,
    clienteId: uuid.optional(),
}).strict();
const updateSchema = z.object({
    nome: z.string().trim().min(2).max(150).optional(),
    cidade: z.string().trim().min(2).max(100).optional(),
    endereco: z.string().trim().min(2).max(255).optional(),
    fotoUrl,
}).strict().refine(b => Object.keys(b).length > 0, "Informe ao menos um campo");

async function quemSou(app: FastifyInstance, authId: string) {
    const r = await app.pg.query(
        `SELECT ua.id_usuario AS id, p.codigo FROM usuario_auth ua
     JOIN usuario u ON u.id_usuario = ua.id_usuario
     JOIN perfil p ON p.id_perfil = u.id_perfil WHERE ua.id_auth = $1`,
        [authId]
    );
    return r.rows[0] as { id: string; codigo: "ADM" | "CLI" | "USR" };
}

export async function arenasController(app: FastifyInstance) {
    const erros = { 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema };
    const r = app.withTypeProvider<ZodTypeProvider>();

    r.get("/arenas", {
        ...docOnly,
        schema: {
            tags: ["arenas"],
            summary: "Listar arenas",
            querystring: arenasQuerySchema,
            response: {
                200: data(z.array(arenaSchema)),
                400: errorSchema,
                500: errorSchema,
            },
        },
    },
        async (request, reply) => {
            const { cidade, q } = parse(
                z.object({
                    cidade: z.string().trim().max(100).optional(),
                    q: z.string().trim().max(150).optional(),
                }).strict(),
                request.query
            );

            const cidadeFiltro = cidade?.trim() || null;
            const nomeFiltro = q?.trim() || null;

            try {
                const result = await app.pg.query(
                    `
          SELECT
            id_arena AS id,
            id_gestor AS "clienteId",
            nome,
            cidade,
            endereco,
            foto_url AS "fotoUrl"
          FROM arena
          WHERE
            ($1::text IS NULL OR cidade ILIKE '%' || $1 || '%')
            AND
            ($2::text IS NULL OR nome ILIKE '%' || $2 || '%')
          ORDER BY nome ASC, id_arena ASC
          `,
                    [cidadeFiltro, nomeFiltro]
                );

                return reply.code(200).send({ data: result.rows });
            } catch (error) {
                request.log.error(error, "Erro ao listar arenas");
                return reply.code(500).send({
                    error: { message: "Erro interno ao consultar arenas" },
                });
            }
        }
    );

    r.get("/arenas/:id", {
        ...docOnly,
        schema: {
            tags: ["arenas"], summary: "Consultar arena", params: z.object({ id: z.guid() }),
            response: { 200: data(arenaSchema), 400: errorSchema, 404: errorSchema }
        },
    }, async request => {
        const { id } = parse(paramsSchema, request.params);
        const result = await app.pg.query(`SELECT ${COLS} FROM arena WHERE id_arena = $1`, [id]);
        if (!result.rowCount) throw new HttpError(404, "Arena não encontrada");
        return { data: result.rows[0] };
    });

    r.post("/arenas", {
        ...docOnly, preHandler: [requireAuth, requireRole("CLI", "ADM")],
        schema: {
            tags: ["arenas"], summary: "Cadastrar arena", security, body: arenaCreateBodySchema,
            response: { 201: data(arenaSchema), ...erros }
        },
    }, async (request, reply) => {
        const body = parse(createSchema, request.body);
        const me = await quemSou(app, request.authUser!.id);
        if (me.codigo === "CLI" && body.clienteId && body.clienteId !== me.id)
            throw new HttpError(403, "Você só pode cadastrar arenas para si mesmo");
        const gestorId = me.codigo === "ADM" ? body.clienteId : me.id;
        if (!gestorId) throw new HttpError(400, "clienteId: obrigatório para administradores");
        const gestor = await app.pg.query(`SELECT 1 FROM gestor_arena WHERE id_usuario = $1`, [gestorId]);
        if (!gestor.rowCount) throw new HttpError(404, "Gestor não encontrado");
        const result = await app.pg.query(
            `INSERT INTO arena (id_gestor, nome, cidade, endereco, foto_url)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
            [gestorId, body.nome, body.cidade, body.endereco, body.fotoUrl ?? null]
        );
        return reply.code(201).send({ data: result.rows[0] });
    });

    r.patch("/arenas/:id", {
        ...docOnly, preHandler: [requireAuth, requireRole("CLI", "ADM")],
        schema: {
            tags: ["arenas"], summary: "Editar arena", security, params: z.object({ id: z.guid() }),
            body: arenaUpdateBodySchema, response: { 200: data(arenaSchema), ...erros }
        },
    }, async request => {
        const { id } = parse(paramsSchema, request.params);
        const body = parse(updateSchema, request.body);
        const me = await quemSou(app, request.authUser!.id);
        const arena = await app.pg.query(`SELECT id_gestor FROM arena WHERE id_arena = $1`, [id]);
        if (!arena.rowCount) throw new HttpError(404, "Arena não encontrada");
        if (me.codigo === "CLI" && arena.rows[0].id_gestor !== me.id)
            throw new HttpError(403, "Você não tem permissão para gerenciar esta arena");
        const colunas = { nome: "nome", cidade: "cidade", endereco: "endereco", fotoUrl: "foto_url" } as const;
        const sets: string[] = [];
        const values: unknown[] = [];
        for (const [campo, coluna] of Object.entries(colunas)) {
            if (campo in body) {
                values.push(body[campo as keyof typeof body]);
                sets.push(`${coluna} = $${values.length}`);
            }
        }
        values.push(id);
        const result = await app.pg.query(
            `UPDATE arena SET ${sets.join(", ")} WHERE id_arena = $${values.length} RETURNING ${COLS}`,
            values
        );
        return { data: result.rows[0] };
    });

    r.delete("/arenas/:id", {
        ...docOnly, preHandler: [requireAuth, requireRole("CLI", "ADM")],
        schema: {
            tags: ["arenas"], summary: "Excluir arena", security, params: z.object({ id: z.guid() }),
            response: { 200: messageSchema, ...erros }
        },
    }, async request => {
        const { id } = parse(paramsSchema, request.params);
        const me = await quemSou(app, request.authUser!.id);
        const client = await app.pg.connect();
        try {
            await client.query("BEGIN");
            const arena = await client.query(`SELECT id_gestor FROM arena WHERE id_arena = $1 FOR UPDATE`, [id]);
            if (!arena.rowCount) throw new HttpError(404, "Arena não encontrada");
            if (me.codigo === "CLI" && arena.rows[0].id_gestor !== me.id)
                throw new HttpError(403, "Você não tem permissão para gerenciar esta arena");
            const quadras = await client.query(`SELECT 1 FROM quadra WHERE id_arena = $1 LIMIT 1`, [id]);
            if (quadras.rowCount)
                throw new HttpError(409, "Arena possui quadras. Exclua as quadras antes de excluir a arena", "CONFLICT");
            await client.query(`DELETE FROM arena WHERE id_arena = $1`, [id]);
            await client.query("COMMIT");
            return { message: "Arena excluída com sucesso" };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    });
}