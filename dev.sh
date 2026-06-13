#!/bin/sh
set -e

NETWORK=naucto-dev

# The backend runs in its own project on this shared network. We call it from the browser, so we
# need the host-published port, and we refuse to start without it.
BACKEND=$(docker ps --filter "network=${NETWORK}" --filter "publish=3000" --format '{{.Names}}' | head -n1)
if [ -z "${BACKEND}" ]; then
  echo "Backend not running on '${NETWORK}'. Start it first: run ./dev.sh in the backend project."
  exit 1
fi

VITE_BACKEND_PORT=$(docker port "${BACKEND}" 3000 | head -n1 | sed 's/.*://')
export VITE_BACKEND_PORT

docker compose -f docker-compose.dev.yml build && \
docker compose -f docker-compose.dev.yml up --watch frontend
