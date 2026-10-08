#!/bin/bash
# 새 OSM 지도 파일이 올라왔는지 확인하고, 있으면 길찾기 그래프를 새로 만들어 운영 GraphHopper에 적용합니다.
#
# - 지도 파일은 data/south-korea-YYMMDD.osm.pbf (Geofabrik 업로드 날짜)로 저장하고 최근 5개만 보존합니다.
# - data/south-korea-latest.osm.pbf는 현재 적용된 파일을 가리키는 링크입니다.
# - 새 그래프는 운영 GraphHopper가 계속 동작하는 동안 별도 컨테이너에서 만들고,
#   완성되면 잠깐 재시작해 교체합니다. 확인에 실패하면 이전 그래프로 되돌립니다.
#
# 사용법: ./update-osm.sh           (cron으로 하루 한 번 실행)
set -euo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
cd "$(dirname "$0")"

OSM_URL="${OSM_URL:-https://download.geofabrik.de/asia/south-korea-latest.osm.pbf}"
OSM_PREFIX="${OSM_PREFIX:-south-korea}"
KEEP_FILES="${OSM_KEEP_FILES:-5}"
IMPORT_HEAP="${OSM_IMPORT_HEAP:-2g}"
# 그래프 생성 중 운영 GraphHopper와 동시에 메모리를 쓰므로, 여유 메모리가 부족하면 이번 회차는 건너뜁니다.
MIN_FREE_MB="${OSM_MIN_FREE_MB:-3072}"
# 교체 후 길찾기가 실제로 되는지 확인할 두 지점 (서울)
CHECK_POINTS="${OSM_CHECK_POINTS:-37.5203,126.9969 37.5309,127.0117}"
PROJECT="${COMPOSE_PROJECT:-toporider}"
GRAPHHOPPER_PORT="${GRAPHHOPPER_PORT:-8989}"
compose=(docker compose -p "$PROJECT" -f docker-compose.yml)
IMAGE="${PROJECT}-graphhopper"
LATEST="data/${OSM_PREFIX}-latest.osm.pbf"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
# data 안의 그래프 폴더는 컨테이너(root)가 만들었으므로 이동·삭제도 컨테이너에서 합니다.
in_data() { docker run --rm -v "$PWD/data:/data" --entrypoint sh "$IMAGE" -c "$1"; }

mkdir -p data
exec 9>data/.update-osm.lock
if command -v flock >/dev/null && ! flock -n 9; then log "이미 업데이트가 진행 중입니다."; exit 0; fi

# 1. 새 파일 확인: 업로드 날짜(Last-Modified)로 파일명을 정합니다.
last_modified="$(curl -fsSIL "$OSM_URL" | tr -d '\r' | awk -F': ' 'tolower($1)=="last-modified"{v=$2} END{print v}')"
if [ -z "$last_modified" ]; then log "지도 파일 정보를 가져오지 못했습니다: $OSM_URL"; exit 1; fi
stamp="$(date -u -d "$last_modified" +%y%m%d 2>/dev/null || date -u -j -f '%a, %d %b %Y %T GMT' "$last_modified" +%y%m%d)"
file="${OSM_PREFIX}-${stamp}.osm.pbf"
current="$(readlink "$LATEST" 2>/dev/null || true)"
if [ "$current" = "$file" ]; then log "이미 최신 지도($file)를 사용 중입니다."; exit 0; fi

# 2. 다운로드와 무결성 확인
if [ ! -s "data/$file" ]; then
  log "새 지도 파일을 내려받습니다: $file"
  curl -fsSL -o "data/$file.part" "$OSM_URL"
  expected="$(curl -fsSL "$OSM_URL.md5" | awk '{print $1}')"
  actual="$( (md5sum "data/$file.part" 2>/dev/null || md5 -r "data/$file.part") | awk '{print $1}')"
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    rm -f "data/$file.part"
    log "다운로드한 파일의 체크섬이 맞지 않습니다. 다음 회차에 다시 시도합니다."
    exit 1
  fi
  mv "data/$file.part" "data/$file"
fi

# 3. 메모리 확인
if [ -r /proc/meminfo ]; then
  free_mb=$(( $(awk '/MemAvailable/{print $2}' /proc/meminfo) / 1024 ))
  if [ "$free_mb" -lt "$MIN_FREE_MB" ]; then
    log "여유 메모리(${free_mb}MB)가 ${MIN_FREE_MB}MB보다 적어 이번 업데이트를 건너뜁니다."
    exit 0
  fi
fi

# 4. 운영과 같은 설정으로 새 그래프를 별도 위치에 생성
docker image inspect "$IMAGE" >/dev/null
graph="$(sed -nE "s/^[[:space:]]*graph\.location:[[:space:]]*'?([^' ]+)'?.*/\1/p" graphhopper/config-gh.yml)"
graph="${graph#/data/}"
next="${graph}-next"
prev="${graph}-prev"
sed -E \
  -e "s#^([[:space:]]*datareader\.file:).*#\1 '/data/$file'#" \
  -e "s#^([[:space:]]*graph\.location:).*#\1 '/data/$next'#" \
  graphhopper/config-gh.yml > data/.import-config.yml
in_data "rm -rf /data/$next"
log "새 그래프를 만듭니다 (운영 길찾기는 계속 동작합니다)…"
if ! docker run --rm --name "${PROJECT}-osm-import" \
    -v "$PWD/data:/data" -v "$PWD/data/.import-config.yml:/graphhopper/config.yml:ro" \
    --entrypoint java "$IMAGE" "-Xmx$IMPORT_HEAP" "-Xms$IMPORT_HEAP" -jar graphhopper.jar import /graphhopper/config.yml; then
  in_data "rm -rf /data/$next"
  log "새 그래프 생성에 실패했습니다. 기존 그래프를 계속 사용합니다."
  exit 1
fi

# 5. 교체: GraphHopper를 멈춘 상태에서 폴더를 바꾸고 다시 시작합니다.
wait_ready() {
  local query="" p
  for p in $CHECK_POINTS; do query="${query}point=${p}&"; done
  for _ in $(seq 1 90); do
    if curl -fs "http://127.0.0.1:${GRAPHHOPPER_PORT}/route?${query}profile=run&points_encoded=false" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
log "그래프를 교체합니다."
"${compose[@]}" stop graphhopper
in_data "rm -rf /data/$prev && mv /data/$graph /data/$prev && mv /data/$next /data/$graph"
"${compose[@]}" start graphhopper
if ! wait_ready; then
  log "새 그래프로 길찾기 확인에 실패했습니다. 이전 그래프로 되돌립니다."
  "${compose[@]}" stop graphhopper
  in_data "rm -rf /data/$graph && mv /data/$prev /data/$graph"
  "${compose[@]}" start graphhopper
  wait_ready || log "이전 그래프로도 길찾기 확인에 실패했습니다. ./deploy.sh live logs를 확인하세요."
  exit 1
fi
in_data "rm -rf /data/$prev"
ln -sfn "$file" "$LATEST"
rm -f data/.import-config.yml
log "새 지도($file)를 적용했습니다."

# 6. 최근 지도 파일만 보존 (현재 사용 중인 파일은 지우지 않음)
{ ls -1 data | grep -E "^${OSM_PREFIX}-[0-9]{6}\.osm\.pbf$" || true; } | sort -r | tail -n +"$((KEEP_FILES + 1))" | while read -r old; do
  if [ "$old" != "$file" ]; then rm -f "data/$old"; log "오래된 지도 파일을 삭제했습니다: $old"; fi
done
