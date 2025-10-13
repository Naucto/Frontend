FROM oven/bun:latest AS base
WORKDIR /app

ARG FRONTEND_PORT=80

COPY ./patches ./patches
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE $FRONTEND_PORT

CMD ["bun", "dev", "--host", "0.0.0.0", "--port", "${FRONTEND_PORT}"]
