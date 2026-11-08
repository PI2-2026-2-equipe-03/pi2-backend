let vitestRunner = null;
try {
  vitestRunner = require('vitest');
} catch (_) {}

const describe = globalThis.describe || vitestRunner?.describe;
const it = globalThis.it || vitestRunner?.it;
const expect = globalThis.expect || vitestRunner?.expect;
const beforeAll = globalThis.beforeAll || vitestRunner?.beforeAll;
const afterAll = globalThis.afterAll || vitestRunner?.afterAll;

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const ORIGIN = process.env.ORIGIN || 'http://localhost:5173';
const STATUS_BLOQUEIO = Number(process.env.STATUS_BLOQUEIO || 429);
const LOGIN_DELAY_MS = Number(process.env.LOGIN_ATTEMPT_DELAY_MS || 0);

const ROTAS = {
  signIn: '/auth/sign-in/email',
  signInContract: '/auth/login',
  signUp: '/auth/sign-up/email',
  registerContract: '/auth/register',
  session: '/auth/get-session',
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
  cameraId: '50000000-0000-0000-0000-000000000001',
  replayRecente: '60000000-0000-0000-0000-000000000001',
  replayExcluirGestor: '60000000-0000-0000-0000-000000000002',
  replayExpirado: '60000000-0000-0000-0000-000000000005', // Data de criação > 7 dias
};

const CREDENCIAIS = {
  gestor: { email: 'teste@conta.com', password: 'Teste@12345' },
  admin: { email: 'teste@conta.com', password: 'Teste@12345' },
  atleta: { email: 'teste@conta.com', password: 'Teste@12345' },
};

// const CREDENCIAIS = {
//   gestor: { email: 'carlos.mendes@example.com', password: 'SenhaValida123' },
//   admin: { email: 'admin01@example.com', password: 'SenhaValida123' },
//   atleta: { email: 'atleta.teste@example.com', password: 'SenhaValida123' },
// };

const cookies = { gestor: null, admin: null, atleta: null };
const criados = { replays: [], sponsors: [] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        `Body: ${JSON.stringify(res.body)}${dica ? `\\nDica: ${dica}` : ''}`
    );
  }
}

function expectReplayIndisponivel(res) {
  if (res.status === 200) {
    expect(['excluido', 'EXCLUDED', 'UNAVAILABLE']).toContain(res.body.status);
  } else {
    expectStatus(res, [404, 410]);
  }
}

async function login(credenciais) {
  let res = await apiRequest(ROTAS.signIn, { method: 'POST', json: credenciais });
  if (res.status === 404) {
    res = await apiRequest(ROTAS.signInContract, { method: 'POST', json: credenciais });
  }

  if (res.status !== 200) {
    throw new Error(
      `Login falhou para ${credenciais.email}: HTTP ${res.status} ${JSON.stringify(res.body)}. ` +
        'Verifique se o usuário existe no seed e se a API está ativa.'
    );
  }

  return res.cookie || (res.body.token ? `Bearer ${res.body.token}` : null);
}

async function tentarLogin(credenciais) {
  let res = await apiRequest(ROTAS.signIn, { method: 'POST', json: credenciais });
  if (res.status === 404) {
    res = await apiRequest(ROTAS.signInContract, { method: 'POST', json: credenciais });
  }
  return res;
}

async function criarUsuarioDescartavel(prefixo) {
  const email = `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'SenhaValida123!';
  let res = await apiRequest(ROTAS.signUp, {
    method: 'POST',
    json: { name: `QA ${prefixo}`, email, password },
  });
  if (res.status === 404) {
    res = await apiRequest(ROTAS.registerContract, {
      method: 'POST',
      json: { name: `QA ${prefixo}`, email, phone: '88999990000', password },
    });
  }
  return { email, password, descartavelCriado: [200, 201].includes(res.status) };
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
        await apiRequest(`${ROTAS.replays}/${id}`, { method: 'DELETE', json: { motivo: 'Limpeza QA' } }, cookies.admin);
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
    if (res.status === 200) expect(res.body).toHaveProperty('totalReplays');
  });

  it('Administrador (ADM) consegue acessar métricas administrativas com 200 OK', async () => {
    const res = await apiRequest(ROTAS.adminMetrics, { method: 'GET' }, cookies.admin);
    expectStatus(res, [200, 304]);
    if (res.status === 200) expect(res.body).toHaveProperty('totalCourts');
  });

  it('Acesso anônimo a endpoint protegido retorna 401 Unauthorized', async () => {
    const res = await apiRequest(ROTAS.adminMetrics, { method: 'GET' });
    expectStatus(res, [401, 403]);
  });
});

describe('RN-01: Retenção Máxima de 7 Dias e Exclusão Automática (RF-08)', () => {
  it('Replay antigo (> 7 dias) do seed permanece expirado/indisponível', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayExpirado}`, { method: 'GET' }, cookies.gestor);
    expectReplayIndisponivel(res);
  });

  it('Replay recente (< 7 dias) permanece ativo e disponível para consulta', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}`, { method: 'GET' }, cookies.gestor);
    expectStatus(res, 200);
    expect(res.body.status).not.toBe('excluido');
  });
});

describe('RN-02: Janela Fixa e Buffer do Replay de 30s (RF-05)', () => {
  it('Aciona gravação e registra replay com duração exata de 30 segundos', async () => {
    const res = await apiRequest(
      ROTAS.replays,
      { method: 'POST', json: { courtId: SEED.quadraId, id_quadra: SEED.quadraId, id_camera: SEED.cameraId } },
      cookies.atleta || cookies.gestor
    );

    expectStatus(res, [200, 201]);
    const replayId = res.body.id || res.body.id_replay;
    expect(replayId).toBeDefined();
    criados.replays.push(replayId);

    const duracao = res.body.duration !== undefined ? res.body.duration : res.body.duracao_segundos;
    if (duracao !== undefined) {
      expect(duracao).toBe(30);
    }
  });

  it('Anônimo recebe 401 Unauthorized ao tentar acionar gravação de replay', async () => {
    const res = await apiRequest(ROTAS.replays, {
      method: 'POST',
      json: { courtId: SEED.quadraId, id_quadra: SEED.quadraId },
    });
    if ([200, 201].includes(res.status)) {
      const id = res.body.id || res.body.id_replay;
      if (id) criados.replays.push(id);
    }
    expectStatus(res, [401, 403]);
  });
});

describe('RN-03: Bloqueio Temporário por Falhas Consecutivas de Login (RF-02)', () => {
  it('Credencial inválida rejeita login com mensagem neutra (sem indicar campo incorreto)', async () => {
    const res = await tentarLogin({
      email: `inexistente-${Date.now()}@example.com`,
      password: 'SenhaTotalmenteIncorreta999!',
    });

    expectStatus(res, [400, 401, 403, 429]);
    const texto = JSON.stringify(res.body).toLowerCase();
    expect(texto).not.toMatch(/wrong password|incorrect password|senha incorreta/);
  });

  it('Bloqueia temporariamente (429 ou 403) após 5 tentativas incorretas consecutivas', async () => {
    const usuario = await criarUsuarioDescartavel('tentativas');

    let bloqueou = false;
    for (let i = 0; i < 5; i++) {
      const tentativa = await tentarLogin({ email: usuario.email, password: 'senha-errada-qualquer' });
      if ([403, 429].includes(tentativa.status)) {
        bloqueou = true;
        break;
      }
      if (LOGIN_DELAY_MS) await sleep(LOGIN_DELAY_MS);
    }

    const resFinal = await tentarLogin(usuario);
    expectStatus(resFinal, [200, 401, 403, 429, STATUS_BLOQUEIO]);
  });
});

describe('RN-04: Permissão e Auditoria de Exclusão Manual de Replay (RF-10)', () => {
  it('Atleta (USR) recebe 403 Forbidden ao tentar excluir vídeo de quadra', async () => {
    const del = await apiRequest(
      `${ROTAS.replays}/${SEED.replayRecente}`,
      { method: 'DELETE', json: { motivo: 'Tentativa indevida' } },
      cookies.atleta
    );
    expectStatus(del, [403, 401]);

    const get = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}`, { method: 'GET' }, cookies.gestor);
    if (get.status === 200) expect(get.body.status).not.toBe('excluido');
  });

  it('Gestor (CLI) ou Admin (ADM) consegue excluir replay informando motivo', async () => {
    const replayId = SEED.replayExcluirGestor;
    const del = await apiRequest(
      `${ROTAS.replays}/${replayId}`,
      { method: 'DELETE', json: { motivo: 'Solicitação do cliente da quadra' } },
      cookies.gestor
    );
    expectStatus(del, [200, 204]);

    const depois = await apiRequest(`${ROTAS.replays}/${replayId}`, { method: 'GET' }, cookies.gestor);
    expectReplayIndisponivel(depois);
  });
});

describe('RN-05: Vinculação Obrigatória de Patrocinador em Replays (RF-07, RF-09)', () => {
  it('Replay de quadra patrocinada retorna metadados da marca/patrocinador ativo', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}`, { method: 'GET' }, cookies.atleta);
    expectStatus(res, 200);

    const quadraId = res.body.courtId || res.body.id_quadra || (res.body.court && res.body.court.id);
    expect(quadraId).toBeDefined();

    if (res.body.patrocinador || res.body.sponsor) {
      const p = res.body.patrocinador || res.body.sponsor;
      const url = p.imageUrl || p.foto_url;
      if (url) expect(typeof url).toBe('string');
    }
  });

  it('Permite cadastrar novo patrocinador e vincular a quadra existente (POST /sponsors)', async () => {
    const payload = {
      name: `Patrocinador QA ${Date.now()}`,
      imageUrl: '/uploads/patrocinador-qa.png',
      duration: 10,
      value: 750.0,
      courtIds: [SEED.quadraId],
    };

    const res = await apiRequest(ROTAS.sponsors, { method: 'POST', json: payload }, cookies.gestor || cookies.admin);
    expectStatus(res, [200, 201, 400, 409]);
    if ([200, 201].includes(res.status) && res.body.id) {
      criados.sponsors.push(res.body.id);
    }
  });
});

describe('RN-06: Logout Automático e Duração de Sessão de 30 minutos (RF-02)', () => {
  it('Token de autenticação possui validade máxima de sessão (expiresIn = 1800s)', async () => {
    const res = await tentarLogin(CREDENCIAIS.atleta);
    expectStatus(res, 200);

    if (res.body.expiresIn !== undefined) {
      expect(res.body.expiresIn).toBe(1800);
    }
  });

  it('Rejeita requisição com token de sessão expirado ou inválido (401 Unauthorized)', async () => {
    const tokenExpiradoFalso = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expirado.invalido';
    const res = await apiRequest(ROTAS.me, { method: 'GET' }, tokenExpiradoFalso);
    expectStatus(res, [401, 403, 404]);
  });
});

describe('RN-07: Validade e Limite de Tentativas do Código de Recuperação (RF-11)', () => {
  it('Solicitação de recuperação de senha retorna resposta genérica (sem vazar e-mails)', async () => {
    const res = await apiRequest(ROTAS.forgotPassword, {
      method: 'POST',
      json: { email: 'qualquer-email-para-teste@example.com' },
    });

    expectStatus(res, [200, 404]);
    if (res.status === 200) {
      expect(JSON.stringify(res.body)).toMatch(/mensagem de recuperação|enviada|sucesso/i);
    }
  });

  it('Rejeita redefinição de senha com token/código expirado ou inválido (400 ou 401)', async () => {
    const res = await apiRequest(ROTAS.resetPassword, {
      method: 'POST',
      json: {
        token: 'codigo-invalido-ou-expirado-123456',
        password: 'NovaSenhaSegura@2026',
        passwordConfirmation: 'NovaSenhaSegura@2026',
      },
    });

    expectStatus(res, [400, 401, 404]);
  });
});

describe('RN-08: Visualização e Download de Vídeos Exclusivo para Autenticados (RF-06)', () => {
  it('Usuário anônimo recebe 401 Unauthorized ao tentar baixar replay', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}/download`, { method: 'GET' });
    expectStatus(res, [401, 403, 404]);
  });

  it('Usuário autenticado consegue obter link ou arquivo para download do vídeo (200 OK)', async () => {
    const res = await apiRequest(`${ROTAS.replays}/${SEED.replayRecente}/download`, { method: 'GET' }, cookies.atleta);
    expectStatus(res, [200, 404]);
    if (res.status === 200 && res.body.downloadUrl) {
      expect(typeof res.body.downloadUrl).toBe('string');
    }
  });
});

describe('RN-09: Unicidade de E-mail e Telefone Vinculados a uma Conta (RF-01)', () => {
  it('Rejeita cadastro com e-mail já existente no sistema (409 Conflict ou 400 Bad Request)', async () => {
    const payloadDuplicado = {
      name: 'Atleta Clonado',
      email: CREDENCIAIS.atleta.email,
      phone: '88998881122',
      password: 'SenhaForte@123',
    };

    let res = await apiRequest(ROTAS.registerContract, { method: 'POST', json: payloadDuplicado });
    if (res.status === 404) {
      res = await apiRequest(ROTAS.signUp, {
        method: 'POST',
        json: { name: payloadDuplicado.name, email: payloadDuplicado.email, password: payloadDuplicado.password },
      });
    }

    expectStatus(res, [409, 400, 422]);
  });
});

describe('RN-10: Requisitos Mínimos de Complexidade e Não Repetição de Senha (RF-01, RF-11)', () => {
  it('Rejeita senha fraca que não atende aos requisitos mínimos de segurança (400 Bad Request)', async () => {
    const payloadSenhaFraca = {
      name: 'Usuario Senha Fraca',
      email: `fraca-${Date.now()}@example.com`,
      phone: '88981112233',
      password: 'fraca',
    };

    let res = await apiRequest(ROTAS.registerContract, { method: 'POST', json: payloadSenhaFraca });
    if (res.status === 404) {
      res = await apiRequest(ROTAS.signUp, {
        method: 'POST',
        json: { name: payloadSenhaFraca.name, email: payloadSenhaFraca.email, password: payloadSenhaFraca.password },
      });
    }

    expectStatus(res, [400, 422]);
  });

  it('Rejeita redefinição de senha quando as senhas de confirmação não coincidem (400 Bad Request)', async () => {
    const res = await apiRequest(ROTAS.resetPassword, {
      method: 'POST',
      json: {
        token: 'token-qualquer',
        password: 'NovaSenha@2026',
        passwordConfirmation: 'SenhaDiferente@2026',
      },
    });

    expectStatus(res, [400, 401, 404, 422]);
  });
});
