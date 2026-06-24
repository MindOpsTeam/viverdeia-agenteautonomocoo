# /docs — Agent COO · Documentação de Build

Leia os arquivos nesta pasta **nesta ordem** antes de escrever qualquer código:

| Arquivo | O que contém |
|---|---|
| `01-PRD.md` | Produto completo: visão, personas, funcionalidades, regras de negócio, decisões tomadas, mapeamento de reuso da base Nina |
| `02-BUILD-INSTRUCTIONS.md` | Instrução master de build: DS tokens, telas especificadas, SQL das tabelas, regras de negócio para implementar, ordem de build em 15 passos |

## Ponto de partida obrigatório

Este projeto é um **remix da base Nina** (sure-shot-code). NÃO comece do zero.
- Reutilize toda a infraestrutura de auth, vault, heartbeat, brain-sync e Edge Functions
- Substitua apenas o domínio (SDR/WhatsApp → COO/Discord+Slack)
- O mapeamento exato do que reutilizar vs. substituir está em `01-PRD.md` seção 3

## Referência visual

O protótipo HTML do Claude Design (DS Viver de IA) é a fonte da verdade para layout e UX.
Arquivo: `Agente_COO__standalone_.html` (na raiz do projeto ou em `/design`)

## Stack

Vite + React + TypeScript + Supabase (Edge Functions) + OpenClaw (VPS do cliente)
