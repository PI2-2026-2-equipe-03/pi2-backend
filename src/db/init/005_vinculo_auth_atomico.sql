
-- Cria usuario e usuario_auth atomicamente
-- quando uma nova identidade Better Auth é inserida.

BEGIN;

CREATE OR REPLACE FUNCTION vincular_novo_usuario_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    novo_id_usuario UUID;
BEGIN
    INSERT INTO usuario (nome, email, senha_hash)
    VALUES (NEW."name", NEW."email", NULL)
    RETURNING id_usuario INTO novo_id_usuario;

    INSERT INTO usuario_auth (id_usuario, id_auth)
    VALUES (novo_id_usuario, NEW."id");

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vincular_novo_usuario_auth
AFTER INSERT ON "user"
FOR EACH ROW
EXECUTE FUNCTION vincular_novo_usuario_auth();

COMMIT;
