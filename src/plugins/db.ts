import fp from "fastify-plugin";
import pg, { Pool } from "pg";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    pg: Pool;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const connectionString =
    process.env.REPLAY_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) throw new Error("DATABASE_URL não definida");

  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 5000),
  });

  pool.on("error", (err) =>
    fastify.log.error(err, "Erro no pool do PostgreSQL"),
  );

  await pool.query("SELECT 1");
  fastify.log.info("PostgreSQL conectado");

  fastify.decorate("pg", pool);
  fastify.addHook("onClose", async (instance) => {
    await instance.pg.end();
  });
});