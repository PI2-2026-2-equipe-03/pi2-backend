CREATE INDEX IF NOT EXISTS idx_arena_cidade ON arena (cidade);
CREATE INDEX IF NOT EXISTS idx_arena_gestor ON arena (id_gestor);
CREATE INDEX IF NOT EXISTS idx_quadra_patrocinador_patrocinador ON quadra_patrocinador (id_patrocinador);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_email_lower ON usuario (lower(email));