import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { bearer } from 'better-auth/plugins'
import { Pool } from 'pg'
import { strongPassword } from '../http/errors.js'
import { hashPassword, verifyPassword } from './password.js'

if (!process.env.AUTH_DATABASE_URL) throw new Error('AUTH_DATABASE_URL não configurada')
export const authPool = new Pool({ connectionString: process.env.AUTH_DATABASE_URL })
// Locks não ocupam conexões usadas pelo handler Better Auth.
export const authLockPool = new Pool({ connectionString: process.env.AUTH_DATABASE_URL, max: 4 })

export const auth = betterAuth({
  database: authPool,
  advanced: { database: { generateId: 'uuid' } },
  trustedOrigins: ['http://localhost:5173'],
  plugins: [bearer()],
  user: { additionalFields: { phone: { type: 'string', required: true } } },
  emailAndPassword: { 
    enabled: true, minPasswordLength: 8, maxPasswordLength: 128,
    password: { hash: hashPassword, verify: verifyPassword },
   },
  session: { expiresIn: 1800, updateAge: 0, cookieCache: { enabled: false } },
  rateLimit: { enabled: true, storage: 'database', window: 60, max: 100, customRules: {
    '/sign-in/email': { window: 60, max: 100 },
    '/sign-up/email': { window: 60, max: 20 },
  } },
  databaseHooks: {
    user: { create: { before: async user => {
      const email = user.email.trim().toLowerCase()
      const existente = await authPool.query('SELECT 1 FROM usuario WHERE lower(email)=$1', [email])
      if (existente.rowCount) throw new APIError('CONFLICT', { message: 'E-mail já cadastrado no sistema' })
      return { data: { ...user, email } }
    } } },
  },
  hooks: { before: createAuthMiddleware(async ctx => {
    const password = ctx.path === '/sign-up/email' ? ctx.body?.password : ctx.body?.newPassword
    if (password !== undefined && ['/sign-up/email', '/change-password', '/reset-password'].includes(ctx.path)) {
      const result = strongPassword.safeParse(password)
      if (!result.success) throw new APIError('UNPROCESSABLE_ENTITY', { message: result.error.issues[0]!.message })
    }
    if (ctx.path === '/change-password' && ctx.body?.currentPassword === ctx.body?.newPassword) {
      throw new APIError('UNPROCESSABLE_ENTITY', { message: 'A nova senha deve ser diferente da anterior' })
    }
  }) },
})
