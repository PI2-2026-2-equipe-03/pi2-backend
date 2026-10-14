import { authPool } from '../lib/auth.js'

export async function verificarIntegridadeAuth() {
  const result = await authPool.query(`
    SELECT
      u.id,
      u.email
    FROM "user" u
    LEFT JOIN usuario_auth ua
      ON ua.id_auth = u.id
    WHERE ua.id_auth IS NULL
    ORDER BY u.email
  `)

  return result.rows
}
