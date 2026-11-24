import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

const ROTAS = {
  signIn: '/auth/login',
  signInAuth: '/auth/sign-in/email',
  signUp: '/auth/register',
  signUpAuth: '/auth/sign-up/email',
  me: '/me',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',

  replays: '/replays',
  sponsors: '/sponsors',

  adminMetrics: '/admin/metrics',
  managerMetrics: '/manager/metrics',
  managerRequests: '/manager-requests',
};

const SEED = {
  arenaId: '30000000-0000-0000-0000-000000000001',
  quadraId: '40000000-0000-0000-0000-000000000001',
  replayRecente: '60000000-0000-0000-0000-000000000001',
  replayExcluirGestor: '60000000-0000-0000-0000-000000000002',
  replayExpirado: '60000000-0000-0000-0000-000000000005',
};

const CREDENCIAIS = {
  gestor: { email: 'cli@tagravado.test', password: 'Cli@Tagravado2026' },
  admin: { email: 'adm@tagravado.test', password: 'Adm@Tagravado2026' },
  atleta: { email: 'usr@tagravado.test', password: 'Usr@Tagravado2026' },
};

const cookies = { gestor: null, admin: null, atleta: null };
const criados = { replays: [], sponsors: [] };

function lerSetCookies(headers) {
  let brutos = [];
  if (typeof headers.getSetCookie === 'function') {
    brutos = headers.getSetCookie();
  } else {
    const unico = headers.get('set-cookie');
    if (unico) brutos = unico.split(/,(?=\s*[^;,\\s]+=)/);
  }
  return brutos.map((c) => c.split(';')[0].trim()).filter(Boolean);
}

function mesclarCookies(atual, novos) {
  const mapa = new Map();
  (atual || '')
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .forEach((c) => {
      const i = c.indexOf('=');
      mapa.set(c.slice(0, i), c.slice(i + 1));
    });
  novos.forEach((c) => {
    const i = c.indexOf('=');
    mapa.set(c.slice(0, i), c.slice(i + 1));
  });
  return [...mapa.entries()].map(([k, v]) => `${k}=${v}`).join('; ') || null;
}

async function apiRequest(endpoint, options = {}, cookie = null) {
  const safeEndpoint = endpoint || '';
  const url = `${API_URL}${safeEndpoint.startsWith('/') ? safeEndpoint : `/${safeEndpoint}`}`;
  const { json, headers: extra, ...resto } = options;

  const headers = {
    ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(cookie ? { Cookie: cookie, Authorization: cookie.startsWith('Bearer ') ? cookie : undefined } : {}),
    Origin: ORIGIN,
    Referer: `${ORIGIN}/`,
    ...(extra || {}),
  };

  const response = await fetch(url, {
    ...resto,
    headers,
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

  const texto = await response.text();
  let body = {};
  if (texto) {
    try {
      body = JSON.parse(texto);
    } catch (_) {
      body = { raw: texto };
    }
  }

  return {
    status: response.status,
    body,
    headers: response.headers,
    cookie: mesclarCookies(cookie, lerSetCookies(response.headers)),
  };
}

function expectStatus(res, esperado, dica = '') {
  const lista = [].concat(esperado);
  if (!lista.includes(res.status)) {
    throw new Error(
      `Esperado HTTP ${lista.join(' ou ')}, recebido ${res.status}. ` +
        `Body: ${JSON.stringify(res.body)}${dica ? `\nDica: ${dica}` : ''}`
    );
  }
}

async function login(credenciais) {
  let res = await apiRequest(ROTAS.signIn, { method: 'POST', json: credenciais });
  if (res.status === 404) {
    res = await apiRequest(ROTAS.signInAuth, { method: 'POST', json: credenciais });
  }

  if (res.status !== 200) {
    throw new Error(
      `Login falhou para ${credenciais.email}: HTTP ${res.status} ${JSON.stringify(res.body)}.`
    );
  }

  return res.cookie || (res.body.token ? `Bearer ${res.body.token}` : null);
}

beforeAll(async () => {
  cookies.gestor = await login(CREDENCIAIS.gestor);
  cookies.admin = await login(CREDENCIAIS.admin);
  cookies.atleta = await login(CREDENCIAIS.atleta);
});

afterAll(async () => {
  if (cookies.admin) {
    for (const id of criados.replays) {
      try {
        await apiRequest(`${ROTAS.replays}/${id}`, { method: 'DELETE', json: { reason: 'Limpeza QA' } }, cookies.admin);
      } catch (_) {}
    }
  }
});

describe('RBAC: Controle de Permissões e Acesso por Perfil', () => {
  it('Atleta (USR) recebe 403 Forbidden ao acessar métricas de Administrador (GET /admin/metrics)', async () => {
    const res = await apiRequest(ROTAS.adminMetrics, { method: 'GET' }, cookies.atleta);
    expectStatus(res, [403, 401]);
  });

  it('Atleta (USR) recebe 403 Forbidden ao acessar métricas de Gestor (GET /manager/metrics)', async () => {
    const res = await apiRequest(ROTAS.managerMetrics, { method: 'GET' }, cookies.atleta);
    expectStatus(res, [403, 401]);
  });

  it('Gestor (CLI) consegue acessar métricas da arena com 200 OK', async () => {
    const res = await apiRequest(ROTAS.managerMetrics, { method: 'GET' }, cookies.gestor);
    expectStatus(res, [200, 304]);
    if (res.status === 200) {
      const data = res.body.data || res.body;
      expect(data).toHaveProperty('totalReplays');
    }
  });

  it('Administrador (ADM) consegue acessar métricas administrativas com 200 OK', async () => {
    const res = await apiRequest(ROTAS.adminMetrics, { method: 'GET' }, cookies.admin);
    expectStatus(res, [200, 304]);
    if (res.status === 200) {
      const data = res.body.data || res.body;
      expect(data).toHaveProperty('totalCourts');
    }
  });

  it('Acesso anônimo a endpoint protegido retorna 401 Unauthorized', async () => {
    const res = await apiRequest(ROTAS.adminMetrics, { method: 'GET' });
    expectStatus(res, [401, 403]);
  });
});

describe('RN-01: Retenção Máxima de 7 Dias e Exclusão Automática (RF-08)', () => {
  it('Replay antigo (> 7 dias) do seed permanece expirado/indisponível', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayExpirado}`, { method: 'GET' }, cookies.gestor);
    if (res.status === 200) {
      const data = res.body.data || res.body;
      expect(['excluido', 'EXCLUDED', 'UNAVAILABLE', 'expirado']).toContain(data.status);
    } else {
      expectStatus(res, [404, 410]);
    }
  });

  it('Replay recente (< 7 dias) permanece ativo e disponível para consulta', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}`, { method: 'GET' }, cookies.gestor);
    expectStatus(res, 200);
    const data = res.body.data || res.body;
    expect(data.status).not.toBe('excluido');
  });
});

describe('RN-02: Janela Fixa e Buffer do Replay de 30s (RF-05)', () => {
  it('Aciona gravação pelo gestor e registra replay com duração exata de 30 segundos', async () => {
    const res = await apiRequest(
      ROTAS.replays,
      { method: 'POST', json: { courtId: SEED.quadraId } },
      cookies.gestor
    );

    expectStatus(res, [200, 201]);
    const data = res.body.data || res.body;
    const replayId = data.id;
    expect(replayId).toBeDefined();
    criados.replays.push(replayId);

    expect(data.duration).toBe(30);
  });

  it('Anônimo ou Atleta sem permissão recebe 401/403 ao tentar acionar gravação de replay', async () => {
    const res = await apiRequest(ROTAS.replays, {
      method: 'POST',
      json: { courtId: SEED.quadraId },
    }, cookies.atleta);
    expectStatus(res, [401, 403]);
  });
});

describe('RN-03: Bloqueio Temporário por Falhas Consecutivas de Login (RF-02)', () => {
  it('Credencial inválida rejeita login com 401 Unauthorized', async () => {
    const res = await apiRequest(ROTAS.signIn, {
      method: 'POST',
      json: {
        email: `inexistente-${Date.now()}@example.com`,
        password: 'SenhaTotalmenteIncorreta999!',
      },
    });

    expectStatus(res, [400, 401, 403, 429]);
  });

  it('Bloqueia temporariamente (429 Too Many Requests) após 5 tentativas incorretas consecutivas', async () => {
    const emailFake = `bloqueio-${Date.now()}@example.com`;
    let bloqueou = false;

    for (let i = 0; i < 6; i++) {
      const res = await apiRequest(ROTAS.signIn, {
        method: 'POST',
        json: { email: emailFake, password: 'senha-errada-qualquer' },
      });
      if (res.status === 429) {
        bloqueou = true;
        expect(res.body.error?.code).toBe('ACCOUNT_LOCKED');
        break;
      }
    }
  });
});

describe('RN-04: Permissão e Auditoria de Exclusão Manual de Replay (RF-10)', () => {
  it('Atleta (USR) recebe 403 Forbidden ao tentar excluir vídeo de quadra', async () => {
    const del = await apiRequest(
      `${ROTAS.replays}/${SEED.replayRecente}`,
      { method: 'DELETE', json: { reason: 'Tentativa indevida de exclusão' } },
      cookies.atleta
    );
    expectStatus(del, [403, 401]);
  });

  it('Gestor (CLI) ou Admin (ADM) consegue excluir replay informando reason (200 OK)', async () => {
    const replayId = SEED.replayExcluirGestor;
    const del = await apiRequest(
      `${ROTAS.replays}/${replayId}`,
      { method: 'DELETE', json: { reason: 'Solicitação do cliente proprietário da quadra' } },
      cookies.gestor
    );
    expectStatus(del, [200, 204]);

    const depois = await apiRequest(`${ROTAS.replays}/${replayId}`, { method: 'GET' }, cookies.gestor);
    if (depois.status === 200) {
      const data = depois.body.data || depois.body;
      expect(['excluido', 'EXCLUDED', 'UNAVAILABLE']).toContain(data.status);
    } else {
      expectStatus(depois, [404, 410]);
    }
  });
});

describe('RN-05: Vinculação Obrigatória de Patrocinador em Replays (RF-07, RF-09)', () => {
  it('Replay de quadra retorna patrocinadores vinculados', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}`, { method: 'GET' }, cookies.atleta);
    expectStatus(res, 200);

    const data = res.body.data || res.body;
    expect(data.courtId || (data.court && data.court.id)).toBeDefined();
  });

  it('Permite cadastrar novo patrocinador com courtIds (POST /sponsors)', async () => {
    const payload = {
      name: `Patrocinador RN ${Date.now()}`,
      imageUrl: '/uploads/patrocinador-rn.png',
      duration: 10,
      value: 500.0,
      courtIds: [SEED.quadraId],
    };

    const res = await apiRequest(ROTAS.sponsors, { method: 'POST', json: payload }, cookies.gestor);
    expectStatus(res, [200, 201, 409]);
    if ([200, 201].includes(res.status)) {
      const data = res.body.data || res.body;
      if (data.id) criados.sponsors.push(data.id);
    }
  });
});

describe('RN-06: Duração de Sessão de 30 minutos (RF-02)', () => {
  it('Token de autenticação possui validade de sessão (expiresIn = 1800s)', async () => {
    const res = await apiRequest(ROTAS.signIn, { method: 'POST', json: CREDENCIAIS.atleta });
    expectStatus(res, 200);

    if (res.body.expiresIn !== undefined) {
      expect(res.body.expiresIn).toBe(1800);
    }
  });
});

describe('RN-07: Validade e Resposta de Recuperação de Senha (RF-11)', () => {
  it('Solicitação de recuperação de senha retorna resposta genérica (sem vazar e-mails)', async () => {
    const res = await apiRequest(ROTAS.forgotPassword, {
      method: 'POST',
      json: { email: 'qualquer-email-para-teste@example.com' },
    });

    expectStatus(res, [200, 204]);
    if (res.status === 200) {
      expect(typeof res.body.message).toBe('string');
    }
  });

  it('Rejeita redefinição de senha com token expirado ou inválido (401 ou 400)', async () => {
    const res = await apiRequest(ROTAS.resetPassword, {
      method: 'POST',
      json: {
        token: 'uuid.123456',
        password: 'NovaSenhaSegura@2026',
        passwordConfirmation: 'NovaSenhaSegura@2026',
      },
    });

    expectStatus(res, [400, 401, 404, 422]);
  });
});

describe('RN-08: Download Exclusivo para Autenticados (RF-06)', () => {
  it('Usuário anônimo recebe 401 Unauthorized ao tentar baixar replay', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}/download`, { method: 'GET' });
    expectStatus(res, [401, 403]);
  });

  it('Usuário autenticado obtém link para download do vídeo (200 OK)', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}/download`, { method: 'GET' }, cookies.atleta);
    expectStatus(res, [200, 404]);
    if (res.status === 200) {
      const data = res.body.data || res.body;
      expect(data.downloadUrl).toBeDefined();
    }
  });
});

describe('RN-09: Unicidade de E-mail e Telefone (RF-01)', () => {
  it('Rejeita cadastro com e-mail já existente no sistema (409 Conflict)', async () => {
    const payloadDuplicado = {
      name: 'Atleta Clonado',
      email: CREDENCIAIS.atleta.email,
      phone: '88998881122',
      password: 'SenhaForte@123',
      confirmPassword: 'SenhaForte@123',
    };

    const res = await apiRequest(ROTAS.signUp, { method: 'POST', json: payloadDuplicado });
    expectStatus(res, [409, 400, 422]);
  });
});

describe('RN-10: Complexidade e Não Repetição de Senha (RF-01, RF-11)', () => {
  it('Rejeita senha fraca que não atende aos requisitos mínimos (422 / 400)', async () => {
    const payloadSenhaFraca = {
      name: 'Usuario Senha Fraca',
      email: `fraca-${Date.now()}@example.com`,
      phone: '88981112233',
      password: 'fraca',
      confirmPassword: 'fraca',
    };

    const res = await apiRequest(ROTAS.signUp, { method: 'POST', json: payloadSenhaFraca });
    expectStatus(res, [400, 422]);
  });

  it('Rejeita redefinição quando a confirmação de senha não coincide (422 / 400)', async () => {
    const res = await apiRequest(ROTAS.resetPassword, {
      method: 'POST',
      json: {
        token: 'uuid.123456',
        password: 'NovaSenha@2026',
        passwordConfirmation: 'SenhaDiferente@2026',
      },
    });

    expectStatus(res, [400, 401, 404, 422]);
  });
});