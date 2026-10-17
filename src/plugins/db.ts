import fp from "fastify-plugin";
import { Pool } from "pg";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    pg: Pool;
  }
}

export default fp(async (fastify: FastifyInstance) => {
const pool = new Pool({
  connectionString:
    process.env.REPLAY_DATABASE_URL ??
    process.env.DATABASE_URL,
});
  await pool.query("SELECT 1");

  fastify.decorate("pg", pool);

  fastify.addHook("onClose", async (instance) => {
    await instance.pg.end();
  });
});
