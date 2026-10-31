import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyRequest } from 'fastify'

vi.mock('../lib/auth.js', () => ({
  authPool: {
    query: vi.fn(),
  },
}))

import { authPool } from '../lib/auth.js'
import { requireRole } from '../middlewares/require-role.js'

const queryMock = vi.mocked(authPool.query)

function criarRequest(autenticado = true) {
  return {
    authUser: autenticado
      ? { id: 'auth-123', name: 'Teste', email: 'teste@example.test' }
      : undefined,
  } as FastifyRequest
}

function criarReply() {
  const reply = {
    code: vi.fn(),
    send: vi.fn(),
  }

  reply.code.mockReturnValue(reply)
  reply.send.mockReturnValue(reply)

  return reply
}

describe('Middleware requireRole', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('retorna 401 sem usuário autenticado e não consulta o banco', async () => {
    const reply = criarReply()

    await requireRole('ADM')(criarRequest(false), reply as never)

    expect(reply.code).toHaveBeenCalledWith(401)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('retorna 403 quando o perfil não é permitido', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ codigo: 'USR' }],
    } as never)

    const reply = criarReply()

    await requireRole('ADM')(criarRequest(), reply as never)

    expect(reply.code).toHaveBeenCalledWith(403)
    expect(reply.send).toHaveBeenCalledWith({
      error: {
        code: 'FORBIDDEN',
        message: 'Seu perfil não tem permissão para acessar este recurso',
      },
    })
  })

  it('permite administrador e consulta o usuário autenticado', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ codigo: 'ADM' }],
    } as never)

    const reply = criarReply()

    await requireRole('ADM')(criarRequest(), reply as never)

    expect(queryMock).toHaveBeenCalledWith(
      expect.any(String),
      ['auth-123'],
    )
    expect(reply.code).not.toHaveBeenCalled()
    expect(reply.send).not.toHaveBeenCalled()
  })

  it('aceita mais de um perfil permitido', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ codigo: 'CLI' }],
    } as never)

    const reply = criarReply()

    await requireRole('ADM', 'CLI')(criarRequest(), reply as never)

    expect(reply.code).not.toHaveBeenCalled()
    expect(reply.send).not.toHaveBeenCalled()
  })

  it('retorna 403 quando não encontra perfil no banco', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [],
    } as never)

    const reply = criarReply()

    await requireRole('ADM')(criarRequest(), reply as never)

    expect(reply.code).toHaveBeenCalledWith(403)
  })

  it('propaga falha do banco para o tratamento de erros da API', async () => {
    const erro = new Error('Banco indisponível')
    queryMock.mockRejectedValueOnce(erro)

    const reply = criarReply()

    await expect(
      requireRole('ADM')(criarRequest(), reply as never),
    ).rejects.toThrow('Banco indisponível')

    expect(reply.send).not.toHaveBeenCalled()
  })
})
