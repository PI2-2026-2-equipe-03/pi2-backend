// Gera o token do agente de uma arena. Uso: npm run agent:token -- <id_arena>
// O token é exibido uma única vez; guarde-o no config.json do agente.
// Os agentes ativos anteriores da arena são desativados (mesma regra de POST /arenas/:id/agent-token).
import { Pool } from 'pg'
import { uuid } from '../http/errors.js'
import { issueAgentToken } from '../services/agent-token.js'

const arenaId = process.argv[2]
if (!arenaId || !uuid.safeParse(arenaId).success) {
  console.error('Uso: npm run agent:token -- <id_arena>')
  process.exit(1)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('Defina DATABASE_URL')
const pool = new Pool({ connectionString })

try {
  const result = await issueAgentToken(pool, arenaId)
  if (!result.ok) {
    console.error(`Arena ${arenaId} não encontrada`)
    process.exitCode = 1
  } else {
    const { agentId, arenaName, token, revokedAgents } = result.issued
    console.log(`Agente ${agentId} criado para a arena "${arenaName}".`)
    if (revokedAgents) console.log(`${revokedAgents} agente(s) anterior(es) desativado(s).`)
    console.log('Token (exibido só agora; copie para agent_token no config.json do agente):')
    console.log(token)
  }
} finally {
  await pool.end()
}
