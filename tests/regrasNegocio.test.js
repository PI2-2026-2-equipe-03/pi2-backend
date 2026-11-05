const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db'); 

const EMAIL_RN03 = 'carlos.mendes@example.com';

async function resetarTentativasLogin(email) {
  await db.query(
    'UPDATE usuarios SET tentativas_login = 0, bloqueado_ate = NULL WHERE email = $1',
    [email]
  );
}

describe('Testes Automatizados de Regras de Negócio e Permissões', () => {
  afterAll(async () => {
    await resetarTentativasLogin(EMAIL_RN03);
    await db.end();
  });

  it('Deve retornar HTTP 403 quando um Atleta (USR) tenta acessar rota de Gestor (CLI)', async () => {
    const loginRes = await request(app)
      .post('/auth/login')
      .send({
        email: 'atleta@example.com',
        senha: 'SenhaValida123',
      });

    const tokenAtleta = loginRes.body.token;

    const res = await request(app)
      .post('/quadras')
      .set('Authorization', `Bearer ${tokenAtleta}`)
      .send({
        nome: 'Quadra Inválida',
        id_arena: '30000000-0000-0000-0000-000000000001',
      });

    expect(res.status).toBe(403);
    expect(res.body.mensagem).toMatch(/permissão|acesso negado/i);
  });


  describe('RN-03: Bloqueio por tentativas de login', () => {
    beforeEach(async () => {
      await resetarTentativasLogin(EMAIL_RN03);
    });

    it('Deve bloquear acesso após 5 tentativas consecutivas de senha incorreta', async () => {
      const credenciaisErradas = {
        email: EMAIL_RN03,
        senha: 'SenhaErrada!',
      };

      for (let i = 0; i < 4; i++) {
        await request(app).post('/auth/login').send(credenciaisErradas);
      }

      const tentativa5 = await request(app)
        .post('/auth/login')
        .send(credenciaisErradas);

      expect([401, 403, 429]).toContain(tentativa5.status);
      expect(tentativa5.body.mensagem).toMatch(/bloqueada|tentativas/i);
    });
  });
});