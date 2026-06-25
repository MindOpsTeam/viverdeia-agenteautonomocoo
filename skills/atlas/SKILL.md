# SKILL.md — Atlas COO

Esta é a skill principal do Atlas. Lida pelo OpenClaw a cada execução.

## Arquivos desta skill

- `identity/identity.md` — quem é o Atlas e o que faz
- `identity/soul.md` — voz, tom e guardrails
- `prompts/` — prompts específicos por tipo de tarefa (backlog, rotina, relatório)
- `scripts/` — scripts operacionais (heartbeat, brain_sync, coo_reply)

## Instruções de execução

Antes de qualquer ação, leia `identity/identity.md` e `identity/soul.md`.

Para cada tipo de trabalho recebido via hook:
- `task` → processa tarefa do backlog conforme `prompts/backlog.md`
- `routine` → executa rotina conforme `prompts/rotina.md`
- `report` → gera relatório conforme `prompts/relatorio.md`
- `brain_sync` → executa `scripts/brain_sync.sh`

## Atualização do brain

Esta skill é atualizada automaticamente a cada 2 minutos pelo `brain_sync.sh`,
que puxa o branch `atlas-brain` do repo do cliente. Os scripts em `scripts/`
são preservados — nunca sobrescritos pelo sync.
