
import { readFileSync } from 'node:fs'
import { Pool, type PoolConfig } from 'pg'

function getSupabaseCA(): string {
  const certificate = process.env.SUPABASE_CA_CERT

  if (certificate) {
    return certificate.replace(/\\n/g, '\n')
  }

  return readFileSync(
    new URL('../../supabase-ca.crt', import.meta.url),
    'utf8',
  )
}

export function createPostgresPool(
  connectionString: string,
  max = 1,
): Pool {
  const url = new URL(connectionString)

  url.searchParams.delete('sslmode')
  url.searchParams.delete('sslrootcert')
  url.searchParams.delete('sslcert')
  url.searchParams.delete('sslkey')

  const isLocal =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1'

  // DB_SSL=false desliga o TLS para bancos sem certificado (ex.: Postgres do docker compose).
  const sslDisabled = process.env.DB_SSL === 'false'

  const config: PoolConfig = {
    connectionString: url.toString(),
    max,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    ssl: isLocal || sslDisabled
      ? false
      : {
          ca: getSupabaseCA(),
          rejectUnauthorized: true,
        },
  }

  return new Pool(config)
}
