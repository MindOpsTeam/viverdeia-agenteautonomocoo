## Problema 1 — Markdown não renderiza no chat

Os balões de mensagem do Atlas em `src/pages/HomePage.tsx` (linha 210) e `src/pages/ConversarPage.tsx` (linha 125) imprimem `m.content` como texto puro com `whitespace-pre-wrap`. Por isso aparece `**Tarefas em andamento**` literalmente, em vez de **negrito**, e títulos `#` / listas também ficam crus.

### Correção
1. Instalar `react-markdown` + `remark-gfm` (suporte a listas, tabelas, etc).
2. Criar um pequeno wrapper `src/components/chat/MarkdownMessage.tsx` com `ReactMarkdown` + `remarkGfm` e classes Tailwind (`prose prose-sm dark:prose-invert`) estilizando dentro do balão.
3. Em `HomePage.tsx` e `ConversarPage.tsx`: para mensagens do **assistente**, renderizar via `<MarkdownMessage>`; para mensagens do **usuário**, manter texto puro (não faz sentido markdown ali).
4. Manter quebras de linha (markdown já trata; remover `whitespace-pre-wrap` apenas no ramo assistant).

Resultado: `**negrito**` vira **negrito**, `#` vira título, listas numeradas ficam formatadas — exatamente como no print que você compartilhou.

---

## Problema 2 — Como testar sozinho no Discord

Você **não precisa de mais ninguém** no servidor para testar. O servidor "Pessoal" que você criou já serve perfeitamente como ambiente de QA. O que vou te orientar (sem mudar código):

### Plano de teste solo
1. **Servidor de teste = seu "Pessoal"** já configurado. O bot Atlas está nele, os canais foram criados pelo setup.
2. **Você simula o "time"** criando 2–3 contas Discord extras (grátis) só pra popular conversas — opcional. Para a maior parte dos testes não precisa: você posta mensagens, o Atlas lê e responde.
3. **Roteiro de smoke test** que vou deixar pronto na tela de Ajuda (ou num modal "Testar Atlas"):
   - **Conversar:** mandar "Resumo de hoje" → ver resposta no chat web.
   - **Tarefas:** criar uma tarefa no Notion conectado → rodar `sync-notion-tasks` → ver aparecer no Backlog.
   - **Discord:** disparar manualmente `generate-report` (botão "Gerar relatório agora" em Relatórios) → mensagem deve chegar no canal `#relatorios` do seu servidor.
   - **Diretriz:** adicionar uma diretriz em Cérebro → pedir "Quais são nossas diretrizes?" no chat → ver Atlas citá-la.
   - **Rotina:** criar rotina de teste com horário daqui a 2 minutos → conferir execução em `execution_logs`.
4. **Botão "Rodar teste agora"** (opcional, posso incluir): um único botão em Configurações → Demonstração que dispara o roteiro acima em sequência e mostra ✅/❌ de cada etapa.

### Decisão que preciso de você
Quer que eu **só corrija o markdown** (problema 1) ou também **adicione o botão "Rodar teste agora"** (item 4 do problema 2)? O resto do roteiro de teste solo é só seguir os passos — não exige código novo.
