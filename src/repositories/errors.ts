import type { Pool, PoolClient } from 'pg'

export type Db = Pick<Pool | PoolClient, 'query'>

export type RepositoryErrorCode = 'CONFLICT' | 'INVALID_REFERENCE' | 'INVALID_DATA' | 'DATABASE_ERROR'

export class RepositoryError extends Error {
  constructor(public code: RepositoryErrorCode, message: string, public cause?: unknown) {
    super(message)
  }
}

export function mapDbError(error: unknown): never {
  if (error instanceof RepositoryError) throw error
  switch ((error as { code?: string }).code) {
    case '23505': throw new RepositoryError('CONFLICT', 'Registro duplicado', error)
    case '23503': throw new RepositoryError('INVALID_REFERENCE', 'Referência inexistente ou em uso', error)
    case '23502':
    case '23514':
    case '22P02': throw new RepositoryError('INVALID_DATA', 'Dados inválidos', error)
    default: throw new RepositoryError('DATABASE_ERROR', 'Erro ao acessar o banco de dados', error)
  }
}