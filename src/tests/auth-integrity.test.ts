
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/auth.js', () => ({
  authPool: {
    query: vi.fn(),
  },
}))

import { authPool } from '../lib/auth.js'
import { verificarIntegridadeAuth } from '../services/auth-integrity.js'

const queryMock = vi.mocked(authPool.query)

describe('Integridade dos cadastros', () => {
  it('retorna lista vazia quando todos estão vinculados', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [],
    } as never)

    const resultado = await verificarIntegridadeAuth()

    expect(resultado).toEqual([])
  })

  it('identifica usuários sem vínculo', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'auth-123',
          email: 'incompleto@example.com',
        },
      ],
    } as never)

    const resultado = await verificarIntegridadeAuth()

    expect(resultado).toHaveLength(1)
    expect(resultado[0].email).toBe('incompleto@example.com')
  })
})
