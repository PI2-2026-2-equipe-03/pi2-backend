import type { Pool, PoolClient } from 'pg'
import { authPool } from '../lib/auth.js'

type Database = Pick<Pool | PoolClient, 'query'>
export async function registrarFalha(email: string, ip = 'unknown', db: Database = authPool) {
  const result = await db.query(`INSERT INTO auth_login_attempt(email,ip,tentativas_login)
    VALUES(lower($1),$2,1)
    ON CONFLICT(email,ip) DO UPDATE SET
      tentativas_login=CASE WHEN auth_login_attempt.bloqueado_ate <= now() THEN 1
        ELSE LEAST(auth_login_attempt.tentativas_login+1,5) END,
      bloqueado_ate=CASE WHEN auth_login_attempt.bloqueado_ate <= now() THEN NULL
        WHEN auth_login_attempt.tentativas_login+1 >= 5 THEN now()+INTERVAL '15 minutes' ELSE NULL END
    RETURNING tentativas_login,bloqueado_ate`, [email, ip])
  return { bloqueado: Boolean(result.rows[0]?.bloqueado_ate), tentativas: result.rows[0]?.tentativas_login ?? null }
}

export async function limparTentativas(email: string, ip = 'unknown', db: Database = authPool) {
  await db.query('DELETE FROM auth_login_attempt WHERE email=lower($1) AND ip=$2', [email, ip])
}
