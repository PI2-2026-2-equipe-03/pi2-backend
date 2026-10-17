
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/auth.js', () => ({
  authPool: {
    query: vi.fn(),
  },
}))

import { authPool } from '../lib/auth.js'
import { analisarCadastroIncompleto } from '../services/auth-recovery.js'

const queryMock = vi.mocked(authPool.query)

describe('Análise de cadastros incompletos', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('identifica conta inexistente', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] } as never)

    const resultado = await analisarCadastroIncompleto('id-1')

    expect(resultado.situacao).toBe('NAO_ENCONTRADO')
  })

  it('identifica conta já vinculada', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'id-1',
        id_usuario: 'usuario-1',
        usuario_existente: 'usuario-1',
      }],
    } as never)

    const resultado = await analisarCadastroIncompleto('id-1')

    expect(resultado.situacao).toBe('JA_VINCULADO')
  })

  it('exige revisão quando já existe usuário correspondente', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'id-1',
        id_usuario: null,
        usuario_existente: 'usuario-2',
      }],
    } as never)

    const resultado = await analisarCadastroIncompleto('id-1')

    expect(resultado.situacao).toBe('EXIGE_REVISAO_MANUAL')
  })

  it('identifica candidato à recuperação', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'id-1',
        id_usuario: null,
        usuario_existente: null,
      }],
    } as never)

    const resultado = await analisarCadastroIncompleto('id-1')

    expect(resultado.situacao).toBe('CANDIDATO_RECUPERACAO')
  })
})
