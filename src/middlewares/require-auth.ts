
import type {
  FastifyRequest,
  FastifyReply,
} from "fastify";

import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { authPool } from "../lib/auth.js";

// Adiciona o usuário autenticado aos tipos do Fastify.
declare module "fastify" {
  interface FastifyRequest {
    authUser?: {
      id: string;
      name: string;
      email: string;
    };
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  if (!session) {
    return reply.code(401).send({
      message: "Sessão inválida ou expirada",
    });
  }

const vinculo = await authPool.query(
  `SELECT id_usuario
   FROM usuario_auth
   WHERE id_auth = $1`,
  [session.user.id]
);

if (vinculo.rows.length === 0) {
  return reply.code(403).send({
    message: "Cadastro do usuário incompleto",
  });
}

  request.authUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
}
