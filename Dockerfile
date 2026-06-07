FROM node:22-alpine AS base
WORKDIR /app

COPY ./patches ./patches
COPY package.json ./
COPY package-lock.json ./
RUN npm ci

COPY . .

ARG BACKEND_URL
ENV VITE_BACKEND_URL=${BACKEND_URL}
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=base --chown=nginx:nginx /app/dist /usr/share/nginx/html
