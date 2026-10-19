#!/usr/bin/env bash
# Store secrets into .env.local (gitignored, mode 600) WITHOUT echoing them.
#
# Usage:   bash scripts/store-secrets.sh
# Then PASTE each value directly at the prompt and press Enter.
# Nothing is displayed while typing, so the values never reach scrollback,
# terminal output, or any conversation record.
#
# Never edit this file to contain real values. Values belong only in
# .env.local (this script) or the platform secret manager.
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
ENV_FILE=".env.local"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

set_or_replace() {
  local key="$1" value="$2"
  [ -n "$value" ] || return 0
  if [ -s "$ENV_FILE" ]; then
    grep -v "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp" || true
  else
    : > "${ENV_FILE}.tmp"
  fi
  printf '%s=%s\n' "$key" "$value" >> "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

CF_TOK=""
SB_DB=""
SB_URL=""

read -rsp 'Cloudflare API token   (paste at this prompt): ' CF_TOK; echo
read -rsp 'Supabase DB connection (paste at this prompt): ' SB_DB; echo
read -rp  'Supabase project URL   (optional, not secret) : ' SB_URL || true

set_or_replace CLOUDFLARE_API_TOKEN "$CF_TOK"
set_or_replace SUPABASE_DB_URL "$SB_DB"
set_or_replace SUPABASE_URL "$SB_URL"
unset CF_TOK SB_DB SB_URL

echo
echo "Stored keys in $ENV_FILE (values are never displayed):"
grep -oE '^[A-Z_]+=' "$ENV_FILE" | tr -d '=' | sed 's/^/  - /'
