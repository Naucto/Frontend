#!/bin/sh
# Writes /config.json from APP_* environment variables so the same image serves every environment.
#
# The build deliberately leaves this one file uncompressed: nginx runs `gzip_static on`, so a
# precompressed twin frozen at build time would be served in preference to whatever is written here
# — the runtime configuration would exist on disk and never reach a browser. Removing a stale twin
# is belt to that brace, for an image built before the build knew to skip it.
set -e
OUT=/usr/share/nginx/html/config.json
rm -f "$OUT.gz"
json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
cat > "$OUT" <<JSON
{
  "apiUrl": "$(json_escape "${APP_API_URL:-}")",
  "google": { "clientId": "$(json_escape "${APP_GOOGLE_CLIENT_ID:-}")", "redirectUri": "$(json_escape "${APP_GOOGLE_REDIRECT_URI:-}")" },
  "github": { "clientId": "$(json_escape "${APP_GITHUB_CLIENT_ID:-}")", "redirectUri": "$(json_escape "${APP_GITHUB_REDIRECT_URI:-}")" },
  "microsoft": { "clientId": "$(json_escape "${APP_MICROSOFT_CLIENT_ID:-}")", "tenantId": "$(json_escape "${APP_MICROSOFT_TENANT_ID:-common}")", "redirectUri": "$(json_escape "${APP_MICROSOFT_REDIRECT_URI:-}")" },
  "docsEnabled": true
}
JSON
echo "runtime config: apiUrl=${APP_API_URL:-<empty>}"
