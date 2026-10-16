INSERT INTO arena (id_gestor, nome, cidade, endereco)
SELECT '10000000-0000-0000-0000-000000000001', 'Massa Arena ' || g, 'Cidade ' || (g % 200), 'Rua ' || g
FROM generate_series(1, 20000) g;

INSERT INTO quadra (id_arena, nome)
SELECT id_arena, 'Quadra ' || n
FROM arena, generate_series(1, 3) n
WHERE nome LIKE 'Massa Arena %';

INSERT INTO replay (id_quadra, data_geracao, hora_geracao, status, arquivo_url)
SELECT q.id_quadra,
       CURRENT_DATE - (random() * 6)::int,
       TIME '00:00' + (random() * 1439)::int * INTERVAL '1 minute',
       'disponivel',
       'https://example.com/massa.mp4'
FROM quadra q
JOIN arena a ON a.id_arena = q.id_arena
CROSS JOIN generate_series(1, 2) s
WHERE a.nome LIKE 'Massa Arena %';

ANALYZE arena; ANALYZE quadra; ANALYZE replay;