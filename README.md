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
npm test                  # Testes unitários; exclui cópias compiladas em dist/
npm run build             # TypeScript
TEST_DATABASE_URL=postgresql://usuario@127.0.0.1:5433/postgres npm run test:integration
npm run db:expire         # Retenção + entrega de exclusões ao adaptador de storage
```

A integração requer PostgreSQL local e permissão de criação de banco. Cria e remove seu próprio banco descartável, sem mocks de banco/autenticação. O envio de e-mail e o protocolo de exclusão usam receptores HTTP locais durante os testes.

Importe a [coleção Postman](docs/postman/b302.postman_collection.json) para testar as oito rotas do núcleo. A [documentação de evidências](docs/regras-de-negocio-implementadas.md#validação-reproduzível-e-evidências) explica as variáveis e a execução via Newman.

## Integrações

A autenticação nativa Better Auth em `/api/auth/*` permanece disponível, além de `/auth/register` e `/auth/login`. Novos cadastros exigem telefone e senha forte. Replays novos ficam pendentes até um serviço real de captura/processamento fornecer a mídia. Marca d'água e buffer de câmera dependem desse serviço.

Recuperação exige `EMAIL_DELIVERY_URL` (HTTPS; token opcional `EMAIL_DELIVERY_TOKEN`). A remoção física de arquivos exige `MEDIA_DELETE_URL` (token opcional `MEDIA_DELETE_TOKEN`). Sem adaptador de storage, os jobs de remoção ficam preservados no banco e os vídeos excluídos/expirados não são acessíveis pela API. Detalhes e payloads estão no documento B3-02.
