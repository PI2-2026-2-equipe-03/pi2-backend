import { z } from 'zod'

const id = z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Informe um UUID válido',
)

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

export const replayCreateBodySchema = z.object({
    courtId: id,
}).strict()

export const replayDeleteBodySchema = z.object({
    reason: z.string().trim().min(3).max(500),
}).strict()

export const replayFiltersSchema = z.object({
    courtId: id.optional(),
    city: z.string().trim().max(100).optional(),
    date: z.iso.date().optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
}).strict()

const cameraStatus = z.enum(['ativa', 'inativa', 'manutencao'])
export const cameraSchema = z.object({ id, quadraId: id, identificador: z.string(), status: cameraStatus })
export const camerasQuerySchema = z.object({
    quadraId: id.optional(),
    status: cameraStatus.optional(),
}).strict()
export const cameraCreateBodySchema = z.object({
    quadraId: id,
    identificador: z.string().trim().min(1).max(100),
    status: cameraStatus.optional(),
}).strict()
export const cameraUpdateBodySchema = z.object({
    identificador: z.string().trim().min(1).max(100).optional(),
    status: cameraStatus.optional(),
}).strict().refine(
    v => Object.keys(v).length > 0,
    'Informe ao menos um campo'
)

export const arenaSchema = z.object({
    id,
    clienteId: id,
    nome: z.string(),
    cidade: z.string(),
    endereco: z.string(),
    fotoUrl: z.string().nullable(),
})
export const arenaParamsSchema = z.object({ id })
export const agentTokenResponseSchema = z.object({
  agentId: id,
  arenaId: id,
  token: z.string(),
  revokedAgents: z.number(),
})
export const arenasQuerySchema = z.object({
    cidade: z.string().trim().max(100).optional(),
    q: z.string().trim().max(150).optional(),
}).strict()
export const arenaCreateBodySchema = z.object({
    nome: z.string().trim().min(2).max(150),
    cidade: z.string().trim().min(2).max(100),
    endereco: z.string().trim().min(2).max(255),
    fotoUrl: z.string().trim().max(500).nullable().optional(),
    clienteId: id.optional(),
}).strict()
export const arenaUpdateBodySchema = z.object({
    nome: z.string().trim().min(2).max(150).optional(),
    cidade: z.string().trim().min(2).max(100).optional(),
    endereco: z.string().trim().min(2).max(255).optional(),
    fotoUrl: z.string().trim().max(500).nullable().optional(),
}).strict().refine(
    b => Object.keys(b).length > 0,
    'Informe ao menos um campo'
)

export const quadraSchema = z.object({
    id,
    arenaId: id,
    nome: z.string(),
    disponivel: z.boolean(),
})
export const quadrasQuerySchema = z.object({
    arenaId: id.optional(),
    disponivel: z.enum(['true', 'false']).optional(),
}).strict()
export const quadraCreateBodySchema = z.object({
    arenaId: id,
    nome: z.string().trim().min(1).max(100),
}).strict()
export const quadraUpdateBodySchema = z.object({
    nome: z.string().trim().min(1).max(100).optional(),
    disponivel: z.boolean().optional(),
}).strict().refine(
    v => Object.keys(v).length > 0,
    'Informe ao menos um campo'
)

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
    name: z.string().min(2).max(150),
    email: z.email(),
    phone: z.string().describe(
        'Telefone com 10 a 15 dígitos após remover espaços, parênteses, +, pontos e hífens',
    ),
    password: z.string()
        .min(8)
        .max(72)
        .regex(/[A-Z]/, 'Deve conter letra maiúscula')
        .regex(/[a-z]/, 'Deve conter letra minúscula')
        .regex(/[0-9]/, 'Deve conter número')
        .regex(/[^A-Za-z0-9\s]/, 'Deve conter caractere especial'),
    confirmPassword: z.string().optional(),
    image: z.url().optional(),
    callbackURL: z.string().optional(),
    rememberMe: z.boolean().optional(),
}).strict()

export const loginBodySchema = z.object({
    email: z.email(),
    password: z.string().min(1).max(128),
    rememberMe: z.boolean().optional(),
    callbackURL: z.string().optional(),
}).strict()

export const loginResponseSchema = z.object({
    token: z.string(),
    expiresIn: z.number(),
    user: sessionUserSchema,
})

export const sponsorBodySchema = z.object({
    name: z.string().trim().min(2, 'Informe o nome do patrocinador').max(150),
    imageUrl: z.string().max(500).refine(
        value => /^\/uploads\/[A-Za-z0-9/_.-]+$/.test(value)
            || z.url({ protocol: /^https?$/ }).safeParse(value).success,
        'Informe uma URL HTTP(S) ou caminho /uploads/ válido',
    ),
    duration: z.number().int().positive().max(30),
    value: z.number().nonnegative().max(99999999.99).refine(
        value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
        'Use no máximo duas casas decimais',
    ),
    courtIds: z.array(id).min(1, 'Selecione ao menos uma quadra').max(100).refine(
        ids => new Set(ids).size === ids.length,
        'Não repita quadras',
    ),
}).strict()
export const sponsorResponseSchema = z.object({
    id,
    name: z.string(),
    imageUrl: z.string().nullable(),
    duration: z.number(),
    value: z.number(),
    courtIds: z.array(id),
})
export const sponsorUpdateBodySchema = sponsorBodySchema.partial()
    .strict()
    .refine(v => Object.keys(v).length > 0, 'Informe ao menos um campo')

export const adminMetricsSchema = z.object({
    activeUsers: z.number().int(),
    totalCourts: z.number().int(),
    totalReplays: z.number().int(),
    mostAccessedCourts: z.array(z.object({
        courtId: id,
        name: z.string(),
        accesses: z.number().int(),
    })),
})
export const managerMetricsSchema = z.object({
    totalReplays: z.number().int(),
    totalSponsors: z.number().int(),
    peakHours: z.array(z.object({
        hour: z.string(),
        accesses: z.number().int(),
    })),
    courts: z.array(z.object({
        id,
        name: z.string(),
        replays: z.number().int(),
    })),
})
export const managerRequestsQuerySchema = z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
}).strict()

export const managerRequestListItemSchema = z.object({
    id: z.number().int(),
    user: z.object({ id, name: z.string(), email: z.string() }),
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
    reviewedBy: id.nullable(),
})

export const forgotPasswordBodySchema = z.object({
    email: z.email(),
}).strict()

export const resetPasswordBodySchema = z.object({
    token: z.string().regex(
        /^[0-9a-f-]{36}\.\d{6}$/i,
        'Informe o token recebido por e-mail',
    ),
    password: z.string()
        .min(8)
        .max(72)
        .regex(/[A-Z]/, 'Deve conter letra maiúscula')
        .regex(/[a-z]/, 'Deve conter letra minúscula')
        .regex(/[0-9]/, 'Deve conter número')
        .regex(/[^A-Za-z0-9\s]/, 'Deve conter caractere especial'),
    passwordConfirmation: z.string(),
}).strict()
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
    userId: id,
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
    message: z.string(),
})
