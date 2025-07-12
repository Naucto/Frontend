FROM oven/bun:latest AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3001

CMD ["bun", "dev", "--host", "0.0.0.0", "--port", "3001"]
