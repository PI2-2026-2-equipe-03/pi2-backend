import fp from 'fastify-plugin'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

export default fp(async (app) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'TaGravado API', version: '1.0.0' },
      tags: [
        { name: 'auth', description: 'Autenticação (Better Auth)' },
        { name: 'replays', description: 'Replays das quadras' },
        { name: 'arenas', description: 'Arenas' },
        { name: 'quadras', description: 'Quadras' },
        { name: 'sponsors', description: 'Patrocinadores' },
        { name: 'metrics', description: 'Métricas de administrador e gestor' },
      ],
      components: {
        securitySchemes: {
          cookieAuth: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token' },
        },
      },
    },
    transform: (args) => {
      try {
        return jsonSchemaTransform(args)
      } catch (err) {
        app.log.error({ url: args.url, method: args.route.method }, 'schema Zod inválido')
        throw err
      }
    },
  })

  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger())
})