# Trazo 로고 (고도 획)

출발점(링)에서 시작해 오르내리는 고도 선을 한 획으로 긋고, 가장 높은 곳에 깃발을 꽂은 모양입니다. 코스를 만들고(획), 오르막을 미리 알고(고도), 목표를 향해 훈련한다(깃발)는 뜻을 담았습니다.

미리보기: [index.html](index.html)를 브라우저로 여세요.

## 색

| 이름 | 값 | 쓰임 |
|---|---|---|
| 딥 틸 | `#0B4F57` | 아이콘 바탕, 밝은 바탕 위 글자 |
| 라임 | `#8FCE3A` | 고도 선 (짙은 바탕 위) |
| 라임 (밝은 바탕용) | `#6FAE28` | 흰 바탕 위 고도 선 (대비 보정) |
| 흰색 | `#FFFFFF` | 깃발, 출발·도착점 |

## 어떤 파일을 쓰나요

| 쓰는 곳 | 파일 |
|---|---|
| 앱·서비스 아이콘 (둥근 사각 포함) | `svg/trazo-icon.svg`, `png/icon/trazo-icon-<크기>.png` |
| 파비콘 등 48px 이하 | `svg/trazo-icon-small.svg`, `png/icon/trazo-icon-small-<16·32·48>.png` (선을 굵히고 면을 뺀 작은 크기용) |
| iOS 홈 화면, 안드로이드 maskable, 앱스토어처럼 운영체제가 모서리를 깎는 곳 | `png/icon-square/` (꽉 찬 사각, 투명 없음) |
| 둥근 화면 (가민 시계 런처 아이콘 등) | `png/icon-round/` (40~512px) |
| 사진·짙은 바탕 위 마크만 | `svg/trazo-mark-on-dark.svg`, `svg/trazo-mark-white.svg` |
| 흰 바탕 위 마크만 | `svg/trazo-mark-on-light.svg`, `svg/trazo-mark-teal.svg` |
| 흑백 인쇄 | `svg/trazo-mark-black.svg` |
| 로고 + 글자 (가로형) | `png/lockup/` (흰 바탕용 `-light`, 짙은 바탕용 `-dark`). SVG는 글꼴(Pretendard)이 있는 곳에서만 그대로 보이므로 문서·외부 등록에는 PNG를 쓰세요. |

- 마크 주변에는 마크 높이의 1/4 이상 여백을 둡니다.
- 마크를 늘리거나 기울이거나 색을 바꾸지 않습니다. 사진 위에는 흰색 단색 마크를 씁니다.

## 서비스에 적용된 곳

`bash docs/logo/sync.sh`가 아래 파일을 덮어씁니다.

| 서비스 파일 | 원본 |
|---|---|
| `frontend/public/favicon.svg` (웹·관리자·OAuth·정적 페이지·코스 소개 페이지 파비콘) | `svg/trazo-icon-small.svg` |
| `frontend/public/apple-touch-icon.png` | `png/icon-square/trazo-icon-square-180.png` |
| `frontend/src/assets/trazo-mark.svg` (상단 메뉴, 종목 선택 창, 코스 이미지 오른쪽 위 로고) | `svg/trazo-mark-on-dark.svg` |
| `mcp/assets/trazo-logo.svg`, `-512.png`, `-1024.png`, `mcp/openai/assets/logo.svg`, `composer-icon.svg` (Claude·ChatGPT 디렉터리 등록) | `svg/trazo-icon.svg`, `png/icon/` |

링크 미리보기 이미지 `frontend/public/og-image.png`는 `frontend/design/og-image.html`(마크가 직접 들어 있음)을 1200×900으로 캡처해 만듭니다.

## 모양 고치기

1. `build.mjs`에서 모양·색을 고칩니다.
2. `node docs/logo/build.mjs` → SVG를 다시 만듭니다.
3. `python docs/logo/render_png.py` → PNG를 다시 만듭니다 (Playwright 필요).
4. `bash docs/logo/sync.sh` → 서비스 파일에 복사합니다.
5. 마크를 바꿨다면 `frontend/design/og-image.html`의 마크도 바꾸고 `og-image.png`를 다시 캡처합니다.

## 가민

Trazo용 가민 Connect IQ 앱은 아직 없습니다(이 저장소와 상위 폴더에 있는 Connect IQ 프로젝트는 RailNow 앱뿐). 가민 쪽에 로고가 필요하면 다음을 씁니다.

- **Connect IQ 스토어 등록 아이콘·Garmin Connect Developer Program(파트너 앱) 로고**: `png/icon/trazo-icon-512.png` 또는 `-1024.png`. 바탕을 꽉 채워야 하면 `png/icon-square/`.
- **시계 런처 아이콘**: `png/icon-round/`에서 기기 해상도에 맞는 크기 (예: 40·54·60·65·70·80px). 기기별 정확한 크기는 Connect IQ SDK의 기기 정의(`compiler.json`의 `launcherIcon`)를 따르며, 크기가 없으면 `render_png.py`의 `icon-round` 크기 목록에 추가해 다시 그립니다.

Connect IQ 앱을 만든 뒤 로고를 바꿔 업데이트하는 순서:

1. 런처 아이콘 PNG를 `resources/drawables/`에 넣고 `drawables.xml`의 `LauncherIcon`이 그 파일을 가리키게 합니다. 기기별로 다르게 하려면 `resources-<기기>/drawables/`에 넣습니다.
2. `manifest.xml`의 `version`을 올립니다. 스토어는 같은 버전을 다시 받지 않습니다.
3. 배포용 패키지를 만듭니다: VS Code Monkey C 확장의 **Monkey C: Export Project**, 또는
   `monkeyc -e -r -o bin/Trazo.iq -f monkey.jungle -y <개발자 키.der>`
   (처음 앱을 올릴 때 쓴 개발자 키와 같은 키여야 업데이트로 인정됩니다.)
4. Connect IQ 개발자 대시보드(apps.garmin.com/developer)에서 앱을 열고 **새 버전 업로드**로 `.iq`를 올립니다. 스토어 목록 아이콘·스크린샷은 같은 화면의 앱 정보 편집에서 바꿉니다.
5. 심사를 통과하면 사용자의 Garmin Connect 앱이 업데이트를 받아 시계에 설치합니다.
