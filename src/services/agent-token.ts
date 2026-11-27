import type { Pool } from 'pg'
import { generateAgentToken, hashAgentToken } from '../lib/agent-token.js'

// Emissão do token do agente, compartilhada entre a rota do app (POST /arenas/:id/agent-token) e o script agent:token.
export type IssuedAgentToken = { agentId: string; arenaId: string; arenaName: string; token: string; revokedAgents: number }

export type IssueAgentTokenResult = { ok: true; issued: IssuedAgentToken } | { ok: false; reason: 'arena_not_found' }

// Rotação: os agentes ativos da arena são desativados na mesma transação em que o novo é criado.
// O token só existe na resposta; o banco guarda apenas o hash SHA-256.
export async function issueAgentToken(pool: Pool, arenaId: string): Promise<IssueAgentTokenResult> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // FOR UPDATE serializa emissões concorrentes para a mesma arena (só um agente ativo ao final).
    const arena = await client.query('SELECT nome FROM arena WHERE id_arena = $1 FOR UPDATE', [arenaId])
    if (!arena.rowCount) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'arena_not_found' }
    }
    const revoked = await client.query('UPDATE agente SET ativo = false WHERE id_arena = $1 AND ativo', [arenaId])
    const token = generateAgentToken()
    const { rows } = await client.query(
      'INSERT INTO agente (id_arena, token_hash) VALUES ($1, $2) RETURNING id_agente',
      [arenaId, hashAgentToken(token)],
    )
    await client.query('COMMIT')
    return {
      ok: true,
      issued: { agentId: rows[0].id_agente, arenaId, arenaName: arena.rows[0].nome, token, revokedAgents: revoked.rowCount ?? 0 },
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
