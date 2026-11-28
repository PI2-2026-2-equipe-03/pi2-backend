# Contrato da API

## Mapeamento entre Rotas e Requisitos Funcionais

A tabela abaixo relaciona os endpoints definidos no contrato da API com os requisitos funcionais atendidos por cada rota.

| Método | Endpoint | Requisito Funcional | Descrição |
|---|---|---|---|
| POST | `/auth/register` | RF-01 | Cadastro de usuário |
| POST | `/auth/login` | RF-02 | Login de usuário |
| GET | `/me` | RF-02 | Usuário autenticado e seu perfil |
| GET | `/admin/metrics` | RF-03 | Métricas para o administrador |
| GET | `/manager/metrics` | RF-04 | Métricas para o cliente/gestor |
| POST | `/replays` | RF-05 / RF-09 | Grava o replay e associa quadra, data e horário |
| GET | `/replays/{id}/download` | RF-06 | Download de vídeo |
| POST | `/sponsors` | RF-07 | Cadastro de patrocinadores |
| DELETE | `/replays/{id}` | RF-10 | Exclusão manual de vídeos |
| POST | `/auth/forgot-password` | RF-11 | Solicitação de recuperação de senha |
| POST | `/manager-requests` | RF-12 | Solicitação de cadastro como gestor de quadra |
| POST | `/arenas/{id}/agent-token` | — | Geração do token do agente da arena (administrador) |

Observação: o RF-08 define a exclusão automática dos vídeos após 7 dias. Como esse comportamento é executado internamente pelo sistema, ele não foi representado como um endpoint público específico neste contrato.

## Visão geral

Este documento descreve o contrato da API do sistema de replays esportivos, com base nos requisitos funcionais definidos para o projeto.

A API utiliza JSON para envio e recebimento de dados, exceto em rotas relacionadas ao download de vídeos.

Base sugerida da API:

```text
/api
```

Para rotas protegidas, o cliente deve enviar o token de autenticação no cabeçalho:

```text
Authorization: Bearer <token>
```

Os exemplos abaixo representam uma proposta de contrato para implementação do sistema. Alguns detalhes técnicos, como uso de JWT, identificadores numéricos e nomes exatos dos campos, são decisões de projeto.

## 1. Cadastrar usuário

### POST /auth/register

Cadastra um novo usuário no sistema.

### Entrada

```json
{
  "name": "João da Silva",
  "email": "joao@email.com",
  "phone": "85999999999",
  "password": "senha123"
}
```

### Saída de sucesso

Status: `201 Created`

```json
{
  "id": 1,
  "name": "João da Silva",
  "email": "joao@email.com",
  "phone": "85999999999",
  "role": "USER",
  "createdAt": "2026-09-24T14:00:00Z"
}
```

### Possíveis erros

Status: `400 Bad Request`

```json
{
  "error": "Todos os campos obrigatórios devem ser preenchidos."
}
```

Status: `409 Conflict`

```json
{
  "error": "Já existe uma conta associada a este e-mail."
}
```

## 2. Login do usuário

### POST /auth/login

Autentica um usuário cadastrado no sistema.

### Entrada

```json
{
  "email": "joao@email.com",
  "password": "senha123"
}
```

### Saída de sucesso

Status: `200 OK`

```json
{
  "token": "token-de-autenticacao",
  "expiresIn": 1800,
  "user": {
    "id": 1,
    "name": "João da Silva",
    "email": "joao@email.com",
    "role": "USER"
  }
}
```

O campo `expiresIn` representa o tempo de sessão em segundos. Neste contrato foi adotado o valor de 1800 segundos, equivalente a 30 minutos.

### Possíveis erros

Status: `401 Unauthorized`

```json
{
  "error": "E-mail ou senha inválidos."
}
```

Status: `429 Too Many Requests`

```json
{
  "error": "Número máximo de tentativas de login excedido.",
  "retryAfter": 300
}
```

### GET /me

Retorna o usuário da sessão atual e seu perfil de acesso. O frontend usa o perfil apenas para adaptar a interface; a autorização continua sendo feita em cada rota.

### Saída de sucesso

Status: `200 OK`

```json
{
  "data": {
    "id": "uuid",
    "name": "João da Silva",
    "email": "joao@email.com",
    "role": "USR"
  }
}
```

O campo `role` assume os valores `ADM`, `CLI` ou `USR`.

### Possíveis erros

Status: `401 Unauthorized`: sessão ausente, inválida ou expirada.

Status: `403 Forbidden`: cadastro do usuário incompleto.

## 3. Solicitar recuperação de senha

### POST /auth/forgot-password

Solicita o envio de um e-mail para redefinição de senha.

### Entrada

```json
{
  "email": "joao@email.com"
}
```

### Saída de sucesso

Status: `200 OK`

```json
{
  "message": "Se o e-mail estiver cadastrado, uma mensagem de recuperação será enviada."
}
```

A resposta é mantida genérica para não informar publicamente se determinado e-mail existe no sistema.

## 4. Redefinir senha

### POST /auth/reset-password

Atualiza a senha do usuário a partir do token enviado no processo de recuperação.

### Entrada

```json
{
  "token": "token-de-recuperacao",
  "password": "novaSenha123",
  "passwordConfirmation": "novaSenha123"
}
```

### Saída de sucesso

Status: `200 OK`

```json
{
  "message": "Senha redefinida com sucesso."
}
```

### Possíveis erros

Status: `400 Bad Request`

```json
{
  "error": "As senhas informadas não coincidem."
}
```

Status: `401 Unauthorized`

```json
{
  "error": "Token de recuperação inválido ou expirado."
}
```

## 5. Listar replays

### GET /replays

Retorna os replays disponíveis para consulta.

A rota pode receber filtros por cidade, quadra, data e horário.

### Exemplo de requisição

```text
GET /replays?city=Fortaleza&courtId=3&date=2026-09-24
```

### Saída de sucesso

Status: `200 OK`

```json
{
  "replays": [
    {
      "id": 42,
      "court": {
        "id": 3,
        "name": "Quadra 01"
      },
      "city": "Fortaleza",
      "recordedAt": "2026-09-24T18:30:00Z",
      "duration": 30,
      "expiresAt": "2026-10-01T18:30:00Z"
    }
  ]
}
```

## 6. Consultar replay específico

### GET /replays/{id}

Retorna os dados de um replay específico.

### Entrada

O identificador do replay é enviado pela URL.

```text
GET /replays/42
```

### Saída de sucesso

Status: `200 OK`

```json
{
  "id": 42,
  "court": {
    "id": 3,
    "name": "Quadra 01"
  },
  "city": "Fortaleza",
  "recordedAt": "2026-09-24T18:30:00Z",
  "duration": 30,
  "videoUrl": "/replays/42/stream",
  "expiresAt": "2026-10-01T18:30:00Z"
}
```

### Possíveis erros

Status: `404 Not Found`

```json
{
  "error": "Replay não encontrado."
}
```

## 7. Registrar novo replay

### POST /replays

Registra um replay após o acionamento do botão da quadra.

O sistema deve armazenar os últimos 30 segundos gravados e associar o replay à quadra, data e horário da solicitação.

### Entrada

```json
{
  "courtId": 3
}
```

### Saída de sucesso

Status: `201 Created`

```json
{
  "id": 42,
  "courtId": 3,
  "recordedAt": "2026-09-24T18:30:00Z",
  "duration": 30,
  "status": "AVAILABLE",
  "expiresAt": "2026-10-01T18:30:00Z"
}
```

### Possíveis erros

Status: `404 Not Found`

```json
{
  "error": "Quadra não encontrada."
}
```

Status: `500 Internal Server Error`

```json
{
  "error": "Não foi possível armazenar o replay.",
  "status": "PENDING"
}
```

## 8. Baixar replay

### GET /replays/{id}/download

Realiza o download do vídeo correspondente ao replay em formato MP4.

### Entrada

O identificador do replay é enviado pela URL.

```text
GET /replays/42/download
```

### Saída de sucesso

Status: `200 OK`

```json
{
  "fileName": "replay-42.mp4",
  "format": "MP4",
  "downloadUrl": "/files/replay-42.mp4"
}
```

Na implementação final, a rota também poderá retornar diretamente o arquivo de vídeo em vez de uma resposta JSON.

### Possíveis erros

Status: `404 Not Found`

```json
{
  "error": "Vídeo não encontrado ou não está mais disponível."
}
```

## 9. Excluir replay

### DELETE /replays/{id}

Exclui manualmente um replay.

Essa operação deve ser permitida apenas para o gestor responsável pela quadra ou para um administrador.

### Entrada

O identificador do replay é enviado pela URL.

```text
DELETE /replays/42
```

### Saída de sucesso

Status: `200 OK`

```json
{
  "message": "Replay excluído com sucesso."
}
```

### Possíveis erros

Status: `403 Forbidden`

```json
{
  "error": "Usuário sem permissão para excluir este replay."
}
```

Status: `404 Not Found`

```json
{
  "error": "Replay não encontrado."
}
```

## 10. Cadastrar patrocinador

### POST /sponsors

Cadastra um novo patrocinador e permite associá-lo a uma ou mais quadras do gestor.

### Entrada

```json
{
  "name": "Empresa Exemplo",
  "imageUrl": "/uploads/patrocinador.png",
  "duration": 10,
  "value": 500.0,
  "courtIds": [3, 4]
}
```

### Saída de sucesso

Status: `201 Created`

```json
{
  "id": 8,
  "name": "Empresa Exemplo",
  "imageUrl": "/uploads/patrocinador.png",
  "duration": 10,
  "value": 500.0,
  "courtIds": [3, 4]
}
```

### Possíveis erros

Status: `409 Conflict`

```json
{
  "error": "Patrocinador já cadastrado."
}
```

Status: `400 Bad Request`

```json
{
  "error": "Não foi possível adicionar novos patrocinadores às quadras selecionadas."
}
```

## 11. Consultar métricas do administrador

### GET /admin/metrics

Retorna dados gerais para o dashboard do administrador.

### Entrada

Não possui payload.

### Saída de sucesso

Status: `200 OK`

```json
{
  "activeUsers": 125,
  "totalCourts": 18,
  "totalReplays": 842,
  "mostAccessedCourts": [
    {
      "courtId": 3,
      "name": "Quadra 01",
      "accesses": 320
    },
    {
      "courtId": 5,
      "name": "Arena Central",
      "accesses": 275
    }
  ]
}
```

## 12. Consultar métricas do gestor

### GET /manager/metrics

Retorna métricas relacionadas às quadras do gestor autenticado.

### Entrada

Não possui payload.

### Saída de sucesso

Status: `200 OK`

```json
{
  "totalReplays": 186,
  "totalSponsors": 5,
  "peakHours": [
    {
      "hour": "19:00",
      "accesses": 72
    },
    {
      "hour": "20:00",
      "accesses": 61
    }
  ],
  "courts": [
    {
      "id": 3,
      "name": "Quadra 01",
      "replays": 120
    },
    {
      "id": 4,
      "name": "Quadra 02",
      "replays": 66
    }
  ]
}
```

## 13. Solicitar cadastro como gestor de quadra

### POST /manager-requests

Permite que um usuário cadastrado solicite a alteração de seu perfil para gestor de quadra.

### Entrada

```json
{
  "cpf": "12345678900",
  "cnpj": "12345678000199",
  "companyName": "Arena Exemplo LTDA",
  "courtQuantity": 2,
  "address": {
    "street": "Rua Principal, 100",
    "neighborhood": "Centro",
    "zipCode": "60000000",
    "city": "Fortaleza",
    "state": "CE"
  }
}
```

### Saída de sucesso

Status: `201 Created`

```json
{
  "id": 15,
  "userId": 1,
  "status": "PENDING",
  "message": "Solicitação enviada. Aguarde a análise dos administradores."
}
```

### Possíveis erros

Status: `400 Bad Request`

```json
{
  "error": "CPF ou CNPJ inválido."
}
```

Status: `409 Conflict`

```json
{
  "error": "Já existe uma solicitação pendente para este usuário."
}
```

## 14. Analisar solicitação de gestor

### PATCH /manager-requests/{id}

Permite que um administrador aprove ou reprove uma solicitação de cadastro como gestor de quadra.

### Entrada

```json
{
  "status": "APPROVED"
}
```

Também pode ser enviado:

```json
{
  "status": "REJECTED"
}
```

### Saída de sucesso

Status: `200 OK`

```json
{
  "id": 15,
  "userId": 1,
  "status": "APPROVED",
  "message": "Solicitação atualizada com sucesso."
}
```

### Possíveis erros

Status: `403 Forbidden`

```json
{
  "error": "Apenas administradores podem analisar solicitações."
}
```

Status: `404 Not Found`

```json
{
  "error": "Solicitação não encontrada."
}
```

## Agente da arena

Rotas usadas pelo agente local (`agent-node`) instalado em cada arena. Os dados usam campos em `snake_case`, e os erros seguem o formato padrão da API: `{ "error": { "code": "MIN_INTERVAL", "message": "..." } }`.

**Autenticação:** `Authorization: Bearer <token do agente>`. O token é gerado por arena (`POST /arenas/{id}/agent-token` ou `npm run agent:token -- <id_arena>`) e guardado só como hash SHA-256. Token ausente, inválido ou inativo retorna `401`. Quadra, arena ou replay de outra arena retorna `403`.

**Novas tentativas:** o agente repete indefinidamente respostas `409`, `429` e `5xx`; os demais `4xx` são definitivos. Por isso, violações de regra de negócio respondem `422`.

| Método | Rota | Faz | Respostas |
|---|---|---|---|
| GET | `/api/agent/arenas/{id}/config` | Lista as quadras disponíveis da arena com a câmera ativa (`identificador` = canal do DVR) | `200`, `403`, `404` |
| POST | `/api/agent/replays` | Cria o replay `pendente` com o horário do clique | `201` criado; `200` reenvio do mesmo clique; `400`; `403`; `404` quadra não encontrada; `422` quadra indisponível, intervalo de 10 s ou `pressed_at` fora da janela |
| POST | `/api/agent/replays/{id}/upload-urls` | Gera URLs `PUT` pré-assinadas para o vídeo e a miniatura | `200`; `409` se não estiver `pendente` ou se expirou; `503` sem storage configurado |
| POST | `/api/agent/replays/{id}/complete` | Confere o vídeo no R2, marca `disponivel` e grava metadados e log de gravação | `200` (idempotente); `409` vídeo ainda não chegou; `503` sem storage |
| DELETE | `/api/agent/replays/{id}` | Descarta o replay `pendente` (falha no recorte) e registra a falha | `204`; `404` |

### POST /arenas/{id}/agent-token

Rota do app (sessão de **administrador**, `Authorization: Bearer <token da sessão>` ou cookie), não do agente. O `id` da arena é escolhido na lista de `GET /arenas`. Gera um novo token para o agente da arena e, na mesma transação, desativa os agentes ativos anteriores dela. Quem usava o token antigo passa a receber `401`.

Sem corpo na entrada. Saída (`201`, com `Cache-Control: no-store`):

```json
{
  "agentId": "UUID",
  "arenaId": "UUID",
  "token": "token opaco em base64url",
  "revokedAgents": 1
}
```

O `token` aparece só nesta resposta e deve ir para `agent_token` no `config.json` do agente. Erros: `400` com `id` inválido, `401` sem sessão, `403` com perfil diferente de administrador e `404` com arena inexistente.

### GET /api/agent/arenas/{id}/config

```json
{
  "arena": { "id_arena": "UUID", "nome": "Arena Exemplo" },
  "quadras": [
    { "id_quadra": "UUID", "nome": "Quadra 1", "camera": { "id_camera": "UUID", "identificador": "1" } },
    { "id_quadra": "UUID", "nome": "Quadra 2", "camera": null }
  ]
}
```

### POST /api/agent/replays

Entrada:

```json
{ "id_quadra": "UUID", "pressed_at": "2026-11-19T13:00:00.000Z" }
```

Aplica as mesmas regras do `POST /replays`: quadra disponível, intervalo de 10 s entre replays da quadra (comparando os horários dos cliques), cópia dos patrocinadores, duração de 30 s e expiração em 168 h a partir do clique. `pressed_at` não pode estar mais de 5 minutos no futuro nem ser mais antigo que a retenção.

Saída (`201`):

```json
{
  "id_replay": "UUID", "id_quadra": "UUID", "arquivo_url": null,
  "data_geracao": "2026-11-19", "hora_geracao": "13:00:00",
  "status": "pendente", "criado_em": "2026-11-19T13:00:00.000Z", "expira_em": "2026-11-26T13:00:00.000Z"
}
```

### POST /api/agent/replays/{id}/upload-urls

```json
{
  "expira_em_segundos": 600,
  "video": { "key": "replays/<arena>/<quadra>/2026/11/19/<id>.mp4", "url": "https://...", "method": "PUT", "headers": { "Content-Type": "video/mp4" } },
  "thumb": { "key": "replays/<arena>/<quadra>/2026/11/19/<id>.jpg", "url": "https://...", "method": "PUT", "headers": { "Content-Type": "image/jpeg" } }
}
```

O agente envia os arquivos direto ao R2; o vídeo não passa pelo backend.

### POST /api/agent/replays/{id}/complete

Retorna o replay no mesmo formato da criação, com `status: "disponivel"` e `arquivo_url` com a **chave** do objeto (o bucket é privado; o app recebe URLs temporárias pelas rotas de replay).

### DELETE /api/agent/replays/{id}

Entrada opcional: `{ "reason": "descrição da falha" }` (mesmo campo do `DELETE /replays/{id}`). Marca o replay como `excluido` e grava `gravacao_log` com `resultado = 'falha'`.

## Códigos HTTP utilizados

| Código | Significado |
|---|---|
| 200 | Requisição realizada com sucesso |
| 201 | Recurso criado com sucesso |
| 400 | Dados inválidos ou campos obrigatórios ausentes |
| 401 | Usuário não autenticado ou credenciais inválidas |
| 403 | Usuário autenticado, mas sem permissão |
| 404 | Recurso não encontrado |
| 409 | Conflito com um recurso já existente |
| 422 | Regra de negócio violada |
| 429 | Limite de tentativas excedido |
| 500 | Erro interno do servidor |
| 503 | Serviço dependente (e-mail ou armazenamento) não configurado |

## Observações

Os vídeos devem permanecer disponíveis por até 7 dias. Após esse período, o sistema deverá realizar a exclusão automática.

Cada replay deve possuir vínculo com a quadra em que foi gerado e registrar data e horário da gravação.

O login deve respeitar o limite máximo de tentativas definido nos requisitos do sistema.

Os nomes das rotas, campos, tipos de identificadores e mecanismo de autenticação podem ser ajustados posteriormente de acordo com as tecnologias escolhidas pela equipe, desde que o comportamento definido neste contrato seja mantido.
