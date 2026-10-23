import { z } from 'zod'

const id = z.guid()

export const errorSchema = z.object({
  error: z.object({ code: z.string().optional(), message: z.string() }),
})
export const data = <T extends z.ZodType>(s: T) => z.object({ data: s })

export const messageSchema = z.object({ message: z.string() })

export const replaySchema = z.object({
  id,
  courtId: id,
  downloadUrl: z.string().nullable(),
  recordingDate: z.iso.date(),
  recordingTime: z.string(),
  status: z.enum(['pendente', 'disponivel', 'excluido']),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  duration: z.number(),
  sponsors: z.array(z.object({ id, name: z.string(), imageUrl: z.string().nullable() })),
})
export const replayListItemSchema = replaySchema.extend({
  courtName: z.string(),
  arenaName: z.string(),
  city: z.string(),
})
export const replayDownloadSchema = z.object({
  id,
  downloadUrl: z.string(),
  fileName: z.string(),
  format: z.literal('MP4'),
})

export const replayCreateBodySchema = z.object({ courtId: id })
export const replayDeleteBodySchema = z.object({ reason: z.string().min(3).max(500) })
export const replayFiltersSchema = z.object({
  courtId: id.optional(),
  city: z.string().optional(),
  date: z.iso.date().optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
})

export const arenaSchema = z.object({
  id,
  clienteId: id,
  nome: z.string(),
  cidade: z.string(),
  endereco: z.string(),
  fotoUrl: z.string().nullable(),
})
export const arenasQuerySchema = z.object({
  cidade: z.string().optional(),
  q: z.string().optional(),
})

export const quadraSchema = z.object({
  id,
  arenaId: id,
  nome: z.string(),
  disponivel: z.boolean(),
})
export const quadrasQuerySchema = z.object({
  arenaId: id.optional(),
  disponivel: z.enum(['true', 'false']).optional(),
})

export const authUserSchema = z.object({
  id,
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export const sessionUserSchema = authUserSchema.extend({
  role: z.enum(['USER', 'MANAGER', 'ADMIN']),
})

export const registerBodySchema = z.object({
  name: z.string(),
  email: z.email(),
  phone: z.string(),
  password: z.string(),
  confirmPassword: z.string().optional(),
})
export const loginBodySchema = z.object({
  email: z.email(),
  password: z.string(),
})
export const loginResponseSchema = z.object({
  token: z.string(),
  expiresIn: z.number(),
  user: sessionUserSchema,
})

export const sponsorBodySchema = z.object({
  name: z.string().min(2).max(150),
  imageUrl: z.string().max(500),
  duration: z.number().int().positive().max(30),
  value: z.number().nonnegative(),
  courtIds: z.array(id).min(1).max(100),
})
export const sponsorResponseSchema = z.object({
  id,
  name: z.string(),
  imageUrl: z.string().nullable(),
  duration: z.number(),
  value: z.number(),
  courtIds: z.array(id),
})
export const adminMetricsSchema = z.object({
  activeUsers: z.number(),
  totalCourts: z.number(),
  totalReplays: z.number(),
  mostAccessedCourts: z.array(z.object({ courtId: id, name: z.string(), accesses: z.number() })),
})
export const managerMetricsSchema = z.object({
  totalReplays: z.number(),
  totalSponsors: z.number(),
  peakHours: z.array(z.object({ hour: z.string(), accesses: z.number() })),
  courts: z.array(z.object({ id, name: z.string(), replays: z.number() })),
})
export const forgotPasswordBodySchema = z.object({ email: z.email() })
export const resetPasswordBodySchema = z.object({
  token: z.string(),
  password: z.string(),
  passwordConfirmation: z.string(),
})