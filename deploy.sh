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
  *) echo "사용법: ./deploy.sh [dev|live] [up|down|logs|status]" >&2; exit 1 ;;
esac
case "$action" in up|down|logs|status) ;; *) echo "알 수 없는 작업: $action" >&2; exit 1 ;; esac
if [ ! -f .env ]; then
  echo ".env 파일이 없습니다. .env.example을 .env로 복사하고 DB와 Firebase 설정을 입력해주세요." >&2
  exit 1
fi
case "$action" in
  down) "${compose[@]}" down; exit ;;
  logs) "${compose[@]}" logs -f --tail=100; exit ;;
  status) "${compose[@]}" ps; exit ;;
esac
if [ ! -s data/south-korea-260101.osm.pbf ]; then
  echo "OSM 지도 파일이 없습니다: data/south-korea-260101.osm.pbf" >&2
  echo "대한민국 .osm.pbf 파일을 해당 경로에 넣어주세요. 이 스크립트는 지도 데이터를 자동 다운로드하지 않습니다." >&2
  exit 1
fi
"${compose[@]}" config --quiet
if [ "$mode" = live ]; then
  echo "main 브랜치의 최신 코드를 가져옵니다…"
  git pull --ff-only origin main
fi
echo "Trazo를 시작합니다 ($mode)…"
"${compose[@]}" up -d --build
if [ "$mode" = dev ]; then
  echo "개발 주소: http://localhost:3001 (코드 수정 자동 반영)"
else
  echo "운영 주소: http://localhost:${FRONTEND_PORT:-3000}"
fi
echo "GraphHopper 최초 실행에는 지도 가공 시간이 필요합니다. 로그 확인: ./deploy.sh $mode logs"
