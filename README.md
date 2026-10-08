# TopoRider

카카오 지도에서 자전거 코스를 만들고, 고도와 경사도를 확인하며, 내 코스를 저장하거나 TCX 파일로 내려받는 서비스입니다. 경로 계산은 GraphHopper, 구글 로그인은 Firebase Authentication, 코스 저장은 PostgreSQL을 사용합니다.

## 실행 준비

Docker와 Docker Compose를 설치한 뒤 저장소 루트에서 다음 명령을 실행합니다.

```bash
cp .env.example .env
```

`.env`에 DB 비밀번호와 Firebase 웹 앱 설정을 입력하세요. `.env.example`은 작성 예시이며, 그 파일만 수정해도 실제 실행 설정에 반영되지는 않습니다. `DATABASE_URL`의 비밀번호는 `POSTGRES_PASSWORD`와 일치해야 하고, 특수 문자가 있으면 URL 인코딩이 필요합니다. 실제 설정 파일인 `.env`는 Git에 올리지 않습니다.

경로 서버에 필요한 대한민국 OSM 파일을 `data/south-korea-260101.osm.pbf`에 넣어주세요. 이 이름은 설정된 로컬 파일명이며 자동 다운로드 주소가 아닙니다. 파일이 없으면 배포 스크립트가 중단됩니다.

## 구글 로그인 설정

1. Firebase 콘솔에서 프로젝트를 선택하고, 프로젝트 설정의 내 앱에서 웹 앱을 등록합니다.
2. 웹 앱 구성의 `apiKey`, `authDomain`, `projectId`, `appId`를 루트 `.env`의 다음 항목에 각각 입력합니다.

```dotenv
VITE_FIREBASE_API_KEY=웹_앱의_apiKey
VITE_FIREBASE_AUTH_DOMAIN=웹_앱의_authDomain
VITE_FIREBASE_PROJECT_ID=웹_앱의_projectId
VITE_FIREBASE_APP_ID=웹_앱의_appId
```

3. Firebase 콘솔의 인증(Authentication) → 로그인 방법(Sign-in method)에서 Google 제공업체를 활성화하고 지원 이메일을 설정합니다.
4. 인증 → 설정 → 승인된 도메인(Authorized domains)에 `toporider.kro.kr`과 개발용 `localhost`를 추가합니다. 도메인은 프로토콜이나 경로 없이 입력합니다.
5. 설정한 후 프론트엔드를 다시 빌드합니다. 운영 접속에는 HTTPS를 사용하세요.

```bash
./deploy.sh live
```

로그인 버튼은 지도 오른쪽 패널 상단에 표시되며, 패널을 접어도 볼 수 있습니다. 로그인이 완료되면 사용자 이름과 로그아웃 버튼이 표시됩니다. 로그인 상태는 새로고침 후에도 유지됩니다. Firebase 설정이 누락되거나 잘못되면 로그인 버튼은 비활성화되고 설정 안내가 표시됩니다.

Firebase 웹 앱 구성값은 브라우저에 포함되는 공개 설정입니다. 서버용 서비스 계정 비밀키는 필요하지 않습니다. 서버는 Firebase 토큰의 서명, 만료, 프로젝트, 발급자와 구글 로그인 제공업체를 확인합니다. 코스 목록·저장·수정·삭제는 인증된 계정에 한해 제공하고, 경로 생성과 TCX 다운로드는 로그인 없이 사용할 수 있습니다.

## 개발 및 운영 실행

```bash
./deploy.sh dev          # 개발 서비스 실행
./deploy.sh live         # 운영 서비스 배포
./deploy.sh dev logs     # 개발 서비스 로그 확인
./deploy.sh dev status   # 개발 서비스 상태 확인
./deploy.sh dev down     # 개발 서비스 종료
```

로그·상태·종료 명령은 `live`에서도 동일하게 사용할 수 있습니다. 인자 없이 `./deploy.sh`를 실행하면 운영 배포를 수행합니다. 두 모드 모두 루트 `.env`를 사용합니다.

| 항목 | 개발 모드 | 운영 모드 |
|---|---|---|
| 실행 명령 | `./deploy.sh dev` | `./deploy.sh live` |
| 접속 주소 | `http://localhost:3001` | 서버의 3000번 포트 |
| 프론트엔드 | Vite 개발 서버, 코드 자동 반영 | 빌드 결과를 Nginx로 제공 |
| 백엔드 | 코드 수정 시 자동 재시작 | 빌드된 코드로 실행 |
| Git 업데이트 | 실행하지 않음 | `main`을 `--ff-only`로 업데이트 |
| Compose 프로젝트 | `toporider-dev` | `toporider` |
| DB 호스트 포트 | 5402 | 5401 |
| 백엔드 호스트 포트 | 8002 | 8001 |
| GraphHopper 호스트 포트 | 8991 | 8989 |
| 지도·고도 캐시 | `data/dev` 내부 | `data` 내부 |

개발 DB는 별도 볼륨에 저장하므로 운영 DB와 분리됩니다. 운영의 기존 `toporider` 프로젝트 이름은 유지해야 기존 DB 볼륨을 계속 사용할 수 있습니다. 개발 화면은 로컬 주소에만 연결되며, DB·백엔드·GraphHopper도 로컬 주소에만 포트를 공개합니다. 운영 프론트엔드는 기본적으로 외부 접속을 허용합니다. 배포 스크립트는 빌드 전에 서비스를 종료하거나 다른 Docker 이미지를 정리하지 않습니다.

개발·운영은 같은 Firebase 프로젝트 설정을 사용합니다. 카카오 지도 JavaScript 키에도 운영 도메인과 개발 주소 `http://localhost:3001`을 등록하세요.

## 로그인 버튼이 보이지 않을 때

최신 코드에서는 로그인 영역이 항상 표시됩니다. Firebase 설정이 없어도 비활성화된 로그인 버튼과 안내가 표시되므로, 버튼 자체가 없으면 이전 프론트엔드가 제공되는지 먼저 확인하세요.

1. 서버 저장소에서 최신 코드와 커밋을 확인합니다.

```bash
git pull --ff-only origin main
git log -1 --oneline
```

2. `.env`의 네 가지 Firebase 값이 모두 채워져 있는지 확인하고 프론트엔드를 다시 빌드합니다. 컨테이너 재시작만으로는 빌드된 Firebase 설정이 변경되지 않습니다.

```bash
docker compose -p toporider -f docker-compose.yml build frontend
docker compose -p toporider -f docker-compose.yml up -d frontend
```

3. 실제 실행 중인 Compose 프로젝트와 프론트엔드 상태를 확인합니다. 도메인의 리버스 프록시가 운영 프론트엔드의 3000번 포트를 가리키는지도 확인하세요. 예전에 만든 다른 컨테이너를 가리키면 재빌드해도 화면이 바뀌지 않을 수 있습니다.

```bash
docker compose ls
docker compose -p toporider -f docker-compose.yml ps
docker compose -p toporider -f docker-compose.yml logs --tail=100 frontend
```

4. 브라우저를 강력 새로고침합니다. CDN이나 리버스 프록시에서 이전 HTML을 캐시하는 경우 해당 캐시도 갱신하세요.

버튼은 있는데 로그인이 실패하면 Firebase의 Google 제공업체 활성화, 승인된 도메인, 브라우저 팝업 허용을 확인하세요. 별도 `docker build`를 사용하면 Compose가 전달하는 Firebase 빌드 인자가 누락될 수 있으므로 위의 Compose 명령으로 빌드합니다. Firebase 설정 누락 시 운영 이미지 빌드는 실패하도록 구성돼 있습니다.

## 지도 데이터와 최초 실행

화면에 보이는 지도는 카카오맵이고, 경로 계산은 전국 OSM 데이터를 가공한 GraphHopper 그래프를 사용합니다. 개발 모드는 운영과 같은 OSM 원본 파일을 읽기 전용으로 사용하지만, 경로·고도 캐시는 별도로 생성합니다. 따라서 처음 개발 모드를 실행할 때도 지도 가공 시간과 저장 공간이 필요합니다.

캐시가 없는 최초 빌드에는 Docker 기본 이미지, GraphHopper 9.1 실행 파일, 프론트엔드 npm 패키지와 백엔드 Python 패키지를 다운로드합니다. 최초 지도 가공 중에는 CGIAR 고도 제공업체에서 고도 타일을 내려받을 수 있습니다. 운영 고도 캐시는 `data/srtm`, 개발 고도 캐시는 `data/dev/srtm`에 저장됩니다. 이후 실행은 기존 캐시를 재사용합니다.

지도 파일을 교체해도 이미 만들어진 그래프는 자동 갱신되지 않습니다. 지도 갱신이나 호환되지 않는 경로 설정 변경 시에는 관련 그래프 캐시를 별도로 재생성해야 합니다. 전국 OSM 원본을 자동 다운로드하는 기능은 없습니다.

## 기존 코스 소유권

서버는 시작할 때 기존 코스 테이블에 `firebase_uid` 열이 없으면 추가합니다. 기존 코스를 처음 로그인한 구글 계정에 자동 배정하지 않습니다. 이전 코스의 소유자를 확인한 뒤 관리자가 해당 계정의 Firebase UID를 코스의 `firebase_uid`에 지정해야 합니다.

Docker 실행은 Firebase 인증만 사용합니다. Firebase 프로젝트 ID를 지정하지 않은 별도 기존 배포에서는 `COURSE_API_TOKENS`를 통한 이전 토큰 인증을 사용할 수 있습니다.

## 기존 DB 비밀번호 변경

이전에 저장소에 포함된 DB 비밀번호는 노출된 값으로 취급합니다. `.env`의 `POSTGRES_PASSWORD`만 바꿔도 기존 PostgreSQL 볼륨의 비밀번호는 변경되지 않습니다. DB를 백업한 뒤 다음 명령으로 접속합니다.

```bash
docker compose -p toporider exec db psql -U admin -d toporider_db
```

접속 후 `\password admin`을 실행해 새 비밀번호를 입력합니다. 같은 값을 `.env`의 `POSTGRES_PASSWORD`와 URL 인코딩된 `DATABASE_URL`에 반영하고 DB·백엔드 컨테이너를 재생성합니다. 기존 볼륨은 유지하고 새 비밀번호로 접속되는지 확인하세요. 비밀번호 변경을 위해 `docker compose down -v`를 실행하면 안 됩니다. 코드 변경만으로 실행 중인 DB 비밀번호나 이전 Git 기록이 변경되지는 않습니다.

## 검증 명령

```bash
npm ci --prefix frontend
npm run build --prefix frontend
python -m unittest discover -s backend/tests
```

백엔드 테스트 전에는 `backend/requirements.txt`의 의존성을 설치해야 합니다. 테스트는 인증 실패, 계정별 코스 접근, 삭제된 코스 접근 제한과 기존 테이블 변경을 확인합니다.

전체 프론트엔드 코드 검사에는 `npm run lint --prefix frontend`를 사용합니다. 현재 기존 고도 차트와 히스토리 훅 등에 검사 오류가 남아 있어 전체 검사는 실패할 수 있습니다.
