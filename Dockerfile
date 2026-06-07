FROM node:22-alpine AS base
WORKDIR /app

COPY ./patches ./patches
COPY package.json ./
COPY package-lock.json ./
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm ci

COPY . .

ARG BACKEND_URL
ENV VITE_BACKEND_URL=${BACKEND_URL}
ENV VITE_MICROSOFT_CLIENT_ID
ENV VITE_MICROSOFT_TENANT_ID
ENV VITE_MICROSOFT_REDIRECT_URI
ENV VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_REDIRECT_URI
ENV VITE_GITHUB_CLIENT_ID
ENV VITE_GITHUB_REDIRECT_URI
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=base --chown=nginx:nginx /app/dist /usr/share/nginx/html
