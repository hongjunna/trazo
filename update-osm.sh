#!/bin/bash
# 새 OSM 지도 파일이 올라왔는지 확인하고, 있으면 길찾기 그래프를 새로 만들어 운영 GraphHopper에 적용합니다.
#
# - 지도 파일은 data/south-korea-YYMMDD.osm.pbf (Geofabrik 업로드 날짜)로 저장하고 최근 5개만 보존합니다.
# - data/south-korea-latest.osm.pbf는 현재 적용된 파일을 가리키는 링크입니다.
# - 새 그래프는 운영 GraphHopper가 계속 동작하는 동안 별도 컨테이너에서 만들고,
#   완성되면 잠깐 재시작해 교체합니다. 확인에 실패하면 이전 그래프로 되돌립니다.
#
# 운영에서는 osm-updater 컨테이너가 매일 자동 실행합니다. 수동 실행: ./update-osm.sh
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
# 호스트에서 실행하면 공개 포트로, osm-updater 컨테이너에서 실행하면 내부 네트워크로 확인합니다.
CHECK_URL="${OSM_CHECK_URL:-http://127.0.0.1:${GRAPHHOPPER_PORT:-8989}}"
compose=(docker compose -p "$PROJECT" -f docker-compose.yml)
IMAGE="${PROJECT}-graphhopper"
LATEST="data/${OSM_PREFIX}-latest.osm.pbf"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "오류: $*" >&2; exit 1; }
# 예상하지 못한 명령이 실패해도 어느 단계에서 멈췄는지 한국어로 알려줍니다.
trap 'log "오류: ${LINENO}번 줄의 명령이 실패해 업데이트를 중단했습니다. 바로 위의 메시지를 확인하세요." >&2' ERR
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
  if ! curl -fsL -o "data/$file.part" "$OSM_URL"; then
    rm -f "data/$file.part"
    fail "지도 파일을 내려받지 못했습니다. 인터넷 연결과 디스크 여유 공간을 확인하세요."
  fi
  expected="$( { curl -fsL "$OSM_URL.md5" || true; } | awk '{print $1}')"
  actual="$( (md5sum "data/$file.part" 2>/dev/null || md5 -r "data/$file.part") | awk '{print $1}')"
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    rm -f "data/$file.part"
    log "다운로드한 파일의 체크섬이 맞지 않습니다. 다음 회차에 다시 시도합니다."
    exit 1
  fi
  mv "data/$file.part" "data/$file"
fi

# 3. 메모리 확인
# Windows(Git Bash)처럼 MemAvailable 항목이 없는 환경에서는 확인을 건너뜁니다.
free_kb="$(awk '/^MemAvailable:/{print $2}' /proc/meminfo 2>/dev/null || true)"
if [ -n "$free_kb" ]; then
  free_mb=$(( free_kb / 1024 ))
  if [ "$free_mb" -lt "$MIN_FREE_MB" ]; then
    log "여유 메모리(${free_mb}MB)가 ${MIN_FREE_MB}MB보다 적어 이번 업데이트를 건너뜁니다."
    exit 0
  fi
fi

# 4. 운영과 같은 설정으로 새 그래프를 별도 위치에 생성
command -v docker >/dev/null || fail "docker 명령을 찾을 수 없습니다. Docker를 설치한 뒤 다시 실행하세요."
docker info >/dev/null 2>&1 || fail "Docker가 실행 중이 아닙니다. Docker(Docker Desktop)를 켠 뒤 다시 실행하세요. 지도 파일은 data/$file에 받아 두었습니다."
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  fail "길찾기 이미지($IMAGE)가 없습니다. 먼저 ./deploy.sh live로 서비스를 한 번 실행한 뒤 다시 시도하세요. 지도 파일은 data/$file에 받아 두었습니다."
fi
graph="$(sed -nE "s/^[[:space:]]*graph\.location:[[:space:]]*'?([^' ]+)'?.*/\1/p" graphhopper/config-gh.yml)"
graph="${graph#/data/}"
next="${graph}-next"
prev="${graph}-prev"
sed -E \
  -e "s#^([[:space:]]*datareader\.file:).*#\1 '/data/$file'#" \
  -e "s#^([[:space:]]*graph\.location:).*#\1 '/data/$next'#" \
  graphhopper/config-gh.yml > data/.import-config.yml
# 이전 회차가 중단돼 남은 생성 컨테이너와 폴더를 정리합니다.
docker rm -f "${PROJECT}-osm-import" >/dev/null 2>&1 || true
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
    if curl -fs "${CHECK_URL}/route?${query}profile=run&points_encoded=false" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
log "그래프를 교체합니다."
"${compose[@]}" stop graphhopper || fail "GraphHopper 컨테이너를 멈추지 못했습니다. ./deploy.sh live status로 상태를 확인하세요."
if ! in_data "rm -rf /data/$prev && mv /data/$graph /data/$prev && mv /data/$next /data/$graph"; then
  "${compose[@]}" start graphhopper || true
  fail "그래프 폴더를 교체하지 못했습니다. 기존 그래프로 다시 시작합니다."
fi
"${compose[@]}" start graphhopper || fail "GraphHopper 컨테이너를 시작하지 못했습니다. ./deploy.sh live logs를 확인하세요."
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
