-- Agente local de captura instalado em cada arena (autenticado por token).
-- O token é exibido uma única vez ao ser gerado; só o hash SHA-256 fica salvo.
BEGIN;

CREATE TABLE agente (
  id_agente          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_arena           UUID NOT NULL REFERENCES arena(id_arena) ON DELETE CASCADE,
  token_hash         CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ativo              BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_contato_em  TIMESTAMPTZ,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agente_arena ON agente (id_arena);

COMMIT;
