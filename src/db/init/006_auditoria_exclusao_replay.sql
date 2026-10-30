CREATE TABLE IF NOT EXISTS auditoria_exclusao_replay (
    id_auditoria  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario    UUID NOT NULL REFERENCES usuario(id_usuario),
    id_replay     UUID NOT NULL REFERENCES replay(id_replay),
    motivo        VARCHAR(255) NOT NULL,
    excluido_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_exclusao_replay
    ON auditoria_exclusao_replay (id_replay);