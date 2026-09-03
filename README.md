# PI2-Backend

API REST do Sistema De Replay.

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
npm run db:seed      # opcional — admin, categorias e produtos de exemplo
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

**sugestão:**
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
`categorias dos endpoints`
- **Admin** - ...
- **Video** - ...

## API

Swagger UI disponível em `http://localhost:3000/docs`. Health check em `http://localhost:3000/health`.

| Grupo | Prefixo | Auth |
|---|---|---|
| Health | `/health` | — |
| Auth | `/auth/*` | — |
| Admin — Admins | `/admin/admins/*` | Bearer JWT |
...

## Scripts

| Script | Descrição |
|---|---|
| `dev` | Servidor em watch mode via tsx |
| `build` | Compila para `dist/` via tsup |
| `build:vercel` | Gera client Prisma + compila (uso em deploy) |
| `start` | Executa o build compilado |
| `lint` / `lint:fix` | ESLint sobre `src/` |
| `format` | Prettier sobre `src/` |
| `test` | Vitest (execução única) |
| `test:watch` | Vitest em modo watch |
| `test:coverage` | Cobertura v8 (≥ 90% em `use-cases/`) |
| `db:migrate` | Cria e aplica migrations |
| `db:generate` | Regenera o Prisma Client |
| `db:seed` | Popula admin, categorias e produtos de exemplo |
| `db:seed:pg` | Seed direto para PostgreSQL |
| `db:reset` | Reset e reaplicação das migrations |
| `db:studio` | Abre o Prisma Studio |

## Banco de dados

O provider é controlado por `DATABASE_PROVIDER` no `.env`:

| Valor | Driver | Migrations |
|---|---|---|
| `sqlite` (padrão dev) | better-sqlite3 | `prisma/migrations/sqlite/` |
| `postgres` (Docker / Supabase) | pg | `prisma/migrations/postgres/` |

O script `scripts/prisma.mjs` sincroniza o `provider` do `schema.prisma` antes de cada comando Prisma, mantendo um schema único para ambos os bancos.

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

Testes unitários usam repositórios in-memory. Testes e2e usam Supertest contra a instância `app` com banco de teste isolado. Cobertura mínima de 90% sobre `src/use-cases/**`.

## Licença

[MIT](LICENSE)
