BEGIN;

CREATE TABLE perfil (
  id_perfil SMALLINT PRIMARY KEY,
  codigo    CHAR(3) NOT NULL UNIQUE CHECK (codigo IN ('ADM','CLI','USR')),
  nome      VARCHAR(50) NOT NULL
);

INSERT INTO perfil (id_perfil, codigo, nome) VALUES
  (1, 'ADM', 'Administrador'),
  (2, 'CLI', 'Cliente'),
  (3, 'USR', 'Usuário');

ALTER TABLE usuario
  ADD COLUMN id_perfil SMALLINT NOT NULL DEFAULT 3 REFERENCES perfil(id_perfil);

UPDATE usuario SET id_perfil = 2 WHERE id_usuario IN (SELECT id_usuario FROM gestor_arena);
UPDATE usuario SET id_perfil = 1 WHERE id_usuario IN (SELECT id_usuario FROM administrador);

CREATE INDEX idx_usuario_perfil ON usuario (id_perfil);

CREATE OR REPLACE FUNCTION sincronizar_perfil_usuario()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE usuario
  SET id_perfil = CASE TG_TABLE_NAME WHEN 'administrador' THEN 1 ELSE 2 END
  WHERE id_usuario = NEW.id_usuario
    AND (TG_TABLE_NAME = 'administrador' OR id_perfil <> 1);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_perfil_gestor AFTER INSERT ON gestor_arena
  FOR EACH ROW EXECUTE FUNCTION sincronizar_perfil_usuario();
CREATE TRIGGER trg_perfil_admin AFTER INSERT ON administrador
  FOR EACH ROW EXECUTE FUNCTION sincronizar_perfil_usuario();

COMMIT;