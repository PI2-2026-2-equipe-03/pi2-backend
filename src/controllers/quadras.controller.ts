import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { parse, uuid } from "../http/errors.js";
import { docOnly } from "../schemas/doc-only.js";
import { data, errorSchema, quadraSchema, quadrasQuerySchema } from "../schemas/api.js";

export async function quadrasController(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/quadras",
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
}