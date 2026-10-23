import type { FastifyRequest, FastifyReply } from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import { auth, authPool } from '../lib/auth.js'

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: { id: string; name: string; email: string }
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  // Verifica a atividade anterior antes de renovar para não ressuscitar sessões antigas.
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers), query: { disableRefresh: true } })
  if (!session || Date.now() - new Date(session.session.updatedAt).getTime() >= 30 * 60_000) {
    return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Sessão inválida ou expirada por inatividade' } })
  }
  const vinculo = await authPool.query('SELECT id_usuario FROM usuario_auth WHERE id_auth=$1', [session.user.id])
  if (!vinculo.rowCount) return reply.code(403).send({ error: { code: 'INCOMPLETE_ACCOUNT', message: 'Cadastro do usuário incompleto' } })
  const refreshed = await auth.api.getSession({ headers: fromNodeHeaders(request.headers), returnHeaders: true })
  if (!refreshed.response) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Sessão inválida ou expirada' } })
  const cookies = refreshed.headers.getSetCookie()
  if (cookies.length) reply.header('set-cookie', cookies)
  request.authUser = { id: session.user.id, name: session.user.name, email: session.user.email }
}
