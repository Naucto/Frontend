#!/bin/sh
# Writes /config.json from APP_* environment variables so the same image serves every environment.
set -e
OUT=/usr/share/nginx/html/config.json
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
