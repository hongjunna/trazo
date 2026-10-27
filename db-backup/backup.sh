#!/bin/bash
# 매일 BACKUP_TIME(기본 03:30, TZ 기준)에 DB를 pg_dump(custom 형식)로 /backups에 저장합니다.
# 백업에 성공했을 때만 BACKUP_KEEP_DAYS일(기본 30일)보다 오래된 백업을 지웁니다.
# 사용법: db-backup        스케줄러 (컨테이너 기본 실행)
#         db-backup now    지금 한 번 백업 (./deploy.sh live backup)
set -uo pipefail
BACKUP_DIR=/backups
BACKUP_TIME="${BACKUP_TIME:-03:30}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
: "${DATABASE_URL:?DATABASE_URL이 필요합니다}"
# 백업 파일에는 회원 데이터가 들어 있으므로 소유자만 읽을 수 있게 만듭니다.
umask 077

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

backup() {
  local name tmp
  name="toporider-$(date +%Y%m%d-%H%M%S).dump"
  tmp="$BACKUP_DIR/.$name.part"
  if ! pg_dump --format=custom --file="$tmp" "$DATABASE_URL"; then
    rm -f "$tmp"
    log "백업에 실패했습니다. DB 상태와 백업 디스크($BACKUP_DIR)를 확인하세요."
    return 1
  fi
  # 복원할 수 있는 파일인지 목차를 읽어 확인합니다.
  if ! pg_restore --list "$tmp" >/dev/null; then
    rm -f "$tmp"
    log "백업 파일을 확인하지 못했습니다: $name"
    return 1
  fi
  mv "$tmp" "$BACKUP_DIR/$name"
  log "백업했습니다: $name ($(du -h "$BACKUP_DIR/$name" | cut -f1))"
  find "$BACKUP_DIR" -maxdepth 1 -name 'toporider-*.dump' -mtime +"$KEEP_DAYS" -print -delete | while read -r old; do
    log "오래된 백업을 지웠습니다: $(basename "$old")"
  done
}

if [ ! -w "$BACKUP_DIR" ]; then
  log "백업 폴더에 쓸 수 없습니다: $BACKUP_DIR (호스트 BACKUP_DIR의 권한과 BACKUP_UID를 확인하세요)"
  exit 1
fi

if [ "${1:-}" = now ]; then
  backup
  exit
fi

log "DB 자동 백업을 시작합니다. 매일 ${BACKUP_TIME} (${TZ:-UTC})에 백업하고 ${KEEP_DAYS}일 동안 보관합니다."
# 처음 실행했거나 최근 하루 동안 백업이 없으면 바로 한 번 백업합니다.
if ! find "$BACKUP_DIR" -maxdepth 1 -name 'toporider-*.dump' -mmin -1440 | grep -q .; then
  backup
fi
while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_TIME}" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${BACKUP_TIME}" +%s)
  log "다음 백업: $(date -d "@$next" '+%Y-%m-%d %H:%M')"
  sleep $((next - now))
  backup || log "다음 회차에 다시 시도합니다."
done
