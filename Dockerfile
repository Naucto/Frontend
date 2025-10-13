FROM oven/bun:latest AS base
WORKDIR /app

ARG FRONTEND_PORT=80

COPY ./patches ./patches
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ENV VITE_SERVER_PORT=$FRONTEND_PORT
EXPOSE $FRONTEND_PORT

CMD ["bun", "dev", "--host", "0.0.0.0"]
