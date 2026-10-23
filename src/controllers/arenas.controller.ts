import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { parse } from "../http/errors.js";
import { docOnly } from "../schemas/doc-only.js";
import { arenaSchema, arenasQuerySchema, data, errorSchema } from "../schemas/api.js";

export async function arenasController(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/arenas",
    {
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
}