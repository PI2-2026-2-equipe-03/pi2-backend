import fp from 'fastify-plugin'
import { deleteStoredMedia, expireReplays } from '../services/replay-retention.js'

export default fp(async app => {
  let running: Promise<unknown> | undefined
  const run = () => {
    if (!running) running = expireReplays(app.pg).then(() => deleteStoredMedia(app.pg))
      .catch(error => app.log.error(error, 'Falha na retenção de mídias; pendências preservadas para nova tentativa'))
      .finally(() => { running = undefined })
    return running
  }
  const timer = setInterval(run, 24 * 60 * 60 * 1000)
  timer.unref()
  app.addHook('onReady', async () => { await run() })
  app.addHook('onClose', async () => { clearInterval(timer); await running })
})
