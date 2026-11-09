#!/bin/bash
# OpenAI 플러그인 제출용 ZIP을 만듭니다: mcp/openai/dist/trazo-<버전>.zip
# 사용법: ./mcp/openai/build.sh  (plugin.json의 version을 올린 뒤 실행)
set -euo pipefail
cd "$(dirname "$0")"
version="$(python3 -c 'import json;print(json.load(open("plugin.json"))["version"])')"
grep -q 'REPLACE_WITH_PUBLIC_TOKEN' plugin.json && {
  echo "plugin.json의 테스트 케이스에 있는 REPLACE_WITH_PUBLIC_TOKEN을 실제 공개 코스 공유 토큰으로 바꿔 주세요." >&2
  exit 1
}
mkdir -p dist
rm -f "dist/trazo-$version.zip"
zip -r -X "dist/trazo-$version.zip" plugin.json mcp.json skills assets -x '*.DS_Store' >/dev/null
echo "만들었습니다: mcp/openai/dist/trazo-$version.zip"
unzip -l "dist/trazo-$version.zip"
