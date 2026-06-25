#!/usr/bin/env bash
# brain_sync.sh — Puxa o branch 'atlas-brain' (Brain Build) do repo do cliente
# e atualiza a PERSONA/CONHECIMENTO da skill (identity/soul/knowledge/prompts/SKILL.md)
# SEM tocar nos scripts operacionais. O OpenClaw hot-reloada os arquivos do workspace.
#
# Rodado pelo cron */2 e sob demanda (o botão "Sincronizar" da UI dispara um
# /hooks/agent pedindo sync, e a skill chama este script).
#
# SEGURANÇA: o token (GITHUB_BRAIN_TOKEN) vive só no ~/.atlas-coo/.env (chmod 600);
# o fetch usa uma URL autenticada inline — o token NÃO é persistido no .git/config.
#
# PRESERVAÇÃO DOS SCRIPTS: o deploy copia tudo de skills/atlas EXCETO scripts/.
# Assim heartbeat.sh/brain_sync.sh/coo_reply.sh nunca são apagados pelo pull.
set -uo pipefail

ENV_FILE="${ATLAS_ENV_FILE:-$HOME/.atlas-coo/.env}"
[[ -f "$ENV_FILE" ]] && { set +u; source "$ENV_FILE"; set -u; }

LOG_DIR="${ATLAS_LOG_DIR:-$HOME/.atlas-coo/logs}"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/brain_sync.log"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

BRAIN_DIR="${BRAIN_DIR:-$HOME/.atlas-coo/brain}"
BRAIN_BRANCH="${BRAIN_BRANCH:-atlas-brain}"
BRAIN_REPO="${BRAIN_REPO:-}"
SKILL_DEST="${SKILL_DEST:-$HOME/.openclaw/workspace/skills/atlas}"

[[ -z "$BRAIN_REPO" ]]        && { log "BRAIN_REPO ausente; skip"; exit 0; }
[[ -d "$BRAIN_DIR/.git" ]]    || { log "brain repo não inicializado ($BRAIN_DIR); skip"; exit 0; }

# URL autenticada só em memória.
AUTH_URL="$BRAIN_REPO"
[[ -n "${GITHUB_BRAIN_TOKEN:-}" ]] && AUTH_URL="${BRAIN_REPO/https:\/\//https://x-access-token:${GITHUB_BRAIN_TOKEN}@}"

if ! git -C "$BRAIN_DIR" fetch --depth 1 "$AUTH_URL" "$BRAIN_BRANCH" >>"$LOG" 2>&1; then
    log "fetch ${BRAIN_BRANCH} falhou (branch ausente ou auth) — mantém skill atual"; exit 0
fi
OLD=$(git -C "$BRAIN_DIR" rev-parse HEAD 2>/dev/null || echo none)
git -C "$BRAIN_DIR" reset --hard FETCH_HEAD >>"$LOG" 2>&1 || { log "reset --hard falhou"; exit 0; }
git -C "$BRAIN_DIR" sparse-checkout set "skills" "install/templates" >>"$LOG" 2>&1 \
  || git -C "$BRAIN_DIR" sparse-checkout reapply >>"$LOG" 2>&1 || true
NEW=$(git -C "$BRAIN_DIR" rev-parse HEAD 2>/dev/null || echo none)

[[ "$OLD" == "$NEW" ]] && { log "brain sem mudanças (${NEW:0:8})"; exit 0; }

SKILLS_SRC="$BRAIN_DIR/skills"
[[ -d "$SKILLS_SRC/atlas" ]] || { log "skills/atlas ausente no brain (branch ${BRAIN_BRANCH})"; exit 0; }
SKILLS_ROOT="$(dirname "$SKILL_DEST")"
mkdir -p "$SKILLS_ROOT"

# Deploy de TODAS as skills do brain. Para a skill 'atlas' preserva scripts/.
for srcdir in "$SKILLS_SRC"/*/; do
    [[ -d "$srcdir" ]] || continue
    name="$(basename "$srcdir")"
    dest="$SKILLS_ROOT/$name"
    mkdir -p "$dest"
    for item in "$srcdir"*; do
        [[ -e "$item" ]] || continue
        b="$(basename "$item")"
        if [[ "$name" == "atlas" && "$b" == "scripts" ]]; then continue; fi
        rm -rf "$dest/$b"
        cp -r "$item" "$dest/$b"
    done
done

log "brain atualizado: ${OLD:0:8} -> ${NEW:0:8} (atlas + skills sincronizados; scripts preservados)"
