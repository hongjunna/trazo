#!/usr/bin/env bash
# docs/logo/sync.sh
# docs/logo의 로고 파일을 서비스에서 쓰는 위치로 복사합니다. 저장소 루트에서 실행하세요.
#   node docs/logo/build.mjs && python docs/logo/render_png.py && bash docs/logo/sync.sh
# 링크 미리보기 이미지(frontend/public/og-image.png)는 frontend/design/og-image.html을 캡처해 따로 만듭니다.
set -euo pipefail
L=docs/logo

# 웹: 파비콘(작은 크기용), iOS 홈 화면 아이콘, 앱 안의 마크(짙은 바탕 타일 위에 얹음)
cp $L/svg/trazo-icon-small.svg frontend/public/favicon.svg
cp $L/png/icon-square/trazo-icon-square-180.png frontend/public/apple-touch-icon.png
cp $L/svg/trazo-mark-on-dark.svg frontend/src/assets/trazo-mark.svg

# MCP 디렉터리 등록(Claude·ChatGPT)용 아이콘
sed 's/viewBox="0 0 64 64"/width="512" height="512" viewBox="0 0 64 64"/' $L/svg/trazo-icon.svg > mcp/assets/trazo-logo.svg
cp $L/png/icon/trazo-icon-512.png mcp/assets/trazo-logo-512.png
cp $L/png/icon/trazo-icon-1024.png mcp/assets/trazo-logo-1024.png
cp mcp/assets/trazo-logo.svg mcp/openai/assets/logo.svg
cp mcp/assets/trazo-logo.svg mcp/openai/assets/composer-icon.svg
echo "synced"
