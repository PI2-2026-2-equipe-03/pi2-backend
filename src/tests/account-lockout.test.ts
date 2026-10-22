
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/auth.js', () => ({
  authPool: {
    query: vi.fn(),
  },
}))

import { authPool } from '../lib/auth.js'
import {
  registrarFalha,
  limparTentativas,
} from '../services/account-lockout.js'

const queryMock = vi.mocked(authPool.query)

describe('RNF-04 — Bloqueio de contas', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('registra uma tentativa incorreta', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ tentativas_login: 1, bloqueado_ate: null }],
    } as never)

    const resultado = await registrarFalha('teste@example.com')

    expect(resultado.tentativas).toBe(1)
    expect(resultado.bloqueado).toBe(false)
  })

  it('identifica uma conta bloqueada na quinta tentativa', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        tentativas_login: 5,
        bloqueado_ate: new Date(Date.now() + 15 * 60_000),
      }],
    } as never)

    const resultado = await registrarFalha('teste@example.com')

    expect(resultado.tentativas).toBe(5)
    expect(resultado.bloqueado).toBe(true)
  })

  it('executa a limpeza das tentativas', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] } as never)

    await limparTentativas('teste@example.com')

    expect(queryMock).toHaveBeenCalledOnce()
    expect(queryMock.mock.calls[0][0]).toContain('DELETE FROM auth_login_attempt')
  })

  it('utiliza o banco para controlar o bloqueio', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ tentativas_login: 1, bloqueado_ate: null }],
    } as never)

    await registrarFalha('teste@example.com')

    expect(queryMock.mock.calls[0][0]).toContain('ON CONFLICT(email,ip) DO UPDATE')
  })
})

