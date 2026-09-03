# pi2-backend — TaGravado

API REST do **TaGravado**, sistema de replay para quadras esportivas. Este repositório concentra o backend da aplicação; para o SPA, veja [pi2-frontend](https://github.com/PI2-2026-2-equipe-03/pi2-frontend). Para a visão geral do projeto (contexto, equipe, roadmap), veja [PI2-2026-2-equipe-03](https://github.com/PI2-2026-2-equipe-03/PI2-2026-2-equipe-03).

## Objetivo

Expor os recursos necessários para o fluxo de replay (geração, listagem e download de clipes) e, na Sprint 2, para a **reserva de horários** das quadras.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Fastify 5 + fastify-type-provider-zod |
| ORM | Prisma 7 (SQLite em dev, PostgreSQL em prod) |
| Validação | Zod 4 |
| Auth | @fastify/jwt — Bearer token (1 dia) |
| Testes | Vitest + Supertest |

## Quickstart

### Local (SQLite)

```bash
git clone https://github.com/PI2-2026-2-equipe-03/pi2-backend
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed      # opcional — dados de exemplo
npm run dev          # http://localhost:3000
```

### Docker (PostgreSQL)

```bash
cp .env.example .env   # ajuste JWT_SECRET
docker compose up --build
```

O compose sobe um Postgres 16 (`db`) e a aplicação (`api`). O entrypoint aplica as migrations antes de subir o servidor.

Seed opcional após o compose estar rodando:

```bash
docker compose exec api npx prisma db seed
```

## Estrutura

Neste momento o repositório contém apenas o esqueleto (`src/`). A estrutura-alvo, a ser construída ao longo das Sprints 1 e 2:

```
src/
├── env/              validação de variáveis de ambiente (Zod)
├── http/
│   ├── controllers/  controller + routes + schemas por domínio
│   ├── middlewares/  verify-jwt
│   ├── error-handler.ts
│   ├── map-domain-error.ts
│   └── http-schemas.ts   envelopes de resposta { data } / { error }
├── repositories/     interfaces + implementações (prisma/ e in-memory/)
├── use-cases/        regras de negócio organizadas por domínio
├── lib/              PrismaClient singleton (adapter selecionado por env)
├── app.ts            instância Fastify — plugins, rotas, error handler
└── server.ts         entry point (chama app.listen)
```

## Domínios

A ser detalhado após o levantamento de requisitos (Sprint 1). Escopo previsto:

- **Auth** — autenticação de administradores da arena.
- **Replay** — geração, listagem e download de clipes disparados pela botoeira.
- **Reserva** — disponibilidade e reserva de horários das quadras (Sprint 2).

## API

Após implementada, a documentação interativa ficará em `http://localhost:3000/docs` (Swagger UI) e o health check em `http://localhost:3000/health`.

## Scripts (previstos)

| Script | Descrição |
|---|---|
| `dev` | Servidor em watch mode via tsx |
| `build` | Compila para `dist/` via tsup |
| `start` | Executa o build compilado |
| `lint` / `lint:fix` | ESLint sobre `src/` |
| `format` | Prettier sobre `src/` |
| `test` | Vitest (execução única) |
| `test:watch` | Vitest em modo watch |
| `test:coverage` | Cobertura v8 (≥ 90% em `use-cases/`) |
| `db:migrate` | Cria e aplica migrations |
| `db:generate` | Regenera o Prisma Client |
| `db:seed` | Popula dados de exemplo |
| `db:reset` | Reset e reaplicação das migrations |
| `db:studio` | Abre o Prisma Studio |

## Banco de dados

O provider será controlado por `DATABASE_PROVIDER` no `.env`:

| Valor | Driver | Migrations |
|---|---|---|
| `sqlite` (padrão dev) | better-sqlite3 | `prisma/migrations/sqlite/` |
| `postgres` (Docker / Supabase) | pg | `prisma/migrations/postgres/` |

Para **Supabase**, defina também `DIRECT_URL` (conexão direta, usada apenas por migrations — o runtime usa o pooler):

```dotenv
DATABASE_URL="postgresql://...@pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...@supabase.com:5432/postgres"
```

## Testes

```bash
npm test
npm run test:watch
npm run test:coverage
```

Testes unitários usarão repositórios in-memory. Testes e2e usarão Supertest contra a instância `app` com banco de teste isolado. Meta de cobertura: ≥ 90% sobre `src/use-cases/**`.

## Licença

[MIT](LICENSE)
