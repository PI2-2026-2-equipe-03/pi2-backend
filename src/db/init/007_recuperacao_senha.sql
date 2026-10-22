BEGIN;
CREATE TABLE password_recovery_request (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_recovery_request_email ON password_recovery_request(email,criado_em);
CREATE INDEX idx_password_recovery_request_ip ON password_recovery_request(ip,criado_em);
CREATE TABLE password_recovery (
  id UUID PRIMARY KEY,
  id_auth UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+INTERVAL '10 minutes',
  attempts SMALLINT NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMIT;
