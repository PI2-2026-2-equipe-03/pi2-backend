
-- TA Gravado - Integração Better Auth 1.7.7
-- Aplicar somente após validação em uma cópia limpa do banco.
-- Pré-requisito: tabela usuario existente.
-- Não aplicar no banco experimental já migrado.

BEGIN;

-- 1. Identidade do Better Auth
CREATE TABLE "user" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tentativas_login SMALLINT NOT NULL DEFAULT 0
        CHECK (tentativas_login >= 0),
    bloqueado_ate TIMESTAMPTZ
);

-- 2. Sessões
CREATE TABLE "session" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL
        REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX "session_userId_idx"
    ON "session" ("userId");

-- 3. Credenciais e provedores OAuth
CREATE TABLE "account" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL
        REFERENCES "user"("id") ON DELETE CASCADE,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ,
    "refreshTokenExpiresAt" TIMESTAMPTZ,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX "account_userId_idx"
    ON "account" ("userId");

-- 4. Verificações de identidade
CREATE TABLE "verification" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "verification_identifier_idx"
    ON "verification" ("identifier");

-- 5. Rate limiting
CREATE TABLE "rateLimit" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL UNIQUE,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL
);

-- 6. Permitir gerenciamento externo de credenciais
ALTER TABLE usuario
    ALTER COLUMN senha_hash DROP NOT NULL;

COMMENT ON COLUMN usuario.senha_hash IS
    'Campo legado. Credenciais gerenciadas pelo Better Auth em account.password.';

-- 7. Vínculo com os usuários originais
CREATE TABLE usuario_auth (
    id_usuario UUID NOT NULL UNIQUE
        REFERENCES usuario(id_usuario) ON DELETE CASCADE,
    id_auth UUID NOT NULL UNIQUE
        REFERENCES "user"("id") ON DELETE CASCADE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id_usuario, id_auth)
);

COMMIT;
