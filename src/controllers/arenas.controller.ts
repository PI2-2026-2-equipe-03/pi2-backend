
import type { FastifyInstance } from "fastify";

interface ArenasQuery {
  cidade?: string;
  q?: string;
}

interface ArenaDto {
  id: string;
  clienteId: string;
  nome: string;
  cidade: string;
  endereco: string;
  fotoUrl: string | null;
}

export async function arenasController(app: FastifyInstance) {
  app.get<{ Querystring: ArenasQuery }>(
    "/arenas",
    async (request, reply) => {
      const { cidade, q } = request.query;

      const cidadeFiltro = cidade?.trim() || null;
      const nomeFiltro = q?.trim() || null;

      try {
        const result = await app.pg.query<ArenaDto>(
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

        return reply.code(200).send({
          data: result.rows,
        });
      } catch (error) {
        request.log.error(error, "Erro ao listar arenas");

        return reply.code(500).send({
          message: "Erro interno ao consultar arenas",
        });
      }
    }
  );
}
