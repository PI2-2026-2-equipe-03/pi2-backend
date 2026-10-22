
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyRequest } from 'fastify'

vi.mock('better-auth/node', () => ({
  fromNodeHeaders: vi.fn(() => new Headers()),
}))

vi.mock('../lib/auth.js', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
  authPool: {
    query: vi.fn(),
  },
}))

import { auth, authPool } from '../lib/auth.js'
import { requireAuth } from '../middlewares/require-auth.js'

const sessionMock = vi.mocked(auth.api.getSession)
const queryMock = vi.mocked(authPool.query)

function criarReply() {
  const reply = {
    code: vi.fn(),
    send: vi.fn(),
  }

  reply.code.mockReturnValue(reply)
  reply.send.mockReturnValue(reply)

  return reply
}

describe('Middleware requireAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('retorna 401 quando não existe sessão', async () => {
    sessionMock.mockResolvedValueOnce(null)

    const request = { headers: {} } as FastifyRequest
    const reply = criarReply()

    await requireAuth(request, reply as never)

    expect(reply.code).toHaveBeenCalledWith(401)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('retorna 403 quando o usuário não possui vínculo', async () => {
    sessionMock.mockResolvedValueOnce({
      session: { updatedAt: new Date(), token: 'session-token' },
      user: {
        id: 'auth-123',
        name: 'Usuario Teste',
        email: 'teste@example.com',
      },
    } as never)

    queryMock.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    } as never)

 const request = { headers: {} } as FastifyRequest  
  const reply = criarReply()

    await requireAuth(request, reply as never)

    expect(reply.code).toHaveBeenCalledWith(403)
    expect(request.authUser).toBeUndefined()
  })

  it('permite usuário autenticado com vínculo', async () => {
    sessionMock.mockResolvedValueOnce({
      session: { updatedAt: new Date(), token: 'session-token' },
      user: {
        id: 'auth-123',
        name: 'Usuario Teste',
        email: 'teste@example.com',
      },
    } as never)

    queryMock.mockResolvedValueOnce({
      rows: [{ id_usuario: 'usuario-456' }],
      rowCount: 1,
    } as never)

    sessionMock.mockResolvedValueOnce({ response: { user: { id: 'auth-123' } }, headers: new Headers() } as never)
    const request = { headers: {} } as FastifyRequest
    const reply = criarReply()

    await requireAuth(request, reply as never)

    expect(reply.code).not.toHaveBeenCalled()

    expect(request.authUser).toEqual({
      id: 'auth-123',
      name: 'Usuario Teste',
      email: 'teste@example.com',
    })
  })
})
