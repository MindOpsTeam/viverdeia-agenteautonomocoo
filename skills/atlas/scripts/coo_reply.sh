#!/usr/bin/env bash
# coo_reply.sh — Envia resposta/ação do Atlas COO ao painel (coo-reply Edge Function).
# Chamado pela skill atlas após processar uma tarefa ou rotina.
#
# Uso:
#   bash coo_reply.sh --run <run_id> --status <sent|blocked|done|error> --content "<texto>"
#   bash coo_reply.sh --run <run_id> --status done --result '<JSON>'
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_shared.sh"

LOG_FILE="$LOG_DIR/coo_reply.log"

# ── Parse de argumentos ───────────────────────────────────────────────────────
RUN_ID=""; STATUS=""; CONTENT=""; RESULT=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --run)      RUN_ID="$2";    shift 2 ;;
        --status)   STATUS="$2";    shift 2 ;;
        --content)  CONTENT="$2";   shift 2 ;;
        --result)   RESULT="$2";    shift 2 ;;
        *) echo "Argumento desconhecido: $1" >&2; exit 1 ;;
    esac
done

[[ -z "$RUN_ID" ]]  && { echo "[$(date '+%F %T')] coo_reply: --run ausente" >> "$LOG_FILE"; exit 1; }
[[ -z "$STATUS" ]]  && { echo "[$(date '+%F %T')] coo_reply: --status ausente" >> "$LOG_FILE"; exit 1; }

# ── Montar body ───────────────────────────────────────────────────────────────
BODY="{\"run_id\":$(_json_str "$RUN_ID"),\"status\":$(_json_str "$STATUS\")"
[[ -n "$CONTENT" ]] && BODY="${BODY},\"content\":$(_json_str "$CONTENT")"
[[ -n "$RESULT" ]]  && BODY="${BODY},\"result\":${RESULT}"
BODY="${BODY}}"

RESP=$(_panel_post "coo-reply" "$BODY") && OK=1 || OK=0
if [[ "$OK" == "1" ]]; then
    echo "[$(date '+%F %T')] coo_reply ok — run=${RUN_ID} status=${STATUS}" >> "$LOG_FILE"
else
    echo "[$(date '+%F %T')] coo_reply FALHOU — run=${RUN_ID}" >> "$LOG_FILE"
    exit 1
fi
