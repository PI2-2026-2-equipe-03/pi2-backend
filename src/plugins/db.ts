
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
  fastify.log.info('[DB] Iniciando plugin')

  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL não definida')
  }

  fastify.log.info('[DB] Variável de conexão encontrada')
  fastify.log.info('[DB] Criando pool PostgreSQL')

  const pool = createPostgresPool(
    connectionString,
    Number(process.env.DB_POOL_MAX ?? 1),
  )

  pool.on('error', (err) => {
    fastify.log.error(err, '[DB] Erro no pool PostgreSQL')
  })

  try {
    fastify.log.info('[DB] Executando SELECT 1')
    await pool.query('SELECT 1')
    fastify.log.info('[DB] SELECT 1 concluído')

    fastify.decorate('pg', pool)

    fastify.addHook('onClose', async (instance) => {
      await instance.pg.end()
    })

    fastify.log.info('[DB] Plugin concluído')
  } catch (error) {
    fastify.log.error(error, '[DB] Falha na conexão PostgreSQL')
    await pool.end()
    throw error
  }
})
