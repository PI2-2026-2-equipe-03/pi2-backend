# Rotina de backup e restore do banco

## Objetivo

Gerar um backup SQL do PostgreSQL e restaurá-lo em um container
separado, preservando o banco original.

## Pré-requisitos

- Docker Desktop iniciado.
- Docker Compose disponível.
- Git Bash no Windows ou Bash no Linux/macOS.
- Arquivo `.env` configurado para o projeto.
- Comandos executados na raiz do repositório, ao lado do
  `docker-compose.yml`.
- Scripts `.sh` salvos com quebras de linha LF.

## Gerar o backup

Inicie o banco:

```bash
docker compose up -d db
```

Execute:

```bash
bash scripts/backup.sh
ls -lh backups/
```

O script gera `backups/backup-DATA-PROCESSO.sql`, com estrutura
e dados do banco configurado no serviço `db`.

Um arquivo temporário é usado durante a geração. O nome final
só é atribuído após o sucesso do `pg_dump` e a verificação de
que o arquivo não está vazio.

A pasta `backups/` é ignorada pelo Git. Os dumps contêm dados
privados e não devem ser anexados às issues ou commits.

O dump não inclui os usuários globais do PostgreSQL nem preserva
proprietários e permissões dos objetos. Também não inclui arquivos
de vídeo ou outros dados externos ao banco.

## Criar um destino limpo para o teste

Execute uma única vez:

```bash
docker run -d --name tagravado-restore-teste --network none \
  -e POSTGRES_USER=restore \
  -e POSTGRES_DB=restore_test \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:16-alpine
```

Esse container não publica portas, não utiliza o volume do banco
original e não recebe os SQLs de inicialização do projeto.
A autenticação sem senha é exclusiva deste container de teste,
isolado da rede.

Confira a disponibilidade:

```bash
docker exec tagravado-restore-teste \
  pg_isready -U restore -d restore_test
```

Aguarde `accepting connections` antes de continuar.

## Restaurar o backup

Substitua o nome abaixo pelo arquivo gerado:

```bash
bash scripts/restore.sh \
  backups/backup-20261031T145539Z-1368.sql \
  tagravado-restore-teste restore restore_test
```

Os argumentos são: arquivo SQL, container, usuário e banco.

Use apenas dumps de origem confiável. O script recusa arquivos
vazios, o container original `tagravado-db` e destinos que já
possuam relações de usuário, como tabelas ou sequências.

A restauração usa `psql`, para no primeiro erro e executa o dump
em uma transação. Para os dumps gerados pelo `backup.sh`, uma
falha impede a aplicação parcial das alterações.

O sucesso é indicado por:

```text
Restore concluido com sucesso: tagravado-restore-teste / restore_test
```

## Conferir os dados

No banco restaurado:

```bash
docker exec tagravado-restore-teste psql \
  -U restore -d restore_test \
  -c "SELECT 'usuarios' AS tabela, count(*) AS total FROM usuario UNION ALL SELECT 'quadras', count(*) FROM quadra UNION ALL SELECT 'replays', count(*) FROM replay;"
```

No banco original:

```bash
docker compose exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT 'usuarios' AS tabela, count(*) AS total FROM usuario
UNION ALL
SELECT 'quadras', count(*) FROM quadra
UNION ALL
SELECT 'replays', count(*) FROM replay;
SQL
```

As contagens devem coincidir se o banco original não mudou
depois do backup. Essa conferência é uma amostragem; não compara
todos os registros e campos do banco.

## Teste realizado em 31/10/2026

- PostgreSQL 16 em Docker.
- Dump SQL gerado com 49.449 bytes.
- Restore concluído em container novo e separado.
- Contagens conferidas:

| Tabela | Original | Restaurado |
|---|---:|---:|
| usuario | 25 | 25 |
| quadra | 13 | 13 |
| replay | 15 | 15 |

Anexar nos comentários da issue #32 os prints da geração do dump,
do sucesso do restore e da conferência das contagens.
Não mostrar conteúdo dos dumps, senhas, tokens ou cookies.

## Rotina operacional

Executar o backup antes de migrações e alterações importantes.
Como rotina recomendada, gerar uma cópia diária e manter uma
cópia protegida fora do computador de origem.

A execução descrita neste guia é manual; não há agendamento
automático configurado pelos scripts.

Repetir periodicamente o teste de restore em destino limpo.
Um arquivo de backup sozinho não comprova sua recuperação.

## Limpeza do ambiente de teste

Após concluir a validação e salvar as evidências:

```bash
docker rm -f -v tagravado-restore-teste
```

Esse comando remove somente o container temporário informado e
seus volumes anônimos. Não execute `docker compose down -v`,
pois isso pode remover o volume do banco original.