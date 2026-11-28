# Plano de integração do agente de replay com o backend

## Objetivo

Definir a arquitetura do servidor local de cada arena (o **agente de replay**, repositório `pi2-replay-agent`) e a forma como ele conversa com o **pi2-backend**. O agente grava as câmeras continuamente e, a cada clique do botão da quadra, entrega à nuvem um vídeo já recortado. O vídeo fica no armazenamento (Cloudflare R2) e é registrado no banco seguindo as regras de negócio.

## Por que um agente local

O replay são os **30 segundos anteriores** ao clique. Para isso, as câmeras precisam ser gravadas o tempo todo, e quem grava tem que ficar **dentro da rede da arena**:

| Se o servidor na nuvem lesse o RTSP direto | Com o agente local |
|---|---|
| Upload contínuo de ~1 Mbps por câmera, 24 h (~11 GB/dia por câmera) | Sobe só o clipe de 30 s (~4 MB) |
| DVR exposto na internet (redirecionamento de porta) ou VPN em cada arena | DVR fica só na rede local |
| Queda de internet = vídeo perdido | Queda de internet = envio atrasado (fila local) |

**Conclusão:** cada arena tem **um PC com Windows ligado 24 h** na mesma rede do DVR, rodando o agente.

## Decisões de arquitetura

| # | Decisão | Motivo |
|---|---|---|
| D1 | O agente roda no PC da arena como tarefa agendada do Windows (SYSTEM, a partir do boot) | Funciona sem login e volta sozinho depois de queda de energia ou travamento |
| D2 | Buffer circular **em disco**, em pedaços `.ts` de 2 s, sem recodificar o vídeo do DVR | Uso de CPU baixo, recorte rápido e disco constante (~2 min por câmera) |
| D3 | O horário do clique é registrado pelo agente (`pressed_at`) | O replay corresponde ao momento real do clique, mesmo se o envio atrasar |
| D4 | Fila local persistente antes de qualquer envio | Quedas de internet ou da API atrasam o replay, mas não o perdem |
| D5 | O vídeo vai **direto do agente ao R2**, por URL pré-assinada | O backend não trafega vídeo; só registra e valida |
| D6 | Armazenamento **privado**: o banco guarda a chave do objeto, e o app recebe URL temporária | Os vídeos não ficam públicos no bucket |
| D7 | Um **token por arena**, guardado no banco só como hash SHA-256 | Um agente não acessa dados de outra arena, e o token vazado é revogado sem afetar as demais |
| D8 | O botão (ESP32) fala com o agente por HTTP na rede local, sem autenticação | Simplicidade no firmware; a rede da arena não é exposta à internet |
| D9 | As regras de criação do replay ficam num único serviço do backend, usado pelo app e pelo agente | Intervalo de 30 s, quadra disponível, patrocinadores e expiração iguais nos dois caminhos |

## Componentes

| Componente | Onde roda | Responsabilidade |
|---|---|---|
| DVR | Rede da arena | Fornece o stream RTSP de cada câmera |
| Botão (ESP32) | Quadra | Avisa o agente do clique |
| Agente (`pi2-replay-agent`) | PC da arena | Buffer, recorte, fila, envio, painel local |
| pi2-backend | Nuvem | Regras de negócio, autenticação do agente, URLs pré-assinadas, retenção |
| Postgres | Nuvem | Replays, metadados, log de gravação, agentes |
| Cloudflare R2 | Nuvem | Vídeos e miniaturas |

## Rede da arena (IPs e portas)

Todos os equipamentos ficam na mesma rede local. Os IPs são fixados por **reserva de DHCP no roteador**, pelo endereço MAC de cada equipamento.

| Equipamento | IP fixo | Porta | Uso |
|---|---|---|---|
| Roteador | `192.168.1.1` | — | Gateway e DHCP |
| PC do agente (servidor local) | `192.168.1.10` | `8080/TCP` (entrada) | Endpoint do botão e painel local |
| DVR | `192.168.1.20` | `554/TCP` | Stream RTSP das câmeras, lido pelo agente |
| Botões ESP32 | `192.168.1.30` em diante (um por quadra: `.30`, `.31`, …) | — | Chamam o agente em `http://192.168.1.10:8080` |

- **Saída para a internet (PC do agente):** só HTTPS (`443/TCP`) para o pi2-backend e para o R2. Nenhuma porta da arena é aberta para a internet.
- A porta da API local pode ser trocada pelo `listen_port` do `config.json` e pelo parâmetro `-Porta` do instalador. Os dois precisam ter o mesmo valor, porque o instalador libera no firewall a porta que recebe.

## Fluxo

```
                       REDE DA ARENA (192.168.1.0/24)                          NUVEM
┌──────────────────────────────────────────────────────────────┐
│ DVR .20 ──RTSP :554──► AGENTE .10 (PC Windows, 24 h)          │
│                         • 1 ffmpeg por câmera: pedaços de 2 s │
│                         • buffer circular de 2 min em disco   │
│ ESP32 .30+ ─POST :8080─► • recorta os 30 s antes do clique    │
│ (botão)                 • MP4 + miniatura → fila persistente  │
└────────────────────────────────┬─────────────────────────────┘
                                 │ HTTPS · Bearer <token da arena>
                                 │ ① cria replay  ② pede URLs  ④ confirma
                                 ▼
                         ┌──────────────┐           ┌──────────┐
                         │  pi2-backend │──────────►│ Postgres │
                         └──────┬───────┘           └──────────┘
                                │ URLs pré-assinadas
                                ▼
                         ┌──────────────┐   ③ upload direto do MP4/JPG
                         │ Cloudflare R2│◄──────────────────────── agente
                         └──────────────┘
                                ▲ app do jogador obtém o link temporário via GET /replays/:id
```

1. O jogador aperta o botão, e o ESP32 faz `POST http://192.168.1.10:8080/api/replay?quadra=<id_quadra>`.
2. O agente grava a hora exata do clique, responde `202` e recorta os 30 s do buffer.
3. O recorte entra na fila local. O agente chama `POST /api/agent/replays`, e o backend aplica as regras e cria o replay `pendente`.
4. O agente pede `POST /api/agent/replays/:id/upload-urls` e envia o vídeo e a miniatura **direto ao R2**.
5. O agente chama `POST /api/agent/replays/:id/complete`. O backend confere o arquivo no R2 e marca o replay como `disponivel`.
6. O app lista e baixa o replay pelas rotas de sempre, com URL temporária gerada pelo backend.
7. Na expiração (168 h), a retenção do backend apaga o vídeo e a miniatura no R2 e marca o replay como `excluido`.

**Status do replay:** `pendente` (registrado, vídeo sendo enviado) → `disponivel` (vídeo no R2) → `excluido` (expirado ou descartado).

## Buffer circular e recorte

- **Gravação:** um processo `ffmpeg` por câmera grava pedaços `.ts` de `segment_seconds` (2 s) em `data/buffer/<id_quadra>/`. O nome de cada pedaço é a hora de início (`AAAAMMDD-HHMMSS.ts`).
- **Sem recodificar:** com DVR real, o vídeo é copiado como vem (`-c:v copy`). Por isso o stream principal do DVR precisa estar em **H.264**: com H.265 (HEVC), o MP4 não toca em vários navegadores.
- **Janela circular:** a cada 5 s, os pedaços mais antigos que `buffer_seconds` (120 s) são apagados.
- **Vigia:** se o `ffmpeg` cair ou passar `stall_seconds` (10 s) sem gerar pedaço novo, ele é reiniciado, com espera crescente de 1 s até 30 s.
- **Recorte:** no clique, o agente espera o pedaço atual fechar, junta os pedaços que cobrem `[clique − 30 s, clique]` (concat do ffmpeg, sem recodificar), corta a janela exata e gera um MP4 com `+faststart` e uma miniatura JPG do quadro do meio.
- **Latência do RTSP:** `latency_compensation_seconds` desloca a janela para compensar o atraso do DVR (cerca de 1 a 2 s com DVR real).

## Contrato: API local do agente (porta 8080)

Só deve ser acessível na rede local.

| Método | Rota | Uso |
|---|---|---|
| `POST` | `/api/replay?quadra=<id_quadra ou número>` | Clique do botão |
| `GET` | `/api/status` | Estado do agente e das câmeras |
| `GET` | `/api/replays` · `/api/replays/:id` | Replays da fila local |
| `GET` | `/` | Painel local |

Respostas de `POST /api/replay`:

| Código | Quando |
|---|---|
| `202` | Clique aceito; o recorte e o envio seguem em segundo plano |
| `404` | Quadra desconhecida |
| `429` | Clique repetido dentro de `debounce_seconds` (30 s, igual ao intervalo do backend) |
| `503` | Agente ainda iniciando ou sem configuração |
| `405` | Método diferente de `POST` |

O parâmetro `quadra` aceita o `id_quadra` ou o número da quadra (1, 2, …). O número segue a **ordem alfabética do nome** das quadras, então muda se uma quadra for criada ou renomeada. **No ESP32, use sempre o `id_quadra`.**

## Contrato: rotas do agente no backend

Todas exigem `Authorization: Bearer <token da arena>` e conferem se a quadra ou o replay pertence à arena do token. Se não pertencer, respondem `403`.

| Rota | Faz | Respostas |
|---|---|---|
| `GET /api/agent/arenas/:id/config` | Lista as quadras disponíveis da arena com a câmera ativa | `200 { arena, quadras[{ id_quadra, nome, camera{ id_camera, identificador } }] }` |
| `POST /api/agent/replays` `{ id_quadra, pressed_at }` | Cria o replay `pendente` com o horário do clique | `201` criado; `200` se já existia para o mesmo clique (idempotente); `400` corpo inválido; `404`; `422` para quadra indisponível, intervalo de 30 s ou `pressed_at` fora do prazo |
| `POST /api/agent/replays/:id/upload-urls` | Gera as URLs PUT do vídeo e da miniatura | `200 { expira_em_segundos, video{ key,url,method,headers }, thumb{…} }`; `409` se não estiver `pendente` ou se tiver expirado |
| `POST /api/agent/replays/:id/complete` | Confere o vídeo no R2, marca como `disponivel` e grava `replay_metadado` e `gravacao_log` (sucesso) | `200` (idempotente); `409` se o vídeo ainda não chegou |
| `DELETE /api/agent/replays/:id` `{ reason? }` | Descarta o replay `pendente` e grava `gravacao_log` (falha) | `204`; `404` |

Regras de `POST /api/agent/replays`:

- `pressed_at` com mais de 5 min no futuro é recusado. O relógio do PC precisa estar sincronizado (NTP).
- `pressed_at` mais antigo que 168 h é recusado, porque o replay já nasceria vencido.
- Valem as mesmas regras do `POST /replays` do app: quadra existente e disponível, intervalo de 30 s por quadra, cópia dos patrocinadores, `duracao_segundos = 30` e expiração de 168 h a partir do clique.

**Erros e novas tentativas:** os erros seguem o formato padrão da API, `{ "error": { "code", "message" } }`. O agente repete indefinidamente `408`, `409`, `429`, `5xx` e falhas de rede, com espera crescente até 120 s. Os outros `4xx` são definitivos: o replay local vai para `erro` e, se já existir no backend, o agente chama o `DELETE`.

## Autenticação do agente

- O token é exibido uma única vez e é gerado de duas formas:
  - pelo administrador, em `POST /api/arenas/:id/agent-token`;
  - pelo terminal do backend, com `npm run agent:token -- <id_arena>`.
- O banco guarda só o hash SHA-256 (tabela `agente`).
- Gerar um token novo desativa os anteriores da arena.
- Cada chamada do agente atualiza `ultimo_contato_em`, o que permite saber se a arena está online.

## Armazenamento (R2)

- Padrão de chave: `replays/<id_arena>/<id_quadra>/<AAAA>/<MM>/<DD>/<id_replay>.mp4`, e `.jpg` para a miniatura.
- `GET /replays/:id` e `/download` convertem a chave em URL temporária.
- Variáveis de ambiente do backend: `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e `UPLOAD_URL_TTL_SECONDS=600`.

## Retenção e limpeza

### Na nuvem (RN-01: 7 dias)

- Roda uma vez por dia: ao subir o servidor e a cada 24 h. Na Vercel, roda pelo cron `/api/cron/expire-replays`, às 03:00.
- Replays com `expira_em <= now()` passam para `excluido`, `arquivo_url` fica `NULL` e a chave do arquivo vai para a fila `media_deletion_job`.
- A fila apaga o vídeo e a miniatura no R2. Se a exclusão falhar, tenta de novo com espera crescente (até 24 h entre tentativas), sem perder a referência ao arquivo.

### No PC da arena

| O quê | Limpeza |
|---|---|
| Buffer (`data/buffer/`) | Pedaços com mais de 2 min são apagados a cada 5 s; o buffer é zerado quando o agente inicia |
| Clipes enviados (`data/clips/`) | Apagados logo após o envio, se `keep_local_clips = false` (padrão) |
| Clipes que terminam em `erro` | A definir (ver "Pontos em aberto") |
| Arquivos temporários do recorte | Apagados ao fim de cada recorte |
| Fila (`data/db/replays.json`) | Mantém só os 500 registros resolvidos mais recentes |
| Log (`data/logs/agent.log`) | Ao passar de 10 MB, vira `agent.log.1` |

## Comportamento em falhas

| Situação | O que acontece |
|---|---|
| API fora do ar ao iniciar | O painel sobe e mostra "aguardando a API"; o agente usa a última configuração salva (`data/remote-config.json`) ou tenta de novo a cada 10 s |
| Internet ou API caem depois | Os replays ficam na fila e são enviados quando a conexão volta, com a hora original do clique |
| `ffmpeg` cai ou trava | É reiniciado pelo vigia |
| Agente reinicia durante um recorte | O replay vai para `erro`; os que estavam `pendente` são retomados |
| PC reinicia | A tarefa sobe no boot (30 s depois), sem login, e retoma os envios |
| Agente encerra sozinho | A tarefa é relançada em 1 min, e o gatilho de 5 em 5 min garante que ele volte |

## Configuração do agente (`config.json`)

```json
{
  "api_url": "https://<URL do pi2-backend>",
  "agent_token": "<token gerado para a arena>",
  "id_arena": "<id_arena>",
  "dvr_rtsp_template": "rtsp://<usuario>:<senha>@192.168.1.20:554/cam/realmonitor?channel={canal}&subtype=0",
  "listen_port": 8080,
  "debounce_seconds": 30,
  "latency_compensation_seconds": 1,
  "test_overlay": false,
  "keep_local_clips": false
}
```

- `debounce_seconds` deve ser igual ao intervalo mínimo do backend (30 s). Um valor menor faz o botão receber `202` para um clique que o backend vai recusar.
- No banco, `camera.identificador` recebe o **número do canal** do DVR (`"1"`, `"2"`…). Para testes sem DVR, use `test` ou `file:<caminho>`.
- A senha do DVR fica só no PC da arena.
- O agente só lê as quadras e câmeras ao iniciar. Depois de cadastrar ou alterar uma quadra ou câmera, reinicie a tarefa.

## Implantação por arena

**Requisitos do PC**
- Windows 10/11, ligado 24 h e conectado **por cabo** à mesma rede do DVR.
- IP fixo `192.168.1.10`, por reserva no DHCP do roteador.
- Acesso à internet (HTTPS de saída para o backend e para o R2).
- Relógio sincronizado (NTP), porque o horário do clique vem do PC.
- Na BIOS: **Restore on AC Power Loss = Power On**, para religar sozinho depois de uma queda de energia.

**Cadastro (backend)**
1. Cadastrar a arena, as quadras e as câmeras (`identificador` = canal do DVR).
2. Gerar o token do agente da arena.

**No PC da arena**
1. Preencher o `config.json` (seção anterior).
2. Dar duplo clique em `install.cmd`, ou rodar `powershell -ExecutionPolicy Bypass -File .\windows\install.ps1` como Administrador. O instalador:
   - pergunta se deve atualizar, reinstalar ou cancelar quando já existe uma instalação;
   - instala Node.js LTS e ffmpeg via `winget`, se faltarem;
   - copia os arquivos para `C:\ReplayAgent` (o `ffmpeg.exe` vai para `C:\ReplayAgent\bin`);
   - desativa suspensão, hibernação e desligamento de disco na tomada;
   - libera a porta 8080 no firewall (perfis privado e domínio);
   - cria a tarefa **ReplayAgent**, que roda como SYSTEM a partir do boot, sem login, e é relançada se cair;
   - espera o agente ficar pronto e mostra o estado das câmeras.
3. Conferir o painel em `http://localhost:8080`: cada quadra deve aparecer gravando.

Os logs da instalação ficam em `C:\ProgramData\Repeteco\logs\`. Os do agente ficam em `C:\ReplayAgent\data\logs\`.

**ESP32**
- `POST http://192.168.1.10:8080/api/replay?quadra=<id_quadra>`, sem autenticação (só na rede local).
- Tratar `202` como sucesso, `429` como clique repetido e `503` como agente iniciando (tentar de novo depois).

**Câmeras/DVR**
- Codificar o stream principal em **H.264**.
- Acertar data e hora do DVR (NTP).

## Critérios de aceite

- O agente roda em segundo plano, sobe no boot sem login e volta sozinho se cair.
- Um clique no ESP32 gera um replay `disponivel` em menos de 10 s, com 30 s de vídeo do momento certo.
- O replay respeita o intervalo de 30 s e a quadra disponível, e copia os patrocinadores.
- Um agente com token de uma arena não acessa quadras ou replays de outra.
- Com a internet desligada, os cliques ficam na fila e são enviados quando a conexão volta.
- Na expiração, o arquivo some do R2 e o replay fica `excluido`.
- O PC reiniciado volta a gravar sem ninguém fazer login.

## Riscos e pontos em aberto

- **R2 real:** o upload e a exclusão precisam ser validados de ponta a ponta contra o bucket real.
- **Clipes com erro no disco do PC:** definir quando o agente apaga os clipes que terminam em `erro` e os arquivos dos registros removidos da fila.
- **Configuração lida só no início:** quadras ou câmeras novas exigem reiniciar a tarefa.
- **API local sem autenticação:** aceitável na rede local, mas vale isolar o PC e os botões numa VLAN. A API local responde com `access-control-allow-origin: *`, então qualquer página aberta num navegador da rede consegue disparar cliques.
- **`install.ps1`:** ainda não foi testado num Windows 11 com o Controle Inteligente de Aplicativos ativo.
