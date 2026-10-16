\echo '== arena por cidade =='
EXPLAIN ANALYZE SELECT * FROM arena WHERE cidade = 'Cidade 42';

\echo '== quadras de uma arena =='
EXPLAIN ANALYZE SELECT * FROM quadra
WHERE id_arena = (SELECT id_arena FROM arena WHERE nome = 'Massa Arena 100');

\echo '== replays por quadra e data =='
EXPLAIN ANALYZE SELECT * FROM replay
WHERE id_quadra = (SELECT q.id_quadra FROM quadra q JOIN arena a ON a.id_arena = q.id_arena
                   WHERE a.nome = 'Massa Arena 100' AND q.nome = 'Quadra 1')
  AND data_geracao = CURRENT_DATE;