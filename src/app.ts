import Fastify from 'fastify'
import dbPlugin from './plugins/db.js'

export const app = Fastify({
  logger: true,
})

await app.register(dbPlugin)

app.get('/health', async () => {
  return {
    status: 'ok',
  }
})