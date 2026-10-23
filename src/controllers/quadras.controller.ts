import { z } from 'zod';
import { parse, uuid } from '../http/errors.js';

import type { FastifyInstance } from "fastify";

interface QuadrasQuery {
  arenaId?: string;
  disponivel?: string;
}

interface QuadraDto {
  id: string;
  arenaId: string;
  nome: string;
  disponivel: boolean;
}

export async function quadrasController(app: FastifyInstance) {
  app.get<{ Querystring: QuadrasQuery }>(
    "/quadras",
    async (request, reply) => {
      const { arenaId, disponivel } = parse(z.object({ arenaId: uuid.optional(), disponivel: z.enum(['true', 'false']).optional() }).strict(), request.query);

      const filtroArena = arenaId ?? null;
      const filtroDisponivel =
        disponivel === undefined
          ? null
          : disponivel === "true";

      try {
        const result = await app.pg.query<QuadraDto>(
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

        return reply.code(200).send({
          data: result.rows,
        });
      } catch (error) {
        request.log.error(error, "Erro ao listar quadras");

        return reply.code(500).send({
          message: "Erro interno ao consultar quadras",
        });
      }
    }
  );
}
