BEGIN;
CREATE TABLE media_deletion_job (
  id_replay UUID PRIMARY KEY REFERENCES replay(id_replay),
  arquivo_url TEXT NOT NULL,
  motivo TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em TIMESTAMPTZ
);
COMMIT;
