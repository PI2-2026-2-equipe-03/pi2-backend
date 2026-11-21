import { describe, expect, it, vi } from 'vitest'
import type { FastifyRequest } from 'fastify'
import { HttpError } from '../http/errors.js'
import { hashAgentToken } from '../lib/agent-token.js'
import { assertAgentArena, requireAgent } from '../middlewares/require-agent.js'

const ARENA = '11111111-1111-1111-1111-111111111111'
const OUTRA_ARENA = '22222222-2222-2222-2222-222222222222'

function criarRequest(authorization: string | undefined, rows: unknown[] = []) {
  const query = vi.fn().mockResolvedValue({ rows })
  const request = {
    headers: authorization ? { authorization } : {},
    server: { pg: { query } },
  } as unknown as FastifyRequest
  return { request, query }
}

function criarReply() {
  const reply = { code: vi.fn(), send: vi.fn() }
  reply.code.mockReturnValue(reply)
  reply.send.mockReturnValue(reply)
  return reply
}

describe('Middleware requireAgent', () => {
  it('retorna 401 sem token e não consulta o banco', async () => {
    const { request, query } = criarRequest(undefined)
    const reply = criarReply()

    await requireAgent(request, reply as never)

    expect(reply.code).toHaveBeenCalledWith(401)
    expect(reply.send).toHaveBeenCalledWith({ error: { code: 'UNAUTHENTICATED', message: expect.any(String) } })
    expect(query).not.toHaveBeenCalled()
  })

  it('aceita token válido, consulta pelo hash e preenche request.agent', async () => {
    const { request, query } = criarRequest('Bearer segredo', [{ id_agente: 'agente-1', id_arena: ARENA }])
    const reply = criarReply()

    await requireAgent(request, reply as never)

    expect(reply.code).not.toHaveBeenCalled()
    expect(query.mock.calls[0]![1]).toEqual([hashAgentToken('segredo')])
    expect(query.mock.calls[0]![0]).toContain('ativo')
    expect(request.agent).toEqual({ id: 'agente-1', arenaId: ARENA })
  })

  it('retorna 401 para token inválido ou de agente inativo (nenhuma linha encontrada)', async () => {
    const { request } = criarRequest('Bearer desconhecido', [])
    const reply = criarReply()

    await requireAgent(request, reply as never)

    expect(reply.code).toHaveBeenCalledWith(401)
    expect(request.agent).toBeUndefined()
  })

  it('não aceita outro esquema de autenticação', async () => {
    const { request, query } = criarRequest('Basic abc')
    const reply = criarReply()

    await requireAgent(request, reply as never)

    expect(reply.code).toHaveBeenCalledWith(401)
    expect(query).not.toHaveBeenCalled()
  })
})

describe('assertAgentArena', () => {
  it('permite recurso da própria arena', () => {
    const request = { agent: { id: 'a', arenaId: ARENA } } as unknown as FastifyRequest
    expect(() => assertAgentArena(request, ARENA)).not.toThrow()
  })

  it('bloqueia recurso de outra arena com 403', () => {
    const request = { agent: { id: 'a', arenaId: ARENA } } as unknown as FastifyRequest
    try {
      assertAgentArena(request, OUTRA_ARENA)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).statusCode).toBe(403)
    }
  })
})
