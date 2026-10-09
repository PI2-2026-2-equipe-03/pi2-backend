import Fastify from 'fastify'
import dbPlugin from './plugins/db.js'

import { authController } from './controllers/auth.controller.js'
import { replaysController } from './controllers/replays.controller.js'

export const app = Fastify({
  logger: true,
})

await app.register(dbPlugin)

app.register(authController)
app.register(replaysController)

app.get('/health', async () => {
  return {
    status: 'ok',
  }
})
