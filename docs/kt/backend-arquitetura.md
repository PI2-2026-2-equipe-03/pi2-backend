# KT — Arquitetura da Infraestrutura de Backend e APIs

## 1. Objetivo

Este documento apresenta a arquitetura do backend do projeto Repeteco, sua organização de arquivos, configuração do ambiente, execução, testes e integrações externas.

Também descreve o procedimento recomendado para adicionar novas rotas à API, mantendo os padrões já utilizados no projeto.

O objetivo é facilitar a manutenção e a continuidade do desenvolvimento por outros integrantes da equipe.

## 2. Tecnologias utilizadas

O backend utiliza as seguintes tecnologias:

| Tecnologia | Finalidade |
|---|---|
| Node.js 22+ | Ambiente de execução |
| TypeScript | Linguagem de desenvolvimento |
| Fastify 5 | Framework HTTP para construção da API |
| PostgreSQL 16+ | Banco de dados relacional |
| Zod | Validação de dados e schemas |
| Better Auth | Autenticação e gerenciamento de sessões |
| Vitest | Execução dos testes automatizados |
| Docker e Docker Compose | Ambiente de desenvolvimento e execução em contêineres |
| AWS SDK S3 | Comunicação com armazenamento compatível com S3, utilizado pelo Cloudflare R2 |

O projeto utiliza PostgreSQL diretamente. Não existe fluxo de banco SQLite ou Prisma.

## 3. Arquitetura geral

A aplicação utiliza o Fastify como servidor HTTP. O arquivo `src/server.ts` inicia o servidor, enquanto `src/application.ts` concentra a configuração da aplicação.

A arquitetura é organizada em controllers, schemas, middlewares, services, repositories e plugins.

O fluxo geral de uma requisição é:

1. O cliente envia uma requisição HTTP para a API.
2. O Fastify identifica a rota e executa os middlewares necessários.
3. Os dados recebidos são validados conforme os schemas definidos.
4. O controller processa a requisição e aplica as regras de negócio.
5. Quando necessário, services e repositories auxiliam no processamento e acesso aos dados.
6. O backend consulta ou altera o PostgreSQL.
7. A API retorna uma resposta HTTP ao cliente.

A arquitetura é híbrida: algumas regras de negócio e consultas SQL permanecem nos controllers, enquanto funcionalidades reutilizáveis e operações mais específicas são organizadas em services e repositories.

## 4. Estrutura de pastas

### 4.1. Diretório `src/`

Contém o código-fonte principal do backend.

| Diretório/arquivo | Responsabilidade |
|---|---|
| `application.ts` | Configuração do Fastify, plugins, tratamento de erros e registro das rotas |
| `server.ts` | Inicialização do servidor HTTP |
| `controllers/` | Definição dos endpoints e processamento das requisições |
| `schemas/` | Schemas Zod para validação e documentação dos dados |
| `middlewares/` | Autenticação, autorização e validação de agentes |
| `services/` | Regras de negócio e operações reutilizáveis |
| `repositories/` | Operações de persistência e acesso a dados |
| `plugins/` | Integrações e extensões registradas no Fastify |
| `http/` | Tratamento de erros e utilitários HTTP |
| `lib/` | Configurações e funcionalidades compartilhadas |
| `db/` | Scripts SQL, inicialização, seed e testes de banco |
| `integration/` | Testes de integração |
| `tests/` | Testes unitários |
| `scripts/` | Scripts auxiliares de manutenção e administração |

### 4.2. Controllers

O diretório `src/controllers/` contém os arquivos responsáveis pelas rotas da API.

Entre os principais controllers estão:

- `auth.controller.ts`: cadastro, login e funcionalidades relacionadas à autenticação.
- `arenas.controller.ts`: gerenciamento de arenas.
- `quadras.controller.ts`: gerenciamento de quadras.
- `cameras.controller.ts`: gerenciamento de câmeras.
- `replays.controller.ts`: operações relacionadas às gravações e replays.
- `management.controller.ts`: funcionalidades administrativas e de gerenciamento.
- `password-recovery.controller.ts`: recuperação de senha.
- `sponsors.controller.ts`: gerenciamento de patrocinadores.
- `agent.controller.ts`: comunicação com os agentes instalados nas arenas.

### 4.3. Services

O diretório `src/services/` concentra funcionalidades reutilizáveis e regras de negócio que podem ser separadas dos controllers.

Exemplos:

- `account-lockout.ts`: controle de tentativas de autenticação.
- `auth-integrity.ts`: verificações de integridade da autenticação.
- `auth-recovery.ts`: análise de cadastros incompletos.
- `replay-authorization.ts`: regras de autorização para operações com replays.
- `replay-creation.ts`: lógica de criação de replays.
- `replay-retention.ts`: expiração e exclusão de mídias.
- `storage.ts`: operações relacionadas ao armazenamento de arquivos.
- `agent-token.ts`: emissão de tokens para agentes.

### 4.4. Repositories

O diretório `src/repositories/` organiza operações de persistência que podem ser reutilizadas por diferentes partes da aplicação.

Exemplos:

- `replay.repository.ts`: operações de criação, consulta, atualização e expiração de replays.
- `replay-metadata.repository.ts`: persistência de metadados dos replays.
- `recording-log.repository.ts`: registro e consulta de logs de gravação.
- `errors.ts`: tratamento e mapeamento de erros de banco de dados.

### 4.5. Middlewares

O diretório `src/middlewares/` contém verificações executadas antes do processamento das rotas.

- `require-auth.ts`: verifica a autenticação do usuário.
- `require-role.ts`: verifica o perfil e as permissões do usuário.
- `require-agent.ts`: valida o token de acesso do agente da arena.

Rotas protegidas devem utilizar o middleware adequado. Não se deve confiar em informações de perfil ou propriedade enviadas diretamente pelo cliente.

### 4.6. Schemas

O diretório `src/schemas/` contém os schemas utilizados na validação dos dados e na documentação da API.

O arquivo `api.ts` concentra schemas de requisições e respostas. O arquivo `doc-only.ts` contém recursos relacionados à documentação das rotas.

A validação utiliza Zod, permitindo verificar os dados recebidos antes de executar operações no banco.

### 4.7. Banco de dados

O diretório `src/db/` contém os arquivos relacionados à estrutura e à preparação do PostgreSQL.

- `init/`: scripts SQL responsáveis pela criação e evolução da estrutura do banco.
- `seed/`: dados sintéticos para desenvolvimento e testes.
- `tests/`: scripts auxiliares para verificações de integridade e desempenho.

As alterações de estrutura do banco devem ser feitas por meio de scripts SQL de migração.

## 5. Regras de negócio

As regras de negócio estão distribuídas entre controllers e services, conforme a responsabilidade de cada funcionalidade.

Os controllers recebem e processam as requisições, enquanto os services concentram regras reutilizáveis ou operações que merecem ser isoladas.

As regras relacionadas a banco de dados podem utilizar repositories ou consultas diretamente nos controllers, conforme o padrão já existente naquela funcionalidade.

Alguns exemplos:

- Autenticação e autorização: `auth.controller.ts`, `require-auth.ts` e `require-role.ts`.
- Criação e autorização de replays: `replay-creation.ts` e `replay-authorization.ts`.
- Retenção de mídias: `replay-retention.ts` e `storage.ts`.
- Controle de agentes: `agent-token.ts`, `require-agent.ts` e `agent.controller.ts`.

A documentação funcional mais detalhada está em:

- `docs/regras-de-negocio-implementadas.md`
- `docs/referencias/contrato-api.md`
- `docs/referencias/regrasDeNegocioRF.md`

O documento de contrato da API deve ser utilizado como referência. Para confirmar o comportamento atualmente implementado, consulte também os controllers, schemas e a documentação OpenAPI gerada pela aplicação.

## 6. Configuração do ambiente

### 6.1. Requisitos

Para executar o backend localmente, são necessários:

- Node.js 22 ou superior.
- PostgreSQL 16 ou superior.
- npm.
- Git.

Docker e Docker Compose são opcionais, mas recomendados para padronizar o ambiente.

### 6.2. Variáveis de ambiente

Na raiz do backend existe o arquivo `.env.example`, que apresenta as variáveis utilizadas pela aplicação.

Para iniciar a configuração:

```bash
cp .env.example .env
```

Depois, edite o arquivo `.env` e configure as conexões com o PostgreSQL, a chave secreta de autenticação e as demais variáveis necessárias para as integrações utilizadas.

Entre as variáveis importantes estão:

- `DATABASE_URL`: conexão única com o PostgreSQL (API, autenticação e scripts).
- `BETTER_AUTH_SECRET`: chave secreta da autenticação.
- `BETTER_AUTH_URL`: endereço base da autenticação.
- `CORS_ORIGINS`: origens permitidas pelo CORS e pelo Better Auth.
- `PORT`: porta de execução do backend.
- `CRON_SECRET`: proteção do endpoint de manutenção agendada.
- Variáveis `S3_*`: configuração do armazenamento compatível com S3.
- `EMAIL_DELIVERY_URL`: endereço do serviço de envio de e-mails.

O `.env.example` é a referência única: indica, para cada variável, se é obrigatória, o valor sugerido e o ambiente de uso.

**Importante:** nunca publique o arquivo `.env`, suas credenciais ou chaves secretas no GitHub. O arquivo `.env.example` deve conter apenas exemplos e valores não sensíveis.

### 6.3. Instalação das dependências

Na raiz do backend, execute:

```bash
npm ci
```

Esse comando instala as dependências conforme o arquivo `package-lock.json`.

## 7. Inicialização do banco de dados

O backend utiliza PostgreSQL.

Para preparar um banco vazio manualmente, aplique os scripts SQL de `src/db/init/`, respeitando a ordem de execução definida pelo mecanismo de inicialização do projeto.

Os arquivos de `src/db/seed/` podem ser aplicados depois para inserir dados sintéticos de desenvolvimento.

O projeto também oferece inicialização automatizada pelo Docker Compose.

Quando o banco já possui um volume inicializado, novas migrações devem ser aplicadas uma única vez, conforme a necessidade da versão instalada.

Não execute novamente todos os scripts de inicialização indiscriminadamente em um banco que já contém dados.

## 8. Execução com Docker Compose

O projeto possui um Dockerfile multi-stage, com estágios destinados ao desenvolvimento e à execução de produção.

### 8.1. Desenvolvimento

Para iniciar o ambiente de desenvolvimento:

```bash
docker compose up --build
```

Esse comando utiliza o `docker-compose.yml` junto com o `docker-compose.override.yml`.

O ambiente de desenvolvimento utiliza:

- Estágio `dev` do Dockerfile.
- Bind mount para refletir alterações do código.
- Hot reload.
- Porta do PostgreSQL publicada para acesso local.
- Inicialização do banco e aplicação do seed quando o volume é novo.

### 8.2. Produção

Para executar utilizando a configuração de produção:

```bash
docker compose -f docker-compose.yml up -d --build
```

Esse comando utiliza somente o arquivo principal, sem aplicar o override de desenvolvimento.

O ambiente utiliza:

- Estágio `runner` do Dockerfile.
- Execução sem bind mount do código-fonte.
- Banco de dados sem porta publicada externamente.
- Sem aplicação automática do seed de desenvolvimento.

### 8.3. Atenção aos volumes

As migrações e os seeds da inicialização automática são executados quando o volume do banco é criado pela primeira vez.

O comando abaixo remove os contêineres e também o volume do banco:

```bash
docker compose down -v
```

**Cuidado:** a opção `-v` apaga o volume e todos os dados armazenados nele. Não utilize esse comando em um ambiente com dados que precisam ser preservados.

O contêiner recebe apenas as variáveis declaradas no `environment` do `docker-compose.yml`; o `.env` só alimenta essa declaração. Se faltar uma variável obrigatória no `.env`, o `docker compose up` falha antes de subir os contêineres.

## 9. Execução sem Docker

Também é possível executar o backend diretamente na máquina, desde que o PostgreSQL esteja instalado e inicializado.

Após configurar o `.env` e preparar o banco:

```bash
npm run dev
```

Esse comando carrega o `.env` e inicia o backend em modo de desenvolvimento, com monitoramento de alterações.

Para iniciar normalmente, com as variáveis já definidas no ambiente (o `.env` não é carregado):

```bash
npm start
```

Também é possível executar diretamente pelo Node.js:

```bash
node --env-file=.env --import tsx src/server.ts
```

Para utilizar watch mode:

```bash
node --env-file=.env --import tsx --watch src/server.ts
```

A porta padrão do backend é `3000`, podendo ser alterada pela variável `PORT`.

No Docker Compose, a variável `BACKEND_PORT` controla a porta publicada para acesso externo ao contêiner.

### 9.1. Verificação da aplicação

Após iniciar o backend, é possível verificar seu funcionamento pelo endpoint:

```http
GET /api/health
```

Uma resposta HTTP bem-sucedida indica que a aplicação está respondendo.

## 10. Testes automatizados

O projeto utiliza Vitest para executar diferentes categorias de testes.

### 10.1. Testes unitários

Os testes unitários estão em:

```text
src/tests/
```

Eles verificam funcionalidades isoladas, como regras de negócio, autenticação, autorização e validações.

Para executar:

```bash
npm test
```

Esses testes não exigem um banco PostgreSQL real nem a API em execução. Dependências externas podem ser simuladas por mocks.

### 10.2. Testes de integração

Os testes de integração estão em:

```text
src/integration/
```

Eles verificam o funcionamento conjunto de componentes da aplicação, incluindo rotas, autenticação e banco de dados.

Para executar:

```bash
TEST_DATABASE_URL=postgresql://usuario@127.0.0.1:5433/postgres npm run test:integration
```

Substitua os dados de conexão pelos valores do PostgreSQL disponível no ambiente.

**Requisitos:**

- PostgreSQL acessível.
- Usuário com permissão para criar bancos de dados.
- Variável `TEST_DATABASE_URL` configurada.

A suíte cria um banco descartável com nome aleatório, aplica os scripts necessários e remove o banco ao finalizar.

Os testes utilizam PostgreSQL real e não simulam o banco ou a autenticação. O envio de e-mails utiliza um receptor HTTP local, enquanto operações de armazenamento R2 são simuladas por meio de `vi.spyOn`.

Não utilize uma conexão de produção em `TEST_DATABASE_URL`.

### 10.3. Testes de API

Os testes de API estão no diretório:

```text
tests/
```

Eles verificam o comportamento dos endpoints por meio de requisições HTTP contra uma API em execução.

Para executar:

```bash
npm run test:api
```

A API deve estar iniciada antes da execução.

Por padrão, os testes utilizam:

```text
http://localhost:3000/api
```

Caso necessário, configure a variável `API_URL` para apontar para outro endereço.

Os principais arquivos são:

- `tests/regrasNegocio.test.js`
- `tests/testesEssenciais.test.js`
- `tests/testesNaoEssenciais.test.js`

### 10.4. Compilação TypeScript

Para verificar se o código compila corretamente:

```bash
npm run build
```

Esse comando executa o compilador TypeScript e gera a saída no diretório `dist/`.

### 10.5. Outros comandos úteis

```bash
npm run test:watch
```

Executa os testes em modo de observação.

```bash
npm run db:expire
```

Executa o processo de retenção e exclusão de mídias. Esse comando é operacional, não um teste automatizado comum. Utilize somente com o ambiente e as permissões adequados.

### 10.6. Coleção Postman

O projeto possui uma coleção Postman para auxiliar na validação dos endpoints:

```text
docs/postman/b302.postman_collection.json
```

As evidências e instruções adicionais de validação estão em:

`docs/regras-de-negocio-implementadas.md`, na seção **Validação reproduzível e evidências**.

## 11. Integrações externas

### 11.1. Better Auth

O projeto utiliza Better Auth para autenticação e gerenciamento de sessões.

A integração é registrada por meio do plugin `src/plugins/better-auth.ts`.

As rotas nativas do Better Auth continuam disponíveis em:

```text
/api/auth/*
```

Além delas, o backend disponibiliza endpoints próprios de cadastro e login.

Os novos cadastros exigem telefone e senha forte, conforme as validações implementadas.

A autenticação e a autorização das rotas devem utilizar os mecanismos existentes, evitando criar verificações paralelas ou incompatíveis.

### 11.2. Cloudflare R2

O Cloudflare R2 é utilizado para armazenamento de mídias dos replays.

O bucket deve permanecer privado. O banco de dados armazena a chave do objeto, e não o arquivo de vídeo diretamente.

A estrutura de chave utilizada é:

```text
replays/<arena>/<quadra>/<AAAA>/<MM>/<DD>/<replay>.mp4
```

Os endpoints de replay retornam URLs temporárias para acesso aos arquivos.

As principais variáveis de configuração são:

- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `UPLOAD_URL_TTL_SECONDS`
- `DOWNLOAD_URL_TTL_SECONDS`

Os valores padrão de validade são 600 segundos para upload e 3600 segundos para download.

A integração utiliza Access Key ID e Secret Access Key do R2. O token geral da Cloudflare não substitui essas credenciais.

As credenciais devem possuir permissões de leitura e escrita de objetos limitadas ao bucket utilizado pelo projeto.

Sem as variáveis necessárias, o upload realizado pelo agente pode retornar HTTP 503, e os trabalhos de exclusão de mídia podem permanecer pendentes.

### 11.3. Serviço de envio de e-mails

A recuperação de senha depende de um serviço externo de envio de e-mails.

A integração utiliza:

- `EMAIL_DELIVERY_URL`
- `EMAIL_DELIVERY_TOKEN` (opcional, conforme configuração)

O endereço do serviço deve utilizar HTTPS.

Sem essa integração configurada, o fluxo de recuperação de senha não poderá concluir o envio da mensagem.

### 11.4. Agente da arena

O projeto possui um agente responsável pela comunicação com os equipamentos instalados nas arenas.

O agente, localizado no projeto `agent-node`, realiza operações relacionadas à gravação das câmeras e ao envio de clipes para o backend por meio das rotas:

```text
/api/agent/*
```

Cada arena utiliza um token próprio.

O token é exibido apenas uma vez durante sua geração. No banco de dados é armazenado somente o hash SHA-256 do token.

A geração de um novo token revoga os tokens anteriores da mesma arena.

O token pode ser gerado por uma rota administrativa autenticada:

```http
POST /api/arenas/{id}/agent-token
```

O identificador da arena pode ser obtido por meio da consulta de arenas.

Também existe o comando:

```bash
npm run agent:token -- <id_arena>
```

Para executar dentro do contêiner:

```bash
docker compose exec backend npm run agent:token -- <id_arena>
```

Para revogar um agente sem gerar outro token, é possível desativar o agente no banco, alterando o campo `agente.ativo` para `false`.

Em bancos já existentes, deve-se verificar e aplicar a migração:

```text
src/db/init/013_agente.sql
```

O contrato detalhado está em:

`docs/referencias/contrato-api.md`, na seção **Agente da arena**.

### 11.5. Limitações da integração de vídeo

Os novos replays permanecem com status `pendente` até que o serviço real de captura e processamento forneça a mídia correspondente.

Recursos como marca d'água e buffer de câmera dependem desse serviço de captura e processamento.

Portanto, a criação de um registro de replay não significa necessariamente que o arquivo de vídeo já esteja disponível.

Mais detalhes sobre as limitações e os adaptadores estão documentados em:

`docs/regras-de-negocio-implementadas.md`.

## 12. Tutorial: como adicionar uma nova rota

Esta seção apresenta o procedimento recomendado para criar um novo endpoint no backend.

### Passo 1 — Identificar a funcionalidade

Antes de criar uma rota, verifique se já existe um controller responsável pela funcionalidade.

Consulte:

```text
src/controllers/
```

Se a rota pertencer a uma funcionalidade existente, prefira utilizar o controller correspondente.

### Passo 2 — Criar ou reutilizar o schema

Verifique os schemas existentes em:

```text
src/schemas/api.ts
```

Se necessário, crie um schema Zod para validar os parâmetros, filtros, corpo da requisição e resposta.

Utilizar schemas evita que dados inválidos sejam processados pela aplicação.

Sempre que possível, utilize validações compatíveis com o padrão já adotado no projeto.

### Passo 3 — Implementar a rota no controller

Abra o controller correspondente ou crie um novo arquivo em:

```text
src/controllers/
```

Os controllers seguem o padrão Fastify com TypeScript e `ZodTypeProvider`.

A estrutura básica de uma rota utiliza métodos como:

- `r.get()` para consultas.
- `r.post()` para criação ou execução de operações.
- `r.patch()` para atualizações parciais.
- `r.delete()` para exclusões.

A rota deve possuir um caminho claro e seguir a organização dos endpoints existentes.

### Passo 4 — Configurar validação e documentação

Na configuração da rota, utilize a propriedade `schema` para documentar os dados esperados.

Conforme a necessidade, configure:

- `tags`: categoria da rota.
- `summary`: descrição resumida.
- `params`: parâmetros do caminho.
- `querystring`: filtros e parâmetros de consulta.
- `body`: corpo da requisição.
- `response`: estrutura das respostas.
- `security`: requisitos de autenticação.

O projeto também utiliza o recurso `docOnly` para situações específicas de documentação. Consulte os controllers existentes antes de utilizá-lo.

### Passo 5 — Configurar autenticação e autorização

Se a rota precisar de proteção, utilize os middlewares existentes.

Exemplos:

- `requireAuth`: exige usuário autenticado.
- `requireRole`: exige determinado perfil.
- `requireAgent`: exige um agente válido.

A autorização deve ser verificada no backend. Nunca confie exclusivamente em identificadores, perfis ou permissões enviados pelo cliente.

### Passo 6 — Implementar o processamento

Dentro do handler:

1. Valide os dados recebidos utilizando os schemas e os recursos de `src/http/errors.ts`.
2. Execute as verificações necessárias.
3. Aplique as regras de negócio.
4. Consulte ou altere o banco de dados utilizando consultas parametrizadas.
5. Retorne o status HTTP e os dados esperados.

Para erros de negócio, utilize `HttpError` conforme o padrão existente.

As respostas devem seguir o formato já utilizado pela funcionalidade correspondente.

### Passo 7 — Separar responsabilidades

Se a nova rota possuir uma regra reutilizável ou uma operação complexa, considere extrair essa lógica para:

```text
src/services/
```

Se houver operações de persistência que devam ser reutilizadas, considere criar ou atualizar um arquivo em:

```text
src/repositories/
```

Mantenha a consistência com a arquitetura híbrida atual, sem criar abstrações desnecessárias.

### Passo 8 — Registrar o controller

Os controllers são registrados em:

```text
src/application.ts
```

A aplicação utiliza um grupo de rotas com prefixo `/api`.

Caso seja criado um novo controller, registre-o nesse ponto, seguindo o padrão dos demais.

Se a rota pertencer a um controller já registrado, não é necessário registrar o controller novamente.

### Passo 9 — Criar testes

Toda nova funcionalidade deve possuir testes compatíveis com seu comportamento.

Os testes podem ser organizados em:

- `src/tests/`: testes unitários.
- `src/integration/`: testes de integração.
- `tests/`: testes de API.

Escolha a categoria adequada e cubra cenários de sucesso, dados inválidos, falhas e restrições de autorização.

### Passo 10 — Validar a implementação

Depois de implementar a rota, execute:

```bash
npm run build
```

Depois:

```bash
npm test
```

Quando houver testes de integração:

```bash
TEST_DATABASE_URL=postgresql://usuario@127.0.0.1:5433/postgres npm run test:integration
```

Com a API em execução, execute:

```bash
npm run test:api
```

Ajuste as conexões conforme o ambiente utilizado.

Por fim, confira a documentação OpenAPI e os endpoints de documentação configurados em `src/plugins/openapi.ts`.

### Passo 11 — Documentar a alteração

Ao finalizar, atualize a documentação relacionada à funcionalidade, quando necessário.

Registre na issue correspondente:

- O que foi implementado.
- Quais arquivos foram alterados.
- Quais regras foram atendidas.
- Quais testes foram executados.
- Como reproduzir a validação.

Isso facilita a revisão e a continuidade do trabalho pela equipe.

## 13. Boas práticas de manutenção

Para manter a qualidade e a consistência do backend:

1. Utilize TypeScript e mantenha a tipagem correta.
2. Valide entradas utilizando os schemas Zod.
3. Utilize consultas SQL parametrizadas.
4. Não exponha senhas, tokens ou credenciais.
5. Utilize os middlewares existentes para autenticação e autorização.
6. Evite duplicar regras de negócio.
7. Mantenha os testes atualizados.
8. Utilize scripts SQL de migração para alterações no banco.
9. Não execute migrações destrutivas sem verificar seus efeitos.
10. Atualize a documentação quando houver alterações relevantes na API ou na infraestrutura.

## 14. Referências do projeto

Para aprofundar o conhecimento sobre o backend, consulte:

| Documento | Conteúdo |
|---|---|
| `README.md` | Instalação, configuração e execução do projeto |
| `docs/regras-de-negocio-implementadas.md` | Regras de negócio implementadas, comandos, validações e evidências |
| `docs/referencias/contrato-api.md` | Referência do contrato e dos endpoints da API |
| `docs/referencias/regrasDeNegocioRF.md` | Requisitos funcionais e regras de negócio |
| `docs/rotina-backup-restore.md` | Procedimentos de backup e restauração |
| `docs/plano-integracao-agente.md` | Planejamento da integração com o agente |
| `docs/postman/b302.postman_collection.json` | Coleção de requisições para validação no Postman |

---

- **Documento:** KT — Arquitetura da Infraestrutura de Backend e APIs
- **Localização:** `docs/kt/backend-arquitetura.md`
- **Projeto:** Repeteco
**Finalidade:** Transferência de conhecimento, manutenção e continuidade do desenvolvimento do backend.
