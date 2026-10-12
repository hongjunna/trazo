#!/usr/bin/env bash
set -Eeuo pipefail

# 운영 DB(toporider_db)를 로컬 포트로 연결하는 SSH 터널을 엽니다. DBGate 등 GUI 도구에서 바로 열 수 있도록
# 접속 정보(계정·비밀번호는 서버 postgres 컨테이너의 환경변수에서 읽음)를 출력하고, Ctrl+C로 종료합니다.
# 사용법: ./database.sh [로컬포트]   (기본 15401)

SSH_HOST="${SSH_HOST:-junlab@ssh.junlab.xyz}"
SSH_PORT="${SSH_PORT:-14457}"
CONTAINER="toporider-db-1"
REMOTE_DB_PORT=5401 # docker-compose.yml의 운영 DB_PORT 기본값 (서버 127.0.0.1에만 열려 있음)
LOCAL_PORT="${1:-${LOCAL_PORT:-15401}}"

if lsof -nP -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "로컬 포트 $LOCAL_PORT 가 이미 사용 중입니다. 다른 포트를 지정하세요: ./database.sh 15402" >&2
  exit 1
fi

echo "운영 서버에서 접속 정보를 가져오는 중..."
CREDENTIALS="$(ssh -p "$SSH_PORT" -o ConnectTimeout=10 "$SSH_HOST" \
  "docker exec $CONTAINER sh -c 'printf \"%s\n%s\n%s\n\" \"\$POSTGRES_DB\" \"\$POSTGRES_USER\" \"\$POSTGRES_PASSWORD\"'")"
DB_NAME="$(sed -n 1p <<<"$CREDENTIALS")"
DB_USER="$(sed -n 2p <<<"$CREDENTIALS")"
DB_PASSWORD="$(sed -n 3p <<<"$CREDENTIALS")"
if [[ -z "$DB_NAME" || -z "$DB_USER" ]]; then
  echo "접속 정보를 가져오지 못했습니다. 컨테이너($CONTAINER)가 실행 중인지 확인하세요." >&2
  exit 1
fi

ssh -N -p "$SSH_PORT" \
  -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -L "127.0.0.1:$LOCAL_PORT:127.0.0.1:$REMOTE_DB_PORT" "$SSH_HOST" &
TUNNEL_PID=$!
trap 'kill "$TUNNEL_PID" 2>/dev/null || true; echo; echo "터널을 닫았습니다."' EXIT INT TERM

for _ in $(seq 1 50); do
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "SSH 터널을 열지 못했습니다." >&2
    exit 1
  fi
  nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null && break
  sleep 0.2
done

ENCODED_PASSWORD="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$DB_PASSWORD")"
DATABASE_URL="postgresql://$DB_USER:$ENCODED_PASSWORD@127.0.0.1:$LOCAL_PORT/$DB_NAME"

cat <<EOF

운영 DB 터널이 열렸습니다. (종료: Ctrl+C)

[DBGate 등 GUI 도구]  Connection type: PostgreSQL
  Server    127.0.0.1
  Port      $LOCAL_PORT
  User      $DB_USER
  Password  $DB_PASSWORD
  Database  $DB_NAME
  URL       $DATABASE_URL

[터미널 접속]
  psql "$DATABASE_URL"
  # psql이 없으면 Docker로:
  docker run --rm -it postgres:15-alpine psql "postgresql://$DB_USER:$ENCODED_PASSWORD@host.docker.internal:$LOCAL_PORT/$DB_NAME"

운영 DB입니다. 수정·삭제 쿼리는 주의하세요.
EOF

wait "$TUNNEL_PID"
