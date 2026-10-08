# TopoRider 프론트엔드

React와 Vite로 만든 자전거 코스 편집 화면입니다. 지도는 카카오 지도 SDK, 로그인은 Firebase Authentication을 사용합니다. 배포와 Firebase 설정의 전체 절차는 [프로젝트 README](../README.md)를 참고하세요.

## 개발 실행

프로젝트 루트에서 `./deploy.sh dev`를 실행하면 `http://localhost:3001`에서 사용할 수 있습니다. 프론트엔드와 백엔드의 코드 수정이 자동 반영되며, 루트 `.env`에서 Firebase 설정을 읽습니다.

Vite만 별도로 실행하려면 이 폴더의 `.env.example`을 `.env.local`로 복사해 Firebase 값을 입력하고 아래 명령을 실행합니다. 기본 `/api` 요청은 `http://localhost:8001`로 전달됩니다. 개발 모드 Docker 백엔드에 연결하려면 `DEV_API_PROXY=http://localhost:8002 npm run dev`를 사용합니다.

```bash
npm ci
npm run dev
```

## 빌드와 코드 검사

```bash
npm run build
npm run lint
```

빌드 결과는 `dist`에 생성됩니다. Firebase 설정은 빌드 시 포함되므로 값을 바꾸면 다시 빌드해야 합니다. 운영 Docker 이미지는 프로젝트 루트의 Docker Compose로 빌드하세요. 전체 코드 검사에는 기존 고도 차트와 히스토리 훅 등의 오류가 남아 있습니다.

## 로그인 화면

지도 오른쪽 패널 상단의 구글 로그인 영역은 패널을 접어도 유지됩니다. 로그인한 계정으로 코스를 저장하거나 불러올 수 있습니다. Firebase 설정이 없으면 버튼을 비활성화하고 설정 안내를 표시합니다. 로그인 버튼 자체가 없다면 배포된 프론트엔드가 최신인지 프로젝트 README의 점검 절차를 확인하세요.
