import { authPool } from '../lib/auth.js'

export async function analisarCadastroIncompleto(authUserId: string) {
  const result = await authPool.query(
    `
    SELECT
      a.id,
      a.email,
      a.name,
      ua.id_usuario,
      u.id_usuario AS usuario_existente
    FROM "user" a
    LEFT JOIN usuario_auth ua
      ON ua.id_auth = a.id
    LEFT JOIN usuario u
      ON lower(u.email) = lower(a.email)
    WHERE a.id = $1
    `,
    [authUserId]
  )

  if (result.rows.length === 0) {
    return { situacao: 'NAO_ENCONTRADO' }
  }

  const conta = result.rows[0]

  if (conta.id_usuario) {
    return { situacao: 'JA_VINCULADO' }
  }

  if (conta.usuario_existente) {
    return { situacao: 'EXIGE_REVISAO_MANUAL' }
  }

  return {
    situacao: 'CANDIDATO_RECUPERACAO',
    authUserId: conta.id,
  }
}
