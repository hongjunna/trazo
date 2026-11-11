# Trazo 경로의 가민·애플·갤럭시 워치 전송 조사

- 조사 기준일: 2026-10-09 (한국 시간)
- 대상: Trazo에서 만든 자전거·러닝 **예정 코스**를 워치에 저장하고 따라가는 기능
- 조사 방법: 현재 저장소 코드와 제조사·플랫폼·앱 개발사의 공식 공개 문서 확인
- 검증 범위: 문서 및 코드 조사. 실제 기기 전송, 개발자 프로그램 승인, 비공개 API 명세 검증은 수행하지 않았다.
- 아래에서 **확인**은 공개 문서 또는 코드 근거, **판단/제안**은 그 근거를 바탕으로 한 개발 방향을 뜻한다.

## 1. 결론

**세 플랫폼 모두 Trazo 코스를 워치에서 사용할 방법은 있다. 다만 현재 웹 서비스만으로 세 제조사의 기본 운동 앱에 동일한 방식으로 즉시 전송할 수 있는 공통 API는 확인되지 않았다.**

| 대상 | 지금 활용할 수 있는 방법 | Trazo 버튼에서 시작하는 자동 연동 | 개발 판단 |
|---|---|---|---|
| 가민 | GPX·FIT·TCX → Garmin Connect 가져오기 → 기기로 보내기·동기화 | 사업자 승인 후 Courses API → Garmin Connect → 호환 기기 동기화 | 기본 코스 기능을 활용하는 공식 연동에 가장 적합. 신규 접근 가능 여부가 선행 조건 |
| 애플워치 | GPX → WorkOutDoors 등 지원 앱 → 해당 앱의 워치 경로 기능 | Trazo iOS+watchOS 앱 간 파일 전송 또는 watchOS 앱의 서버 다운로드 | 자체 앱이면 가능. Apple 기본 운동·지도 앱으로 임의 코스를 넣는 공개 API는 확인되지 않음 |
| 갤럭시 워치 | 지원 모델에서 GPX → Samsung Health 가져오기 → 워치 경로 선택 | Trazo Android+Wear OS 앱 간 전송 또는 Wear OS 앱의 서버 다운로드 | 자체 앱이면 가능. Samsung Health 예정 코스 등록·워치 배포용 공개 API는 확인되지 않음 |

근거: [Garmin Courses API](https://developer.garmin.com/gc-developer-program/courses-api/), [Garmin 파일 가져오기](https://support.garmin.com/en-GB/?faq=wKuZXCaZRP4mWPX5aRz5h5), [Apple Watch Connectivity](https://developer.apple.com/documentation/watchconnectivity), [WorkOutDoors](https://www.workoutdoors.net/), [Samsung GPX 안내](https://www.samsung.com/us/support/answer/ANS10003407/), [Wear OS Data Layer](https://developer.android.com/training/wearables/data/overview).

추천 순서는 **파일 기반 연결 경험 개선 → 가민 승인·접근 확인 및 공식 연동 → 수요가 확인된 플랫폼의 자체 워치 앱**이다. 가민 접근이 지연되어도 파일 기반 기능은 출시할 수 있다.

### “바로 전송”의 제품 정의

1. **파일 전달:** 웹에서 파일을 내려받거나 공유한다. 사용자가 대상 앱에서 가져오고 워치로 동기화한다.
2. **계정 연동:** 최초 연결 후 Trazo에서 코스 전송을 누르면 제조사 계정에 등록된다. 워치 수신은 별도 동기화 조건에 달려 있다.
3. **자체 워치 앱 수신:** Trazo 워치 앱이 코스를 받고 로컬 저장 완료를 응답한다. 코스 선택·운동 시작은 사용자가 수행한다.

다운로드 완료, 제조사 서버 등록, 워치 저장 완료는 서로 다른 상태다. “워치 전송 완료”는 실제 수신을 확인할 수 있는 경우에만 표시해야 한다.

## 2. 현재 Trazo에서 재사용할 수 있는 것

| 확인한 코드 | 현재 기능 | 연동에 주는 의미 |
|---|---|---|
| `frontend/package.json` | React·Vite 웹 프런트엔드 | 현재 확인한 구현은 웹 중심이며 네이티브 워치 수신 앱을 추가해야 함 |
| `frontend/src/utils/course.js`의 `buildGpx` | GPX 1.1, `<trk>/<trkseg>/<trkpt>`, 위경도·고도, 별도 `<wpt>` 생성 | 파일 기반 MVP에 필요한 핵심 데이터가 이미 있음 |
| `frontend/src/utils/fit.js`의 `buildFit` | FIT 파일 종류를 코스(6)로 기록하고 course·record·course_point 메시지 생성 | 가민 코스 파일 경로 및 Connect IQ 다운로드 PoC에 활용 가능 |
| `frontend/src/App.jsx`의 `handleExport` | GPX·FIT 등 Blob 다운로드, TCX 백엔드 호출 | 기종별 내보내기와 파일 공유 UI를 연결할 지점 |
| `frontend/src/api/courseApi.js` | Firebase 토큰을 사용한 코스 API 호출 | 워치 연결을 기존 사용자 계정에 귀속시킬 기반 |
| `backend/main.py`의 `Course` | 제목, 종목, 경로, 웨이포인트, 소유자, 공개 범위 저장 | 저장된 코스를 서버에서 변환·전달할 기반 |
| `backend/main.py`의 `/export/tcx` | TCX 생성 엔드포인트 | 서버 변환 구조의 출발점 |

**확인한 보완 사항:**

- GraphHopper 요청에서 `instructions: False`이고, 프런트엔드는 주로 좌표를 소비한다. 현재 경로 선과 사용자가 추가한 웨이포인트만으로 자동 회전 안내 데이터가 완성되었다고 볼 수 없다.
- `App.jsx`는 TCX 내보내기 시 `waypoints`를 넘기지만, `courseApi.js`의 `downloadTCX`는 `{ name, speedKmh }`만 받아 요청 본문에 웨이포인트를 넣지 않는다. 현재 UI 경로에서는 TCX 웨이포인트가 누락될 수 있으므로 연동 전에 수정·검증이 필요하다.
- GPX의 `<wpt>` 보존·아이콘·이름 표시는 수신 앱과 기기마다 다를 수 있다. 코드 주석의 호환성 설명을 모든 기기의 보장으로 사용하면 안 된다.
- FIT의 시간 값은 설정 속도로 계산한 예상값이다. 실제 운동 기록과 구분해 **예정 코스**로 전달해야 한다.

## 3. 가민워치

### 3.1 공식 Courses API: 권장 방향

**확인:** Courses API는 코스와 코스 포인트를 Garmin Connect에 게시하고, 사용자가 코스 기능이 있는 워치·사이클링 컴퓨터에 동기화하도록 한다. 워치에서는 기본 Courses 메뉴를 사용한다. 기기와의 통신은 Garmin Connect가 담당한다. 이것은 Trazo 웹이 워치 Bluetooth에 직접 쓰는 방식이 아니다. [공식 기능 설명](https://developer.garmin.com/gc-developer-program/courses-api/)

개발자 프로그램은 사업자용이고 승인이 필요하며 OAuth 2.0을 사용한다. FAQ는 프로그램 접근에 기본 라이선스·유지비가 없다고 설명하지만 일부 지표에는 별도 조건이 있을 수 있다. 실제 계약·비용 조건은 승인 과정에서 확인해야 한다. [Program FAQ](https://developer.garmin.com/gc-developer-program/program-faq/)

**접근 상태에 대한 제한:** 조사 시 공개 Overview와 Courses 페이지는 프로그램 업데이트 안내를 표시한다. 이 조사만으로 신규 신청 접수·Trazo 승인 가능 여부를 확정할 수 없다. FAQ의 일반 처리 기간을 프로젝트 승인 일정으로 약속하지 말고, 공식 지원 창구에 Courses API 신규 접근 가능 여부를 확인해야 한다. [Overview](https://developer.garmin.com/gc-developer-program/overview/)

**제안 흐름:**

```text
최초: Trazo 로그인 → Garmin 계정 연결·동의 → 서버에서 사용자 연결 저장
이후: 코스 저장 → 가민에 보내기 → 서버 Courses API 호출
      → Garmin Connect 등록 → 호환 워치 동기화 → 워치에서 코스 선택
```

- 백엔드에 연결 시작·콜백·해제, 코스 전송, 전송 상태 조회 기능을 추가한다.
- Firebase UID와 Garmin 사용자 식별자를 매핑하고, 공급자 토큰은 서버에서 보호한다.
- 서버 등록 성공 후에는 “Garmin Connect에 등록됨 · 워치를 동기화하세요”를 표시한다.
- API가 실제 기기 수신 상태를 제공하는지는 승인 후 명세로 확인한다. 제공되지 않으면 기기 완료 상태를 추정하지 않는다.
- 코스 변경 시 기존 외부 코스 갱신·새 코스 생성 정책을 정한다.
- 정확한 API URL, 필수 포맷, 코스 크기·포인트 제한, 삭제·갱신, 권한 scope, 오류·쿼터는 승인 후 문서로 확정한다. GPX 파일을 아무 REST URL에 POST하면 된다고 가정하지 않는다.

**판단:** 자전거·러닝 코스 생성 서비스인 Trazo와 가장 잘 맞는 기본 앱 연동이다. 별도 Trazo 워치 앱을 유지하지 않아도 되지만, 코스 탐색을 지원하는 가민 모델만 대상으로 해야 한다.

### 3.2 현재 가능한 파일 기반 경로

사용자는 Trazo GPX·FIT·TCX 파일을 Garmin Connect 모바일에서 열거나, 웹의 **Training & Planning → Courses → Import**에서 가져올 수 있다. 저장 후 Send to Device와 동기화가 필요하다. 일반 활동 기록의 Import Data와 코스 가져오기를 구분해 안내한다. [Garmin 공식 가져오기 안내](https://support.garmin.com/en-GB/?faq=wKuZXCaZRP4mWPX5aRz5h5)

**제안:** GPX를 기본값으로 안내하고, 코스 포인트 보존이 필요한 경우 FIT·TCX를 실기기로 비교한다. “가민에 보내기”를 파일 방식에 붙일 때는 다음 단계가 있음을 명시한다.

### 3.3 대안: Connect IQ 앱이 서버 코스를 다운로드

**확인:** Connect IQ `Communications.makeWebRequest`는 FIT·GPX 응답 형식으로 받은 콘텐츠를 파싱해 기기에 저장할 수 있다. `PersistedContent`로 코스에 접근하고 Intent로 관련 기본 앱을 실행하는 구조도 제공된다. 기기마다 포맷·API 지원이 다르다. [Communications API](https://developer.garmin.com/connect-iq/api-docs/Toybox/Communications.html), [PersistedContent](https://developer.garmin.com/connect-iq/api-docs/Toybox/PersistedContent.html), [Downloading Content](https://developer.garmin.com/connect-iq/core-topics/downloading-content/)

**제안:** Courses API 접근이 어려우면 작은 Connect IQ 앱에서 계정 연결 코드를 입력하고 서버의 FIT 코스를 받는 PoC를 진행할 수 있다. 설치·스토어 배포·기기별 메모리·통신·지원 API 검증이 추가된다. Courses API와 별도 프로그램이라는 점도 확인할 필요가 있다. [프로그램 구분](https://developer.garmin.com/gc-developer-program/program-faq/)

이 대안은 **공식 계정 API 승인을 우회하는 비공식 Garmin Connect 호출**과 다르다. 사용자 Garmin 비밀번호를 수집하거나 비공개 Connect API에 의존하는 구현은 권장하지 않는다.

## 4. 애플워치

### 4.1 기존 앱으로 파일 전달: 가장 빠른 경로

**확인:** WorkOutDoors는 Apple Watch에서 GPX·TCX·FIT 경로 표시, 오프라인 지도 및 경로 이탈 알림을 지원한다고 안내한다. 따라서 Trazo 파일을 지원 앱에 가져온 뒤 그 앱의 워치 기능으로 사용하는 경로가 있다. 정확한 가져오기·워치 전송 UI, 비용 및 지원 OS는 출시 전 앱 버전에서 확인해야 한다. [개발사 안내](https://www.workoutdoors.net/), [App Store](https://apps.apple.com/us/app/workoutdoors/id1241909999)

**제안 흐름:** Trazo에서 GPX 저장/공유 → iPhone의 지원 앱으로 가져오기 → 앱에서 워치 경로 저장·선택. 제3자 앱 설치와 사용자 조작이 필요하며, Trazo가 해당 앱의 수신 성공을 자동으로 확인할 수 있다고 가정하면 안 된다.

### 4.2 자체 iOS·watchOS 앱: Trazo 수신 경험 구현

**확인:** Watch Connectivity는 같은 앱의 iOS와 페어링된 watchOS 앱 사이에서 데이터·파일을 전달한다. 백그라운드 전송은 시스템이 관리하므로 즉시 도착을 보장하지 않는다. [Watch Connectivity](https://developer.apple.com/documentation/watchconnectivity), [공식 전송 예제](https://developer.apple.com/documentation/WatchConnectivity/transferring-data-with-watch-connectivity)

**제안 흐름:**

```text
Trazo 웹에서 코스 저장·전송 요청
→ Trazo iOS 앱이 서버에서 코스 다운로드
→ WCSession.transferFile로 Trazo watchOS 앱에 전달
→ 워치 로컬 저장·수신 응답 → 코스 선택 → 안내 시작
```

대안으로 독립 watchOS 앱이 서버에서 코스를 직접 받는 구조도 검토할 수 있다. 네트워크·로그인·백그라운드 처리와 오프라인 저장을 검증해야 한다. [Apple 독립 워치 앱 발표 자료](https://devstreaming-cdn.apple.com/videos/wwdc/2019/208ryw5t6xyu0a6/208/208_creating_independent_watch_apps.pdf?dl=1)

**판단:** 경로를 보내는 일보다 워치에서 경로 선·현재 위치·진행 거리·이탈 알림을 안정적으로 표시하는 일이 더 큰 개발 범위다. 지도, 위치 업데이트, 운동 중 실행 유지, 배터리, 앱 심사가 필요하다. 지도 제공·오프라인 저장은 웹의 카카오 지도를 그대로 재사용한다고 가정하지 말고 대상 SDK와 이용 조건을 별도 검토한다.

### 4.3 HealthKit·WorkoutKit을 전송 API로 혼동하지 않기

- **HealthKit `HKWorkoutRoute`:** 운동 중 수집한 위치를 운동 기록에 연결하는 기능이다. 예정 GPX 코스를 기본 운동 앱에 넣어 내비게이션하게 하는 기능으로 설명되지 않는다. [Creating a workout route](https://developer.apple.com/documentation/healthkit/creating-a-workout-route)
- **WorkoutKit:** 인터벌, 거리·시간 목표 등의 운동 구성을 기본 운동 앱에 동기화한다. 공개 문서에서 임의 GPX 좌표 경로를 가져오는 모델은 확인되지 않았다. 목표 운동 연동은 향후 별도 기능으로 검토한다. [WorkoutKit](https://developer.apple.com/documentation/workoutkit)

기본 지도·운동 앱이 제공하는 사용자 기능이 있더라도, Trazo가 임의 코스를 등록할 공개 개발자 API가 있다는 뜻은 아니다. 이번 조사에서는 그런 전송 API를 확인하지 못했다.

## 5. 갤럭시 워치

### 5.1 Samsung Health GPX: 모델·종목 조건부 가능

**확인:** 삼성은 휴대전화 Samsung Health에서 GPX를 가져오고 연결된 워치에서 경로를 선택하는 절차를 제공한다. Bluetooth 및 Galaxy Wearable 연결이 필요하다. Watch5 Pro 절차는 자전거·하이킹 중심이고, Ultra는 러닝·걷기까지 GPX 지원이 명시되어 있다. [GPX 지원 안내](https://www.samsung.com/us/support/answer/ANS10003407/), [Ultra 운동 기능](https://www.samsung.com/us/support/answer/ANS10003243/)

| 공식 문서로 확인한 모델 | 자전거 코스 | 러닝 코스 | 제품 안내 방향 |
|---|---|---|---|
| Galaxy Watch5 Pro | GPX 경로 기능 확인 | 인용한 공식 절차에서 확인되지 않음 | 러닝까지 된다고 일괄 표기하지 않음 |
| Galaxy Watch Ultra | GPX 경로 기능 확인 | GPX 지원 명시 | Trazo 자전거·러닝 파일 흐름 모두 검증 대상 |
| Galaxy Watch Ultra2 | GPX 코스 기능 확인 | 러닝·트레일런 등 선택 안내 확인 | 최신 모델도 검증 대상에 포함 |
| 그 밖의 일반·Classic 모델, 구형 Tizen 모델 | 이 조사로 기본 앱 호환을 보장할 수 없음 | 동일 | 모델·OS·앱 버전 확인 후 지원 목록에 추가 |

Ultra2 공식 제품 페이지는 GPX 가져오기와 운동 종목 선택을 설명한다. 기존 지원 문서의 “Watch5 Pro와 Ultra만 지원” 문구와 최신 제품 문서의 범위가 달라, 한 지원 문서만으로 최신 전체 모델을 확정하면 안 된다. [Ultra2 공식 제품 안내](https://www.samsung.com/us/watches/galaxy-watch-ultra2/)

**Trazo에 특히 관련된 제한:** 삼성 안내는 시작·종료점이 너무 가까우면 감지 문제가 생길 수 있다고 설명한다. Trazo의 순환·왕복 코스를 실기기로 검증하고, 필요하면 원본을 유지한 채 사용자가 선택하는 호환용 사본을 제공한다. [삼성 GPX 주의사항](https://www.samsung.com/us/support/answer/ANS10003407/)

### 5.2 Samsung Health SDK가 예정 코스 배포를 의미하지는 않음

**확인:** Samsung Health Data SDK는 건강·운동 데이터 읽기와 일부 쓰기를 지원한다. 공식 데이터 목록과 운동 쓰기 예제에서 예정 코스를 My routes에 등록하고 워치로 배포하는 API는 확인되지 않았다. 따라서 운동 기록을 삽입해 경로 전송을 대체하지 않는다. 비공개 파트너 기능 존재 여부는 별도 문의 대상이다. [지원 데이터 타입](https://developer.samsung.com/health/data/guide/features/data-types.html), [운동 데이터 쓰기 예제](https://developer.samsung.com/codelab/health/write-exercise-data.html)

Health Connect도 운동 세션과 연결된 위치 경로를 다룬다. 이것을 Samsung Health의 예정 코스 목록으로 자동 연결하는 공개 계약은 확인되지 않았다. [Health Connect exercise routes](https://developer.android.com/health-and-fitness/health-connect/features/exercise-routes)

### 5.3 자체 Wear OS 앱: 일반 모델 확대 방향

**확인:** Data Layer는 Android 앱과 같은 패키지명·서명을 가진 Wear OS 앱 사이에서 동작한다. Trazo 웹이나 Trazo 앱이 Samsung Health 앱에 임의 데이터로 코스를 넣는 통로가 아니다. Wear OS 앱은 네트워크로 서버에 직접 접속할 수도 있다. [Data Layer](https://developer.android.com/training/wearables/data/overview), [직접 네트워크 통신](https://developer.android.com/training/wearables/data/network-communication)

**제안 흐름:** 웹에서 코스 저장 → Android 동반 앱에서 다운로드 → Data Layer의 Asset/Channel 등으로 자체 워치 앱 전달 → 로컬 저장·응답. 또는 워치 앱이 서버에서 직접 다운로드한다. DataItem 일반 payload는 100KB 제한이 있어 긴 코스를 작은 메시지로 그대로 넣지 않는다. [DataItem 제한](https://developer.android.com/training/wearables/data/data-items)

**판단:** Samsung Health 기본 경로 지원 모델보다 넓은 Wear OS 모델을 목표로 할 수 있지만, 각 모델에서 GPS·실행 유지·배터리·화면을 검증해야 한다. Tizen은 별도 플랫폼이므로 첫 MVP 범위에서 제외하는 것이 합리적이다. 받은 코스는 **Trazo 워치 앱**에서 따라가게 되며 Samsung Health 기본 내비게이션을 자동으로 활성화하는 구조는 아니다.

## 6. 공통 개발 방향

### 6.1 1단계: 기존 파일 내보내기 개선

**목표:** 네이티브 앱 없이 실제 사용 가능한 경로를 제공하고 전송 수요를 측정한다.

1. “워치에서 사용” 메뉴에 Garmin / Apple Watch / Galaxy Watch를 제공한다.
2. Garmin은 GPX·FIT 다운로드와 Connect 가져오기 안내를 제공한다.
3. Apple Watch는 GPX 공유·다운로드와 지원 앱 필요 안내를 제공한다.
4. Galaxy Watch는 모델·종목 조건을 보여주고 Samsung Health 가져오기 안내를 제공한다.
5. `navigator.canShare({ files })`를 확인해 가능한 환경에서 파일 공유를 제공하고, 미지원 환경은 다운로드로 연결한다. 공유 대상 앱을 강제로 지정하거나 미확인 딥링크로 자동 등록한다고 약속하지 않는다. [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)
6. TCX 웨이포인트 전달 누락을 고치고 GPX·FIT·TCX 결과를 대표 기기로 확인한다.

웹 파일 공유는 사용자 조작과 브라우저 지원에 달려 있다. PWA 설치만으로 Watch Connectivity나 Wear OS Data Layer를 사용할 수 있는 것은 아니다.

**완료 기준:** 대표 기기에서 Trazo 코스가 실제로 열리고 경로를 따라갈 수 있음, 파일 방식임이 화면에 명확함, 미지원 모델·브라우저에 대안이 있음.

### 6.2 2단계: 가민 공식 계정 연동

**선행 조건:** Courses API 신규 접근 가능 여부·사업자 승인·API 명세 확보.

- 사용자 동의·계정 연결·해제 및 서버 토큰 관리를 구현한다.
- 저장 코스의 소유권을 확인하고, 코스 버전별 전송 작업을 만든다.
- 비동기 작업 큐와 재시도로 요청 실패·공급자 제한을 처리한다.
- 기본 워치 코스 메뉴에서 정상 표시되는지 확인한다.
- API 접근이 확보되지 않으면 1단계를 유지하며 Connect IQ 다운로드 대안을 소규모 검증한다.

**완료 기준:** 승인 환경에서 계정 연결부터 코스 등록·실제 워치 사용까지 성공하고, 중복 클릭·재시도·연결 해제 시 동작이 확인됨.

### 6.3 3단계: 수요 기반 자체 워치 앱

Apple 또는 Wear OS 중 사용자 비중, 파일 가져오기 중단률, 개발 인력을 보고 먼저 하나를 선택한다. 지금 저장소만으로 사용자 비중을 알 수 없어 플랫폼 우선순위를 단정하지 않는다.

첫 앱은 **저장 코스 목록 → 다운로드 → 오프라인 경로 선·현재 위치 → 진행 거리·이탈 알림**까지로 제한한다. 다음 단계에서 회전 안내·지도 다운로드·운동 기록을 확장한다. 크로스플랫폼 모바일 UI를 채택하더라도 watchOS·Wear OS 통신과 운동 실행 부분은 플랫폼별 구현·검증이 필요하다.

**완료 기준:** 휴대전화 연결을 끊은 상태에서도 다운로드된 코스를 표시하고, 실제 운동 시간 동안 위치·이탈 알림이 동작하며, 재연결 시 상태가 맞게 갱신됨.

### 6.4 서버와 데이터 설계 제안

다음은 현재 구현이 아닌 신규 설계안이다.

| 요소 | 제안 |
|---|---|
| 정규 코스 모델 | `course_id`, `revision`, 제목, 종목, 위경도·고도, 누적 거리, 웨이포인트, 향후 회전 안내 |
| 서버 export | 권한 검사 후 GPX·FIT·TCX 또는 워치용 압축 데이터를 생성. 브라우저가 열려 있지 않아도 전달 가능하게 함 |
| `watch_connections` | Firebase UID, 플랫폼 사용자/기기 식별자, 연결·철회 상태, 보호된 자격 증명 참조 |
| `course_deliveries` | 사용자, 코스 버전, 대상, 외부 코스 ID, 시도 횟수, 오류, 상태, 생성·갱신 시각 |
| 중복 방지 | 사용자+대상+코스+버전 기준으로 중복 요청을 제어하고 명시적인 다시 보내기 허용 |
| 자체 앱 인증 | 웹 로그인과 연결한 단기 기기 연결 코드, 만료·시도 제한, 교환 후 기기별 철회 가능한 토큰 |
| 다운로드 권한 | 공개 공유 링크를 필수로 요구하지 않고, 사용자/연결 기기 권한과 짧은 만료의 다운로드 권한을 사용 |
| 개인정보 | 계정 연결 해제·기기 삭제 시 자격 증명 폐기. 경로 좌표·토큰을 일반 로그에 남기지 않음 |

제안 상태는 `queued → processing → provider_registered` 또는 `device_received`, 실패 시 `failed`, 연결 철회 시 `cancelled`다. Garmin에서는 확인 가능한 상태까지만, 자체 앱에서는 저장 완료 ACK까지 표시한다. 오프라인 수신 지연과 실패를 구분하고 경로 수정 뒤에는 어떤 버전을 받았는지 보여준다.

회전 안내를 추가하려면 GraphHopper instructions를 받아 코스 전체의 좌표 인덱스·누적 거리와 함께 저장하고, 편집 시 갱신해야 한다. 직선 연결 구간은 도로 기반 안내가 없을 수 있다. 지도 선을 전송하는 1차 MVP와 회전 안내의 완료 기준을 분리한다.

### 6.5 외부 서비스 경유안의 한계

Strava 등에서 워치 연동을 제공한다고 해서 Trazo 코스를 그 서비스에 자동 생성할 수 있는 것은 아니다. 조사한 Strava 공개 Routes API는 조회·내보내기 중심이며 경로 생성용 POST는 확인되지 않았다. 활동 업로드 API로 예정 코스를 운동 기록처럼 등록하는 방식은 대안으로 삼지 않는다. [Strava API Reference](https://developers.strava.com/docs/reference/)

## 7. 실기기 검증 계획 및 일정 판단

아래 항목은 조사 중 실행한 테스트가 아니라 개발 시 필요한 검증이다.

| 검증 항목 | 확인할 내용 |
|---|---|
| 종목 | 자전거·러닝이 올바른 코스 유형으로 열리는지 |
| 한국어 | 긴 이름, 한글 웨이포인트, 특수문자, 표시 잘림 |
| 경로 형태 | 단방향·왕복·순환, 겹치는 구간, 출발·도착 동일점 |
| 크기 | 장거리 코스, 많은 좌표·웨이포인트, 기기별 제한·단순화 허용 오차 |
| 포맷 | GPX·FIT·TCX의 거리·고도·웨이포인트 일치 여부 |
| 통신 | 화면 잠금, 앱 종료, Bluetooth 해제, LTE/Wi-Fi 전환, 오프라인 후 재연결 |
| 상태 | 중복 전송, 코스 편집·삭제, 계정 변경·연결 해제, 재시도 |
| 운동 중 사용 | GPS 정확도, 실제 알림, 실행 유지, 배터리, 다운로드 후 휴대전화 없이 사용 |

최소 검증 조합은 코스 기능이 있는 가민 1종, iPhone+Apple Watch+지원 앱, Android+Watch5 Pro(자전거), Android+Ultra 또는 Ultra2(러닝)다. 자체 Wear OS 앱을 개발하면 일반 모델 1종도 추가한다. OS·지역·앱 버전을 결과에 기록한다.

**일정은 다음과 같은 내부 추정이며 확정 견적이 아니다.** 파일 UX 개선은 기존 구조를 재사용해 수일~2주 수준의 작은 작업으로 시작할 수 있다. 가민은 접근 확보 후 인증·전송·실기기 검증에 수 주를 예상하되 승인 대기는 별도로 둔다. 자체 워치 앱은 지도·운동 중 실행·스토어 배포까지 포함하면 플랫폼당 수 주~수개월 범위로 보는 것이 타당하다. 인력·기기·지도 제공자·지원 기능 확정 후 재산정해야 한다.

## 8. 바로 착수할 작업

1. TCX 웨이포인트 전달 누락 수정과 GPX·FIT 대표 코스 호환성 검증.
2. 기종별 “워치에서 사용” 안내 및 모바일 파일 공유 기능 추가.
3. Garmin 공식 지원 창구에 신규 Courses API 접근·신청 경로·사업자 조건 문의. 이 조사에서는 문의를 발송하지 않았다.
4. 플랫폼별 사용 수요와 파일 가져오기 중단 구간을 측정.
5. 가민 접근 결과와 수요를 보고 Courses API, Connect IQ 대안, Apple/Wear OS 자체 앱 중 다음 투자를 결정.

**최종 판단:** 현재 Trazo는 코스 데이터와 파일 생성 기반을 이미 갖춰 파일 연동을 빠르게 제공할 수 있다. 기본 워치 코스 기능에 자연스럽게 연결하는 방향은 가민 공식 API가 우선이고, 애플·갤럭시에서 자체 브랜드의 수신·안내 경험까지 제공하려면 워치 앱 개발을 별도 제품 범위로 잡아야 한다.
