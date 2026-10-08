# Trazo 프론트엔드

React와 Vite로 만든 자전거·러닝 코스 편집 화면입니다. 지도는 카카오 지도 SDK, 로그인은 Firebase Authentication을 사용합니다. 배포와 Firebase 설정의 전체 절차는 [프로젝트 README](../README.md)를 참고하세요.

## 개발 실행

프로젝트 루트에서 `./deploy.sh dev`를 실행하면 `http://localhost:3001`에서 사용할 수 있습니다. 프론트엔드와 백엔드의 코드 수정이 자동 반영되며, 루트 `.env`에서 Firebase 설정을 읽습니다. Windows의 Docker에서는 프론트엔드 수정이 자동 반영되지 않을 수 있으니, 그때는 `./deploy.sh dev`를 다시 실행하세요.

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

빌드 결과는 `dist`에 생성됩니다. Firebase 설정은 빌드 시 포함되므로 값을 바꾸면 다시 빌드해야 합니다. 운영 Docker 이미지는 프로젝트 루트의 Docker Compose로 빌드하세요.

## 코드 구성

| 위치 | 내용 |
|---|---|
| `src/App.jsx` | 화면 배치(데스크톱 사이드바 / 모바일 위쪽 바·아래 시트), 지도, 코스 편집 상태 |
| `src/components/CoursePanel.jsx` | 코스 요약과 코스 설정 (데스크톱·모바일 공용) |
| `src/components/BottomSheet.jsx` | 모바일 아래 시트 |
| `src/components/CourseLibrary.jsx` | 내 코스 목록 |
| `src/components/ui/` | 공통 버튼, 대화상자, 알림, 아이콘 |
| `src/index.css`, `src/styles/app.css` | 색·간격 등 디자인 토큰과 화면 스타일 |

화면 크기 기준(768px)은 `src/hooks/useMediaQuery.js`와 `src/styles/app.css`에 함께 정의돼 있으니, 바꿀 때는 두 곳을 같이 고칩니다.

## 로그인 화면

구글 로그인 버튼은 데스크톱에서는 사이드바 머리글, 모바일에서는 위쪽 바 오른쪽에 표시됩니다. 로그인하면 프로필 사진을 눌러 내 코스와 로그아웃 메뉴를 엽니다. 로그인한 계정으로 코스를 저장하거나 불러올 수 있습니다. Firebase 설정이 없으면 버튼을 비활성화하고 설정 안내를 표시합니다. 로그인 버튼 자체가 없다면 배포된 프론트엔드가 최신인지 프로젝트 README의 점검 절차를 확인하세요.
