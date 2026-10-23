import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { authPool } from '../lib/auth.js'
import { HttpError, parse, strongPassword } from '../http/errors.js'

const emailSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email({ error: 'Informe um e-mail válido' })) }).strict()
const resetSchema = z.object({ token: z.string().regex(/^[0-9a-f-]{36}\.\d{6}$/i, 'Informe o token recebido por e-mail'), password: z.string(), passwordConfirmation: z.string() }).strict()
const tokenHash = (token: string) => createHmac('sha256', process.env.BETTER_AUTH_SECRET!).update(token).digest('hex')

function deliveryUrl() {
  const configured = process.env.EMAIL_DELIVERY_URL
  if (!configured) throw new HttpError(503, 'O serviço de recuperação de senha não está configurado')
  const url = new URL(configured)
  const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new HttpError(503, 'O serviço de e-mail deve usar HTTPS')
  return url
}

export async function passwordRecoveryController(app: FastifyInstance) {
  app.post('/auth/forgot-password', async (request, reply) => {
    const { email } = parse(emailSchema, request.body)
    const url = deliveryUrl()
    if (!process.env.BETTER_AUTH_SECRET) throw new HttpError(503, 'Configuração de autenticação incompleta')
    const client = await authPool.connect()
    try {
      await client.query('BEGIN')
      // Ordem fixa dos locks de e-mail e IP evita deadlocks entre destinatários.
      for (const key of ['recovery-email:' + email, 'recovery-ip:' + request.ip]) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key])
      }
      const recent = await client.query(`SELECT count(*) FILTER(WHERE email=$1)::int AS email_count,
        count(*) FILTER(WHERE ip=$2)::int AS ip_count FROM password_recovery_request
        WHERE criado_em>now()-INTERVAL '1 hour' AND (email=$1 OR ip=$2)`, [email,request.ip])
      if (recent.rows[0].email_count >= 3 || recent.rows[0].ip_count >= 20) throw new HttpError(429, 'Limite de solicitações de recuperação atingido. Tente novamente em uma hora')
      await client.query('INSERT INTO password_recovery_request(email,ip) VALUES($1,$2)', [email,request.ip])
      const user = await client.query('SELECT id FROM "user" WHERE lower(email)=$1', [email])
      if (user.rowCount) {
        const id = randomUUID()
        const token = `${id}.${randomInt(0,1000000).toString().padStart(6,'0')}`
        await client.query('UPDATE password_recovery SET used_at=now() WHERE id_auth=$1 AND used_at IS NULL', [user.rows[0].id])
        await client.query('INSERT INTO password_recovery(id,id_auth,token_hash) VALUES($1,$2,$3)', [id,user.rows[0].id,tokenHash(token)])
        try {
          const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
            headers: { 'content-type': 'application/json', ...(process.env.EMAIL_DELIVERY_TOKEN ? { authorization: `Bearer ${process.env.EMAIL_DELIVERY_TOKEN}` } : {}) },
            body: JSON.stringify({ to: email, template: 'password-recovery', token, expiresIn: 600, idempotencyKey: id }),
          })
          if (!response.ok) throw new Error('Falha na entrega')
          await response.body?.cancel()
        } catch { throw new HttpError(503, 'Não foi possível enviar o e-mail de recuperação. Tente novamente mais tarde') }
      }
      await client.query('COMMIT')
      return reply.code(200).send({ message: 'Se o e-mail estiver cadastrado, uma mensagem de recuperação será enviada.' })
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  })

  app.post('/auth/reset-password', async (request, reply) => {
    const { token,password,passwordConfirmation } = parse(resetSchema, request.body)
    parse(strongPassword, password, 422)
    if (password !== passwordConfirmation) throw new HttpError(422, 'As senhas não coincidem')
    const client = await authPool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query('SELECT * FROM password_recovery WHERE id=$1 FOR UPDATE', [token.split('.')[0]])
      const recovery = result.rows[0]
      if (!recovery || recovery.used_at) throw new HttpError(401, 'Token de recuperação inválido ou já utilizado')
      if (new Date(recovery.expires_at) <= new Date()) throw new HttpError(401, 'Código expirado')
      if (recovery.attempts >= 3) throw new HttpError(429, 'Limite de tentativas de recuperação atingido')
      if (!timingSafeEqual(Buffer.from(recovery.token_hash, 'hex'), Buffer.from(tokenHash(token), 'hex'))) {
        await client.query('UPDATE password_recovery SET attempts=attempts+1 WHERE id=$1', [recovery.id])
        await client.query('COMMIT')
        return reply.code(recovery.attempts === 2 ? 429 : 401).send({ error: { code: 'INVALID_RECOVERY_CODE', message: 'Código inválido ou limite de tentativas atingido' } })
      }
      const account = await client.query(`SELECT id,password FROM account WHERE "userId"=$1 AND "providerId"='credential' FOR UPDATE`, [recovery.id_auth])
      if (!account.rowCount) throw new HttpError(401, 'Não foi possível redefinir a senha desta conta')
      if (await verifyPassword({ password, hash: account.rows[0].password })) throw new HttpError(422, 'A nova senha deve ser diferente da anterior')
      await client.query('UPDATE account SET password=$1,"updatedAt"=now() WHERE id=$2', [await hashPassword(password),account.rows[0].id])
      await client.query('UPDATE password_recovery SET used_at=now() WHERE id_auth=$1 AND used_at IS NULL', [recovery.id_auth])
      await client.query('DELETE FROM "session" WHERE "userId"=$1', [recovery.id_auth])
      await client.query('DELETE FROM auth_login_attempt WHERE email=(SELECT lower(email) FROM "user" WHERE id=$1)', [recovery.id_auth])
      await client.query('COMMIT')
      return reply.code(200).send({ message: 'Senha redefinida com sucesso' })
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  })
}
