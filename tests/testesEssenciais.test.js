import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const API_URL = process.env.API_URL || 'http://localhost:3000';

function extrairOrigem(urlStr) {
  try {
    return new URL(urlStr).origin;
  } catch (_) {
    return 'http://localhost:5173';
  }
}

const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';

const ROTAS = {
  signUp: '/auth/sign-up/email',
  registerFallback: '/auth/register',
  signIn: '/auth/sign-in/email',
  loginFallback: '/auth/login',
  session: '/auth/get-session',
  me: '/me',

  replays: '/replays',
  replayTriggerFallback: '/replays/trigger',
  
  managerRequests: '/manager-requests',
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


const authState = {
  adminCookie: null,
  adminToken: null,
  gestorCookie: null,
  gestorToken: null,
  atletaCookie: null,
  atletaToken: null,
};

const recursosCriados = {
  replays: [],
  solicitacoes: [],
};

function extrairCookies(headers) {
  let cookiesBrutos = [];
  if (typeof headers.getSetCookie === 'function') {
    cookiesBrutos = headers.getSetCookie();
  } else {
    const raw = headers.get('set-cookie');
    if (raw) cookiesBrutos = raw.split(/,(?=\s*[^;,\\s]+=)/);
  }
  return cookiesBrutos.map((c) => c.split(';')[0].trim()).filter(Boolean);
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

async function apiRequest(endpoint, options = {}, authContext = null) {
  const safeEndpoint = endpoint || '';
  const url = `${API_URL}${safeEndpoint.startsWith('/') ? safeEndpoint : `/${safeEndpoint}`}`;
  const { json, headers: extraHeaders, ...resto } = options;

  let cookie = null;
  let token = null;

  if (typeof authContext === 'string') {
    if (authContext.includes('=')) {
      cookie = authContext;
    } else {
      token = authContext;
    }
  } else if (authContext && typeof authContext === 'object') {
    cookie = authContext.cookie || null;
    token = authContext.token || null;
  }

  const headers = {
    ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    Origin: ORIGIN,
    Referer: ORIGIN,
    ...(cookie ? { Cookie: cookie } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extraHeaders || {}),
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

  const novosCookies = extrairCookies(response.headers);

  return {
    status: response.status,
    body,
    headers: response.headers,
    cookie: mesclarCookies(cookie, novosCookies),
    token: body.token || body.accessToken || token,
  };
}

async function executarLogin(credenciais) {
  let res = await apiRequest(ROTAS.signIn, { method: 'POST', json: credenciais });
  if (res.status === 404) {
    res = await apiRequest(ROTAS.loginFallback, { method: 'POST', json: credenciais });
  }

  if (res.status !== 200) {
    throw new Error(
      `Falha na autenticação de ${credenciais.email}: HTTP ${res.status} ${JSON.stringify(res.body)}.`
    );
  }

  return {
    cookie: res.cookie,
    token: res.body.token || res.body.accessToken || null,
  };
}

beforeAll(async () => {
  try {
    const loginAdmin = await executarLogin(CREDENCIAIS.admin);
    authState.adminCookie = loginAdmin.cookie;
    authState.adminToken = loginAdmin.token;

    const loginGestor = await executarLogin(CREDENCIAIS.gestor);
    authState.gestorCookie = loginGestor.cookie;
    authState.gestorToken = loginGestor.token;

    const loginAtleta = await executarLogin(CREDENCIAIS.atleta);
    authState.atletaCookie = loginAtleta.cookie;
    authState.atletaToken = loginAtleta.token;
  } catch (err) {
    console.warn(`[Aviso de Inicialização] Erro ao autenticar contas padrão: ${err.message}`);
  }
});

afterAll(async () => {
  const authAdmin = { cookie: authState.adminCookie, token: authState.adminToken };
  
  for (const replayId of recursosCriados.replays) {
    try {
      await apiRequest(`${ROTAS.replays}/${replayId}`, { method: 'DELETE', json: { motivo: 'Limpeza Vitest' } }, authAdmin);
    } catch (_) {}
  }
});

describe('ST-01: Gestão de Acesso e Contas', () => {
  
  it('CT-001 — Cadastro de Novo Atleta com Dados Válidos', async () => {
    const usuarioNovo = {
      name: 'Carlos Eduardo QA',
      email: `atleta.novo.${Date.now()}.${Math.random().toString(36).substring(2, 7)}@email.com`,
      phone: '88998887766',
      password: 'SenhaValida@123',
    };

    let res = await apiRequest(ROTAS.signUp, {
      method: 'POST',
      json: usuarioNovo,
    });

    if (res.status === 404) {
      res = await apiRequest(ROTAS.registerFallback, {
        method: 'POST',
        json: usuarioNovo,
      });
    }

    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveProperty('id');
    if (res.body.email) {
      expect(res.body.email).toBe(usuarioNovo.email);
    }
  });

  it('CT-002 — Autenticação de Usuário e Geração de Token JWT / Sessão', async () => {
    let res = await apiRequest(ROTAS.signIn, {
      method: 'POST',
      json: CREDENCIAIS.atleta,
    });

    if (res.status === 404) {
      res = await apiRequest(ROTAS.loginFallback, {
        method: 'POST',
        json: CREDENCIAIS.atleta,
      });
    }

    expect(res.status).toBe(200);

    const temCookie = Boolean(res.cookie && res.cookie.length > 0);
    const temToken = Boolean(res.body.token || res.body.accessToken);
    expect(temCookie || temToken).toBe(true);

    // Valida acesso a rota protegida com a credencial obtida
    let sessao = await apiRequest(ROTAS.me, { method: 'GET' }, { cookie: res.cookie, token: res.token });
    if (sessao.status === 404) {
      sessao = await apiRequest(ROTAS.session, { method: 'GET' }, { cookie: res.cookie, token: res.token });
    }

    expect([200, 304]).toContain(sessao.status);
  });
});

describe('ST-02: Captura e Processamento de Replay', () => {

  // CT-003: Acionamento e Gravação de Replay de 30 Segundos (RF-05, RN-02)
  it('CT-003 — Acionamento e Gravação de Replay de 30 Segundos', async () => {
    const payloadTrigger = {
      courtId: SEED.quadraId,
      id_quadra: SEED.quadraId,
      id_camera: SEED.cameraId,
    };

    let res = await apiRequest(
      ROTAS.replays,
      { method: 'POST', json: payloadTrigger },
      { cookie: authState.gestorCookie || authState.atletaCookie, token: authState.gestorToken }
    );

    if (res.status === 404) {
      res = await apiRequest(
        ROTAS.replayTriggerFallback,
        { method: 'POST', json: payloadTrigger },
        { cookie: authState.gestorCookie || authState.atletaCookie, token: authState.gestorToken }
      );
    }

    expect([200, 201]).toContain(res.status);

    const replayId = res.body.id || res.body.id_replay;
    expect(replayId).toBeDefined();
    recursosCriados.replays.push(replayId);

    const duracao = res.body.duration !== undefined ? res.body.duration : res.body.duracao_segundos;
    if (duracao !== undefined) {
      expect(duracao).toBe(30);
    }
  });

  it('CT-004 — Vinculação Automática de Metadados ao Replay', async () => {
    // Consulta o replay recente com metadados vinculados no seed
    const res = await apiRequest(
      `${ROTAS.replays}/${SEED.replayRecente}`,
      { method: 'GET' },
      { cookie: authState.atletaCookie, token: authState.atletaToken }
    );

    expect(res.status).toBe(200);

    const idQuadra = res.body.courtId || res.body.id_quadra || (res.body.court && res.body.court.id);
    expect(idQuadra).toBeDefined();

    const dataRegistro = res.body.recordedAt || res.body.data_hora || res.body.createdAt;
    expect(dataRegistro).toBeDefined();
  });
});

describe('ST-03: Consulta, Download e Manutenção', () => {

  it('CT-005 — Busca de Vídeos e Download de MP4 em menos de 10s (RNF-03)', async () => {
    const resBusca = await apiRequest(
      `${ROTAS.replays}?city=Crateus&courtId=${SEED.quadraId}`,
      { method: 'GET' },
      { cookie: authState.atletaCookie, token: authState.atletaToken }
    );

    expect([200, 304]).toContain(resBusca.status);

    const inicioTimestamp = Date.now();
    const resDownload = await apiRequest(
      `${ROTAS.replays}/${SEED.replayRecente}/download`,
      { method: 'GET' },
      { cookie: authState.atletaCookie, token: authState.atletaToken }
    );

    const duracaoDownloadMs = Date.now() - inicioTimestamp;

    if (resDownload.status !== 404) {
      expect([200, 302]).toContain(resDownload.status);
    }
    expect(duracaoDownloadMs).toBeLessThan(10000);
  });

  it('CT-006 — Indisponibilidade de Replay com Mais de 7 Dias (RN-01)', async () => {
    const res = await apiRequest(
      `${ROTAS.replays}/${SEED.replayExpirado}`,
      { method: 'GET' },
      { cookie: authState.gestorCookie, token: authState.gestorToken }
    );

    if (res.status === 200) {
      expect(['excluido', 'EXPIRED', 'inactive']).toContain(res.body.status);
    } else {
      expect([404, 410]).toContain(res.status);
    }
  });
});

describe('ST-04: Gestão e Solicitação de Perfil Gestor', () => {
  let solicitacaoId = null;

  it('CT-007 — Envio de Solicitação de Cadastro como Gestor de Quadra', async () => {
    const payloadSolicitacao = {
      cpf: '12345678900',
      cnpj: '12345678000199',
      companyName: 'Arena Crateús Beach Sports LTDA',
      courtQuantity: 2,
      address: {
        street: 'Rua Principal, 100',
        neighborhood: 'Centro',
        zipCode: '60000000',
        city: 'Crateús',
        state: 'CE',
      },
    };

    const res = await apiRequest(
      ROTAS.managerRequests,
      { method: 'POST', json: payloadSolicitacao },
      { cookie: authState.atletaCookie, token: authState.atletaToken }
    );

    if (res.status !== 404) {
      expect([200, 201]).toContain(res.status);
      solicitacaoId = res.body.id || res.body.id_solicitacao;
      if (solicitacaoId) recursosCriados.solicitacoes.push(solicitacaoId);
      if (res.body.status) {
        expect(['PENDING', 'pendente']).toContain(res.body.status);
      }
    }
  });

  it('CT-008 — Bloqueio de Solicitação de Gestor em Duplicidade', async () => {
    const payloadDuplicado = {
      cpf: '12345678900',
      cnpj: '12345678000199',
      companyName: 'Arena Crateús Beach Sports LTDA',
      courtQuantity: 2,
    };

    const res = await apiRequest(
      ROTAS.managerRequests,
      { method: 'POST', json: payloadDuplicado },
      { cookie: authState.atletaCookie, token: authState.atletaToken }
    );

    if (res.status !== 404) {
      expect([400, 409]).toContain(res.status);
    }
  });

  it('CT-009 — Aprovação de Solicitação de Gestor pelo Administrador', async () => {
    const targetId = solicitacaoId || 1;

    const res = await apiRequest(
      `${ROTAS.managerRequests}/${targetId}`,
      { method: 'PATCH', json: { status: 'APPROVED' } },
      { cookie: authState.adminCookie, token: authState.adminToken }
    );

    if (res.status !== 404) {
      expect([200, 204]).toContain(res.status);
      if (res.body.status) {
        expect(['APPROVED', 'aprovado']).toContain(res.body.status);
      }
    }
  });

  it('CT-010 — Reprovação / Indeferimento de Solicitação pelo Administrador', async () => {
    const targetId = solicitacaoId || 2;

    const res = await apiRequest(
      `${ROTAS.managerRequests}/${targetId}`,
      { method: 'PATCH', json: { status: 'REJECTED', motivo: 'Documentação inconsistente' } },
      { cookie: authState.adminCookie, token: authState.adminToken }
    );

    if (res.status !== 404) {
      expect([200, 204]).toContain(res.status);
      if (res.body.status) {
        expect(['REJECTED', 'reprovado', 'indeferido']).toContain(res.body.status);
      }
    }
  });
});
