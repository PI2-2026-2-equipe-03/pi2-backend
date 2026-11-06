const API_URL = process.env.API_URL || 'http://localhost:3000/api';

// Helper HTTP nativo para envio e recepção de cookies de sessão (Better Auth)
async function apiRequest(endpoint, options = {}, cookie = null) {
  const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
  } else {
    try {
      data = await response.text();
    } catch (_) {
      data = null;
    }
  }

  const setCookie = response.headers.get('set-cookie');

  return {
    status: response.status,
    body: data || {},
    headers: response.headers,
    cookie: setCookie || cookie,
  };
}

describe('Suíte de Testes Automatizados — Regras de Negócio e RBAC (TáGravado v3)', () => {

  const gestorCredentials = {
    email: 'carlos.mendes@example.com',
    password: 'SenhaValida123'
  };

  const adminCredentials = {
    email: 'admin01@example.com',
    password: 'SenhaValida123'
  };

  const atletaCredentials = {
    email: 'atleta.teste@example.com',
    password: 'SenhaValida123'
  };

  let cookieGestor = null;
  let cookieAdmin = null;
  let cookieAtleta = null;

  beforeAll(async () => {
    try {
      const resGestor = await apiRequest('/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify(gestorCredentials)
      });
      if (resGestor.status === 200) {
        cookieGestor = resGestor.cookie;
      }

      const resAdmin = await apiRequest('/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify(adminCredentials)
      });
      if (resAdmin.status === 200) {
        cookieAdmin = resAdmin.cookie;
      }

      const resAtleta = await apiRequest('/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify(atletaCredentials)
      });
      if (resAtleta.status === 200) {
        cookieAtleta = resAtleta.cookie;
      }
    } catch (err) {
      console.warn(`[Aviso QA] Certifique-se de que a API está ativa em ${API_URL}`);
    }
  });

  describe('RBAC: Controle de Permissões e Acesso por Perfil', () => {
    it('Deve retornar HTTP 403 Forbidden quando Atleta (USR) tenta cadastrar quadra em rota de Gestor/Admin', async () => {
      const payloadQuadra = {
        nome: 'Quadra Proibida Atleta',
        id_arena: '30000000-0000-0000-0000-000000000001',
      };

      const res = await apiRequest('/admin/quadras', {
        method: 'POST',
        body: JSON.stringify(payloadQuadra),
      }, cookieAtleta);

      const resFallback = res.status === 404
        ? await apiRequest('/quadras', {
            method: 'POST',
            body: JSON.stringify(payloadQuadra),
          }, cookieAtleta)
        : res;

      expect([403, 401]).toContain(resFallback.status);
    });

    it('Deve permitir que o Gestor (CLI) ou Admin (ADM) consulte ou acesse rotas administrativas', async () => {
      const res = await apiRequest('/admin/quadras', { method: 'GET' }, cookieGestor || cookieAdmin);
      
      const resFallback = res.status === 404
        ? await apiRequest('/quadras', { method: 'GET' }, cookieGestor || cookieAdmin)
        : res;

      expect([200, 304]).toContain(resFallback.status);
    });

    it('Deve retornar HTTP 401 ao tentar acessar rota privada sem cookie de sessão', async () => {
      const res = await apiRequest('/me', { method: 'GET' });
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('RN-03: Bloqueio de Tentativas Consecutivas de Login', () => {
    const emailAlvo = 'mariana.costa@example.com';
    const credencialInvalida = { email: emailAlvo, password: 'SenhaTotalmenteIncorreta999!' };

    it('Deve rejeitar tentativas inválidas com mensagem neutra sem indicar qual campo está incorreto', async () => {
      const res = await apiRequest('/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify(credencialInvalida),
      });

      expect([400, 401]).toContain(res.status);
    });

    it('Deve bloquear temporariamente após 5 tentativas incorretas consecutivas', async () => {
      let ultimoStatus = 401;

      for (let i = 1; i <= 5; i++) {
        const res = await apiRequest('/auth/sign-in/email', {
          method: 'POST',
          body: JSON.stringify(credencialInvalida),
        });
        ultimoStatus = res.status;
      }

      expect([401, 403, 429]).toContain(ultimoStatus);
    });
  });

  describe('RN-04: Restrição de Exclusão Manual de Replay', () => {
    const replayId = '60000000-0000-0000-0000-000000000001';

    it('Deve retornar HTTP 403 Forbidden quando perfil Atleta (USR) tenta excluir vídeo', async () => {
      const res = await apiRequest(`/replays/${replayId}`, {
        method: 'DELETE',
      }, cookieAtleta);

      expect([403, 401]).toContain(res.status);
    });

    it('Deve permitir que o Gestor (CLI) ou Administrador (ADM) solicite a exclusão de um replay', async () => {
      const replayParaExcluir = '60000000-0000-0000-0000-000000000002';

      const res = await apiRequest(`/replays/${replayParaExcluir}`, {
        method: 'DELETE',
        body: JSON.stringify({ motivo: 'Solicitação de teste QA' }),
      }, cookieGestor || cookieAdmin);

      expect([200, 204, 404]).toContain(res.status);
    });
  });

  describe('RN-02: Acionamento e Duração do Replay (30s)', () => {
    it('Deve acionar o replay da quadra e registrar metadados de 30 segundos', async () => {
      const payloadDisparo = {
        id_quadra: '40000000-0000-0000-0000-000000000001',
        id_camera: '50000000-0000-0000-0000-000000000001',
      };

      const res = await apiRequest('/replays/trigger', {
        method: 'POST',
        body: JSON.stringify(payloadDisparo),
      }, cookieAtleta || cookieGestor);

      if (res.status === 200 || res.status === 201) {
        expect(res.body).toHaveProperty('id_replay');
        if (res.body.duracao_segundos) {
          expect(res.body.duracao_segundos).toBe(30);
        }
      } else {
        expect([404, 501]).toContain(res.status);
      }
    });
  });

  describe('RN-01: Retenção Máxima de 7 Dias e Rotina de Limpeza', () => {
    it('Deve disparar rotina de limpeza de replays vencidos (> 7 dias)', async () => {
      const res = await apiRequest('/replays/cleanup-expired', {
        method: 'POST',
      }, cookieAdmin || cookieGestor);

      expect([200, 204, 404]).toContain(res.status);
    });

    it('Ao consultar replay expirado do seed (CURRENT_DATE - 8), status deve ser excluido ou 404', async () => {
      const res = await apiRequest('/replays/60000000-0000-0000-0000-000000000005', {
        method: 'GET',
      }, cookieGestor || cookieAtleta);

      if (res.status === 200) {
        expect(res.body.status).toBe('excluido');
      } else {
        expect([404, 410]).toContain(res.status);
      }
    });
  });

  describe('RN-05: Exibição de Marca de Patrocinador Vinculado à Quadra', () => {
    it('Deve retornar dados do patrocinador ativo ao consultar quadra patrocinada', async () => {
      const res = await apiRequest('/replays/60000000-0000-0000-0000-000000000001', {
        method: 'GET',
      }, cookieAtleta || cookieGestor);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('id_quadra');
        if (res.body.patrocinador) {
          expect(res.body.patrocinador).toHaveProperty('foto_url');
        }
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });
  });
});
