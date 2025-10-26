FROM oven/bun:latest AS base
WORKDIR /app

COPY ./patches ./patches
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ARG FRONTEND_PORT=80
ENV FRONTEND_PORT=${FRONTEND_PORT}
EXPOSE $FRONTEND_PORT

RUN bun run build

FROM nginx:alpine AS runtime
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
