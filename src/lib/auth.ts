import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { bearer } from 'better-auth/plugins'
import { createPostgresPool } from './postgres.js'
import { strongPassword } from '../http/errors.js'
import { hashPassword, verifyPassword } from './password.js'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada')
export const authPool = createPostgresPool(
  process.env.DATABASE_URL,
  Number(process.env.AUTH_DB_POOL_MAX ?? 2),
)
// Locks não ocupam conexões usadas pelo handler Better Auth.
export const authLockPool = createPostgresPool(
  process.env.DATABASE_URL,
  Number(process.env.AUTH_LOCK_POOL_MAX ?? 1),
)

// Mesmas origens do CORS: acessar pelo IP da rede local (celular) exige declarar esse IP.
const trustedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

const crossSiteCookies = process.env.NODE_ENV === 'production'

export const auth = betterAuth({
  database: authPool,
  advanced: {
    database: { generateId: 'uuid' },
    ...(crossSiteCookies
      ? { defaultCookieAttributes: { sameSite: 'none' as const, secure: true, partitioned: true } }
      : {}),
  },
  trustedOrigins,
  plugins: [bearer()],
  user: { additionalFields: { phone: { type: 'string', required: true } } },
  emailAndPassword: {
    enabled: true, minPasswordLength: 8, maxPasswordLength: 128,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  session: { expiresIn: 1800, updateAge: 0, cookieCache: { enabled: false } },
  rateLimit: {
    enabled: true, storage: 'database', window: 60, max: 100, customRules: {
      '/sign-in/email': { window: 60, max: 100 },
      '/sign-up/email': { window: 60, max: 20 },
    }
  },
  databaseHooks: {
    user: {
      create: {
        before: async user => {
          const email = user.email.trim().toLowerCase()
          const existente = await authPool.query('SELECT 1 FROM usuario WHERE lower(email)=$1', [email])
          if (existente.rowCount) throw new APIError('CONFLICT', { message: 'E-mail já cadastrado no sistema' })
          return { data: { ...user, email } }
        }
      }
    },
  },
  hooks: {
    before: createAuthMiddleware(async ctx => {
      const password = ctx.path === '/sign-up/email' ? ctx.body?.password : ctx.body?.newPassword
      if (password !== undefined && ['/sign-up/email', '/change-password', '/reset-password'].includes(ctx.path)) {
        const result = strongPassword.safeParse(password)
        if (!result.success) throw new APIError('UNPROCESSABLE_ENTITY', { message: result.error.issues[0]!.message })
      }
      if (ctx.path === '/change-password' && ctx.body?.currentPassword === ctx.body?.newPassword) {
        throw new APIError('UNPROCESSABLE_ENTITY', { message: 'A nova senha deve ser diferente da anterior' })
      }
    })
  },
})
