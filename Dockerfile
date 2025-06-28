FROM oven/bun:latest

WORKDIR /app

COPY package.json ./
COPY bun.lock ./
COPY patches/ ./patches

RUN bun i

COPY . .

EXPOSE 3001

CMD ["bun", "run", "dev", "--host"]
