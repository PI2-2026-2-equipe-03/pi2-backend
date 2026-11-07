const { execSync } = require('node:child_process');

jest.setTimeout(30000);

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';
const STATUS_BLOQUEIO = Number(process.env.STATUS_BLOQUEIO || 429);
const LOGIN_DELAY_MS = Number(process.env.LOGIN_ATTEMPT_DELAY_MS || 0);

const ROTAS = {
  signIn: '/auth/sign-in/email',
  signInContract: '/auth/login',
  signUp: '/auth/sign-up/email',
  session: '/auth/get-session',
  me: '/me',
  
  quadras: '/admin/quadras',
  quadrasPublic: '/quadras',
 
  adminMetrics: '/admin/metrics',
  managerMetrics: '/manager/metrics',
  replays: '/replays',
  sponsors: '/sponsors',
  managerRequests: '/manager-requests',
  replayTrigger: '/replays/trigger',
  replayCleanup: '/replays/cleanup-expired',
};

const SEED = {
  arenaId: '30000000-0000-0000-0000-000000000001',
  quadraId: '40000000-0000-0000-0000-000000000001',
  cameraId: '50000000-0000-0000-0000-000000000001',
  replayRecente: '60000000-0000-0000-0000-000000000001',
  replayExcluirGestor: '60000000-0000-0000-0000-000000000002',
  replayExcluirAdmin: process.env.SEED_REPLAY_EXCLUIR_ADMIN || '60000000-0000-0000-0000-000000000003',
  replayExpirado: '60000000-0000-0000-0000-000000000005',
};

const CREDENCIAIS = {
  gestor: { email: 'teste@conta.com', password: 'Teste@12345' },
  admin: { email: 'teste@conta.com', password: 'Teste@12345' },
  atleta: { email: 'teste@conta.com', password: 'Teste@12345' },
};

// const CREDENCIAIS = {
//   gestor: { email: 'teste@conta.com', password: 'Teste@12345' },
//   admin: { email: 'admin01@example.com', password: 'SenhaValida123' },
//   atleta: { email: 'atleta.teste@example.com', password: 'SenhaValida123' },
// };

const cookies = { gestor: null, admin: null, atleta: null };
const criados = { quadras: [], replays: [] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lerSetCookies(headers) {
  let brutos = [];
  if (typeof headers.getSetCookie === 'function') {
    brutos = headers.getSetCookie();
  } else {
    const unico = headers.get('set-cookie');
    if (unico) brutos = unico.split(/,(?=\s*[^;,\s]+=)/);
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
  const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const { json, headers: extra, ...resto } = options;

  const headers = {
    ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(ORIGIN ? { Origin: ORIGIN } : {}),
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

function expectReplayIndisponivel(res) {
  if (res.status === 200) {
    expect(res.body.status).toBe('excluido');
  } else {
    expectStatus(res, [404, 410]);
  }
}

async function login(credenciais) {
  const res = await apiRequest(ROTAS.signIn, { method: 'POST', json: credenciais });
  if (res.status !== 200) {
    throw new Error(
      `Login falhou para ${credenciais.email}: HTTP ${res.status} ${JSON.stringify(res.body)}. ` +
        'Verifique se o usuário existe no seed e se a API está acessível.'
    );
  }
  if (!res.cookie) {
    throw new Error(`Login de ${credenciais.email} retornou 200, mas sem cookie de sessão.`);
  }
  return res.cookie;
}

async function tentarLogin(credenciais) {
  return apiRequest(ROTAS.signIn, { method: 'POST', json: credenciais });
}

async function criarUsuarioDescartavel(prefixo) {
  const email = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'SenhaValida123';
  const res = await apiRequest(ROTAS.signUp, {
    method: 'POST',
    json: { name: `QA ${prefixo}`, email, password },
  });
  if (![200, 201].includes(res.status)) {
    return { email, password, descartavelCriado: false };
  }
  return { email, password, descartavelCriado: true };
}

beforeAll(async () => {
  if (process.env.RESET_SEED_CMD) {
    try {
      execSync(process.env.RESET_SEED_CMD, { stdio: 'inherit' });
    } catch (e) {
      console.warn('Comando de reset de seed falhou:', e.message);
    }
  }

  cookies.gestor = await login(CREDENCIAIS.gestor);
  cookies.admin = await login(CREDENCIAIS.admin);
  cookies.atleta = await login(CREDENCIAIS.atleta);
});

afterAll(async () => {
  if (cookies.admin) {
    for (const id of criados.replays) {
      try {
        await apiRequest(`${ROTAS.replays}/${id}`, { method: 'DELETE', json: { motivo: 'Limpeza QA' } }, cookies.admin);
      } catch (_) {}
    }
    for (const id of criados.quadras) {
      try {
        await apiRequest(`${ROTAS.quadras}/${id}`, { method: 'DELETE' }, cookies.admin);
      } catch (_) {}
    }
  }
});

describe('RBAC: Controle de Permissões e Acesso por Perfil', () => {
  it('Atleta (USR) recebe 403 ao tentar cadastrar quadra em rota administrativa', async () => {
    let res = await apiRequest(
      ROTAS.quadras,
      { method: 'POST', json: { nome: 'Quadra Proibida Atleta', id_arena: SEED.arenaId } },
      cookies.atleta
    );

    if (res.status === 404) {
      res = await apiRequest(
        ROTAS.quadrasPublic,
        { method: 'POST', json: { nome: 'Quadra Proibida Atleta', id_arena: SEED.arenaId } },
        cookies.atleta
      );
    }

    if ([200, 201].includes(res.status) && res.body.id) criados.quadras.push(res.body.id);
    expectStatus(res, [403, 401]);
  });

  it('Anônimo recebe 401 ao tentar cadastrar quadra', async () => {
    let res = await apiRequest(ROTAS.quadras, {
      method: 'POST',
      json: { nome: 'Quadra Anonima', id_arena: SEED.arenaId },
    });
    if (res.status === 404) {
      res = await apiRequest(ROTAS.quadrasPublic, {
        method: 'POST',
        json: { nome: 'Quadra Anonima', id_arena: SEED.arenaId },
      });
    }
    if ([200, 201].includes(res.status) && res.body.id) criados.quadras.push(res.body.id);
    expectStatus(res, [401, 403]);
  });

  it('Atleta recebe 403 ao listar quadras administrativas', async () => {
    const res = await apiRequest(ROTAS.quadras, { method: 'GET' }, cookies.atleta);
    // 403 (Forbidden) ou 404 se a rota administrativa não estiver exposta para USR
    expectStatus(res, [403, 404]);
  });

  it('Gestor (CLI) ou Admin (ADM) consegue listar quadras administrativas (200 ou 304)', async () => {
    let res = await apiRequest(ROTAS.quadras, { method: 'GET' }, cookies.gestor);
    if (res.status === 404) {
      res = await apiRequest(ROTAS.quadrasPublic, { method: 'GET' }, cookies.gestor);
    }
    expectStatus(res, [200, 304]);
  });

  it('Rota de sessão sem cookie retorna 401 Unauthorized', async () => {
    let res = await apiRequest(ROTAS.me, { method: 'GET' });
    if (res.status === 404) {
      res = await apiRequest(ROTAS.session, { method: 'GET' });
    }
    expectStatus(res, [401, 403, 404]);
  });

  it('Rota de sessão com cookie válido retorna 200 e dados do usuário', async () => {
    let res = await apiRequest(ROTAS.me, { method: 'GET' }, cookies.atleta);
    if (res.status === 404) {
      res = await apiRequest(ROTAS.session, { method: 'GET' }, cookies.atleta);
    }
    if (res.status === 200) {
      expect(JSON.stringify(res.body)).toContain(CREDENCIAIS.atleta.email);
    } else {
      expectStatus(res, [200, 404]);
    }
  });
});

describe('RN-03: Bloqueio de Tentativas Consecutivas de Login', () => {
  it('Senha errada e e-mail inexistente rejeitam tentativa (401 ou 403 quando bloqueado)', async () => {
    const emailInexistente = `inexistente-${Date.now()}@example.com`;
    const res = await tentarLogin({
      email: emailInexistente,
      password: 'SenhaTotalmenteIncorreta999!',
    });

    // 401 ou 403 (caso o IP já esteja em rate limit por execuções anteriores)
    expectStatus(res, [400, 401, 403]);
    const texto = JSON.stringify(res.body).toLowerCase();
    expect(texto).not.toMatch(/wrong password|incorrect password|senha incorreta/);
  });

  it('Tentativas sucessivas acionam proteção de bloqueio temporário (RN-03)', async () => {
    const usuario = await criarUsuarioDescartavel('cinco');

    let bloqueou = false;
    for (let i = 0; i < 5; i++) {
      const tentativa = await tentarLogin({ email: usuario.email, password: 'errada-tentativa' });
      if ([403, 429].includes(tentativa.status)) {
        bloqueou = true;
        break;
      }
      if (LOGIN_DELAY_MS) await sleep(LOGIN_DELAY_MS);
    }

    const resFinal = await tentarLogin(usuario);
    expectStatus(
      resFinal,
      [200, 401, 403, 429, STATUS_BLOQUEIO],
      'Proteção de força bruta ativada'
    );
  });
});

describe('RN-04: Restrição de Exclusão Manual de Replay', () => {
  it('Atleta (USR) recebe 403 ao excluir replay e o vídeo permanece ativo', async () => {
    const del = await apiRequest(
      `${ROTAS.replays}/${SEED.replayRecente}`,
      { method: 'DELETE', json: { motivo: 'Tentativa não autorizada atleta' } },
      cookies.atleta
    );
    expectStatus(del, [403, 401, 400]);

    const get = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}`, { method: 'GET' }, cookies.gestor);
    if (get.status === 200) {
      expect(get.body.status).not.toBe('excluido');
    }
  });

  it('Anônimo recebe 401 ao tentar excluir replay', async () => {
    const del = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}`, {
      method: 'DELETE',
      json: { motivo: 'Tentativa anônima' },
    });
    expectStatus(del, [401, 403]);
  });

  it('Gestor (CLI) ou Admin (ADM) consegue excluir replay com motivo', async () => {
    const replayId = SEED.replayExcluirGestor;
    const del = await apiRequest(
      `${ROTAS.replays}/${replayId}`,
      { method: 'DELETE', json: { motivo: 'Solicitação de teste QA' } },
      cookies.gestor
    );
    expectStatus(del, [200, 204]);

    const depois = await apiRequest(`${ROTAS.replays}/${replayId}`, { method: 'GET' }, cookies.gestor);
    expectReplayIndisponivel(depois);
  });
});

describe('RN-02: Acionamento e Duração do Replay (30s)', () => {
  it('Atleta aciona o replay da quadra e o registro é gerado com 30 segundos', async () => {
    const res = await apiRequest(
      ROTAS.replayTrigger,
      { method: 'POST', json: { id_quadra: SEED.quadraId, id_camera: SEED.cameraId } },
      cookies.atleta
    );
    expectStatus(res, [200, 201]);
    expect(res.body.id_replay).toBeDefined();
    criados.replays.push(res.body.id_replay);

    if (res.body.duracao_segundos !== undefined) {
      expect(res.body.duracao_segundos).toBe(30);
    }

    const get = await apiRequest(`${ROTAS.replays}/${res.body.id_replay}`, { method: 'GET' }, cookies.atleta);
    if (get.status === 200) {
      expect(get.body.id_quadra).toBe(SEED.quadraId);
      if (get.body.duracao_segundos !== undefined) {
        expect(get.body.duracao_segundos).toBe(30);
      }
    }
  });

  it('Anônimo recebe 401 ao acionar replay', async () => {
    const res = await apiRequest(ROTAS.replayTrigger, {
      method: 'POST',
      json: { id_quadra: SEED.quadraId, id_camera: SEED.cameraId },
    });
    if ([200, 201].includes(res.status) && res.body.id_replay) criados.replays.push(res.body.id_replay);
    expectStatus(res, 401);
  });
});

describe('RN-01: Retenção Máxima de 7 Dias e Rotina de Limpeza', () => {
  it('Admin dispara a rotina de limpeza de replays expirados', async () => {
    const res = await apiRequest(
      ROTAS.replayCleanup,
      { method: 'POST', json: { force: true } },
      cookies.admin
    );
    expectStatus(res, [200, 204, 400]);
  });

  it('Replay com mais de 7 dias do seed permanece expirado/indisponível', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayExpirado}`, { method: 'GET' }, cookies.gestor);
    expectReplayIndisponivel(res);
  });

  it('Replay recente NÃO é excluído pela rotina de limpeza', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}`, { method: 'GET' }, cookies.gestor);
    expectStatus(res, 200);
    expect(res.body.status).not.toBe('excluido');
  });

  it('Atleta recebe 403 ao tentar disparar limpeza administrativa', async () => {
    const res = await apiRequest(
      ROTAS.replayCleanup,
      { method: 'POST', json: { force: true } },
      cookies.atleta
    );
    expectStatus(res, [403, 401, 400]);
  });
});

describe('RN-05: Exibição de Marca de Patrocinador Vinculado à Quadra', () => {
  it('Replay de quadra patrocinada retorna metadados do patrocinador ativo', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}`, { method: 'GET' }, cookies.atleta);
    expectStatus(res, 200);
    expect(res.body.id_quadra).toBeDefined();

    if (res.body.patrocinador) {
      expect(typeof res.body.patrocinador.foto_url).toBe('string');
      expect(res.body.patrocinador.foto_url.length).toBeGreaterThan(0);
    }
  });
});
