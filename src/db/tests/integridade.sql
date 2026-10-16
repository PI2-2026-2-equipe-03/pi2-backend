BEGIN;

CREATE FUNCTION pg_temp.esperar_erro(nome text, esperado text, comando text)
RETURNS void AS $$
BEGIN
  EXECUTE comando;
  RAISE NOTICE 'FALHOU | % | nenhum erro lançado', nome;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = esperado THEN
    RAISE NOTICE 'OK     | % | % | %', nome, SQLSTATE, SQLERRM;
  ELSE
    RAISE NOTICE 'FALHOU | % | esperado %, obtido % | %', nome, esperado, SQLSTATE, SQLERRM;
  END IF;
END $$ LANGUAGE plpgsql;

SELECT pg_temp.esperar_erro('FK: replay com quadra inexistente', '23503',
$q$INSERT INTO replay (id_quadra, data_geracao, hora_geracao)
   VALUES ('99999999-0000-0000-0000-000000000000', CURRENT_DATE, '10:00')$q$);

SELECT pg_temp.esperar_erro('FK: quadra com arena inexistente', '23503',
$q$INSERT INTO quadra (id_arena, nome)
   VALUES ('99999999-0000-0000-0000-000000000000', 'Quadra X')$q$);

SELECT pg_temp.esperar_erro('FK: camera com quadra inexistente', '23503',
$q$INSERT INTO camera (id_quadra, identificador)
   VALUES ('99999999-0000-0000-0000-000000000000', 'CAM-X')$q$);

SELECT pg_temp.esperar_erro('FK: excluir gestor que possui arena (RESTRICT)', '23503',
$q$DELETE FROM gestor_arena WHERE id_usuario = '10000000-0000-0000-0000-000000000001'$q$);

SELECT pg_temp.esperar_erro('UNIQUE: e-mail duplicado', '23505',
$q$INSERT INTO usuario (nome, email, senha_hash)
   VALUES ('Duplicado', 'carlos.mendes@example.com', 'hash')$q$);

SELECT pg_temp.esperar_erro('UNIQUE: patrocinador repetido para o mesmo gestor', '23505',
$q$INSERT INTO patrocinador (id_gestor, nome, duracao, valor)
   VALUES ('10000000-0000-0000-0000-000000000001', 'Academia Força Total', 10, 100)$q$);

SELECT pg_temp.esperar_erro('UNIQUE: CPF duplicado em gestor_arena', '23505',
$q$INSERT INTO gestor_arena (id_usuario, razao_social, cpf, endereco)
   VALUES ('20000000-0000-0000-0000-000000000001', 'X LTDA', '10000000001', 'Rua X')$q$);

SELECT pg_temp.esperar_erro('NOT NULL: usuário sem senha_hash', '23502',
$q$INSERT INTO usuario (nome, email) VALUES ('Sem senha', 'semsenha@example.com')$q$);

SELECT pg_temp.esperar_erro('CHECK: status de replay inválido', '23514',
$q$INSERT INTO replay (id_quadra, data_geracao, hora_geracao, status)
   VALUES ('40000000-0000-0000-0000-000000000001', CURRENT_DATE, '10:00', 'invalido')$q$);

SELECT pg_temp.esperar_erro('CHECK: CPF com formato inválido', '23514',
$q$INSERT INTO gestor_arena (id_usuario, razao_social, cpf, endereco)
   VALUES ('20000000-0000-0000-0000-000000000002', 'X LTDA', 'abc', 'Rua X')$q$);

SELECT pg_temp.esperar_erro('CHECK: tentativas_login negativa', '23514',
$q$UPDATE usuario SET tentativas_login = -1 WHERE email = 'carlos.mendes@example.com'$q$);

SELECT pg_temp.esperar_erro('CHECK: duração de patrocinador <= 0', '23514',
$q$INSERT INTO patrocinador (id_gestor, nome, duracao, valor)
   VALUES ('10000000-0000-0000-0000-000000000001', 'Novo', 0, 100)$q$);

ROLLBACK;