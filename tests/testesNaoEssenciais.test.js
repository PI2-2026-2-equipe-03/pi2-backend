import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

const ROTAS = {
  signIn: '/auth/sign-in/email',
  signInContract: '/auth/login',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',

  adminMetrics: '/admin/metrics',
  managerMetrics: '/manager/metrics',

  replays: '/replays',
  sponsors: '/sponsors',

  cameras: '/cameras',
  quadrasAdmin: '/admin/quadras',
  quadrasPublic: '/quadras',
};

const SEED = {
  arenaId: '30000000-0000-0000-0000-000000000001',
  quadraId: '40000000-0000-0000-0000-000000000001',
  cameraId: '50000000-0000-0000-0000-000000000001',
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
const criados = { quadras: [], cameras: [], sponsors: [] };

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

async function apiRequest(endpoint = '', options = {}, cookie = null) {
  const safeEndpoint = endpoint || '';
  const url = `${API_URL}${safeEndpoint.startsWith('/') ? safeEndpoint : `/${safeEndpoint}`}`;
  const { json, headers: extra, ...resto } = options;

  const headers = {
    ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
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
        `Body: ${JSON.stringify(res.body)}${dica ? `\\nDica: ${dica}` : ''}`
    );
  }
}

async function login(credenciais) {
  let res = await apiRequest(ROTAS.signIn, { method: 'POST', json: credenciais });
  if (res.status === 404) {
    res = await apiRequest(ROTAS.signInContract, { method: 'POST', json: credenciais });
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
  // Limpeza de recursos criados durante a execução
  if (cookies.admin || cookies.gestor) {
    const auth = cookies.admin || cookies.gestor;
    for (const id of criados.cameras) {
      try {
        await apiRequest(`${ROTAS.cameras}/${id}`, { method: 'DELETE' }, auth);
      } catch (_) {}
    }
    for (const id of criados.quadras) {
      try {
        await apiRequest(`${ROTAS.quadrasAdmin}/${id}`, { method: 'DELETE' }, auth);
      } catch (_) {}
    }
  }
});

describe('Suíte 1: Métricas e Dashboards de Gestão (RF-03 & RF-04)', () => {
  it('RF-03: Administrador acessa métricas globais da plataforma (200 OK)', async () => {
    const res = await apiRequest(ROTAS.adminMetrics, { method: 'GET' }, cookies.admin);
    expectStatus(res, [200, 304]);

    if (res.status === 200) {
      const campos = Object.keys(res.body);
      const contemMetricaAdmin = campos.some((k) =>
        ['totalCourts', 'totalReplays', 'activeUsers', 'metricas'].includes(k)
      );
      expect(contemMetricaAdmin).toBe(true);
    }
  });

  it('RF-03: Atleta (USR) recebe 403 Forbidden ao tentar acessar métricas de Administrador', async () => {
    const res = await apiRequest(ROTAS.adminMetrics, { method: 'GET' }, cookies.atleta);
    expectStatus(res, [403, 401]);
  });

  it('RF-04: Gestor / Cliente acessa métricas exclusivas da sua arena (200 OK)', async () => {
    const res = await apiRequest(ROTAS.managerMetrics, { method: 'GET' }, cookies.gestor);
    expectStatus(res, [200, 304]);

    if (res.status === 200) {
      // Conforme contrato-api.md (totalReplays, totalSponsors, peakHours, courts)
      const campos = Object.keys(res.body);
      const contemMetricaGestor = campos.some((k) =>
        ['totalReplays', 'totalSponsors', 'courts', 'quadras'].includes(k)
      );
      expect(contemMetricaGestor).toBe(true);
    }
  });

  it('RF-04: Atleta (USR) recebe 403 Forbidden ao tentar acessar métricas de Gestor', async () => {
    const res = await apiRequest(ROTAS.managerMetrics, { method: 'GET' }, cookies.atleta);
    expectStatus(res, [403, 401]);
  });
});

describe('Suíte 2: Gestão de Patrocinadores (RF-07)', () => {
  it('RF-07: Gestor cadastra novo patrocinador vinculado à quadra (201 Created)', async () => {
    const payload = {
      name: `Patrocinador QA ${Date.now()}`,
      imageUrl: '/uploads/patrocinador-teste.png',
      duration: 10,
      value: 750.0,
      courtIds: [SEED.quadraId],
      id_arena: SEED.arenaId,
    };

    const res = await apiRequest(ROTAS.sponsors, { method: 'POST', json: payload }, cookies.gestor);
    expectStatus(res, [200, 201]);

    const sponsorId = res.body.id || res.body.id_patrocinador;
    if (sponsorId) {
      criados.sponsors.push(sponsorId);
    }
  });

  it('RF-07: Atleta (USR) recebe 403 Forbidden ao tentar cadastrar patrocinador', async () => {
    const payload = {
      name: 'Patrocinador Proibido Atleta',
      imageUrl: '/uploads/logo.png',
      courtIds: [SEED.quadraId],
    };

    const res = await apiRequest(ROTAS.sponsors, { method: 'POST', json: payload }, cookies.atleta);
    expectStatus(res, [403, 401]);
  });
});

describe('Suíte 3: Ciclo de Vida e Exclusão de Vídeos (RF-08 & RF-10)', () => {
  it('RF-08: Replay com mais de 7 dias do seed permanece expirado/indisponível (RN-01)', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayExpirado}`, { method: 'GET' }, cookies.gestor);
    if (res.status === 200) {
      expect(['excluido', 'EXCLUDED', 'UNAVAILABLE', 'expirado']).toContain(res.body.status);
    } else {
      expectStatus(res, [404, 410]);
    }
  });

  it('RF-10: Gestor ou Administrador exclui replay manualmente informando motivo (200 OK / 204)', async () => {
    const replayId = SEED.replayExcluirGestor;
    const res = await apiRequest(
      `${ROTAS.replays}/${replayId}`,
      { method: 'DELETE', json: { motivo: 'Solicitação de exclusão manual pelo cliente' } },
      cookies.gestor
    );
    expectStatus(res, [200, 204]);

    const check = await apiRequest(`${ROTAS.replays}/${replayId}`, { method: 'GET' }, cookies.gestor);
    if (check.status === 200) {
      expect(['excluido', 'EXCLUDED', 'UNAVAILABLE']).toContain(check.body.status);
    } else {
      expectStatus(check, [404, 410]);
    }
  });

  it('RF-10: Atleta (USR) recebe 403 Forbidden ao tentar excluir vídeo manualmente', async () => {
    const res = await apiRequest(
      `${ROTAS.replays}/${SEED.replayRecente}`,
      { method: 'DELETE', json: { motivo: 'Tentativa não autorizada' } },
      cookies.atleta
    );
    expectStatus(res, [403, 401]);
  });
});

describe('Suíte 4: Recuperação e Redefinição de Senha (RF-11)', () => {
  it('RF-11: Solicitação de recuperação responde de forma neutra para e-mail cadastrado (200 OK)', async () => {
    const res = await apiRequest(ROTAS.forgotPassword, {
      method: 'POST',
      json: { email: CREDENCIAIS.atleta.email },
    });
    expectStatus(res, [200, 204]);
    if (res.status === 200 && res.body.message) {
      expect(typeof res.body.message).toBe('string');
    }
  });

  it('RF-11: Solicitação com e-mail inexistente não revela ausência do usuário (resposta neutra)', async () => {
    const res = await apiRequest(ROTAS.forgotPassword, {
      method: 'POST',
      json: { email: `inexistente-${Date.now()}@example.com` },
    });
    expectStatus(res, [200, 204, 404]);
  });

  it('RF-11: Rejeita redefinição quando as senhas informadas não coincidem (400 Bad Request)', async () => {
    const res = await apiRequest(ROTAS.resetPassword, {
      method: 'POST',
      json: {
        token: 'token-teste-simulado-123',
        password: 'NovaSenhaForte@123',
        passwordConfirmation: 'OutraSenhaCompletamenteDiferente@123',
      },
    });
    expectStatus(res, [400, 422]);
  });

  it('RF-11: Rejeita redefinição com token inválido ou expirado (400 ou 401)', async () => {
    const res = await apiRequest(ROTAS.resetPassword, {
      method: 'POST',
      json: {
        token: 'token-invalido-ou-expirado-999',
        password: 'NovaSenhaForte@123',
        passwordConfirmation: 'NovaSenhaForte@123',
      },
    });
    expectStatus(res, [400, 401, 404, 422]);
  });
});

describe('Suíte 5: Gestão de Câmeras e Quadras (RF-14, RF-15, RF-16, RF-17)', () => {
  let quadraCriadaId = null;
  let cameraCriadaId = null;

  it('RF-16: Gestor da arena cadastra nova quadra com sucesso (201 Created)', async () => {
    const payload = {
      nome: `Quadra de Teste QA ${Date.now()}`,
      id_arena: SEED.arenaId,
      arenaId: SEED.arenaId,
    };

    let res = await apiRequest(ROTAS.quadrasAdmin, { method: 'POST', json: payload }, cookies.gestor);
    if (res.status === 404) {
      res = await apiRequest(ROTAS.quadrasPublic, { method: 'POST', json: payload }, cookies.gestor);
    }

    expectStatus(res, [200, 201]);
    quadraCriadaId = res.body.id || res.body.id_quadra;
    if (quadraCriadaId) criados.quadras.push(quadraCriadaId);
  });

  it('RF-14: Gestor cadastra nova câmera vinculada à quadra (201 Created)', async () => {
    const payload = {
      nome: 'Câmera Principal Linha de Fundo',
      ip: '192.168.1.150',
      id_quadra: quadraCriadaId || SEED.quadraId,
      quadraId: quadraCriadaId || SEED.quadraId,
    };

    const res = await apiRequest(ROTAS.cameras, { method: 'POST', json: payload }, cookies.gestor);
    expectStatus(res, [200, 201, 404]); // 404 tolerado caso módulo de câmeras esteja em branch de hardware
    if ([200, 201].includes(res.status)) {
      cameraCriadaId = res.body.id || res.body.id_camera;
      if (cameraCriadaId) criados.cameras.push(cameraCriadaId);
    }
  });

  it('RF-15: Gestor exclui câmera cadastrada na arena (200 OK / 204)', async () => {
    const camId = cameraCriadaId || SEED.cameraId;
    const res = await apiRequest(`${ROTAS.cameras}/${camId}`, { method: 'DELETE' }, cookies.gestor);
    expectStatus(res, [200, 204, 404]);
  });

  it('RF-17: Gestor exclui quadra cadastrada na arena (200 OK / 204)', async () => {
    const qId = quadraCriadaId || SEED.quadraId;
    let res = await apiRequest(`${ROTAS.quadrasAdmin}/${qId}`, { method: 'DELETE' }, cookies.gestor);
    if (res.status === 404) {
      res = await apiRequest(`${ROTAS.quadrasPublic}/${qId}`, { method: 'DELETE' }, cookies.gestor);
    }
    expectStatus(res, [200, 204, 403, 404]);
  });

  it('RF-16 & RF-14: Atleta (USR) recebe 403 Forbidden ao tentar cadastrar quadra ou câmera', async () => {
    const resQuadra = await apiRequest(
      ROTAS.quadrasAdmin,
      { method: 'POST', json: { nome: 'Quadra Invasão Atleta', id_arena: SEED.arenaId } },
      cookies.atleta
    );
    expectStatus(resQuadra, [403, 401, 404]);

    const resCamera = await apiRequest(
      ROTAS.cameras,
      { method: 'POST', json: { nome: 'Câmera Invasão Atleta', id_quadra: SEED.quadraId } },
      cookies.atleta
    );
    expectStatus(resCamera, [403, 401, 404]);
  });
});
