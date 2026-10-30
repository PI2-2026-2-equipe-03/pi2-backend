import { Pool } from 'pg'
import { hashPassword } from 'better-auth/crypto'

const connectionString = process.env.AUTH_DATABASE_URL ?? process.env.DATABASE_URL
if (!connectionString) throw new Error('Defina AUTH_DATABASE_URL ou DATABASE_URL')

const users = [
    { role: 'ADM', name: 'Administrador Teste', email: 'adm@tagravado.test', phone: '85900000001', password: 'Adm@Tagravado2026' },
    { role: 'CLI', name: 'Cliente Teste', email: 'cli@tagravado.test', phone: '85900000002', password: 'Cli@Tagravado2026' },
    { role: 'USR', name: 'Usuario Teste', email: 'usr@tagravado.test', phone: '85900000003', password: 'Usr@Tagravado2026' },
]

const pool = new Pool({ connectionString })
const client = await pool.connect()

try {
    await client.query('BEGIN')
    const ids: Record<string, string> = {}

    for (const u of users) {
        await client.query(
            `INSERT INTO "user"(name,email,"emailVerified",phone) VALUES($1,$2,true,$3) ON CONFLICT (email) DO NOTHING`,
            [u.name, u.email, u.phone],
        )
        const authId = (await client.query(`SELECT id FROM "user" WHERE email=$1`, [u.email])).rows[0].id
        await client.query(
            `INSERT INTO account("accountId","providerId","userId",password,"updatedAt")
   SELECT $1::text,'credential',$1::uuid,$2,now()
   WHERE NOT EXISTS (SELECT 1 FROM account WHERE "userId"=$1::uuid AND "providerId"='credential')`,
            [authId, await hashPassword(u.password)],
        )
        ids[u.role] = (await client.query(`SELECT id_usuario FROM usuario_auth WHERE id_auth=$1`, [authId])).rows[0].id_usuario
    }

    await client.query(`INSERT INTO administrador(id_usuario) VALUES($1) ON CONFLICT DO NOTHING`, [ids.ADM])
    await client.query(
        `INSERT INTO gestor_arena(id_usuario,razao_social,cpf,endereco)
     VALUES($1,'Arena Cliente Teste LTDA','11144477735','Rua do Teste, 100') ON CONFLICT DO NOTHING`,
        [ids.CLI],
    )
    await client.query(
        `INSERT INTO arena(id_arena,id_gestor,nome,cidade,endereco)
     VALUES('31000000-0000-0000-0000-000000000001',$1,'Arena Teste','Crateús','Av. Teste, 200') ON CONFLICT DO NOTHING`,
        [ids.CLI],
    )
    await client.query(
        `INSERT INTO quadra(id_quadra,id_arena,nome) VALUES
     ('41000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','Quadra A'),
     ('41000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000001','Quadra B') ON CONFLICT DO NOTHING`,
    )
    await client.query(
        `INSERT INTO camera(id_camera,id_quadra,identificador) VALUES
     ('51000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','CAM-TESTE-A'),
     ('51000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000002','CAM-TESTE-B') ON CONFLICT DO NOTHING`,
    )
    await client.query(
        `INSERT INTO replay(id_replay,id_quadra,arquivo_url,data_geracao,hora_geracao,status,expira_em) VALUES
     ('61000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','https://example.com/replays/teste01.mp4',CURRENT_DATE,'09:00','disponivel',now()+INTERVAL '6 days'),
     ('61000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000001','https://example.com/replays/teste02.mp4',CURRENT_DATE,'10:30','disponivel',now()+INTERVAL '6 days'),
     ('61000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000002','https://example.com/replays/teste03.mp4',CURRENT_DATE,'18:00','disponivel',now()+INTERVAL '6 days') ON CONFLICT DO NOTHING`,
    )
    await client.query(
        `INSERT INTO patrocinador(id_patrocinador,id_gestor,nome,foto_url,duracao,valor) VALUES
     ('71000000-0000-0000-0000-000000000001',$1,'Patrocinador Teste 1','https://example.com/logos/p1.png',10,300),
     ('71000000-0000-0000-0000-000000000002',$1,'Patrocinador Teste 2','https://example.com/logos/p2.png',15,450) ON CONFLICT DO NOTHING`,
        [ids.CLI],
    )
    await client.query(
        `INSERT INTO quadra_patrocinador(id_quadra,id_patrocinador) VALUES
     ('41000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001'),
     ('41000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002'),
     ('41000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING`,
    )

    await client.query('COMMIT')
    console.log('Seed concluído')
} catch (error) {
    await client.query('ROLLBACK')
    throw error
} finally {
    client.release()
    await pool.end()
}