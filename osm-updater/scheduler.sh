#!/bin/bash
# 매일 OSM_UPDATE_TIME(기본 04:00, TZ 기준)에 update-osm.sh를 실행합니다.
# 저장소는 호스트와 같은 경로로 연결돼 있어야 합니다 (docker run -v 경로를 호스트 Docker가 해석하기 때문).
set -uo pipefail
UPDATE_TIME="${OSM_UPDATE_TIME:-04:00}"
cd "${TRAZO_DIR:?TRAZO_DIR가 필요합니다}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log "지도 자동 업데이트를 시작합니다. 매일 ${UPDATE_TIME} (${TZ:-UTC})에 새 지도를 확인합니다."
while true; do
  now=$(date +%s)
  next=$(date -d "today ${UPDATE_TIME}" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${UPDATE_TIME}" +%s)
  log "다음 확인: $(date -d "@$next" '+%Y-%m-%d %H:%M')"
  sleep $((next - now))
  ./update-osm.sh || log "업데이트에 실패했습니다. 다음 회차에 다시 시도합니다."
done
