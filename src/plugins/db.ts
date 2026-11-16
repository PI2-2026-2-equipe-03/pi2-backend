import fp from 'fastify-plugin'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'
import { createPostgresPool } from '../lib/postgres.js'

declare module 'fastify' {
  interface FastifyInstance {
    pg: Pool
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const connectionString =
    process.env.REPLAY_DATABASE_URL ?? process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL não definida')
  }

  const pool = createPostgresPool(
    connectionString,
    Number(process.env.DB_POOL_MAX ?? 1),
  )

  pool.on('error', (err) => {
    fastify.log.error(err, 'Erro no pool do PostgreSQL')
  })

  await pool.query('SELECT 1')

  fastify.log.info('PostgreSQL conectado')
  fastify.decorate('pg', pool)

  fastify.addHook('onClose', async (instance) => {
    await instance.pg.end()
  })
})
