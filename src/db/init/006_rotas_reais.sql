-- B3-02: aplicar uma vez em bancos existentes, após 005.
BEGIN;
-- Mantém o prazo de inatividade também para sessões emitidas antes desta alteração.
UPDATE "session" SET "expiresAt"=LEAST("expiresAt", "updatedAt"+INTERVAL '30 minutes');
ALTER TABLE "user" ADD COLUMN phone TEXT;
-- A normalização faz formatos como (85) 99999-0000 e 85999990000 colidirem.
CREATE UNIQUE INDEX uq_usuario_telefone_normalizado
  ON usuario (regexp_replace(telefone, '[^0-9]', '', 'g'))
  WHERE telefone IS NOT NULL;
CREATE UNIQUE INDEX uq_auth_phone ON "user" (phone) WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION vincular_novo_usuario_auth()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE novo_id_usuario UUID;
BEGIN
  INSERT INTO usuario (nome, email, senha_hash, telefone)
  VALUES (NEW."name", lower(NEW."email"), NULL, NEW.phone)
  RETURNING id_usuario INTO novo_id_usuario;
  INSERT INTO usuario_auth (id_usuario, id_auth) VALUES (novo_id_usuario, NEW."id");
  RETURN NEW;
END;
$$;

ALTER TABLE replay ADD COLUMN duracao_segundos SMALLINT NOT NULL DEFAULT 30 CHECK (duracao_segundos = 30);
-- Snapshot de metadados; não afirma que o processamento de mídia foi concluído.
ALTER TABLE replay ADD COLUMN patrocinadores JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE replay_auditoria (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_replay UUID NOT NULL REFERENCES replay(id_replay),
  id_auth UUID NOT NULL,
  motivo TEXT NOT NULL CHECK (length(trim(motivo)) BETWEEN 3 AND 500),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_replay_auditoria_replay ON replay_auditoria(id_replay);

-- Contadores por e-mail/IP não compartilham bloqueios entre IPs.
CREATE TABLE auth_login_attempt (
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  tentativas_login SMALLINT NOT NULL DEFAULT 0,
  bloqueado_ate TIMESTAMPTZ,
  PRIMARY KEY(email, ip)
);
CREATE UNIQUE INDEX uq_patrocinador_nome_lower ON patrocinador(id_gestor,lower(nome));
CREATE TABLE replay_download_event (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_replay UUID NOT NULL REFERENCES replay(id_replay),
  id_auth UUID NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_replay_download_event_replay ON replay_download_event(id_replay);

COMMIT;
