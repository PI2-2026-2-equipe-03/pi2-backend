import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import { createReplay, REPLAY_INTERVAL_SECONDS } from '../services/replay-creation.js'

const ARENA = '11111111-1111-1111-1111-111111111111'
const QUADRA = '33333333-3333-3333-3333-333333333333'

type Cenario = {
  quadra?: { disponivel: boolean; arenaId: string; ownerAuthId: string | null }
  existente?: boolean
  recente?: boolean
}

// Simula o banco respondendo a cada consulta do serviço pelo trecho do SQL.
function criarPool(c: Cenario) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('FOR UPDATE OF q')) return c.quadra ? { rowCount: 1, rows: [c.quadra] } : { rowCount: 0, rows: [] }
    if (sql.includes('r.criado_em = $2')) return c.existente ? { rowCount: 1, rows: [{ id: 'existente' }] } : { rowCount: 0, rows: [] }
    if (sql.includes('SELECT 1 FROM replay')) return { rowCount: c.recente ? 1 : 0, rows: [] }
    if (sql.includes('FROM patrocinador')) return { rowCount: 1, rows: [{ id: 'p1', name: 'Patrocínio', imageUrl: null }] }
    if (sql.includes('INSERT INTO replay')) return { rowCount: 1, rows: [{ id: 'novo', status: 'pendente', duration: 30 }] }
    return { rowCount: 0, rows: [] }
  })
  const release = vi.fn()
  const pool = { connect: vi.fn().mockResolvedValue({ query, release }) } as unknown as Pool
  const comandos = () => query.mock.calls.map(([sql]) => sql.trim())
  return { pool, query, release, comandos }
}

const quadraDisponivel = { disponivel: true, arenaId: ARENA, ownerAuthId: 'gestor' }
const mesmaArena = (court: { arenaId: string }) => court.arenaId === ARENA

describe('createReplay', () => {
  it('retorna court_not_found quando a quadra não existe', async () => {
    const { pool, comandos, release } = criarPool({})
    expect(await createReplay(pool, { courtId: QUADRA, canAccess: mesmaArena })).toEqual({ ok: false, reason: 'court_not_found' })
    expect(comandos()).toContain('ROLLBACK')
    expect(release).toHaveBeenCalled()
  })

  it('retorna forbidden quando a regra de acesso recusa a quadra', async () => {
    const { pool } = criarPool({ quadra: quadraDisponivel })
    const result = await createReplay(pool, { courtId: QUADRA, canAccess: () => false })
    expect(result).toEqual({ ok: false, reason: 'forbidden' })
  })

  it('retorna court_unavailable para quadra indisponível', async () => {
    const { pool } = criarPool({ quadra: { ...quadraDisponivel, disponivel: false } })
    expect(await createReplay(pool, { courtId: QUADRA, canAccess: mesmaArena })).toEqual({ ok: false, reason: 'court_unavailable' })
  })

  it('respeita o intervalo mínimo entre replays da quadra e não insere o replay', async () => {
    const { pool, query, comandos } = criarPool({ quadra: quadraDisponivel, recente: true })
    expect(await createReplay(pool, { courtId: QUADRA, canAccess: mesmaArena })).toEqual({ ok: false, reason: 'min_interval' })
    expect(comandos()).toContain('ROLLBACK')
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO replay'))).toBe(false)
  })

  it('cria com o horário do clique, o intervalo mínimo e cópia dos patrocinadores', async () => {
    const { pool, query, comandos } = criarPool({ quadra: quadraDisponivel })
    const pressedAt = new Date('2026-11-19T13:00:00.000Z')

    const result = await createReplay(pool, { courtId: QUADRA, pressedAt, canAccess: mesmaArena })

    expect(result).toMatchObject({ ok: true, created: true, replay: { id: 'novo' } })
    const intervalo = query.mock.calls.find(([sql]) => sql.includes('SELECT 1 FROM replay'))!
    expect(intervalo[1]).toEqual([QUADRA, pressedAt.toISOString(), REPLAY_INTERVAL_SECONDS])
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO replay'))!
    expect(insert[1]).toEqual([QUADRA, JSON.stringify([{ id: 'p1', name: 'Patrocínio', imageUrl: null }]), pressedAt.toISOString()])
    expect(insert[0]).toContain("INTERVAL '168 hours'")
    expect(comandos()).toContain('COMMIT')
  })

  it('usa o relógio do banco quando não há horário do clique (app)', async () => {
    const { pool, query } = criarPool({ quadra: quadraDisponivel })
    await createReplay(pool, { courtId: QUADRA, canAccess: mesmaArena })
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO replay'))!
    expect(insert[1]![2]).toBeNull()
    expect(query.mock.calls.some(([sql]) => sql.includes('r.criado_em = $2'))).toBe(false)
  })

  it('devolve o replay pendente já criado no reenvio do mesmo clique', async () => {
    const { pool, query } = criarPool({ quadra: quadraDisponivel, existente: true })
    const result = await createReplay(pool, { courtId: QUADRA, pressedAt: new Date(), canAccess: mesmaArena })
    expect(result).toMatchObject({ ok: true, created: false, replay: { id: 'existente' } })
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO replay'))).toBe(false)
  })
})
