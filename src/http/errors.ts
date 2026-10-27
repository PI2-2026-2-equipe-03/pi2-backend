import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
z.config(z.locales.pt())

export class HttpError extends Error {
    constructor(public statusCode: number, message: string, public code = 'REQUEST_ERROR') {
        super(message)
    }
}

export function parse<T>(schema: z.ZodType<T>, value: unknown, status = 400): T {
    const result = schema.safeParse(value)
    if (!result.success) {
        const issue = result.error.issues[0]!
        throw new HttpError(status, `${issue.path.join('.') || 'Dados'}: ${issue.message}`, 'VALIDATION_ERROR')
    }
    return result.data
}

// UUIDs sintéticos do seed também são aceitos; todos os parâmetros são vinculados no SQL.
export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Informe um UUID válido')
export const replayParams = z.object({ id: uuid })
export const strongPassword = z.string().min(8, 'Use no mínimo 8 caracteres').max(72, 'Use no máximo 72 caracteres')
    .regex(/[A-Z]/, 'Inclua uma letra maiúscula').regex(/[a-z]/, 'Inclua uma letra minúscula')
    .regex(/[0-9]/, 'Inclua um número').regex(/[^A-Za-z0-9\s]/, 'Inclua um caractere especial')
export const phone = z.string().transform(value => value.replace(/[\s()+.-]/g, ''))
    .pipe(z.string().regex(/^\d{10,15}$/, 'Informe um telefone com 10 a 15 dígitos'))

export function registerErrorHandler(app: FastifyInstance) {
    app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request, reply) => {
        if (error instanceof HttpError) {
            return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } })
        }
        if (error.code === '23505') {
            return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Já existe um registro com esses dados' } })
        }
        if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
            return reply.code(error.statusCode).send({ error: { code: 'BAD_REQUEST', message: error.statusCode === 400 ? 'Requisição inválida. Confira o JSON e os campos enviados' : error.message } })
        }
        request.log.error(error)
        return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' } })
    })
}
