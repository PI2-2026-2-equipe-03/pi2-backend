import type { FastifyRequest, FastifyReply } from 'fastify'
import { authPool } from '../lib/auth.js'

type Perfil = 'ADM' | 'CLI' | 'USR'

export function requireRole(...perfisPermitidos: Perfil[]) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    if (!request.authUser) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Você precisa estar autenticado',
        },
      })
    }

    const result = await authPool.query<{ codigo: string }>(
      `SELECT p.codigo
       FROM usuario_auth ua
       JOIN usuario u ON u.id_usuario = ua.id_usuario
       JOIN perfil p ON p.id_perfil = u.id_perfil
       WHERE ua.id_auth = $1`,
      [request.authUser.id],
    )

    const perfil = result.rows[0]?.codigo

    if (!perfisPermitidos.some(permitido => permitido === perfil)) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Seu perfil não tem permissão para acessar este recurso',
        },
      })
    }
  }
}