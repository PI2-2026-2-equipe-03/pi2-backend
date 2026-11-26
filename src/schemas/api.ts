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

const cameraStatus = z.enum(['ativa', 'inativa', 'manutencao'])
export const cameraSchema = z.object({ id, quadraId: id, identificador: z.string(), status: cameraStatus })
export const camerasQuerySchema = z.object({ quadraId: id.optional(), status: cameraStatus.optional() })
export const cameraCreateBodySchema = z.object({
    quadraId: id, identificador: z.string().min(1).max(100), status: cameraStatus.optional(),
})
export const cameraUpdateBodySchema = z.object({
    identificador: z.string().min(1).max(100).optional(), status: cameraStatus.optional(),
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
export const arenaCreateBodySchema = z.object({
    nome: z.string().min(2).max(150),
    cidade: z.string().min(2).max(100),
    endereco: z.string().min(2).max(255),
    fotoUrl: z.string().max(500).nullable().optional(),
    clienteId: id.optional(),
})
export const arenaUpdateBodySchema = z.object({
    nome: z.string().min(2).max(150).optional(),
    cidade: z.string().min(2).max(100).optional(),
    endereco: z.string().min(2).max(255).optional(),
    fotoUrl: z.string().max(500).nullable().optional(),
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
export const quadraCreateBodySchema = z.object({
    arenaId: id, nome: z.string().min(1).max(100)
})
export const quadraUpdateBodySchema = z.object({
    nome: z.string().min(1).max(100).optional(), disponivel: z.boolean().optional()
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
export const currentUserSchema = z.object({
    id,
    name: z.string(),
    email: z.string(),
    role: z.enum(['ADM', 'CLI', 'USR']),
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
export const managerRequestsQuerySchema = z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
}).strict()

export const managerRequestListItemSchema = z.object({
    id: z.number().int(),
    user: z.object({ id: z.guid(), name: z.string(), email: z.string() }),
    cpf: z.string(),
    cnpj: z.string().nullable(),
    companyName: z.string(),
    courtQuantity: z.number().int(),
    address: z.object({
        street: z.string(),
        neighborhood: z.string(),
        zipCode: z.string(),
        city: z.string(),
        state: z.string(),
    }),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
    createdAt: z.iso.datetime(),
    reviewedAt: z.iso.datetime().nullable(),
    reviewedBy: z.guid().nullable(),
})

export const forgotPasswordBodySchema = z.object({ email: z.email() })
export const resetPasswordBodySchema = z.object({
    token: z.string(),
    password: z.string(),
    passwordConfirmation: z.string(),
})
export const replayDetailSchema = z.object({
    id,
    court: z.object({
        id,
        name: z.string(),
    }),
    city: z.string(),
    recordedAt: z.iso.datetime(),
    duration: z.number(),
    videoUrl: z.string(),
    expiresAt: z.iso.datetime(),
})


export const managerRequestBodySchema = z.object({
    cpf: z.string().regex(/^\d{11}$/, 'O CPF deve conter 11 dígitos'),
    cnpj: z.string().regex(/^\d{14}$/, 'O CNPJ deve conter 14 dígitos').optional(),
    companyName: z.string().trim().min(2, 'Informe a razão social').max(150),
    courtQuantity: z.number().int().positive('A quantidade de quadras deve ser positiva').max(1000),
    address: z.object({
        street: z.string().trim().min(2).max(150),
        neighborhood: z.string().trim().min(2).max(100),
        zipCode: z.string().regex(/^\d{8}$/, 'O CEP deve conter 8 dígitos'),
        city: z.string().trim().min(2).max(100),
        state: z.string().regex(/^[A-Za-z]{2}$/, 'Informe a sigla do estado'),
    }).strict(),
}).strict()

export const managerRequestParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
})

export const managerRequestStatusSchema = z.object({
    status: z.enum(['APPROVED', 'REJECTED']),
}).strict()

export const managerRequestResponseSchema = z.object({
    id: z.number().int(),
    userId: z.guid(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
    message: z.string(),
})
