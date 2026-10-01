-- TaGravado — DDL inicial

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE usuario (
    id_usuario        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome              VARCHAR(150) NOT NULL,
    email             VARCHAR(150) NOT NULL UNIQUE,
    senha_hash        VARCHAR(255) NOT NULL,
    telefone          VARCHAR(20),
    tentativas_login  SMALLINT NOT NULL DEFAULT 0 CHECK (tentativas_login >= 0),
    bloqueado_ate     TIMESTAMPTZ,
    criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gestor_arena (
    id_usuario     UUID PRIMARY KEY REFERENCES usuario(id_usuario) ON DELETE CASCADE,
    razao_social   VARCHAR(150) NOT NULL,
    cpf            CHAR(11) NOT NULL UNIQUE,
    cnpj           CHAR(14) UNIQUE,
    endereco       VARCHAR(255) NOT NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_cpf_formato CHECK (cpf ~ '^[0-9]{11}$'),
    CONSTRAINT chk_cnpj_formato CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$')
);

CREATE TABLE administrador (
    id_usuario  UUID PRIMARY KEY REFERENCES usuario(id_usuario) ON DELETE CASCADE,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE arena (
    id_arena   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_gestor  UUID NOT NULL REFERENCES gestor_arena(id_usuario) ON DELETE RESTRICT,
    nome       VARCHAR(150) NOT NULL,
    cidade     VARCHAR(100) NOT NULL,
    endereco   VARCHAR(255) NOT NULL,
    foto_url   VARCHAR(500),
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quadra (
    id_quadra   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_arena    UUID NOT NULL REFERENCES arena(id_arena) ON DELETE CASCADE,
    nome        VARCHAR(100) NOT NULL,
    disponivel  BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (id_arena, nome)
);

CREATE TABLE camera (
    id_camera      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_quadra      UUID NOT NULL REFERENCES quadra(id_quadra) ON DELETE CASCADE,
    identificador  VARCHAR(100) NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'ativa'
                   CHECK (status IN ('ativa', 'inativa', 'manutencao')),
    UNIQUE (id_quadra, identificador)
);

CREATE TABLE replay (
    id_replay      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_quadra      UUID NOT NULL REFERENCES quadra(id_quadra) ON DELETE CASCADE,
    arquivo_url    VARCHAR(500),
    data_geracao   DATE NOT NULL,
    hora_geracao   TIME NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente', 'disponivel', 'excluido')),
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX idx_replay_quadra_data ON replay (id_quadra, data_geracao, hora_geracao);
CREATE INDEX idx_replay_expira_em ON replay (expira_em) WHERE status <> 'excluido';

CREATE TABLE patrocinador (
    id_patrocinador  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_gestor        UUID NOT NULL REFERENCES gestor_arena(id_usuario) ON DELETE CASCADE,
    nome             VARCHAR(150) NOT NULL,
    foto_url         VARCHAR(500),
    duracao          INTEGER NOT NULL CHECK (duracao > 0),
    valor            NUMERIC(10, 2) NOT NULL CHECK (valor >= 0),
    UNIQUE (id_gestor, nome)
);

CREATE TABLE quadra_patrocinador (
    id_quadra        UUID NOT NULL REFERENCES quadra(id_quadra) ON DELETE CASCADE,
    id_patrocinador  UUID NOT NULL REFERENCES patrocinador(id_patrocinador) ON DELETE CASCADE,
    PRIMARY KEY (id_quadra, id_patrocinador)
);