# syntax=docker/dockerfile:1.7
# Production image: build the Angular app, serve it with nginx. Runtime configuration (API URL,
# OAuth client ids) is written to /config.json by nginx/40-runtime-config.sh from APP_* env vars,
# so one image serves every environment.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY patches ./patches
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/
COPY packages/ui/package.json packages/ui/
COPY packages/api-client/package.json packages/api-client/
# The engine's prepare script bundles the AudioWorklet; ship it so npm ci can run
# it (it no-ops here because the worklet source only arrives in the build stage).
COPY packages/engine/scripts packages/engine/scripts
# NPM_TOKEN (read:packages) is only needed once @naucto/api-client is consumed from GitHub Packages;
# the BuildKit secret is optional so local builds work without it.
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN="$(cat /run/secrets/npm_token 2>/dev/null || true)" npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build:worklet -w @naucto/engine && npm run docs:build && npm run build -w web -- --configuration production \
  && find apps/web/dist/browser -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.svg' -o -name '*.ttf' \) -exec gzip -9 -k {} \;

FROM nginx:1.27-alpine AS runtime
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build --chown=nginx:nginx /app/apps/web/dist/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
