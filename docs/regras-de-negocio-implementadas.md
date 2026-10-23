# B3-02 — Rotas reais e regras de negócio

Base: [`contrato-api.md`](referencias/contrato-api.md) e [`regrasDeNegocioRF.md`](referencias/regrasDeNegocioRF.md) fornecidos para a issue #16. O contrato contém mais de oito rotas. Este incremento cobre as oito primeiras da tabela de mapeamento, preserva as listagens existentes e acrescenta recuperação/redefinição de senha para a RN-07.

## Rotas do núcleo

| Método e caminho | Persistência/comportamento | Erros esperados |
| --- | --- | --- |
| `POST /auth/register` | Better Auth cria identidade, credencial com hash, usuário e vínculo. Nome, e-mail, telefone e senha obrigatórios. | 400, 409, 422 |
| `POST /auth/login` | Sessão persistida, token Bearer e cookie; `expiresIn: 1800`. Perfil derivado do banco. | 400, 401, 429 |
| `GET /admin/metrics` | Agregações globais; exclusivo de administrador. | 401, 403 |
| `GET /manager/metrics` | Agregações exclusivamente das quadras do gestor. | 401, 403 |
| `POST /replays` | `{ "courtId": "UUID" }`: registra solicitação pendente, janela de 30 segundos, validade de 168 horas e snapshot dos patrocinadores. | 400, 401, 403, 404, 409, 422 |
| `GET /replays/:id/download` | Consulta URL persistida de vídeo disponível e não expirado. Registra emissão do link para métricas. | 400, 401, 404, 422 |
| `POST /sponsors` | Insere patrocinador e vínculos às quadras do gestor na mesma transação. | 400, 401, 403, 404, 409 |
| `DELETE /replays/:id` | Exige `{ "reason": "Motivo com 3 a 500 caracteres" }`; marca como excluído, retira URL, grava auditoria e enfileira remoção física atomicamente. | 400, 401, 403, 404 |

As rotas são expostas sem prefixo `/api`, como as rotas preexistentes do backend. Os identificadores reais são UUIDs. Cadastro e login seguem os objetos do contrato; replays mantêm o envelope `{ data }` já usado pelo frontend. Erros da aplicação seguem `{ error: { code, message } }`.

Os endpoints nativos `/api/auth/sign-up/email`, `/api/auth/sign-in/email`, `/api/auth/get-session`, `/api/auth/sign-out` e `/api/auth/change-password` continuam disponíveis. O caminho antigo com array de usuários/senhas em memória foi removido. O frontend precisa enviar `phone` no cadastro real; sem esse campo, recebe 400.

## Rotas complementares

- `GET /arenas?cidade=Fortaleza&q=Nome`: filtros textuais limitados a 100/150 caracteres.
- `GET /quadras?arenaId=UUID&disponivel=true`: UUID e booleano textual validados.
- `GET /replays?city=Fortaleza&courtId=UUID&date=2026-10-20&time=14:15`: exige sessão; retorna somente vídeos disponíveis, com URL e ainda válidos. Datas de calendário e horários são validados antes do SQL.
- `POST /auth/forgot-password`: `{ "email": "usuario@example.com" }`.
- `POST /auth/reset-password`: `{ "token": "UUID.codigo", "password": "NovaSenha@2026", "passwordConfirmation": "NovaSenha@2026" }`.

## Mapeamento das regras

| RN | Implementação e evidência | Limite da garantia |
| --- | --- | --- |
| RN-01 | `replays.controller.ts`, `replay-retention.ts` e plugin de retenção: expiração de 168h; expirados não aparecem na busca/download; rotina na inicialização e a cada 24h; fila persistente de exclusão. Testes de expiração, falha do storage e reprocessamento. | Exclusão física depende do adaptador `MEDIA_DELETE_URL`. Sem ele, a fila permanece pendente, e o acesso pela API é negado. Links públicos já emitidos precisam de política de expiração no storage. |
| RN-02 | Criação sempre registra `duracao_segundos=30`, recusa duração enviada pelo cliente e guarda data/horário/quadra. Restrição também no banco. | Buffer de câmera, geração de MP4 e captura dos 30 segundos anteriores pertencem ao serviço de captura, ausente neste repositório. Uma solicitação permanece `pendente` até processamento real. |
| RN-03 | `auth.controller.ts` e `account-lockout.ts`: cinco falhas consecutivas por e-mail/IP, bloqueio de 15 min, verificação antes do hash, limpeza no sucesso. Lock transacional serializa tentativas. Testes verificam isolamento por IP. | `request.ip` é a origem confiável do Fastify; cabeçalhos enviados pelo cliente são sobrescritos antes do Better Auth. Instalações atrás de proxy devem configurar explicitamente a cadeia confiável, sem confiar indiscriminadamente em `X-Forwarded-For`. |
| RN-04 | Exclusão apenas por gestor proprietário ou administrador. Mudança, fila e auditoria (identidade, replay, horário e motivo) na mesma transação. Usuário comum recebe 403. | Remoção do arquivo externo é assíncrona e confirmada pelo adaptador de storage. |
| RN-05 | Patrocinadores e vínculos são persistidos; apenas quadras do próprio gestor. O replay guarda snapshot dos patrocinadores vinculados no acionamento. | A tabela atual não possui flag de patrocinador ativo: vínculo significa participação. Inserção de marca d'água/vinheta, escolha principal/rodízio e marca padrão dependem do processador de mídia. Snapshot não afirma que a marca já foi aplicada. |
| RN-06 | Sessão com 1800 segundos, verificação de última atividade antes de renovação e renovação de cookie nas rotas protegidas. Migração ajusta sessões antigas. Testes verificam renovação, expiração e inatividade mesmo com validade absoluta futura. | O backend aplica a política de 30 min independentemente do campo `rememberMe`; ele não estende esse prazo para dias. A contagem é renovada ao acessar rotas protegidas ou consultar a sessão nativa. |
| RN-07 | `password-recovery.controller.ts`: token com identificador aleatório e código de seis dígitos, armazenado como HMAC; 10 min, uso único, três tentativas e no máximo três envios por e-mail/hora. Novo envio invalida o anterior. Limite adicional de 20 solicitações/IP/hora. | Entrega real exige `EMAIL_DELIVERY_URL`. A suíte testa o protocolo de envio com receptor HTTP local, sem enviar mensagens a pessoas. Sem configuração, a API retorna 503, sem prometer envio. |
| RN-08 | Listagem/download exigem cadastro vinculado e sessão válida; atletas autenticados podem consultar. Capturas da mesma quadra respeitam intervalo de 30 segundos, inclusive sob concorrência. | O documento mistura autenticação e intervalo entre acionamentos; ambos foram considerados. Criação continua restrita ao gestor, preservando a autorização do backend existente. |
| RN-09 | E-mail normalizado em minúsculas; telefone normalizado; índices únicos e lock de cadastro para conflitos concorrentes. Duplicidade retorna 409 e não deixa identidades órfãs nos cenários testados. | O telefone é obrigatório em novos cadastros; números legados nulos continuam permitidos. Alteração de telefone pela rota nativa não é exposta neste incremento. Se houver duplicatas legadas após normalização, a migração falha para correção explícita, sem apagar dados. |
| RN-10 | Cadastro, troca nativa e recuperação exigem 8–128 caracteres, maiúscula, minúscula, número e especial. Troca/recuperação rejeitam senha anterior. Recuperação usa o hash compatível com Better Auth e revoga sessões. | Recuperação nativa do Better Auth fica desabilitada em favor do fluxo com limites da RN-07. |

RN-01, RN-02, RN-04 e RN-05 têm dependências de mídia externas. Esta entrega não deve ser interpretada como validação da captura, do MP4, da marca d'água ou da exclusão em S3.

## Validações e códigos HTTP

- 400: JSON malformado, campos ausentes, tipo inválido, UUID/data/horário incorreto, propriedades desconhecidas no payload.
- 401: credenciais inválidas, ausência de sessão, sessão expirada, token de recuperação inválido/expirado/usado.
- 403: usuário autenticado sem o perfil ou propriedade necessários.
- 404: quadra/replay inexistente, replay excluído ou expirado.
- 409: e-mail/telefone/patrocinador duplicado ou acionamentos em intervalo inferior a 30 segundos.
- 422: senha sem complexidade, confirmação divergente, senha anterior repetida, quadra indisponível ou vídeo ainda em processamento.
- 429: bloqueio de login ou limites de recuperação/serviço de autenticação.
- 503: serviço de e-mail não configurado ou indisponível.
- 500: erro inesperado, sem expor mensagens de SQL ou detalhes internos ao cliente.

Todos os valores SQL são vinculados por parâmetros. Perfil e propriedade vêm do banco, nunca do payload. Os índices e transações garantem as restrições também sob concorrência.

## Banco e execução

Node.js 22+ (validado em Node 24), PostgreSQL (validado em PostgreSQL 17; compose usa 16). Auth e replay devem usar o mesmo banco com as tabelas de `src/db/init/`.

Para banco existente que já recebeu 001–005, faça backup e aplique **uma única vez**, na ordem:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/init/006_rotas_reais.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/init/007_recuperacao_senha.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/init/008_retencao_midias.sql
```

A criação de índices falha se os dados existentes violarem unicidade; trate esses dados antes de repetir a migração. Nenhum reset automático é executado. O compose aplica todos os arquivos na primeira criação do volume; um volume já existente precisa das migrações acima.

Com as variáveis de `.env.example` preenchidas para o banco correto:

```bash
npm ci
node --env-file=.env --import tsx src/server.ts
```

As variáveis também podem ser injetadas pelo ambiente (`npm start`). `.env` não é carregado implicitamente pelo script antigo. Ajuste `PORT`, não apenas `API_PORT`, para execução fora do compose.

Para executar a rotina de retenção por cron, independentemente do processo web, injete as variáveis e rode diariamente `npm run db:expire`. A rotina é idempotente; múltiplos workers usam `SKIP LOCKED`. Se o storage falhar, o job não recebe confirmação e será tentado novamente. A API nunca transforma registro pendente em disponível artificialmente.

## Adaptadores externos

`EMAIL_DELIVERY_URL` deve ser um endpoint HTTPS controlado pela equipe que envie o e-mail. `EMAIL_DELIVERY_TOKEN` é uma credencial opcional, enviada como Bearer; configure-a por variável segura. O backend envia:

```json
{ "to": "destinatario@example.com", "template": "password-recovery", "token": "UUID.codigo", "expiresIn": 600, "idempotencyKey": "UUID" }
```

O serviço deve tratar a chave de idempotência e retornar 2xx ao aceitar a entrega. Tokens nunca são devolvidos pela API de recuperação, impressos nos logs ou incluídos em arquivos versionados.

`MEDIA_DELETE_URL` deve apagar o objeto solicitado de forma idempotente e retornar 2xx **somente após confirmar a remoção** (objeto já ausente também é sucesso). `MEDIA_DELETE_TOKEN` é opcional. Payload:

```json
{ "replayId": "UUID", "objectUrl": "URL do objeto persistido", "reason": "Motivo da exclusão" }
```

Ambos os adaptadores preservam TLS, recusam redirecionamentos e têm timeout de 5 segundos. HTTP sem TLS é permitido exclusivamente para loopback fora de produção. URLs e credenciais reais não acompanham este repositório.

## Validação reproduzível e evidências

Execução nesta entrega (20/10/2026): 28 testes unitários aprovados, 31 cenários de integração aprovados (incluindo o runner Postman), compilação TypeScript aprovada. A coleção executou 10 requisições (oito rotas e dois logins de apoio), com 18 assertions aprovadas e zero falhas. As migrações 006–008 também foram aplicadas ao banco local deste ambiente após backup.

```bash
npm test
npm run build
TEST_DATABASE_URL=postgresql://usuario@127.0.0.1:5433/postgres npm run test:integration
```

A conexão de integração precisa de `CREATEDB`. A suíte cria um banco de nome aleatório `b302_test_*`, aplica schema, migrations e seed reais e remove apenas esse banco ao final. Não redefine o banco apontado por `TEST_DATABASE_URL`. O teste Postman é opcional e aparece como ignorado se `POSTMAN_RUNNER` não for fornecido.

Para incluir a coleção por HTTP real, instale Newman em um diretório local de ferramentas e execute:

```bash
npm install --prefix /tmp/b302-tools newman@6
TEST_DATABASE_URL=postgresql://usuario@127.0.0.1:5433/postgres \
POSTMAN_RUNNER=/tmp/b302-tools/node_modules/.bin/newman npm run test:integration
```

A coleção está em [`postman/b302.postman_collection.json`](postman/b302.postman_collection.json). O relatório sanitizado da execução está em [`evidencias/b302-postman-resultados.json`](evidencias/b302-postman-resultados.json). Os testes verificam as respostas e a persistência diretamente no PostgreSQL, com cenários de concorrência, perfis, auditoria, sessão, recuperação e reprocessamento da fila de mídia. URLs `example.com` dos fixtures/seed não são provas de arquivo de vídeo existente.

Para os **prints exigidos na issue**, importe a coleção no Postman/Insomnia, configure as variáveis locais (contas reais de gestor/administrador, quadra própria e replay disponível), execute e capture método, URL, status e resposta das oito rotas. O Collection Runner cadastra um usuário novo, cria um patrocinador e exclui apenas o replay criado na execução. Não exponha tokens, cookies, senhas ou valores de variáveis nos prints. O relatório Newman é evidência automatizada; não substitui prints de uma interface que não foi executada. Nenhum comentário foi publicado na issue por esta implementação.
