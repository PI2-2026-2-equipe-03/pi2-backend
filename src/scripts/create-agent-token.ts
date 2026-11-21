// Gera o token do agente de uma arena. Uso: npm run agent:token -- <id_arena>
// O token é exibido uma única vez; guarde-o no config.json do agente.
import { Pool } from 'pg'
import { generateAgentToken, hashAgentToken } from '../lib/agent-token.js'

const arenaId = process.argv[2]
if (!arenaId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arenaId)) {
  console.error('Uso: npm run agent:token -- <id_arena>')
  process.exit(1)
}

const connectionString = process.env.REPLAY_DATABASE_URL ?? process.env.DATABASE_URL
if (!connectionString) throw new Error('Defina DATABASE_URL ou REPLAY_DATABASE_URL')
const pool = new Pool({ connectionString })

try {
  const arena = await pool.query('SELECT nome FROM arena WHERE id_arena = $1', [arenaId])
  if (!arena.rowCount) {
    console.error(`Arena ${arenaId} não encontrada`)
    process.exitCode = 1
  } else {
    const token = generateAgentToken()
    const { rows } = await pool.query(
      'INSERT INTO agente (id_arena, token_hash) VALUES ($1, $2) RETURNING id_agente',
      [arenaId, hashAgentToken(token)],
    )
    console.log(`Agente ${rows[0].id_agente} criado para a arena "${arena.rows[0].nome}".`)
    console.log('Token (exibido só agora; copie para agent_token no config.json do agente):')
    console.log(token)
  }
} finally {
  await pool.end()
}
