#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

# GraphHopper 설정이 바뀌면 컨테이너를 다시 만들도록 체크섬을 전달합니다 (docker-compose.yml의 labels 참고).
export GRAPHHOPPER_CONFIG_SUM="$(cksum graphhopper/config-gh.yml | cut -d' ' -f1)"

# osm-updater 컨테이너가 호스트와 같은 경로로 저장소를 연결할 때 사용합니다.
export TRAZO_DIR="$(pwd)"

mode="${1:-live}"
action="${2:-up}"
case "$mode" in
  dev)
    export FRONTEND_BIND=127.0.0.1 FRONTEND_PORT=3001
    export DB_PORT=5402 BACKEND_PORT=8002 GRAPHHOPPER_PORT=8991
    compose=(docker compose -p toporider-dev -f docker-compose.yml -f docker-compose.dev.yml)
    ;;
  live)
    # 운영에서만 지도 자동 업데이트 컨테이너(osm-updater)를 함께 실행합니다.
    compose=(docker compose -p toporider --profile osm-updater -f docker-compose.yml)
    ;;
  *) echo "사용법: ./deploy.sh [dev|live] [up|down|logs|status]" >&2; exit 1 ;;
esac
case "$action" in up|down|logs|status) ;; *) echo "알 수 없는 작업: $action" >&2; exit 1 ;; esac
if [ ! -f .env ]; then
  echo ".env 파일이 없습니다. .env.example을 .env로 복사하고 DB와 Firebase 설정을 입력해주세요." >&2
  exit 1
fi
if ! command -v docker >/dev/null; then
  echo "docker 명령을 찾을 수 없습니다. Docker를 설치한 뒤 다시 실행해주세요." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker가 실행 중이 아닙니다. Docker(Docker Desktop)를 켠 뒤 다시 실행해주세요." >&2
  exit 1
fi
case "$action" in
  down) "${compose[@]}" down; exit ;;
  logs) "${compose[@]}" logs -f --tail=100; exit ;;
  status) "${compose[@]}" ps; exit ;;
esac
# GraphHopper는 data/south-korea-latest.osm.pbf 링크를 읽습니다. 링크가 없으면 가장 최근 날짜 파일에 연결합니다.
if [ ! -e data/south-korea-latest.osm.pbf ]; then
  newest="$(ls -1 data 2>/dev/null | grep -E '^south-korea-[0-9]{6}\.osm\.pbf$' | sort | tail -n 1 || true)"
  if [ -n "$newest" ]; then
    ln -sfn "$newest" data/south-korea-latest.osm.pbf
    echo "지도 파일 링크를 만들었습니다: data/south-korea-latest.osm.pbf -> $newest"
  fi
fi
if [ ! -s data/south-korea-latest.osm.pbf ]; then
  echo "OSM 지도 파일이 없습니다: data/south-korea-latest.osm.pbf" >&2
  echo "./update-osm.sh로 최신 파일을 내려받거나, 대한민국 .osm.pbf 파일을 data/south-korea-YYMMDD.osm.pbf로 넣어주세요." >&2
  exit 1
fi
if ! "${compose[@]}" config --quiet; then
  echo "Docker Compose 설정을 확인하지 못했습니다. 위 메시지와 .env 값을 확인해주세요." >&2
  exit 1
fi
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
