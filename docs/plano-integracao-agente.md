# Plano de implementação: integração do agente de replay com o backend

## Objetivo

Fazer o **pi2-backend** receber os replays gerados nas arenas. O vídeo chega já recortado e processado, fica no armazenamento (Cloudflare R2) e é registrado no banco com as regras de negócio. O `server-node` usado hoje na simulação deixa de existir.

## Por que o agente precisa estar instalado na arena

O replay são os **30 segundos anteriores** ao clique. Para isso, alguém precisa gravar as câmeras o tempo todo, e esse papel tem que ficar **dentro da rede da arena**:

| Se o servidor na nuvem lesse o RTSP direto | Com o agente local |
|---|---|
| Upload contínuo de ~1 Mbps por câmera, 24 h (~11 GB/dia por câmera) | Sobe só o clipe de 30 s (~4 MB) |
| DVR exposto na internet (redirecionamento de porta) ou VPN em cada arena | DVR fica só na rede local |
| Queda de internet = vídeo perdido | Queda de internet = envio atrasado (fila local) |

**Conclusão:** cada arena precisa de **um PC com Windows ligado 24 h** na mesma rede do DVR, rodando o agente (`agent-node`).

## Fluxo

```
                 REDE DA ARENA                                   NUVEM
┌──────────────────────────────────────────────┐
│ DVR ──RTSP──► AGENTE (PC Windows, 24 h)      │
│               • buffer contínuo de 2 min     │
│ ESP32 ─POST─► • recorta 30 s antes do clique │
│ (botão)       • gera MP4 + miniatura         │
└──────────────┬───────────────────────────────┘
               │ ① cria replay  ② pede URLs  ④ confirma
               ▼
        ┌──────────────┐           ┌──────────┐
        │  pi2-backend │──────────►│ Postgres │
        └──────┬───────┘           └──────────┘
               │ URLs pré-assinadas
               ▼
        ┌──────────────┐   ③ upload direto do MP4/JPG
        │ Cloudflare R2│◄──────────────────── agente
        └──────────────┘
               ▲ app do jogador obtém o link via GET /replays/:id
```

1. O jogador aperta o botão, e o ESP32 faz `POST http://<IP do PC>:8080/api/replay?quadra=<id_quadra>`.
2. O agente responde `202`, recorta os 30 s do buffer e chama `POST /api/agent/replays`. O backend aplica as regras e cria o replay `pendente`.
3. O agente pede `POST /api/agent/replays/:id/upload-urls` e envia o vídeo e a miniatura **direto ao R2**. O vídeo não passa pelo backend.
4. O agente chama `POST /api/agent/replays/:id/complete`. O backend confere o arquivo no R2 e marca o replay como `disponivel`.
5. O app lista e baixa o replay pelas rotas que já existem.
6. Na expiração (168 h), a retenção apaga o arquivo no R2 e marca o replay como `excluido`.

Se a internet cair, o agente guarda os clipes numa fila e reenvia quando a conexão voltar.

## Decisões a confirmar

| # | Decisão | Proposta |
|---|---|---|
| D1 | Nova dependência no backend | Adicionar `@aws-sdk/client-s3` e `@aws-sdk/s3-request-presigner` |
| D2 | Acesso ao vídeo | **Privado**: o banco guarda a chave do objeto, e `GET /replays/:id` e `/download` geram URL temporária |
| D3 | Autenticação do agente | **Token por arena**, guardado como hash SHA-256 no banco |

## O que falta no backend

### 1. Banco: `src/db/init/013_agente.sql`
- Tabela `agente`: `id_agente`, `id_arena` (FK), `token_hash CHAR(64) UNIQUE`, `ativo`, `ultimo_contato_em`, `criado_em`.
- Script para gerar o token de uma arena. O token é exibido uma única vez, e só o hash fica salvo.

### 2. Autenticação: `src/middlewares/require-agent.ts`
- Lê `Authorization: Bearer <token>`, calcula o hash e procura um agente ativo.
- Preenche `request.agent = { id, arenaId }` e atualiza `ultimo_contato_em`.
- Toda rota do agente confere se a quadra ou o replay pertence a `arenaId`; se não pertencer, responde `403`.

### 3. Armazenamento: `src/services/storage.ts`
- `presignPut(key, contentType)`, `exists(key)` → `{ ok, size }`, `remove(key)` e `presignGet(key)` (este último, se D2 for privado).
- Padrão de chave: `replays/<id_arena>/<id_quadra>/<AAAA>/<MM>/<DD>/<id_replay>.mp4` (e `.jpg` para a miniatura).
- Variáveis de ambiente: `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `UPLOAD_URL_TTL_SECONDS=600` (e `PUBLIC_BASE_URL` só se D2 for público).

### 4. Regra de criação compartilhada: `src/services/replay-creation.ts`
- Reescrever com a lógica que hoje está dentro do `POST /replays`: quadra existe e está disponível, intervalo de 30 s, cópia dos patrocinadores, `duracao_segundos = 30`, expiração de 168 h.
- Aceitar o horário do clique como parâmetro: `pressedAt` vindo do agente, ou `clock_timestamp()` vindo do app.
- O `POST /replays` (app) e o `POST /api/agent/replays` passam a usar esse serviço.

### 5. Rotas do agente: `src/controllers/agent.controller.ts`

Registrar em `src/app.ts`. As rotas mantêm o contrato atual para que o agente não precise mudar.

| Rota | Faz | Respostas |
|---|---|---|
| `GET /api/agent/arenas/:id/config` | Lista as quadras disponíveis da arena com a câmera ativa | `200 { arena, quadras[{ id_quadra, nome, camera{ id_camera, identificador } }] }` |
| `POST /api/agent/replays` `{ id_quadra, pressed_at }` | Cria o replay `pendente` pelo serviço do item 4 | `201`; `404` quadra não encontrada; **`422`** para indisponível ou intervalo de 30 s* |
| `POST /api/agent/replays/:id/upload-urls` | Gera as URLs PUT do vídeo e da miniatura | `200 { expira_em_segundos, video{ key,url,method,headers }, thumb{…} }`; `409` se não estiver `pendente` |
| `POST /api/agent/replays/:id/complete` | Confere o arquivo no R2 (`HeadObject`), marca como `disponivel`, preenche `arquivo_url`, grava `replay_metadado` e `gravacao_log` (sucesso) | `200`; `409` se o vídeo ainda não chegou |
| `DELETE /api/agent/replays/:id` | Descarta o replay `pendente` quando o recorte falha e grava `gravacao_log` (falha) | `204`; `404` |

\* O agente trata `409` e `429` como erro temporário e tenta de novo indefinidamente. Violações de regra precisam responder **`422`**.

Os erros seguem o formato `{ "erro": "..." }`, que é o que o agente lê.

### 6. Leitura pelo app (se D2 for privado)
- Em `GET /replays/:id` e `GET /replays/:id/download`, converter `arquivo_url` (chave) em URL temporária com `presignGet`.

### 7. Retenção: `src/services/replay-retention.ts`
- `deleteStoredMedia` passa a apagar direto no R2 (`storage.remove`) no lugar de chamar `MEDIA_DELETE_URL`, mantendo a fila `media_deletion_job` e as novas tentativas.
- Apagar também a miniatura (`.jpg`).

### 8. Testes
- Unitários: `require-agent` (token válido, inválido, inativo, de outra arena) e o serviço de criação (intervalo de 30 s, quadra indisponível).
- Integração: o fluxo completo `config → criar → upload-urls → complete` com armazenamento simulado (mock).
- Atualizar a coleção do Postman em `docs/postman/`.

### 9. Documentação
- Atualizar o `contrato-api.md` com as rotas do agente e o README com as novas variáveis de ambiente.

## O que muda no agente (`agent-node`)

Nenhuma alteração de código, só no `config.json`:

```json
{
  "api_url": "https://<URL do pi2-backend>",
  "agent_token": "<token gerado para a arena>",
  "id_arena": "<id_arena>",
  "dvr_rtsp_template": "rtsp://<usuario>:<senha>@<IP do DVR>:554/cam/realmonitor?channel={canal}&subtype=0",
  "debounce_seconds": 30,
  "test_overlay": false
}
```

No banco, `camera.identificador` recebe o **número do canal** do DVR (`"1"`, `"2"`…). A senha do DVR fica só no PC da arena.

## Instalação do agente (por arena)

**Requisitos do PC**
- Windows 10/11, ligado 24 h e conectado **por cabo** à mesma rede do DVR.
- **IP fixo**, por reserva no DHCP do roteador. É esse IP que o ESP32 chama.
- Acesso à internet (HTTPS de saída para o backend e para o R2).
- Na BIOS: **Restore on AC Power Loss = Power On**, para religar sozinho depois de uma queda de energia.

**Cadastro (backend)**
1. Cadastrar a arena, as quadras e as câmeras (`identificador` = canal do DVR).
2. Gerar o token do agente da arena.

**No PC da arena** (PowerShell como Administrador, dentro de `agent-node`)
1. Preencher o `config.json` (seção anterior).
2. `Get-ChildItem -Recurse | Unblock-File`
3. `powershell -ExecutionPolicy Bypass -File .\windows\install.ps1`. O instalador:
   - instala Node.js e ffmpeg, se faltarem;
   - copia os arquivos para `C:\ReplayAgent`;
   - desativa suspensão e hibernação;
   - libera a porta 8080 no firewall;
   - cria a tarefa **ReplayAgent**, que roda como SYSTEM a partir do boot, sem login, e é reiniciada se cair.
4. Conferir o painel em `http://localhost:8080`: cada quadra deve aparecer gravando.

**ESP32**
- `POST http://<IP fixo do PC>:8080/api/replay?quadra=<id_quadra>`, sem autenticação (só na rede local).
- Respostas: `202` aceito, `429` clique repetido, `404` quadra desconhecida, `503` agente ainda iniciando.

**Câmeras/DVR**
- Codificar o stream principal em **H.264**. Com H.265 (HEVC), o MP4 não toca em vários navegadores, porque o agente não recodifica o vídeo.
- Acertar data e hora do DVR (NTP).

## Critérios de aceite
- Um clique no ESP32 gera um replay `disponivel` em menos de 10 s, com 30 s de vídeo do momento certo.
- O replay respeita o intervalo de 30 s e o cadastro de quadra disponível, e copia os patrocinadores.
- Um agente com token de uma arena não acessa quadras ou replays de outra.
- Com a internet desligada, os cliques ficam na fila e são enviados quando a conexão volta.
- Na expiração, o arquivo some do R2 e o replay fica `excluido`.
- O PC reiniciado volta a gravar sem ninguém fazer login.

## Pendências e riscos
- `install.ps1` ainda não foi testado num Windows 11 com o Controle Inteligente de Aplicativos ativo.
- O upload contra o bucket R2 real não foi validado de ponta a ponta.
- O agente só lê a configuração ao iniciar: quadras novas exigem reiniciar a tarefa.
- O ESP32 fala com o agente sem autenticação: aceitável na rede local, mas vale isolar o PC e os botões numa VLAN.
- Depois da migração, desligar o `server-node`, para não haver duas limpezas disputando os mesmos replays.
