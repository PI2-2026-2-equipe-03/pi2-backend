import type { FastifyReply, FastifyRequest } from 'fastify'
import { HttpError } from '../http/errors.js'
import { hashAgentToken } from '../lib/agent-token.js'

declare module 'fastify' {
  interface FastifyRequest {
    agent?: { id: string; arenaId: string }
  }
}

// Autentica o agente da arena pelo token (Bearer) e registra o último contato.
export async function requireAgent(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Token do agente ausente' } })

  const { rows } = await request.server.pg.query(
    `UPDATE agente SET ultimo_contato_em = now()
      WHERE token_hash = $1 AND ativo
      RETURNING id_agente, id_arena`,
    [hashAgentToken(token)],
  )
  if (!rows[0]) return reply.code(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Token do agente inválido ou inativo' } })

  request.agent = { id: rows[0].id_agente, arenaId: rows[0].id_arena }
}

// Garante que o recurso pertence à arena do agente autenticado.
export function assertAgentArena(request: FastifyRequest, arenaId: string) {
  if (!request.agent || request.agent.arenaId !== arenaId) {
    throw new HttpError(403, 'Recurso pertence a outra arena', 'FORBIDDEN')
  }
}
