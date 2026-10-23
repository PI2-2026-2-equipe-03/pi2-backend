import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import { z } from 'zod'
import { auth, authPool, authLockPool } from '../lib/auth.js'
import { HttpError, parse, phone, strongPassword } from '../http/errors.js'
import { registrarFalha, limparTentativas } from '../services/account-lockout.js'

const signup = z.object({ name: z.string().trim().min(2, 'Informe o nome completo').max(150),
  email: z.string().trim().toLowerCase().pipe(z.email({ error: 'Informe um e-mail válido' })), phone,
  password: z.string().min(1), confirmPassword: z.string().optional(), image: z.url().optional(),
  callbackURL: z.string().optional(), rememberMe: z.boolean().optional(),
}).strict()
const login = z.object({ email: z.string().trim().toLowerCase().pipe(z.email({ error: 'Informe um e-mail válido' })),
  password: z.string().min(1).max(128), rememberMe: z.boolean().optional(), callbackURL: z.string().optional(),
}).strict()

async function handleAuthUnlocked(request: FastifyRequest, reply: FastifyReply, path?: string) {
  const pathname = path ?? new URL(request.url, 'http://localhost').pathname
  if (pathname === '/api/auth/request-password-reset' || pathname.startsWith('/api/auth/reset-password') || pathname === '/api/auth/forget-password') {
    throw new HttpError(404, 'Use /auth/forgot-password e /auth/reset-password para recuperação de senha')
  }
  // O novo campo de cadastro não abre uma alteração de telefone fora da política de unicidade.
  if (pathname === '/api/auth/update-user' && request.body && typeof request.body === 'object' && 'phone' in request.body) {
    throw new HttpError(400, 'Alteração de telefone não está disponível neste fluxo')
  }
  let body = request.body
  const isSignup = request.method === 'POST' && pathname === '/api/auth/sign-up/email'
  const isLogin = request.method === 'POST' && pathname === '/api/auth/sign-in/email'
  if (isSignup) {
    const data = parse(signup, body)
    parse(strongPassword, data.password, 422)
    if (data.confirmPassword !== undefined && data.password !== data.confirmPassword) throw new HttpError(422, 'As senhas não coincidem')
    const existing = await authPool.query(`SELECT 1 FROM usuario WHERE lower(email)=$1 OR regexp_replace(telefone,'[^0-9]','','g')=$2`, [data.email, data.phone])
    if (existing.rowCount) throw new HttpError(409, 'E-mail ou telefone já vinculado a uma conta')
    const { confirmPassword, ...payload } = data
    body = { ...payload, rememberMe: true }
  }
  if (isLogin) body = { ...parse(login, body), rememberMe: true }
  const headers = fromNodeHeaders(request.headers)
  headers.set('content-type', 'application/json')
  // Sobrescreve endereços fornecidos pelo cliente; Fastify não confia em proxies por padrão.
  headers.set('x-forwarded-for', request.ip)
  const req = new Request(new URL(pathname + (path ? '' : new URL(request.url, 'http://localhost').search), process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'), {
    method: request.method, headers,
    ...(request.method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {}),
  })
  const execute = async () => {
    const response = await auth.handler(req)
    const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text()
    return { response, payload }
  }
  let result: Awaited<ReturnType<typeof execute>>
  if (isLogin) {
    const { email } = body as z.infer<typeof login>
    const client = await authLockPool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [email + ':' + request.ip])
      const blocked = await client.query(`SELECT 1 FROM auth_login_attempt WHERE email=$1 AND ip=$2 AND bloqueado_ate > now()`, [email, request.ip])
      if (blocked.rowCount) throw new HttpError(429, 'Conta temporariamente bloqueada por 15 minutos')
      result = await execute()
      if (result.response.status === 401 && result.payload?.code === 'INVALID_EMAIL_OR_PASSWORD') {
        const failure = await registrarFalha(email, request.ip, client)
        if (failure.bloqueado) {
          await client.query('COMMIT')
          return reply.header('retry-after', '900').code(429).send({ error: { code: 'ACCOUNT_LOCKED', message: 'Conta temporariamente bloqueada por 15 minutos' } })
        }
      } else if (result.response.ok) await limparTentativas(email, request.ip, client)
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  } else result = await execute()
  const { response, payload } = result
  // Preserva cada cookie separadamente para o cliente Better Auth do frontend.
  for (const [key, value] of response.headers) if (key !== 'set-cookie') reply.header(key, value)
  const cookies = response.headers.getSetCookie()
  if (cookies.length) reply.header('set-cookie', cookies)
  if (!response.ok) {
    const status = payload?.code === 'USER_ALREADY_EXISTS' || payload?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' ? 409 : response.status
    return reply.code(status).send({ error: { code: payload?.code ?? 'AUTH_ERROR', message: status === 401 ? 'E-mail ou senha inválidos' : status === 409 ? 'E-mail ou telefone já vinculado a uma conta' : status === 429 ? 'Limite de solicitações atingido. Tente novamente mais tarde' : status >= 500 ? 'Não foi possível concluir a autenticação' : payload?.message ?? 'Não foi possível autenticar' } })
  }
  if (isLogin && path) {
    const role = await authPool.query(`SELECT CASE WHEN ad.id_usuario IS NOT NULL THEN 'ADMIN' WHEN ga.id_usuario IS NOT NULL THEN 'MANAGER' ELSE 'USER' END AS role
      FROM usuario_auth ua LEFT JOIN administrador ad ON ad.id_usuario=ua.id_usuario LEFT JOIN gestor_arena ga ON ga.id_usuario=ua.id_usuario WHERE ua.id_auth=$1`, [payload.user.id])
    return reply.code(200).send({ token: payload.token, expiresIn: 1800, user: { ...payload.user, role: role.rows[0]?.role ?? 'USER' } })
  }
  if (isSignup && path) return reply.code(201).send({ ...payload.user, role: 'USER' })
  return reply.code(response.status).send(payload)
}

export async function handleAuth(request: FastifyRequest, reply: FastifyReply, path?: string) {
  const pathname = path ?? new URL(request.url, 'http://localhost').pathname
  if (request.method !== 'POST' || pathname !== '/api/auth/sign-up/email') return handleAuthUnlocked(request, reply, path)
  const data = parse(signup, request.body)
  const client = await authLockPool.connect()
  try {
    await client.query('BEGIN')
    for (const key of ['signup-email:' + data.email, 'signup-phone:' + data.phone]) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key])
    }
    const response = await handleAuthUnlocked(request, reply, path)
    await client.query('COMMIT')
    return response
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
}

export async function authController(app: FastifyInstance) {
  app.post('/auth/register', (request, reply) => handleAuth(request, reply, '/api/auth/sign-up/email'))
  app.post('/auth/login', (request, reply) => handleAuth(request, reply, '/api/auth/sign-in/email'))
}
