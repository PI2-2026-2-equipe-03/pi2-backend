import fp from 'fastify-plugin'
import { handleAuth } from '../controllers/auth.controller.js'
export default fp(async app => {
  app.route({ method: ['GET', 'POST'], url: '/api/auth/*', handler: (request, reply) => handleAuth(request, reply) })
})
