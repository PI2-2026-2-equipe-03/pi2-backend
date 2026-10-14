
import { authPool } from "../lib/auth.js";

export async function podeGerenciarQuadra(
  authUserId: string,
  quadraId: string
): Promise<boolean> {
  const result = await authPool.query(
    `
    SELECT 1
    FROM usuario_auth ua
    JOIN gestor_arena ga
      ON ga.id_usuario = ua.id_usuario
    JOIN arena a
      ON a.id_gestor = ga.id_usuario
    JOIN quadra q
      ON q.id_arena = a.id_arena
    WHERE ua.id_auth = $1
      AND q.id_quadra = $2
    LIMIT 1
    `,
    [authUserId, quadraId]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function podeBaixarReplay(
  authUserId: string,
  replayId: string
): Promise<boolean> {
  const result = await authPool.query(
    `
    SELECT 1
    FROM usuario_auth ua
    JOIN gestor_arena ga
      ON ga.id_usuario = ua.id_usuario
    JOIN arena a
      ON a.id_gestor = ga.id_usuario
    JOIN quadra q
      ON q.id_arena = a.id_arena
    JOIN replay r
      ON r.id_quadra = q.id_quadra
    WHERE ua.id_auth = $1
      AND r.id_replay = $2
      AND r.status = 'disponivel'
      AND r.expira_em > NOW()
    LIMIT 1
    `,
    [authUserId, replayId]
  );

  return (result.rowCount ?? 0) > 0;
}
