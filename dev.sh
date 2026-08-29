#!/bin/sh
# Starts the frontend dev server in Docker against the backend running on the naucto-dev network.
set -e

NETWORK=naucto-dev

BACKEND=$(docker ps --filter "network=${NETWORK}" --filter "publish=3000" --format '{{.Names}}' | head -n1)
if [ -z "${BACKEND}" ]; then
  echo "Backend not running on '${NETWORK}'. Start it first: run ./dev.sh in the Backend project."
  exit 1
fi

BACKEND_PORT=$(docker port "${BACKEND}" 3000 | head -n1 | sed 's/.*://')
export APP_API_URL="http://localhost:${BACKEND_PORT}"
echo "Using backend ${BACKEND} at ${APP_API_URL}"

docker compose -f docker-compose.dev.yml build && \
docker compose -f docker-compose.dev.yml up --watch frontend
