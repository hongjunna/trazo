#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

mode="${1:-live}"
action="${2:-up}"
case "$mode" in
  dev)
    export FRONTEND_BIND=127.0.0.1 FRONTEND_PORT=3001
    export DB_PORT=5402 BACKEND_PORT=8002 GRAPHHOPPER_PORT=8991
    compose=(docker compose -p toporider-dev -f docker-compose.yml -f docker-compose.dev.yml)
    ;;
  live)
    compose=(docker compose -p toporider -f docker-compose.yml)
    ;;
  *) echo "Usage: ./deploy.sh [dev|live] [up|down|logs|status]" >&2; exit 1 ;;
esac
case "$action" in up|down|logs|status) ;; *) echo "Unknown action: $action" >&2; exit 1 ;; esac
if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and fill in DB/Firebase settings." >&2
  exit 1
fi
case "$action" in
  down) "${compose[@]}" down; exit ;;
  logs) "${compose[@]}" logs -f --tail=100; exit ;;
  status) "${compose[@]}" ps; exit ;;
esac
if [ ! -s data/south-korea-260101.osm.pbf ]; then
  echo "Missing OSM input: data/south-korea-260101.osm.pbf" >&2
  echo "Place your South Korea .osm.pbf file there. This script does not download map data." >&2
  exit 1
fi
"${compose[@]}" config --quiet
if [ "$mode" = live ]; then
  echo "Updating main branch..."
  git pull --ff-only origin main
fi
echo "Starting TopoRider ($mode)..."
"${compose[@]}" up -d --build
if [ "$mode" = dev ]; then
  echo "Dev: http://localhost:3001 (source reload enabled)"
else
  echo "Live: http://localhost:${FRONTEND_PORT:-3000}"
fi
echo "GraphHopper may take time to import the map on its first start. Check ./deploy.sh $mode logs"
