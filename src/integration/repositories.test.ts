import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { RepositoryError } from '../repositories/errors.js'
import * as replays from '../repositories/replay.repository.js'
import * as metadata from '../repositories/replay-metadata.repository.js'
import * as logs from '../repositories/recording-log.repository.js'

if (!process.env.TEST_DATABASE_URL) throw new Error('Defina TEST_DATABASE_URL apontando para um PostgreSQL local com permissão CREATEDB.')
const adminPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const databaseName = `b403_test_${randomUUID().replaceAll('-', '')}`
const databaseUrl = new URL(process.env.TEST_DATABASE_URL)
databaseUrl.pathname = '/' + databaseName

let db: Pool
let courtId: string
let cameraId: string
let availableId: string
let expiredId: string
let expiredNoUrlId: string
let pendingId: string
let createdId: string

const failure = (p: Promise<unknown>) =>
  p.then(() => null, (e: unknown) => (e instanceof RepositoryError ? e.code : 'OUTRO'))

async function fixture(url: string | null, time: string, status: string, createdAgo: string, expiresIn: string) {
  const { rows } = await db.query(
    `INSERT INTO replay (id_quadra, arquivo_url, data_geracao, hora_geracao, status, criado_em, expira_em)
     VALUES ($1, $2, CURRENT_DATE, $3, $4, now() - $5::interval, now() + $6::interval) RETURNING id_replay`,
    [courtId, url, time, status, createdAgo, expiresIn])
  return rows[0].id_replay as string
}

beforeAll(async () => {
  await adminPool.query(`CREATE DATABASE "${databaseName}"`)
  db = new Pool({ connectionString: databaseUrl.toString() })
  const initDir = new URL('../db/init/', import.meta.url)
  for (const file of (await readdir(initDir)).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(await readFile(new URL(file, initDir), 'utf8'))
  }
  const arena = await db.query(
    `INSERT INTO arena (id_gestor, nome, cidade, endereco)
     VALUES ('10000000-0000-0000-0000-000000000001', 'Arena B403', 'Fortaleza', 'Rua Teste') RETURNING id_arena`)
  courtId = (await db.query(`INSERT INTO quadra (id_arena, nome) VALUES ($1, 'Quadra B403') RETURNING id_quadra`, [arena.rows[0].id_arena])).rows[0].id_quadra
  cameraId = (await db.query(`INSERT INTO camera (id_quadra, identificador) VALUES ($1, 'CAM-B403') RETURNING id_camera`, [courtId])).rows[0].id_camera
  availableId = await fixture('https://example.com/a.mp4', '14:15', 'disponivel', '2 days', '5 days')
  expiredId = await fixture('https://example.com/e.mp4', '14:16', 'disponivel', '8 days', '-1 day')
  expiredNoUrlId = await fixture(null, '14:17', 'pendente', '8 days', '-1 day')
  pendingId = await fixture(null, '14:18', 'pendente', '2 days', '5 days')
})

afterAll(async () => {
  if (db) await db.end()
  await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`)
  await adminPool.end()
})

describe('B4-03 — repositório de replays', () => {
  it('cria replay pendente com 30s, expiração de 168h e snapshot de patrocinadores', async () => {
    const replay = await replays.criarReplay(db, courtId, [{ id: randomUUID(), name: 'Patrocínio', imageUrl: null }])
    createdId = replay.id
    expect(replay).toMatchObject({ courtId, status: 'pendente', duration: 30, fileUrl: null })
    expect(replay.sponsors[0].name).toBe('Patrocínio')
    expect(new Date(replay.expiresAt).getTime() - new Date(replay.createdAt).getTime()).toBe(168 * 3600_000)
  })

  it('traduz erros do banco em RepositoryError', async () => {
    expect(await failure(replays.criarReplay(db, randomUUID()))).toBe('INVALID_REFERENCE')
    expect(await failure(replays.buscarReplayPorId(db, 'x'))).toBe('INVALID_DATA')
  })

  it('busca por id e retorna null quando não existe', async () => {
    expect((await replays.buscarReplayPorId(db, availableId))?.fileUrl).toBe('https://example.com/a.mp4')
    expect(await replays.buscarReplayPorId(db, randomUUID())).toBeNull()
  })

  it('lista só disponíveis não expirados e aplica filtros e paginação', async () => {
    const all = (await replays.listarReplaysDisponiveis(db, { courtId })).map(r => r.id)
    expect(all).toEqual([availableId])
    expect((await replays.listarReplaysDisponiveis(db, { courtId, city: 'fortaleza', time: '14:15' })).map(r => r.id)).toEqual([availableId])
    expect(await replays.listarReplaysDisponiveis(db, { courtId, time: '14:16' })).toHaveLength(0)
    expect(await replays.listarReplaysDisponiveis(db, { courtId, city: 'Recife' })).toHaveLength(0)
    expect(await replays.listarReplaysDisponiveis(db, { courtId, limit: 0 })).toHaveLength(0)
  })

  it('lista pendentes não expirados', async () => {
    const ids = (await replays.listarReplaysPendentes(db)).map(r => r.id)
    expect(ids).toEqual(expect.arrayContaining([pendingId, createdId]))
    expect(ids).not.toContain(expiredNoUrlId)
  })

  it('marca como disponível uma única vez', async () => {
    const done = await replays.marcarReplayDisponivel(db, createdId, 'https://example.com/novo.mp4')
    expect(done).toMatchObject({ status: 'disponivel', fileUrl: 'https://example.com/novo.mp4' })
    expect(await replays.marcarReplayDisponivel(db, createdId, 'https://example.com/outro.mp4')).toBeNull()
    expect(await replays.marcarReplayDisponivel(db, expiredNoUrlId, 'https://example.com/x.mp4')).toBeNull()
  })

  it('expira vencidos, enfileira mídia e é idempotente', async () => {
    expect(await replays.expirarReplaysVencidos(db)).toBe(2)
    const rows = (await db.query('SELECT id_replay, status, arquivo_url FROM replay WHERE id_replay = ANY($1)', [[expiredId, expiredNoUrlId, availableId]])).rows
    const byId = Object.fromEntries(rows.map(r => [r.id_replay, r]))
    expect(byId[expiredId]).toMatchObject({ status: 'excluido', arquivo_url: null })
    expect(byId[expiredNoUrlId]).toMatchObject({ status: 'excluido', arquivo_url: null })
    expect(byId[availableId].status).toBe('disponivel')
    const jobs = (await db.query('SELECT id_replay, arquivo_url FROM media_deletion_job WHERE id_replay = ANY($1)', [[expiredId, expiredNoUrlId]])).rows
    expect(jobs).toEqual([{ id_replay: expiredId, arquivo_url: 'https://example.com/e.mp4' }])
    expect(await replays.expirarReplaysVencidos(db)).toBe(0)
  })
})

describe('B4-03 — repositório de metadados', () => {
  const base = { resolution: '1920x1080', codec: 'h264', checksum: 'a'.repeat(64) }

  it('salva, atualiza (upsert) e busca', async () => {
    const saved = await metadata.salvarMetadados(db, { replayId: availableId, cameraId, sizeBytes: 1048576, ...base })
    expect(saved).toMatchObject({ replayId: availableId, cameraId, sizeBytes: 1048576, format: 'mp4', resolution: '1920x1080' })
    await metadata.salvarMetadados(db, { replayId: availableId, cameraId, sizeBytes: 2097152, ...base })
    expect((await metadata.buscarMetadadosPorReplay(db, availableId))?.sizeBytes).toBe(2097152)
    expect((await db.query('SELECT 1 FROM replay_metadado WHERE id_replay = $1', [availableId])).rowCount).toBe(1)
    expect(await metadata.buscarMetadadosPorReplay(db, randomUUID())).toBeNull()
  })

  it('rejeita dados inválidos e replay inexistente', async () => {
    expect(await failure(metadata.salvarMetadados(db, { replayId: availableId, checksum: 'xyz' }))).toBe('INVALID_DATA')
    expect(await failure(metadata.salvarMetadados(db, { replayId: availableId, sizeBytes: 0 }))).toBe('INVALID_DATA')
    expect(await failure(metadata.salvarMetadados(db, { replayId: availableId, resolution: 'full-hd' }))).toBe('INVALID_DATA')
    expect(await failure(metadata.salvarMetadados(db, { replayId: randomUUID() }))).toBe('INVALID_REFERENCE')
  })
})

describe('B4-03 — repositório de logs de gravação', () => {
  it('registra sucesso e falha e lista por quadra e por replay', async () => {
    const ok = await logs.registrarGravacao(db, { courtId, cameraId, replayId: availableId, result: 'sucesso' })
    expect(ok).toMatchObject({ origin: 'botoeira', result: 'sucesso', replayId: availableId })
    await logs.registrarGravacao(db, { courtId, cameraId, result: 'falha', errorMessage: 'Câmera sem buffer' })
    const all = await logs.listarLogsPorQuadra(db, courtId)
    expect(all.map(l => l.result)).toEqual(['falha', 'sucesso'])
    expect((await logs.listarLogsPorQuadra(db, courtId, { result: 'falha' }))).toHaveLength(1)
    expect((await logs.listarLogsPorReplay(db, availableId)).map(l => l.id)).toEqual([ok.id])
  })

  it('rejeita falha sem mensagem, origem inválida e quadra inexistente', async () => {
    expect(await failure(logs.registrarGravacao(db, { courtId, result: 'falha' }))).toBe('INVALID_DATA')
    expect(await failure(logs.registrarGravacao(db, { courtId, result: 'sucesso', origin: 'x' as never }))).toBe('INVALID_DATA')
    expect(await failure(logs.registrarGravacao(db, { courtId: randomUUID(), result: 'sucesso' }))).toBe('INVALID_REFERENCE')
  })
})