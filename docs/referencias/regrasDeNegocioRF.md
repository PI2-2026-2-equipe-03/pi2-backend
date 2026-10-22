# Regras de Negócio (RN) — Plataforma de Replays Esportivos

Este documento especifica as Regras de Negócio do sistema, definindo as políticas, restrições e lógicas operacionais que regem as funcionalidades da plataforma de replays esportivos.

## Detalhamento das Regras de Negócio

### RN-01 — Retenção e Exclusão Automática de Mídia

* **Descrição:** Todo vídeo gravado e armazenado na plataforma possui um tempo de vida útil máximo de **7 dias corridos (168 horas)** contados a partir da data e hora exatas de sua geração.  
* **Política Operacional:**  
  1. Uma rotina/cronjob diária verifica os registros de vídeos cujo campo data\_criacao seja superior a 7 dias em relação ao horário atual.  
  2. O arquivo de vídeo correspondente é removido do armazenamento (storage/S3) e seu registro no banco de dados tem o status atualizado para EXPIRADO ou é removido.  
  3. Uma vez expirado, o vídeo não poderá mais ser recuperado nem listado para busca ou download.  
* **Requisitos Vinculados:** RF-08 (Exclusão automática) e RNF-03 (Métricas de armazenamento/desempenho).

---

### RN-02 — Janela Fixa e Buffer do Replay (30 segundos)

* **Descrição:** O acionamento do botão de captura (físico ou virtual na quadra) gera um clipe de vídeo com duração contínua e exata de **30 segundos anteriores ao momento do clique**.  
* **Política Operacional:**  
  1. O sistema de captura das câmeras na quadra deve manter um buffer circular em memória dos últimos 30 segundos de gravação.  
  2. Ao receber o sinal de gravação, o buffer atual é empacotado, associado à quadra/horário e enviado para processamento.  
  3. Não são permitidas gravações avulsas com tempos customizados (menores que 30s ou maiores que 30s) pelo usuário comum.  
* **Requisitos Vinculados:** RF-05 (Gravar Vídeo).

---

### RN-03 — Bloqueio Temporário por Tentativas de Acesso

* **Descrição:** Para proteger o sistema contra ataques de força bruta, a tentativa de autenticação será temporariamente bloqueada após **5 falhas consecutivas** de login.  
* **Política Operacional:**  
  1. O sistema contabiliza as tentativas incorretas de senha para uma determinada combinação de e-mail e endereço IP.  
  2. Ao atingir 5 tentativas incorretas sem sucesso intermediário, o usuário fica bloqueado por **15 minutos**.  
  3. Durante o período de bloqueio, qualquer nova tentativa retornará erro HTTP 429 Too Many Requests ou mensagem de conta temporariamente suspensa, sem consultar a hash de senha.  
* **Requisitos Vinculados:** RF-02 (Login) e RNF-04 (Segurança).

---

### RN-04 — Permissão de Exclusão Manual de Vídeos

* **Descrição:** A remoção antecipada de um vídeo (antes do prazo automático de 7 dias) é uma operação restrita e auditada.  
* **Política Operacional:**  
  1. Apenas o perfil **Administrador do Sistema** ou o **Cliente Proprietário da Quadra** onde o vídeo foi gravado têm permissão para solicitar a exclusão manual.  
  2. Usuários comuns/atletas não possuem permissão para deletar vídeos da quadra.  
  3. Toda exclusão manual gera um registro de auditoria contendo usuario\_id, video\_id, data\_hora e motivo.  
* **Requisitos Vinculados:** RF-10 (Exclusão manual) e Matriz de Perfis de Acesso.

---

### RN-05 — Vinculação Obrigatória de Patrocinador em Replays

* **Descrição:** Todo vídeo disponibilizado para visualização e download deve conter a marca d'água ou vinheta do patrocinador ativo vinculado à respectiva quadra.  
* **Política Operacional:**  
  1. Se a quadra possuir um patrocinador ativo cadastrado no momento do processamento do vídeo, a marca d'água do patrocinador deve ser sobreposta ao vídeo ou inserida na vinheta.  
  2. Caso a quadra possua múltiplos patrocinadores ativos, o sistema aplicará o patrocinador em rodízio (round-robin) ou exibirá a marca principal configurada pelo cliente.  
  3. Caso não haja patrocinador cadastrado, a marca padrão da plataforma/quadra será mantida.  
* **Requisitos Vinculados:** RF-07 (Gestão de Patrocinadores) e RF-09 (Associar Metadados ao Replay).

---

RN-06 \- Logout automático por sessão   
	

* **Descrição:** Usuário sem atividades no período de 30 minutos terão que logar novamente  
* **Política Operacional:**  
  1. Token de acesso é criado automaticamente após alguma atividade  
  2. Depois de 30 minutos passados é feito o logout na conta  
  3. Se o usuário fizer qualquer operação no sistema, a contagem do token é reiniciada  
* **Requisitos Vinculados:** RF-02 (login de Usuário)

---

RN-07 \- Validade do Código de recuperação de senha 

* **Descrição:** válido por 10 minutos, de uso único, com limite de 3 tentativas e de 3 reenvios por hora.   
* **Política Operacional:**  
1. Na tentativa de recuperação de senha passou-se 10 minutos após o envio do código por email ou telefone  
2. O usuário ao tentar utilizar o código com tempo expirado aparecerá a mensagem “Código expirado”  
3. O usuário terá direito a mais três tentativas em uma hora  
* **Requisitos Vinculados:** RF-11 (Recuperação de senha)

---

RN-08 \- Visualização e download de vídeos apenas por usuários cadastrados

* **Descrição:** Um cliente só conseguirá gravar os últimos 30 segundos em quadra, apertando o botão, se já tiverem passado 30 segundos da última vez que o botão foi acionado, para evitar replays duplicados ou sobrepostos.   
* **Política Operacional:**   
1. Usuário cria email e senha  
2. Após o login ela consegue visualizar e baixar os vídeo   
3. Sem conta o usuário não consegue “sair” da conta de login  
* **Requisitos Vinculados:** RF-06 (Baixar vídeos)

---

RN-09 \- Email e telefones vinculados a uma única conta

* **Descrição:** Um cliente só conseguirá se cadastrar com um email e um telefone a uma única conta  
* **Política Operacional:**   
1. Cliente tenta se cadastrar com email e/ou telefone já existente então o sistema informa que Email ou telefone ou os dois já estão vinculados em uma conta  
2. Se o mesmo cliente quiser criar duas contas com email e telefones diferentes, assim ele popderá  
* **Requisitos Vinculados:** RF-01(Cadastro de Usuário)

---

RN-10 \- Nova senha diferente da anterior e sua complexidade

	**Descrição:** Um cliente só conseguirá cadastrar uma nova senha se ela for diferente da anterior  e apresentar requisitos mínimos

* **Política Operacional:**   
1. Nova senha deverá ser diferente da anterior  
2. Terá que ter no mínimo 8 caracteres, uma letra maiúsculo, uma minúscula, um número e um caractere especial  
* **Requisitos Vinculados:** RF-01(Cadastro de Usuário)