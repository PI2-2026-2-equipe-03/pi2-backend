import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (!process.env.TEST_DATABASE_URL) throw new Error('Defina TEST_DATABASE_URL apontando para um PostgreSQL local com permissão CREATEDB. A suíte cria e remove um banco exclusivo.')
const adminPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const databaseName = `b302_test_${randomUUID().replaceAll('-', '')}`
const databaseUrl = new URL(process.env.TEST_DATABASE_URL)
databaseUrl.pathname = '/' + databaseName
const deliveries: Array<{ to: string; token: string; expiresIn: number }> = []
const mediaRequests: Array<{ replayId: string; objectUrl: string }> = []
let storageUnavailable = false
const mailReceiver = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    if (request.url === '/delete-media') {
        if (storageUnavailable) { response.writeHead(503).end(); return }
        mediaRequests.push(JSON.parse(body))
    } else deliveries.push(JSON.parse(body))
    response.writeHead(204).end()
})
let app: FastifyInstance
let db: Pool
let closeAuth: () => Promise<void>
let manager: { id: string; token: string }
let user: { id: string; token: string }
let admin: { id: string; token: string }
let courtId: string
let arenaId: string
let availableId: string
let expiredId: string
let pendingId: string
let createdId: string
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
const password = 'Teste@2026Seguro'

async function account(name: string, phone: string) {
    const email = `${name}@b302.example`
    const signup = await app.inject({ method: 'POST', url: '/auth/register', payload: { name, email, phone, password } })
    expect(signup.statusCode, signup.body).toBe(201)
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } })
    expect(login.statusCode, login.body).toBe(200)
    return { id: signup.json().id as string, token: login.json().token as string }
}

beforeAll(async () => {
    await new Promise<void>(resolve => mailReceiver.listen(0, '127.0.0.1', resolve))
    const address = mailReceiver.address() as { port: number }
    process.env.EMAIL_DELIVERY_URL = `http://127.0.0.1:${address.port}/deliver`
    await adminPool.query(`CREATE DATABASE "${databaseName}"`)
    db = new Pool({ connectionString: databaseUrl.toString() })
    const initDir = new URL('../db/init/', import.meta.url)
    for (const file of (await readdir(initDir)).filter(file => file.endsWith('.sql')).sort()) {
        await db.query(await readFile(new URL(file, initDir), 'utf8'))
    }
    process.env.AUTH_DATABASE_URL = process.env.REPLAY_DATABASE_URL = process.env.DATABASE_URL = databaseUrl.toString()
    process.env.BETTER_AUTH_URL = 'http://localhost:3000'
    process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID()
    const auth = await import('../lib/auth.js')
    closeAuth = async () => { await auth.authPool.end(); await auth.authLockPool.end() }
    app = (await import('../app.js')).app
    await app.ready()
    manager = await account('gestor', '85911112222')
    user = await account('atleta', '85911113333')
    admin = await account('administrador', '85911114444')
    await db.query(`INSERT INTO gestor_arena(id_usuario,razao_social,cpf,endereco)
    SELECT id_usuario,'Arena B302','12345678901','Rua Teste' FROM usuario_auth WHERE id_auth=$1`, [manager.id])
    await db.query(`INSERT INTO administrador(id_usuario) SELECT id_usuario FROM usuario_auth WHERE id_auth=$1`, [admin.id])
    const arena = await db.query(`INSERT INTO arena(id_gestor,nome,cidade,endereco) SELECT id_usuario,'Arena B302','Fortaleza','Rua Teste' FROM usuario_auth WHERE id_auth=$1 RETURNING id_arena`, [manager.id])
    arenaId = arena.rows[0].id_arena
    courtId = (await db.query(`INSERT INTO quadra(id_arena,nome) VALUES($1,'Quadra B302') RETURNING id_quadra`, [arenaId])).rows[0].id_quadra
    const replays = await db.query(`INSERT INTO replay(id_quadra,arquivo_url,data_geracao,hora_geracao,status,criado_em,expira_em)
    VALUES ($1,'https://example.com/real-db-fixture.mp4',CURRENT_DATE,'14:15','disponivel',now()-INTERVAL '2 days',now()+INTERVAL '5 days'),
    ($1,'https://example.com/expired.mp4',CURRENT_DATE,'14:16','disponivel',now()-INTERVAL '8 days',now()-INTERVAL '1 day'),
    ($1,NULL,CURRENT_DATE,'14:17','pendente',now()-INTERVAL '2 days',now()+INTERVAL '5 days') RETURNING id_replay`, [courtId])
        ;[availableId, expiredId, pendingId] = replays.rows.map(row => row.id_replay)
})

afterAll(async () => {
    if (app) await app.close()
    if (closeAuth) await closeAuth()
    if (db) await db.end()
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`)
    await adminPool.end()
    await new Promise<void>((resolve, reject) => mailReceiver.close(error => error ? reject(error) : resolve()))
})

describe('B3-02 — rotas com PostgreSQL real, sem mock', () => {
    it('persiste identidade, hash e vínculo de cadastro, sem senha na resposta', async () => {
        const result = await db.query(`SELECT u.telefone,a.password FROM usuario u JOIN usuario_auth ua ON ua.id_usuario=u.id_usuario JOIN account a ON a."userId"=ua.id_auth WHERE ua.id_auth=$1`, [manager.id])
        expect(result.rows[0].telefone).toBe('85911112222')
        expect(result.rows[0].password).toBeTruthy()
        expect(result.rows[0].password).not.toBe(password)
    })
    it('retorna 400 para cadastro ausente e JSON malformado', async () => {
        expect((await app.inject({ method: 'POST', url: '/auth/register', payload: {} })).statusCode).toBe(400)
        expect((await app.inject({ method: 'POST', url: '/auth/register', payload: '{', headers: { 'content-type': 'application/json' } })).statusCode).toBe(400)
    })
    it('rejeita senha fraca com 422 e mensagens compreensíveis', async () => {
        const response = await app.inject({ method: 'POST', url: '/auth/register', payload: { name: 'Teste', email: 'novo@example.com', phone: '85988889999', password: 'senha123' } })
        expect(response.statusCode).toBe(422)
        expect(response.json().error.message).toContain('maiúscula')
    })
    it('rejeita e-mail duplicado normalizado e telefone duplicado formatado com 409', async () => {
        for (const payload of [
            { name: 'Duplicado', email: ' GESTOR@b302.example ', phone: '85911119999', password },
            { name: 'Duplicado', email: 'novo@example.com', phone: '(85) 91111-2222', password },
        ]) expect((await app.inject({ method: 'POST', url: '/auth/register', payload })).statusCode).toBe(409)
    })
    it('cadastros concorrentes do mesmo telefone resultam em 201 e 409, sem identidades órfãs', async () => {
        const responses = await Promise.all(['concorrente1', 'concorrente2'].map(name => app.inject({ method: 'POST', url: '/auth/register', payload: { name, email: name + '@b302.example', phone: '85999998888', password } })))
        expect(responses.map(item => item.statusCode).sort()).toEqual([201, 409])
        const orphans = await db.query('SELECT 1 FROM "user" u LEFT JOIN usuario_auth ua ON ua.id_auth=u.id WHERE ua.id_auth IS NULL')
        expect(orphans.rowCount).toBe(0)
    })
    it('login inválido retorna 401 e sessão válida informa 1800 segundos', async () => {
        const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'atleta@b302.example', password: 'SenhaErrada1!' } })
        expect(response.statusCode).toBe(401)
        const valid = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'atleta@b302.example', password } })
        expect(valid.json().expiresIn).toBe(1800)
        expect(valid.json().user.role).toBe('USER')
    })
    it('preserva signup/login nativos e autenticação por cookie do Better Auth', async () => {
        const response = await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', payload: { email: 'gestor@b302.example', password } })
        expect(response.statusCode, response.body).toBe(200)
        const cookie = response.cookies.map(item => `${item.name}=${item.value}`).join('; ')
        expect((await app.inject({ url: '/manager/metrics', headers: { cookie } })).statusCode).toBe(200)
    })
    it('informa o perfil do usuário autenticado', async () => {
        for (const [account, role] of [[admin, 'ADM'], [manager, 'CLI'], [user, 'USR']] as const) {
            const response = await app.inject({ url: '/me', headers: bearer(account.token) })
            expect(response.statusCode, response.body).toBe(200)
            expect(response.json().data).toMatchObject({ id: account.id, role })
        }
    })
    it('protege todas as rotas privadas com 401', async () => {
        for (const [method, url] of [['GET', '/me'], ['GET', '/admin/metrics'], ['GET', '/manager/metrics'], ['POST', '/sponsors'], ['POST', '/replays'], ['GET', '/replays'], ['GET', `/replays/${availableId}/download`], ['DELETE', `/replays/${availableId}`]] as const) {
            expect((await app.inject({ method, url })).statusCode, url).toBe(401)
        }
    })
    it('lista arenas e quadras com filtros reais e rejeita tipos inválidos', async () => {
        const arenas = await app.inject('/arenas?q=B302&cidade=Fortaleza')
        expect(arenas.json().data[0].id).toBe(arenaId)
        const courts = await app.inject(`/quadras?arenaId=${arenaId}&disponivel=true`)
        expect(courts.json().data[0].id).toBe(courtId)
        expect((await app.inject('/arenas?q[x]=foo')).statusCode).toBe(400)
        expect((await app.inject('/quadras?disponivel=talvez')).statusCode).toBe(400)
    })
    it('métricas negam perfis indevidos e retornam agregações reais', async () => {
        expect((await app.inject({ url: '/admin/metrics', headers: bearer(manager.token) })).statusCode).toBe(403)
        expect((await app.inject({ url: '/manager/metrics', headers: bearer(user.token) })).statusCode).toBe(403)
        const metrics = await app.inject({ url: '/admin/metrics', headers: bearer(admin.token) })
        expect(metrics.statusCode, metrics.body).toBe(200)
        expect(metrics.json().totalCourts).toBe(11)
        const own = await app.inject({ url: '/manager/metrics', headers: bearer(manager.token) })
        expect(own.json().courts).toHaveLength(1)
        expect(own.json().totalReplays).toBe(2)
    })
    it('cria solicitação de gestor com persistência real e valida os dados', async () => {
        const payload = {
            cpf: '52998224725',
            cnpj: '12345678000199',
            companyName: 'Arena Solicitação B404',
            courtQuantity: 2,
            address: {
                street: 'Rua Principal, 100',
                neighborhood: 'Centro',
                zipCode: '60000000',
                city: 'Fortaleza',
                state: 'CE',
            },
        }

        const response = await app.inject({
            method: 'POST',
            url: '/manager-requests',
            headers: bearer(user.token),
            payload,
        })

        expect(response.statusCode, response.body).toBe(201)
        expect(response.json().status).toBe('PENDING')

        const id = response.json().id
        createdId = String(id)

        const persisted = await db.query(
            'SELECT * FROM manager_request WHERE id = $1',
            [id],
        )
        expect(persisted.rowCount).toBe(1)
        expect(persisted.rows[0].razao_social).toBe(payload.companyName)

        const duplicate = await app.inject({
            method: 'POST',
            url: '/manager-requests',
            headers: bearer(user.token),
            payload: { ...payload, cpf: '11144477735', cnpj: '98765432000199' },
        })
        expect(duplicate.statusCode).toBe(409)

        const invalid = await app.inject({
            method: 'POST',
            url: '/manager-requests',
            headers: bearer(user.token),
            payload: { ...payload, cpf: '123' },
        })
        expect(invalid.statusCode).toBe(400)

        const unauthenticated = await app.inject({
            method: 'POST',
            url: '/manager-requests',
            payload,
        })
        expect(unauthenticated.statusCode).toBe(401)
    })

    it('admin aprova solicitação e cria gestor; usuário comum não pode analisar', async () => {
        const forbidden = await app.inject({
            method: 'PATCH',
            url: `/manager-requests/${createdId}`,
            headers: bearer(user.token),
            payload: { status: 'APPROVED' },
        })
        expect(forbidden.statusCode).toBe(403)

        const response = await app.inject({
            method: 'PATCH',
            url: `/manager-requests/${createdId}`,
            headers: bearer(admin.token),
            payload: { status: 'APPROVED' },
        })
        expect(response.statusCode, response.body).toBe(200)
        expect(response.json().status).toBe('APPROVED')

        const persisted = await db.query(
            `SELECT mr.status, mr.analisado_em, ga.id_usuario
       FROM manager_request mr
       JOIN gestor_arena ga ON ga.id_usuario = mr.id_usuario
       WHERE mr.id = $1`,
            [createdId],
        )
        expect(persisted.rowCount).toBe(1)
        expect(persisted.rows[0].status).toBe('APPROVED')
        expect(persisted.rows[0].analisado_em).not.toBeNull()

        const repeated = await app.inject({
            method: 'PATCH',
            url: `/manager-requests/${createdId}`,
            headers: bearer(admin.token),
            payload: { status: 'REJECTED' },
        })
        expect(repeated.statusCode).toBe(409)

        const missing = await app.inject({
            method: 'PATCH',
            url: '/manager-requests/999999999',
            headers: bearer(admin.token),
            payload: { status: 'REJECTED' },
        })
        expect(missing.statusCode).toBe(404)
    })
    it('cadastra e vincula patrocinador, detecta duplicidade e impede vínculo com quadra alheia', async () => {
        const payload = { name: 'Patrocínio B302', imageUrl: 'https://example.com/logo.png', duration: 10, value: 500, courtIds: [courtId] }
        const response = await app.inject({ method: 'POST', url: '/sponsors', headers: bearer(manager.token), payload })
        expect(response.statusCode, response.body).toBe(201)
        const linked = await db.query('SELECT * FROM quadra_patrocinador WHERE id_patrocinador=$1', [response.json().id])
        expect(linked.rows[0].id_quadra).toBe(courtId)
        expect((await app.inject({ method: 'POST', url: '/sponsors', headers: bearer(manager.token), payload })).statusCode).toBe(409)
        expect((await app.inject({ method: 'POST', url: '/sponsors', headers: bearer(user.token), payload })).statusCode).toBe(403)
        expect((await app.inject({ method: 'POST', url: '/sponsors', headers: bearer(manager.token), payload: { ...payload, name: 'Invasor', courtIds: ['40000000-0000-0000-0000-000000000001'] } })).statusCode).toBe(403)
    })
    it('patrocinador inválido não cria registros parciais', async () => {
        const payload = { name: 'Teste Inválido', imageUrl: 'https://example.com/logo.png', duration: 0, value: -1, courtIds: [courtId] }
        expect((await app.inject({ method: 'POST', url: '/sponsors', headers: bearer(manager.token), payload })).statusCode).toBe(400)
        const result = await db.query("SELECT 1 FROM patrocinador WHERE nome='Teste Inválido'")
        expect(result.rowCount).toBe(0)
    })
    it('geração valida UUID, existência, permissão e disponibilidade', async () => {
        for (const [id, status] of [['x', 400], [randomUUID(), 404], ['40000000-0000-0000-0000-000000000001', 403]] as const) {
            expect((await app.inject({ method: 'POST', url: '/replays', headers: bearer(manager.token), payload: { courtId: id } })).statusCode).toBe(status)
        }
        await db.query('UPDATE quadra SET disponivel=false WHERE id_quadra=$1', [courtId])
        expect((await app.inject({ method: 'POST', url: '/replays', headers: bearer(manager.token), payload: { courtId } })).statusCode).toBe(422)
        await db.query('UPDATE quadra SET disponivel=true WHERE id_quadra=$1', [courtId])
    })
    it('serializa duas capturas concorrentes: uma persiste e outra retorna 409', async () => {
        const responses = await Promise.all([0, 1].map(() => app.inject({ method: 'POST', url: '/replays', headers: bearer(manager.token), payload: { courtId } })))
        expect(responses.map(item => item.statusCode).sort()).toEqual([201, 409])
        const response = responses.find(item => item.statusCode === 201)!
        createdId = response.json().data.id
        const replay = (await db.query('SELECT * FROM replay WHERE id_replay=$1', [createdId])).rows[0]
        expect(replay.status).toBe('pendente')
        expect(replay.duracao_segundos).toBe(30)
        expect(replay.expira_em.getTime() - replay.criado_em.getTime()).toBe(168 * 3600_000)
        expect(replay.patrocinadores[0].name).toBe('Patrocínio B302')
    })
    it('rejeita duração arbitrária e filtros/data inválidos', async () => {
        expect((await app.inject({ method: 'POST', url: '/replays', headers: bearer(manager.token), payload: { courtId, duration: 60 } })).statusCode).toBe(400)
        for (const filter of ['date=2026-02-30', 'courtId=x', 'time=25:00']) {
            expect((await app.inject({ url: '/replays?' + filter, headers: bearer(user.token) })).statusCode).toBe(400)
        }
    })
    it('listagem permite atleta autenticado e filtra expirados/pendentes e horário', async () => {
        const response = await app.inject({ url: `/replays?courtId=${courtId}&city=Fortaleza&time=14:15`, headers: bearer(user.token) })
        expect(response.statusCode, response.body).toBe(200)
        expect(response.json().data.map((item: { id: string }) => item.id)).toEqual([availableId])
    })


    it('detalhes do replay retorna dados persistidos e trata IDs inválidos ou indisponíveis', async () => {
        const response = await app.inject({
            url: `/replays/${availableId}`,
            headers: bearer(user.token),
        })

        expect(response.statusCode, response.body).toBe(200)
        expect(response.json().data).toMatchObject({
            id: availableId,
            court: { id: courtId, name: 'Quadra B302' },
            city: 'Fortaleza',
            duration: 30,
            videoUrl: 'https://example.com/real-db-fixture.mp4',
        })
        expect(response.json().data.recordedAt).toBeTruthy()
        expect(response.json().data.expiresAt).toBeTruthy()

        for (const [id, status] of [
            ['invalido', 400],
            [randomUUID(), 404],
            [expiredId, 404],
            [pendingId, 404],
        ] as const) {
            const result = await app.inject({
                url: `/replays/${id}`,
                headers: bearer(user.token),
            })
            expect(result.statusCode, `${id}: ${result.body}`).toBe(status)
        }

        expect((await app.inject({
            url: `/replays/${availableId}`,
        })).statusCode).toBe(401)
    })


    it('download diferencia UUID inválido, ausente, expirado e pendente', async () => {
        for (const [id, status] of [['x', 400], [randomUUID(), 404], [expiredId, 404], [pendingId, 422]] as const) {
            expect((await app.inject({ url: `/replays/${id}/download`, headers: bearer(user.token) })).statusCode).toBe(status)
        }
    })
    it('download real consulta URL persistida e registra evento para as métricas', async () => {
        const response = await app.inject({ url: `/replays/${availableId}/download`, headers: bearer(user.token) })
        expect(response.statusCode, response.body).toBe(200)
        expect(response.json().data.downloadUrl).toBe('https://example.com/real-db-fixture.mp4')
        const metrics = await app.inject({ url: '/admin/metrics', headers: bearer(admin.token) })
        expect(metrics.json().mostAccessedCourts[0]).toMatchObject({ courtId, accesses: 1 })
    })
    it('exclusão exige motivo e perfil e grava mudança/auditoria atomicamente', async () => {
        expect((await app.inject({ method: 'DELETE', url: `/replays/${availableId}`, headers: bearer(manager.token), payload: { reason: '' } })).statusCode).toBe(400)
        expect((await app.inject({ method: 'DELETE', url: `/replays/${availableId}`, headers: bearer(user.token), payload: { reason: 'Teste sem permissão' } })).statusCode).toBe(403)
        const response = await app.inject({ method: 'DELETE', url: `/replays/${availableId}`, headers: bearer(manager.token), payload: { reason: 'Solicitação do proprietário' } })
        expect(response.statusCode, response.body).toBe(200)
        expect((await db.query('SELECT status,arquivo_url FROM replay WHERE id_replay=$1', [availableId])).rows[0]).toEqual({ status: 'excluido', arquivo_url: null })
        expect((await db.query('SELECT id_auth,motivo FROM replay_auditoria WHERE id_replay=$1', [availableId])).rows[0]).toMatchObject({ id_auth: manager.id, motivo: 'Solicitação do proprietário' })
        expect((await app.inject({ url: `/replays/${availableId}/download`, headers: bearer(user.token) })).statusCode).toBe(404)
        expect((await app.inject({ method: 'DELETE', url: `/replays/${availableId}`, headers: bearer(manager.token), payload: { reason: 'Novamente' } })).statusCode).toBe(404)
    })
    it('administrador também pode excluir replay de outra quadra', async () => {
        const response = await app.inject({ method: 'DELETE', url: `/replays/${createdId}`, headers: bearer(admin.token), payload: { reason: 'Moderação administrativa' } })
        expect(response.statusCode, response.body).toBe(200)
    })
    it('expira sessão após inatividade e renova por atividade', async () => {
        const before = (await db.query('SELECT "expiresAt" FROM "session" WHERE token=$1', [user.token])).rows[0].expiresAt
        await db.query(`UPDATE "session" SET "expiresAt"=now()+INTERVAL '2 minutes',"updatedAt"=now()-INTERVAL '28 minutes' WHERE token=$1`, [user.token])
        expect((await app.inject({ url: '/replays', headers: bearer(user.token) })).statusCode).toBe(200)
        const after = (await db.query('SELECT "expiresAt" FROM "session" WHERE token=$1', [user.token])).rows[0].expiresAt
        expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime())
        await db.query(`UPDATE "session" SET "expiresAt"=now()-INTERVAL '1 second' WHERE token=$1`, [user.token])
        expect((await app.inject({ url: '/replays', headers: bearer(user.token) })).statusCode).toBe(401)
    })
    it('rejeita inatividade acima de 30 minutos mesmo com expiração absoluta no futuro', async () => {
        const idle = await account('inativo', '85911117777')
        await db.query(`UPDATE "session" SET "updatedAt"=now()-INTERVAL '31 minutes',"expiresAt"=now()+INTERVAL '1 hour' WHERE token=$1`, [idle.token])
        expect((await app.inject({ url: '/replays', headers: bearer(idle.token) })).statusCode).toBe(401)
    })
    it('bloqueia após cinco falhas por e-mail/IP e não aceita senha correta durante bloqueio', async () => {
        await account('bloqueio', '85911115555')
        for (let i = 1; i <= 5; i++) {
            const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'bloqueio@b302.example', password: 'Incorreta1!' } })
            expect(response.statusCode, response.body).toBe(i === 5 ? 429 : 401)
        }
        expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'bloqueio@b302.example', password } })).statusCode).toBe(429)
        expect((await app.inject({ method: 'POST', url: '/auth/login', remoteAddress: '127.0.0.2', payload: { email: 'bloqueio@b302.example', password } })).statusCode).toBe(200)
    })
    it('recuperação responde genericamente e não expõe o código na API', async () => {
        await account('recuperacao', '85911116666')
        const response = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'recuperacao@b302.example' } })
        expect(response.statusCode, response.body).toBe(200)
        const message = deliveries.at(-1)!
        expect(message.expiresIn).toBe(600)
        expect(response.body).not.toContain(message.token)
        const unknown = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'desconhecido@b302.example' } })
        expect(unknown.json()).toEqual(response.json())
        const stored = (await db.query('SELECT token_hash FROM password_recovery WHERE id=$1', [message.token.split('.')[0]])).rows[0]
        expect(stored.token_hash).not.toBe(message.token)
    })
    it('recuperação rejeita senha anterior e consome o código uma única vez, revogando sessões', async () => {
        const token = deliveries.at(-1)!.token
        const payload = { token, password, passwordConfirmation: password }
        expect((await app.inject({ method: 'POST', url: '/auth/reset-password', payload })).statusCode).toBe(422)
        const next = 'NovaSenha@2026Segura'
        const response = await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { ...payload, password: next, passwordConfirmation: next } })
        expect(response.statusCode, response.body).toBe(200)
        expect((await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { ...payload, password: next, passwordConfirmation: next } })).statusCode).toBe(401)
        const sessions = await db.query(`SELECT 1 FROM "session" s JOIN "user" u ON u.id=s."userId" WHERE u.email='recuperacao@b302.example'`)
        expect(sessions.rowCount).toBe(0)
        expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'recuperacao@b302.example', password: next } })).statusCode).toBe(200)
    })
    it('código expira em 10 minutos e três códigos incorretos bloqueiam a recuperação', async () => {
        const requestReset = () => app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'recuperacao@b302.example' } })
        expect((await requestReset()).statusCode).toBe(200)
        let token = deliveries.at(-1)!.token
        await db.query(`UPDATE password_recovery SET expires_at=now()-INTERVAL '1 second' WHERE id=$1`, [token.split('.')[0]])
        const next = 'OutraSenha@2026'
        expect((await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token, password: next, passwordConfirmation: next } })).statusCode).toBe(401)
        expect((await requestReset()).statusCode).toBe(200)
        token = deliveries.at(-1)!.token
        const wrong = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0')
        for (let i = 1; i <= 3; i++) expect((await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token: wrong, password: next, passwordConfirmation: next } })).statusCode).toBe(i === 3 ? 429 : 401)
        expect((await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token, password: next, passwordConfirmation: next } })).statusCode).toBe(429)
        expect((await requestReset()).statusCode).toBe(429)
    })
    it('não permite alterar telefone por uma rota nativa sem a política de unicidade', async () => {
        const response = await app.inject({ method: 'POST', url: '/api/auth/update-user', headers: bearer(manager.token), payload: { phone: '(85) 91111-3333' } })
        expect(response.statusCode).toBe(400)
        expect((await db.query('SELECT phone FROM "user" WHERE id=$1', [manager.id])).rows[0].phone).toBe('85911112222')
    })
    it('recuperação nativa não permite contornar os limites da RN-07', async () => {
        expect((await app.inject({ method: 'POST', url: '/api/auth/request-password-reset', payload: { email: 'atleta@b302.example' } })).statusCode).toBe(404)
        expect((await app.inject({ method: 'POST', url: '/api/auth/reset-password', payload: { token: 'invalido', newPassword: 'Senha@2026' } })).statusCode).toBe(404)
    })
    it('sem serviço de e-mail configurado retorna 503 sem prometer entrega', async () => {
        const url = process.env.EMAIL_DELIVERY_URL
        delete process.env.EMAIL_DELIVERY_URL
        try {
            expect((await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: 'recuperacao@b302.example' } })).statusCode).toBe(503)
        } finally { process.env.EMAIL_DELIVERY_URL = url }
    })

    it('retenção e exclusão preservam objetos em fila e repetem entrega sem perder pendências', async () => {
        const { expireReplays, deleteStoredMedia } = await import('../services/replay-retention.js')
        const deleted = (await db.query('SELECT arquivo_url FROM media_deletion_job WHERE id_replay=$1', [availableId])).rows[0]
        expect(deleted.arquivo_url).toBe('https://example.com/real-db-fixture.mp4')
        await expireReplays(db)
        expect((await db.query('SELECT status,arquivo_url FROM replay WHERE id_replay=$1', [expiredId])).rows[0]).toEqual({ status: 'excluido', arquivo_url: null })
        expect((await deleteStoredMedia(db)).configured).toBe(false)
        const address = mailReceiver.address() as { port: number }
        process.env.MEDIA_DELETE_URL = `http://127.0.0.1:${address.port}/delete-media`
        storageUnavailable = true
        await expect(deleteStoredMedia(db)).rejects.toThrow('storage')
        expect((await db.query('SELECT 1 FROM media_deletion_job WHERE concluido_em IS NULL')).rowCount).toBeGreaterThan(0)
        storageUnavailable = false
        await db.query('UPDATE media_deletion_job SET proxima_tentativa_em=NULL')
        const result = await deleteStoredMedia(db)
        expect(result.completed).toBeGreaterThan(0)
        expect(mediaRequests.some(job => job.replayId === availableId)).toBe(true)
        expect((await db.query('SELECT 1 FROM media_deletion_job WHERE concluido_em IS NULL')).rowCount).toBe(0)
        expect((await deleteStoredMedia(db)).completed).toBe(0)
    })

        ; (process.env.POSTMAN_RUNNER ? it : it.skip)('executa a coleção Postman por HTTP real e grava relatório sem credenciais', async () => {
            const court = (await db.query(`INSERT INTO quadra(id_arena,nome) VALUES($1,'Quadra Postman') RETURNING id_quadra`, [arenaId])).rows[0].id_quadra
            const replay = (await db.query(`INSERT INTO replay(id_quadra,arquivo_url,data_geracao,hora_geracao,status,criado_em) VALUES($1,'https://example.com/postman-fixture.mp4',CURRENT_DATE,'14:00','disponivel',now()-INTERVAL '1 day') RETURNING id_replay`, [court])).rows[0].id_replay
            const address = await app.listen({ host: '127.0.0.1', port: 0 })
            const reportDir = await mkdtemp(join(tmpdir(), 'b302-newman-'))
            const report = join(reportDir, 'private.json')
            const args = ['run', 'docs/postman/b302.postman_collection.json', '--reporters', 'cli,json', '--reporter-json-export', report]
            for (const [key, value] of Object.entries({ baseUrl: address, managerEmail: 'gestor@b302.example', managerPassword: password, adminEmail: 'administrador@b302.example', adminPassword: password, courtId: court, availableReplayId: replay })) {
                args.push('--env-var', key + '=' + value)
            }
            let result
            try {
                await promisify(execFile)(process.env.POSTMAN_RUNNER!, args, { maxBuffer: 2 * 1024 * 1024 })
                result = JSON.parse(await readFile(report, 'utf8'))
            } finally { await rm(reportDir, { recursive: true, force: true }) }
            expect(result.run.failures).toHaveLength(0)
            expect(result.run.stats.requests.total).toBe(10)
            const sanitized = {
                executedAt: new Date().toISOString(), runner: 'Newman 6 / coleção Postman v2.1', database: 'PostgreSQL real em banco descartável', requests: result.run.stats.requests.total, assertions: result.run.stats.assertions.total, failures: result.run.failures.length,
                executions: result.run.executions.map((execution: { item: { name: string }; request: { method: string }; response: { code: number }; assertions: Array<{ assertion: string; error?: unknown }> }) => ({ name: execution.item.name, method: execution.request.method, status: execution.response.code, assertions: execution.assertions.map(item => ({ name: item.assertion, passed: !item.error })) }))
            }
            await writeFile('docs/evidencias/b302-postman-resultados.json', JSON.stringify(sanitized, null, 2) + '\n')
        }, 30000)

})
