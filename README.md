# pi2-backend — TaGravado

API REST para replays de quadras esportivas. Stack atual: Fastify 5, TypeScript, PostgreSQL (`pg`), Better Auth e Zod. O frontend está em [pi2-frontend](https://github.com/PI2-2026-2-equipe-03/pi2-frontend).

## Desenvolvimento

Requisitos: Node.js 22+ e PostgreSQL 16+. Copie `.env.example` para `.env` e ajuste as conexões e uma chave de autenticação segura. O backend atual usa PostgreSQL; não há fluxo SQLite/Prisma.

```bash
npm ci
# No banco vazio, aplique os arquivos src/db/init/*.sql na ordem numérica
# e, se quiser dados sintéticos, src/db/seed/*.sql em seguida.
# Ou use Docker Compose, que inicializa o volume novo automaticamente:
docker compose up --build
```

`src/db/init/` contém só migrações (todos os ambientes); `src/db/seed/` contém dados sintéticos, aplicados apenas em desenvolvimento e nos testes de integração.

### Docker: desenvolvimento x produção

Um único `Dockerfile` multi-stage (`dev` e `runner`) atende os dois ambientes:

- **Desenvolvimento:** `docker compose up --build` carrega `docker-compose.yml` + `docker-compose.override.yml` (stage `dev`, hot reload com bind mount, porta do Postgres publicada e seed aplicado).
- **Produção:** `docker compose -f docker-compose.yml up -d --build` ignora o override (stage `runner`, sem bind mount, banco sem porta publicada e sem seed).

`POSTGRES_PASSWORD` e `BETTER_AUTH_SECRET` são obrigatórios no `.env`. As migrações e o seed só rodam quando o volume do banco está vazio; para reinicializá-lo, `docker compose down -v` apaga o volume e **todos os dados**.

Sem Docker, com o banco já inicializado:

```bash
node --env-file=.env --import tsx src/server.ts
# Watch mode:
node --env-file=.env --import tsx --watch src/server.ts
```

`npm start` e `npm run dev` também funcionam com variáveis injetadas pelo ambiente. A porta vem de `PORT` (padrão 3000); o compose usa `BACKEND_PORT` para publicar a porta. Health check: `GET /api/health`.

Em volume/banco existente, aplique as novas migrações uma única vez. Consulte a [documentação B3-02](docs/regras-de-negocio-implementadas.md) para comandos, oito rotas, payloads, regras, códigos HTTP e limites das integrações de vídeo/e-mail.

## Testes

```bash
npm test                  # Testes unitários (src/tests); não precisam de banco nem de API no ar
npm run build             # TypeScript
TEST_DATABASE_URL=postgresql://usuario@127.0.0.1:5433/postgres npm run test:integration
npm run test:api          # Testes de API (tests/); exigem a API no ar em API_URL (padrão http://localhost:3000/api)
npm run db:expire         # Retenção + exclusão das mídias no R2
```

A integração requer PostgreSQL local e permissão de criação de banco. Cria e remove seu próprio banco descartável, sem mocks de banco/autenticação. O envio de e-mail usa um receptor HTTP local; as operações do R2 são simuladas (`vi.spyOn`) durante os testes.

Importe a [coleção Postman](docs/postman/b302.postman_collection.json) para testar as oito rotas do núcleo. A [documentação de evidências](docs/regras-de-negocio-implementadas.md#validação-reproduzível-e-evidências) explica as variáveis e a execução via Newman.

## Integrações

A autenticação nativa Better Auth em `/api/auth/*` permanece disponível, além de `/auth/register` e `/auth/login`. Novos cadastros exigem telefone e senha forte. Replays novos ficam pendentes até um serviço real de captura/processamento fornecer a mídia. Marca d'água e buffer de câmera dependem desse serviço.

Recuperação exige `EMAIL_DELIVERY_URL` (HTTPS; token opcional `EMAIL_DELIVERY_TOKEN`). Detalhes e payloads estão no documento B3-02.

### Armazenamento de vídeos (Cloudflare R2)

Os vídeos ficam num bucket R2 **privado**. O banco guarda só a chave do objeto (`replays/<arena>/<quadra>/<AAAA>/<MM>/<DD>/<replay>.mp4`), e `GET /replays`, `GET /replays/:id` e `/download` devolvem URLs temporárias.

| Variável | Uso |
|---|---|
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` (padrão) |
| `S3_BUCKET` | Nome do bucket |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Credenciais S3 de um token de API do R2 com permissão *Object Read & Write* restrita a este bucket |
| `UPLOAD_URL_TTL_SECONDS` | Validade das URLs de upload do agente (padrão 600) |
| `DOWNLOAD_URL_TTL_SECONDS` | Validade dos links de vídeo do app (padrão 3600) |

Ao criar o token (R2 → *Manage API tokens*), a Cloudflare exibe uma única vez o valor do token, o *Access Key ID* e o *Secret Access Key*. A API S3 usa só os dois últimos; o valor do token serve para a API REST da Cloudflare e não é configurado aqui. Restringir o token ao bucket limita o impacto de um vazamento das credenciais.

No Docker Compose, essas variáveis são repassadas do `.env` ao serviço `backend`. Sem elas, as rotas de upload do agente respondem `503` e a fila de exclusão (`media_deletion_job`) fica pendente até o storage ser configurado.

O bucket precisa de uma regra de CORS só se algum navegador fizer upload direto; o agente (Node) não precisa.

### Agente da arena

Cada arena roda o `agent-node`, que grava as câmeras e envia os clipes pelas rotas `/api/agent/*` (contrato em [contrato-api.md](docs/referencias/contrato-api.md#agente-da-arena)). O token de uma arena é exibido uma única vez (só o hash SHA-256 fica no banco). Gerar um novo token desativa os anteriores da mesma arena. Há duas formas de gerá-lo:

- pelo app, com sessão de administrador: `POST /api/arenas/{id}/agent-token` (o `id` vem de `GET /api/arenas`);
- pelo terminal:

```bash
npm run agent:token -- <id_arena>
# com Docker: docker compose exec backend npm run agent:token -- <id_arena>
```

Para revogar sem gerar outro, marque `agente.ativo = false`. Em banco existente, aplique `src/db/init/013_agente.sql` uma única vez.
