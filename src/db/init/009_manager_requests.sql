BEGIN;

CREATE TABLE manager_request (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario UUID NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
    cpf CHAR(11) NOT NULL,
    cnpj CHAR(14),
    razao_social VARCHAR(150) NOT NULL,
    quantidade_quadra INTEGER NOT NULL CHECK (quantidade_quadra > 0),
    logradouro VARCHAR(150) NOT NULL,
    bairro VARCHAR(100) NOT NULL,
    cep VARCHAR(8) NOT NULL,
    cidade VARCHAR(100) NOT NULL,
    estado CHAR(2) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    analisado_em TIMESTAMPTZ,
    analisado_por UUID REFERENCES usuario(id_usuario),
    CONSTRAINT chk_manager_request_cpf CHECK (cpf ~ '^[0-9]{11}$'),
    CONSTRAINT chk_manager_request_cnpj CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$')
);

CREATE UNIQUE INDEX uq_manager_request_pending_user
    ON manager_request(id_usuario)
    WHERE status = 'PENDING';

COMMIT;
