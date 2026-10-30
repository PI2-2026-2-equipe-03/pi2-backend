BEGIN;

CREATE TABLE replay_metadado (
  id_replay       UUID PRIMARY KEY REFERENCES replay(id_replay) ON DELETE CASCADE,
  id_camera       UUID REFERENCES camera(id_camera) ON DELETE SET NULL,
  tamanho_bytes   BIGINT CHECK (tamanho_bytes > 0),
  resolucao       VARCHAR(11) CHECK (resolucao ~ '^[0-9]{3,5}x[0-9]{3,5}$'),
  formato         VARCHAR(10) NOT NULL DEFAULT 'mp4',
  codec           VARCHAR(30),
  checksum_sha256 CHAR(64) CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gravacao_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_quadra     UUID NOT NULL REFERENCES quadra(id_quadra) ON DELETE CASCADE,
  id_camera     UUID REFERENCES camera(id_camera) ON DELETE SET NULL,
  id_replay     UUID REFERENCES replay(id_replay) ON DELETE SET NULL,
  origem        VARCHAR(10) NOT NULL DEFAULT 'botoeira' CHECK (origem IN ('botoeira','api')),
  resultado     VARCHAR(10) NOT NULL CHECK (resultado IN ('sucesso','falha')),
  erro_mensagem TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_log_erro CHECK (resultado = 'sucesso' OR erro_mensagem IS NOT NULL)
);
CREATE INDEX idx_gravacao_log_quadra ON gravacao_log (id_quadra, criado_em DESC);
CREATE INDEX idx_gravacao_log_replay ON gravacao_log (id_replay) WHERE id_replay IS NOT NULL;

COMMIT;