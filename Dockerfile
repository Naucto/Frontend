FROM oven/bun:latest AS base
WORKDIR /app

COPY ./patches ./patches
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG BACKEND_URL
ENV VITE_BACKEND_URL=${BACKEND_URL}
RUN echo "VITE_BACKEND_URL=${BACKEND_URL}" > /app/.env.production
RUN bun run build --mode production

FROM nginx:alpine AS runtime
COPY --from=base --chown=nginx:nginx /app/dist /usr/share/nginx/html
