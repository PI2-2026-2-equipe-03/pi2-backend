console.log('[BOOT] Carregando server.ts')

import Fastify from 'fastify'
import { app } from './application.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

console.log('[BOOT] VERCEL:', process.env.VERCEL)
console.log('[BOOT] Iniciando Fastify')

app.listen({ port, host })
  .then((address) => {
    app.log.info(`Servidor iniciado em ${address}`)
  })
  .catch((error) => {
    app.log.error(error)
    throw error
  })

export default app
