
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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function quadrasController(app: FastifyInstance) {
  app.get<{ Querystring: QuadrasQuery }>(
    "/quadras",
    async (request, reply) => {
      const { arenaId, disponivel } = request.query;

      // Validar o identificador da arena
      if (arenaId !== undefined && !UUID_REGEX.test(arenaId)) {
        return reply.code(400).send({
          message: "arenaId deve ser um UUID válido",
        });
      }

      // Validar disponibilidade
      if (
        disponivel !== undefined &&
        disponivel !== "true" &&
        disponivel !== "false"
      ) {
        return reply.code(400).send({
          message: "disponivel deve ser true ou false",
        });
      }

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
