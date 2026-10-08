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
# The client's sources are generated from openapi.json by the root postinstall, so `npm ci` needs
# the contract and the generator's config beside the manifest.
COPY packages/api-client/package.json packages/api-client/openapi.json packages/api-client/openapi-ts.config.ts packages/api-client/
# The engine's prepare script bundles the AudioWorklet; ship it so npm ci can run
# it (it no-ops here because the worklet source only arrives in the build stage).
COPY packages/engine/scripts packages/engine/scripts
# No registry credential is mounted: `@naucto/api-client` resolves from the workspace.
# No cache mount: the deploying host builds with the classic builder, which rejects --mount.
RUN npm ci --no-audit --no-fund

# Dev server with hot reload; docker-compose.dev.yml syncs the sources into it.
FROM deps AS dev
COPY . .
EXPOSE 4200
# `ng` directly: npm drops the flag names of arguments appended to a workspace script.
CMD ["npx", "ng", "serve", "web", "--host", "0.0.0.0", "--port", "4200", "--poll", "1000"]

FROM deps AS build
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build:worklet -w @naucto/engine && npm run docs:build && npm run build -w @naucto/web -- --configuration production \
  && find apps/web/dist/browser -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.svg' -o -name '*.ttf' \) ! -name 'config.json' -exec gzip -9 -k {} \;

FROM nginx:1.27-alpine AS runtime
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build --chown=nginx:nginx /app/apps/web/dist/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
