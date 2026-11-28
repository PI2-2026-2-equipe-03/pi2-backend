# pi2-backend — TaGravado

API REST para replays de quadras esportivas. Stack atual: Fastify 5, TypeScript, PostgreSQL (`pg`), Better Auth e Zod. O frontend está em [pi2-frontend](https://github.com/PI2-2026-2-equipe-03/pi2-frontend).

## Desenvolvimento

Requisitos: Node.js 22+ e PostgreSQL 16+. O backend atual usa PostgreSQL; não há fluxo SQLite/Prisma.

### Variáveis de ambiente

Copie `.env.example` para `.env` e preencha `BETTER_AUTH_SECRET`. O [`.env.example`](.env.example) é a **referência única**: cada variável indica se é obrigatória, o valor sugerido e em que ambiente é usada (compose, execução nativa ou deploy no Render).

Como o `.env` é usado em cada ambiente:

| Ambiente | Origem das variáveis |
|---|---|
| Dev no Docker (`docker compose up`) | `environment` do `docker-compose.yml`. O `.env` só alimenta a interpolação do compose, que falha se faltar uma obrigatória, e não é carregado dentro do container. |
| Dev fora do Docker (`npm run dev`) | `.env`, carregado pelo script. |
| Produção (stage `runner`, Render) | Plataforma ou `environment`. O `.env` não entra na imagem (`.dockerignore`) e não é carregado. |

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

Se faltar uma variável obrigatória no `.env`, o `docker compose up` falha antes de subir os containers. As migrações e o seed só rodam quando o volume do banco está vazio; para reinicializá-lo, `docker compose down -v` apaga o volume e **todos os dados**.

Sem Docker para o backend, usando o banco do compose (publicado em `POSTGRES_PORT`):

```bash
docker compose up -d db
npm run dev   # watch mode; carrega o .env
```

`docker compose up -d db` sobe só o Postgres, com migrações e seed num volume novo. Mesmo assim, o compose valida o arquivo inteiro, então as obrigatórias do backend também precisam estar no `.env`. A rede `pi2-net` é externa: crie-a uma vez com `docker network create pi2-net`. Com um Postgres local, aponte o `DATABASE_URL` para ele e aplique as migrações de `src/db/init/` manualmente.

`npm start` não carrega o `.env`: usa só as variáveis do ambiente, como no Render. Health check: `GET /api/health`.

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

Recuperação exige `EMAIL_DELIVERY_URL` (ver `.env.example`). Detalhes e payloads estão no documento B3-02.

### Armazenamento de vídeos (Cloudflare R2)

Os vídeos ficam num bucket R2 **privado**. O banco guarda só a chave do objeto (`replays/<arena>/<quadra>/<AAAA>/<MM>/<DD>/<replay>.mp4`), e `GET /replays`, `GET /replays/:id` e `/download` devolvem URLs temporárias.

As variáveis `S3_*` estão descritas no `.env.example`. As credenciais vêm de um token de API do R2 com permissão *Object Read & Write* restrita a este bucket.

Ao criar o token (R2 → *Manage API tokens*), a Cloudflare exibe uma única vez o valor do token, o *Access Key ID* e o *Secret Access Key*. A API S3 usa só os dois últimos; o valor do token serve para a API REST da Cloudflare e não é configurado aqui. Restringir o token ao bucket limita o impacto de um vazamento das credenciais.

Sem as variáveis `S3_*`, as rotas de upload do agente respondem `503` e a fila de exclusão (`media_deletion_job`) fica pendente até o storage ser configurado.

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
