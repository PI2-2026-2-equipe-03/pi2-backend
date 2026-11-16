import Fastify from 'fastify'
import { app } from './application.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

export default app

if (!process.env.VERCEL) {
  app.listen({ port, host })
    .then((address) => {
      app.log.info(`Servidor iniciado em ${address}`)
    })
    .catch((error) => {
      app.log.error(error)
      process.exit(1)
    })
}