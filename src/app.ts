import Fastify from 'fastify'
import dbPlugin from './plugins/db.js'
import cors from '@fastify/cors'

import { authController } from './controllers/auth.controller.js'
import { replaysController } from './controllers/replays.controller.js'

export const app = Fastify({
  logger: true,
})

await app.register(dbPlugin)
await app.register(cors, { origin: true })
app.register(authController)
app.register(replaysController)

app.get('/health', async () => {
  return {
    status: 'ok',
  }
})
