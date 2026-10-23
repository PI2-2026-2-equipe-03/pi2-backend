import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/auth.js', () => ({
  authPool: {
    query: vi.fn(),
  },
}))

import { authPool } from '../lib/auth.js'
import {
  podeGerenciarQuadra,
  podeBaixarReplay,
} from '../services/replay-authorization.js'

const queryMock = vi.mocked(authPool.query)

describe('Autorização dos replays', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('permite acessar a própria quadra', async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ '?column?': 1 }],
    } as never)

    const autorizado = await podeGerenciarQuadra(
      'auth-user-1',
      'quadra-1'
    )

    expect(autorizado).toBe(true)
  })

  it('nega acesso à quadra de outro gestor', async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 0,
      rows: [],
    } as never)

    const autorizado = await podeGerenciarQuadra(
      'auth-user-1',
      'quadra-2'
    )

    expect(autorizado).toBe(false)
  })

  it('permite baixar replay autorizado', async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ '?column?': 1 }],
    } as never)

    const autorizado = await podeBaixarReplay(
      'auth-user-1',
      'replay-1'
    )

    expect(autorizado).toBe(true)
  })

  it('nega download de replay não autorizado', async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 0,
      rows: [],
    } as never)

    const autorizado = await podeBaixarReplay(
      'auth-user-1',
      'replay-2'
    )

    expect(autorizado).toBe(false)
  })
})
