# Trazo Garmin 러닝·같이달리기 개발 계획서

> 작성 기준일: 2026-11-10 · 1차 지원 기기: Garmin Forerunner 265 · 1차 지원 종목: 러닝

## 1. 문서 목적

이 문서는 Trazo에서 만든 러닝 코스를 Garmin 워치로 전송하고, Garmin 기본 러닝 앱으로 코스를 실행하며, 러닝 크루가 운동 중 서로의 진행 상황을 확인할 수 있는 **Trazo Garmin 연동 제품**의 개발 범위와 구현 순서를 정의한다. Garmin Connect의 Activity/Courses API 사업자 연동을 검토한 기존 문서는 [`docs/garmin.md`](../garmin.md)를 참고한다. 이번 계획은 Garmin Courses API 승인 없이 먼저 출시할 수 있는 **Connect IQ 워치 앱 + Connect IQ Data Field + Trazo 서버** 구조를 우선한다.

## 2. 제품 목표

Trazo Garmin 연동의 목표는 별도의 운동 기록 앱을 만드는 것이 아니다. 사용자는 Garmin 기본 러닝의 GPS 기록, 심박, 랩, 트랙 러닝 보정, 러닝 다이내믹스와 활동 동기화를 그대로 사용하고, Trazo는 그 앞뒤에 코스 전송·모임 안내·그룹 진행 정보를 추가한다.

핵심 사용자 경험은 다음과 같다.

`Trazo에서 코스와 모임 생성 → 워치의 Trazo 앱으로 코스 받기 → 코스 컨디션 확인 → Garmin 기본 러닝으로 이동 → 사용자가 START → Trazo 그룹 페이지로 동료와 간격 확인`

제품의 한 문장 정의는 다음과 같다.

> Trazo는 러닝 크루가 좋은 코스로 모이고, Garmin으로 함께 달리며, 흩어지지 않게 돕는 서비스다.

## 3. 확정된 기술 판단

| 요구사항 | 판단 | 구현 방식 및 제약 |
| --- | --- | --- |
| Trazo 코스를 Forerunner 265에 저장 | 가능 | Connect IQ 워치 앱이 Trazo 서버에서 러닝용 FIT Course를 내려받아 `PersistedContent`로 저장한다. |
| 저장한 코스를 Garmin 기본 러닝에서 사용 | 가능 | 저장 후 Trazo 앱을 거치지 않고 `러닝 → 내비게이션 → 코스`에서 선택할 수 있다. 기기 언어·펌웨어에 따라 메뉴명은 다를 수 있다. |
| Trazo 앱에서 기본 러닝으로 이동 | 가능 | 저장된 Course의 Intent로 기본 활동 앱을 연다. 사용자에게 앱 전환 확인이 표시될 수 있다. |
| 기본 러닝 기록 자동 시작 | 불가 및 불필요 | 사용자가 Garmin 기본 러닝 화면에서 START를 눌러 기록을 시작한다. |
| 웹 버튼만으로 워치를 즉시 깨워 전송 | Connect IQ 방식만으로는 불가 | 웹은 전송 대기 작업을 만들고, 사용자가 워치의 Trazo 앱을 열어 동기화한다. 완전한 클라우드 푸시는 Garmin Courses API를 후속 검토한다. |
| 기본 러닝의 UP/DOWN 페이지에 Trazo 화면 제공 | 가능 | 별도의 Connect IQ Data Field를 Garmin 기본 러닝 데이터 화면에 추가한다. |
| 체크포인트 및 휴식 장소까지 거리 | 가능 | 코스와 웨이포인트를 사전 저장해 워치에서 계산한다. 오프라인에서도 동작하도록 한다. |
| 팀원의 앞뒤 거리와 선두·후미 표시 | 조건부 가능 | 각 참가자의 워치가 휴대폰의 Garmin Connect Mobile과 연결되어 있고 휴대폰에 인터넷이 있어야 한다. 10~30초 간격의 준실시간 갱신을 목표로 한다. |
| 도움 요청 수신 | 가능 | 서버 상태를 Data Field가 받아 화면 및 Connect IQ 알림으로 표시한다. |
| 도움 요청 전송 | 제한적 | Data Field의 물리 버튼 입력은 기본 활동이 소유한다. 터치 입력은 가능하지만 운동 중 터치 비활성화 가능성이 있어 핵심 안전 기능으로 의존하지 않는다. |

관련 Garmin 공식 문서:

- [Forerunner 265 코스 사용 방법](https://www8.garmin.com/manuals/webhelp/GUID-F41EAFB3-6CC9-42DE-9C6C-9E358DBB0671/EN-US/GUID-63B647CE-1409-4BE9-8A8B-33EFEFCBF255.html)
- [Connect IQ PersistedContent](https://developer.garmin.com/connect-iq/api-docs/Toybox/PersistedContent.html)
- [Connect IQ 콘텐츠 다운로드](https://developer.garmin.com/connect-iq/core-topics/downloading-content/)
- [Connect IQ Intents](https://developer.garmin.com/connect-iq/core-topics/intents/)
- [Connect IQ Data Fields](https://developer.garmin.com/connect-iq/articles/user-experience-guidelines/Data_Fields.html)
- [Activity.Info의 현재 위치](https://developer.garmin.com/connect-iq/api-docs/Toybox/Activity/Info.html)
- [Garmin Courses API](https://developer.garmin.com/gc-developer-program/enterprise/courses-api/)

## 4. 제품 구성

Connect IQ 애플리케이션은 앱 유형별 권한과 실행 위치가 다르므로 워치 앱과 운동 중 화면을 하나의 실행 파일로 만들 수 없다. 사용자에게는 하나의 Trazo Garmin 제품처럼 보이게 하되 기술적으로 다음 두 구성요소로 나눈다.

### 4.1 Trazo Routes 워치 앱

운동 전에 실행하는 Connect IQ Watch App이다.

- Trazo 계정·워치 연결
- 전송 대기 중인 코스 동기화
- 최근 저장한 코스, 담아둔 코스, 모임 코스 표시
- 출발점까지 거리와 워치 저장 상태 표시
- 내 모임, 출발 시각, 집결지, 페이스 그룹 표시
- 코스 컨디션 카드 표시
- FIT Course 다운로드 및 워치 코스 저장
- 저장된 코스를 Garmin 기본 러닝 앱으로 전달

### 4.2 Trazo Together 데이터 필드

운동 중 Garmin 기본 러닝의 데이터 화면 한 페이지로 실행하는 Connect IQ Data Field다.

- 다음 체크포인트와 휴식 장소까지 남은 거리
- 체크포인트 통과 상태
- 자신의 코스 진행 거리
- 리더·후미 및 가까운 팀원의 앞뒤 거리
- 일정 거리 이상 이탈한 팀원 알림
- 서버 연결 상태와 마지막 동기화 시각
- 필요한 경우 Trazo 전용 지표를 Garmin 활동 FIT에 기록

사용자는 설치 후 Garmin 기본 러닝의 데이터 화면 설정에서 Trazo Together를 한 번 추가해야 한다. Forerunner 265에서는 가급적 **한 칸 전체 화면 레이아웃**을 권장한다.

## 5. 주요 사용자 흐름

### 5.1 최초 연결

1. 사용자가 Connect IQ Store에서 Trazo Routes와 Trazo Together를 설치한다.
2. Trazo Routes가 짧은 연결 코드와 QR 또는 연결 URL을 표시한다.
3. 사용자가 휴대폰에서 Trazo에 로그인한 뒤 코드를 승인한다.
4. 서버가 Connect IQ 앱 설치 인스턴스와 Trazo 사용자 계정을 연결한다.
5. 앱은 짧은 수명의 access token과 갱신 가능한 device credential을 안전하게 저장한다.
6. 앱이 Data Field 추가 방법을 안내한다.

워치에 Google 로그인을 직접 구현하지 않는다. OAuth Device Authorization과 유사한 코드 승인 흐름을 Trazo 서버에 구현하며, 코드는 짧게 만료되고 한 번만 사용할 수 있어야 한다.

### 5.2 웹에서 코스 보내기

1. 코스 상세 화면에서 사용자가 `Garmin 워치로 보내기`를 선택한다.
2. 서버는 코스의 현재 버전을 고정하고 `GarminCourseDelivery` 작업을 만든다.
3. 화면은 `워치에서 Trazo 앱을 열어 동기화하세요`를 안내한다.
4. 사용자가 Trazo Routes의 `동기화`를 실행한다.
5. 앱이 대기 작업 목록을 조회하고 FIT Course를 다운로드한다.
6. 워치가 FIT를 검증·저장하고 저장된 Course ID를 서버에 보고한다.
7. 웹은 상태를 `전송 대기 → 워치 다운로드 중 → 워치에 저장됨`으로 표시한다.

이 방식은 서버가 워치를 직접 깨우는 푸시가 아니다. 사용자가 워치 앱을 열어야 하지만, 한 번 저장된 코스는 이후 Trazo 앱 없이 Garmin 기본 러닝에서 사용할 수 있다.

### 5.3 워치 앱에서 코스 선택

1. `내 코스`, `담은 코스`, `내 모임` 중 하나를 연다.
2. 코스를 선택하면 거리·상승·예상 시간과 동기화 상태를 보여준다.
3. `코스 컨디션`에서 주요 구간과 웨이포인트를 확인한다.
4. `러닝으로 시작`을 선택한다.
5. 코스가 저장되지 않았다면 먼저 다운로드한다.
6. Course Intent로 Garmin 기본 활동 앱 전환을 요청한다.
7. 사용자가 확인 후 기본 러닝 화면에서 START를 누른다.

Intent가 정확히 `Run`을 바로 여는지, 호환 활동 선택 화면을 먼저 표시하는지는 Forerunner 265 실기기에서 확인한다. FIT Course의 sport는 `running`으로 생성한다.

### 5.4 모임 참가 및 같이달리기

1. 웹에서 크루 모임에 참가하고 페이스 그룹을 선택한다.
2. 워치의 `내 모임`에서 집결지, 출발 시각, 리더·후미 담당과 코스를 확인한다.
3. 참가자는 모임 코스를 워치에 내려받는다.
4. 주최자가 모임을 시작하면 서버가 Live Session을 연다.
5. 참가자가 Garmin 기본 러닝을 시작하면 Trazo Together가 현재 위치와 진행 상태를 서버에 보낸다.
6. 서버가 모든 참가자의 위치를 코스 위 진행 거리로 변환하고 각 참가자에게 필요한 요약을 반환한다.
7. 운동 종료 또는 모임 종료 시 위치 공유를 자동으로 끈다.

## 6. 코스 컨디션 카드

코스 컨디션 카드는 운동 시작 전 워치 앱의 핵심 차별 기능으로 제공한다. 작은 화면에서 긴 설명을 읽게 하지 않고 여러 장의 요약 카드로 구성한다.

```text
서울숲 한강 15K

15.2 km       상승 83 m
예상 1:24     급수 2곳

0–6 km        평탄
6–9 km        완만한 오르막
12.4 km       급수
14.1 km       주의 교차로

[러닝으로 시작]
```

1차 카드에 포함할 정보는 다음과 같다.

- 거리, 누적 상승, 예상 시간
- 출발점까지 직선거리
- 가장 긴 오르막의 시작 거리·길이·상승량
- 급수·화장실·휴식·위험 웨이포인트 수
- 코스 전반/중반/후반의 간단한 특성
- 모임 코스인 경우 출발 시각, 집결지, 선택한 페이스 그룹

카드 데이터는 워치에서 복잡하게 분석하지 않고 서버가 계산한 `CourseBriefing`을 내려준다. 코스 폴리라인과 웨이포인트가 변경되면 briefing version도 함께 갱신한다.

## 7. 같이달리기 화면 설계

운동 중에는 상세 지도보다 즉시 판단할 수 있는 정보를 우선한다. 기본 화면은 전체 참가자 목록이 아니라 그룹 상태 요약이다.

```text
B그룹 · 9명

리더       +85 m
후미       -140 m
다음 휴식   1.2 km
이탈        1명
동기화      8초 전
```

상태 우선순위는 `도움 요청/심한 이탈 → 다음 체크포인트 → 그룹 간격 → 일반 상태` 순으로 한다. 화면을 보고 있지 않을 때 중요한 이벤트를 전달하려면 Data Field Alert를 사용하되 사용자가 Garmin 설정에서 Connect IQ 알림을 허용해야 한다.

### 7.1 앞뒤 거리 계산

단순한 두 GPS 좌표 사이의 직선거리는 강 건너편이나 루프 코스에서 잘못된 결과를 만든다. 서버가 각 위치를 모임 코스 폴리라인의 가장 가까운 구간에 투영해 코스 시작점부터의 진행 거리 `progress_m`를 계산한다.

`팀원과의 간격 = 팀원 progress_m - 나의 progress_m`

- 양수: 나보다 앞
- 음수: 나보다 뒤
- 코스와 일정 거리 이상 떨어짐: `off_course`
- 위치가 오래됨: `stale`

겹치는 루프나 왕복 코스에서는 가장 가까운 좌표만으로 앞뒤 구간을 혼동할 수 있다. 직전 진행 거리, 이동 방향과 최대 이동 속도를 함께 사용해 후보 구간을 선택한다.

### 7.2 체크포인트 판정

체크포인트는 코스상의 거리와 좌표를 모두 가진다. 워치가 지정 반경에 진입하면 로컬에서 통과 처리하고, 서버 연결 시 이벤트를 업로드한다. 기본 반경은 GPS 오차를 고려해 30~50m로 시작하되 도심·트랙 테스트 후 조정한다.

체크포인트 유형은 다음으로 제한해 시작한다.

- 집결지
- 급수
- 휴식
- 반환점
- 위험 구간
- 종료 지점

### 7.3 통신 주기와 장애 처리

- 기본 위치 업로드/그룹 조회 주기: 15초
- 배터리 절약 또는 대규모 모임: 30초
- 긴급 상태가 있는 동안: 가능한 범위에서 5~10초
- 45초 이상 미수신: `연결 지연`
- 90초 이상 미수신: `연결 끊김`

네트워크 요청은 비동기이며 이전 요청이 끝나지 않았으면 중복 요청하지 않는다. 응답에는 화면에 필요한 인원만 담고, 전체 참가자 좌표 배열을 매번 내려보내지 않는다. 휴대폰 연결이 끊겨도 코스 진행, 체크포인트와 다음 휴식 거리 기능은 계속 작동해야 한다.

## 8. 시스템 아키텍처

```text
Trazo Web
   │ 코스 전송 요청·크루/모임 관리
   ▼
Trazo API ─── DB / 작업 큐 / Live Session 저장소
   ▲                         ▲
   │ HTTPS                   │ 참가자 위치 집계
   │                         │
Garmin Connect Mobile        │
   ▲                         │
   │ Bluetooth 중계          │
   ▼                         │
Forerunner 265               │
 ├ Trazo Routes Watch App ───┘ 코스·모임 조회, FIT 다운로드
 ├ Trazo Together Data Field ─ 위치 업로드, 그룹 요약 조회
 └ Garmin Run ──────────────── 기본 활동 기록·내비게이션
```

Forerunner 265는 독립 LTE 장치가 아니므로 운동 중 서버 통신은 휴대폰과 Garmin Connect Mobile 연결을 전제로 한다. 별도의 Trazo 네이티브 모바일 앱은 1차 범위에 포함하지 않는다. Connect IQ 통신의 안정성이나 향후 도움 요청 UX가 부족할 때 Garmin Mobile SDK 기반 companion app을 별도 검토한다.

## 9. 서버 데이터 모델 초안

기존 `Course`와 `UserProfile`을 즉시 변경하기보다 Garmin과 크루 도메인을 별도 테이블로 추가하고 점진적으로 연결한다.

| 엔터티 | 주요 필드 |
| --- | --- |
| `GarminDeviceLink` | `id`, `user_id`, `app_instance_id`, credential hash/encrypted token, device model, CIQ version, 연결·마지막 접속·해제 시각 |
| `GarminCourseDelivery` | `id`, `user_id`, `course_id`, immutable course revision/hash, 상태, 요청·다운로드·저장 시각, watch content id, 오류 코드 |
| `CourseBriefing` | `course_id`, course revision, 거리·상승·예상 시간, 주요 오르막, 요약 구간, 생성 버전 |
| `Crew` | 이름, 소개, 지역, 가입 방식, 공개 범위, 대표 이미지 |
| `CrewMember` | crew/user, 역할, 가입 상태, 가입·탈퇴 시각 |
| `RunEvent` | crew, course revision, 집결지, 시작 시각/timezone, 정원, 상태, 위치 공유 정책 |
| `PaceGroup` | event, 이름, 목표 페이스, 리더, 후미 담당, 정원 |
| `RunParticipant` | event/user, pace group, 참가 상태, 체크인·시작·종료 상태 |
| `RunCheckpoint` | event, course distance, 좌표, 유형, 이름, 반경, 순서 |
| `LiveSession` | event, 시작·종료, 상태, 보관 정책 |
| `ParticipantLiveState` | session/user, progress, 좌표 또는 제한된 위치 데이터, off-course, accuracy, 마지막 갱신 시각 |
| `CheckpointPass` | session/checkpoint/user, local event id, 통과 시각, 동기화 시각 |
| `AssistanceSignal` | session/user, 유형, 상태, 생성·확인·해제 시각 |

`ParticipantLiveState`는 고빈도 갱신 데이터이므로 초기에는 Redis 같은 TTL 저장소를 사용하고, 영구 DB에는 참가·체크포인트·운영 이벤트만 최소 저장하는 편이 적합하다. 실시간 원본 좌표의 영구 보관은 기본값으로 하지 않는다.

## 10. API 초안

### 10.1 워치 연결 및 인증

| Method | Endpoint | 용도 |
| --- | --- | --- |
| `POST` | `/garmin/device-codes` | 워치가 연결 코드 발급 |
| `POST` | `/garmin/device-codes/{code}/approve` | 로그인한 웹 사용자가 코드 승인 |
| `POST` | `/garmin/device-tokens` | 워치가 승인 결과를 교환해 credential 수신 |
| `POST` | `/garmin/device-tokens/refresh` | 만료된 access token 갱신 |
| `DELETE` | `/garmin/devices/{id}` | 연결 해제 및 credential 폐기 |

### 10.2 코스 전송

| Method | Endpoint | 용도 |
| --- | --- | --- |
| `POST` | `/courses/{id}/garmin-deliveries` | 웹에서 워치 전송 작업 생성 |
| `GET` | `/garmin/deliveries?status=pending` | 워치가 받을 작업 조회 |
| `GET` | `/garmin/deliveries/{id}/course.fit` | 러닝용 FIT Course 다운로드 |
| `POST` | `/garmin/deliveries/{id}/complete` | 저장된 content id와 결과 보고 |
| `POST` | `/garmin/deliveries/{id}/fail` | 기기 미지원·저장 공간·파일 오류 보고 |
| `GET` | `/garmin/courses` | 최근·담은·모임 코스의 경량 목록 |
| `GET` | `/garmin/courses/{id}/briefing` | 코스 컨디션 카드 데이터 |

### 10.3 모임과 라이브 그룹

| Method | Endpoint | 용도 |
| --- | --- | --- |
| `GET` | `/garmin/events/upcoming` | 참가 예정 모임 목록 |
| `GET` | `/garmin/events/{id}` | 모임·페이스 그룹·체크포인트 상세 |
| `POST` | `/live-sessions/{id}/join` | 운동 시작 및 라이브 참가 등록 |
| `POST` | `/live-sessions/{id}/pulse` | 내 위치·진행·체크포인트 이벤트 업로드와 그룹 요약 조회를 한 요청으로 처리 |
| `POST` | `/live-sessions/{id}/leave` | 운동 종료·위치 공유 중지 |
| `POST` | `/live-sessions/{id}/assistance` | 향후 도움 요청 전송 |
| `POST` | `/live-sessions/{id}/assistance/{signal_id}/ack` | 리더가 요청 확인 |

`pulse` 요청은 작은 payload와 응답을 유지한다. 서버는 인증된 참가자가 속한 모임 데이터만 반환하고, 다른 페이스 그룹의 정확한 좌표는 운영 목적상 필요한 경우에만 노출한다.

## 11. FIT Course 생성 계획

현재 프론트엔드의 [`frontend/src/utils/fit.js`](../../frontend/src/utils/fit.js)는 `course`, `lap`, `event`, `record`, `course_point`를 포함한 러닝·자전거 FIT Course를 브라우저에서 생성한다. Garmin 워치 전송용 파일은 서버가 인증된 delivery별로 생성해야 하므로 다음 작업이 필요하다.

1. 현행 `buildFit()` 동작을 테스트 벡터로 고정한다.
2. 공식 Garmin FIT SDK validator로 현재 파일을 검증한다.
3. 서버용 FIT Course 생성 모듈을 만들거나 공식 SDK를 사용한다.
4. `sport=running`, UTF-8 이름, 고도, 거리, timestamp와 course point를 검증한다.
5. Forerunner 265에서 코스명, 선, 고도 그래프와 course point 표시를 실기기 확인한다.
6. 너무 많은 track point가 BLE 다운로드와 워치 저장 공간에 미치는 영향을 측정하고 단순화 허용 오차를 정한다.
7. 동일 course revision의 중복 전송을 감지하고 사용자가 명시적으로 재전송할 때만 새 파일을 만든다.

클라이언트 구현을 서버에서 그대로 복사해 두 벌로 유지하지 않는다. 공통 테스트 fixture와 기대 결과를 만들고, 장기적으로 FIT 생성 책임을 서버로 이동한다.

## 12. 웹 기능 계획

### 12.1 코스 상세

- `Garmin 워치로 보내기` 버튼
- 연결된 워치가 없으면 설치·연결 안내
- 전송 대상 코스 revision 고정
- 상태: `전송 대기`, `다운로드 중`, `워치에 저장됨`, `실패`, `코스가 수정됨`
- 실패 시 원인별 재시도 안내

### 12.2 크루

- 공개, 승인제, 초대 전용 크루
- 활동 지역, 소개, 대표 페이스, 정기 일정
- 소유자, 운영자, 런 리더, 후미 담당, 일반 멤버
- 가입 신청과 승인, 초대 링크
- 크루 전용 코스 모음

### 12.3 모임

- 코스 revision, 집결 장소와 출발 시각
- 참가 정원과 신청 마감
- 페이스 그룹별 목표 페이스, 리더, 후미 담당
- 체크포인트와 휴식 장소
- 참가, 취소, 대기
- 변경·취소 공지
- 모임 종료 후 참석과 체크포인트 결과

코스가 모임에 연결되는 순간 불변 스냅샷 또는 revision을 저장한다. 원본 코스가 수정되어 참가자별 워치 코스가 달라지는 문제를 방지한다.

## 13. 개인정보와 안전 원칙

같이달리기는 정밀 위치를 다루므로 기능 설계와 동시에 개인정보 보호를 구현한다.

- 위치 공유는 모임 시작 전 명시적으로 동의한 참가자만 활성화한다.
- 공유 시작·종료 시각을 화면에 명확히 표시한다.
- 운동 종료, 참가 취소 또는 세션 종료 시 위치 공유를 자동으로 끈다.
- 실시간 좌표는 기본적으로 TTL 후 삭제하고 영구 활동 기록으로 전환하지 않는다.
- 일반 참가자에게 집 주소로 추정될 수 있는 모임 전후 위치를 노출하지 않는다.
- 정확한 좌표보다 코스상의 앞뒤 거리와 상태를 기본 제공한다.
- 탈퇴·강퇴·차단된 사용자는 즉시 라이브 세션 접근을 잃는다.
- 도움 요청은 Garmin의 공식 사고 감지·긴급 연락 기능을 대체한다고 표현하지 않는다.
- 위치 공유와 코스 사용에는 네트워크 지연·GPS 오차가 있음을 명시한다.

## 14. 개발 단계

### Phase 0 — Connect IQ 기술 스파이크

목표는 Forerunner 265 실기기에서 핵심 가정을 검증하는 것이다.

- Connect IQ SDK 프로젝트와 CI 빌드 구성
- Trazo 서버에서 작은 러닝 FIT Course 다운로드
- `PersistedContent` 저장 성공
- 저장 코스가 기본 `러닝 → 내비게이션 → 코스`에 표시되는지 확인
- Course Intent로 기본 러닝 전환 확인
- 전체 화면 Data Field 추가 및 `Activity.Info.currentLocation` 확인
- 운동 중 `makeWebRequest()`의 성공률·지연·배터리 측정

**완료 기준:** 실제 Forerunner 265에서 코스를 저장하고 기본 러닝으로 실행하며, Data Field가 휴대폰을 통해 테스트 서버와 15초 간격으로 통신한다.

### Phase 1 — 개인 코스 전송 MVP

- 워치 연결 코드 인증
- 웹 전송 작업과 상태 UI
- 워치 앱의 내 코스·전송 대기 목록
- FIT Course 다운로드·저장·오류 처리
- 출발점까지 거리와 동기화 상태
- 코스 컨디션 카드
- 기본 러닝 전환

**완료 기준:** 사용자가 웹에서 코스를 전송 요청하고 워치 앱에서 동기화한 뒤, Trazo 앱을 다시 열지 않고도 기본 러닝의 코스 메뉴에서 실행할 수 있다.

### Phase 2 — 크루와 모임 MVP

- 크루 생성·가입·역할
- 코스가 연결된 모임 생성
- 페이스 그룹, 리더·후미, 정원
- 참가 신청과 내 모임 목록
- 모임 코스 일괄 전송 안내
- 워치 앱의 내 모임·출발 시각·집결 정보

**완료 기준:** 운영자가 웹에서 모임을 만들고 참가자가 워치에서 모임 정보를 확인해 동일한 course revision을 내려받는다.

### Phase 3 — 오프라인 그룹 가이드

- Data Field 전체 화면
- 코스 진행 거리
- 다음 체크포인트와 휴식 거리
- 체크포인트 로컬 통과 판정
- 네트워크 없이도 동작하는 캐시

**완료 기준:** 휴대폰 연결이 끊긴 상태에서도 다음 체크포인트와 휴식 장소까지의 거리가 계속 갱신된다.

### Phase 4 — 준실시간 같이달리기

- Live Session과 참가자 pulse
- 코스 투영 및 진행 거리 계산
- 리더·후미·근접 팀원 간격
- 이탈·stale 상태
- 15~30초 동기화와 재연결
- Data Field Alert

**완료 기준:** 최소 5명의 실외 테스트에서 참가자의 앞뒤 순서와 간격이 운영상 유용한 수준으로 표시되고, 연결이 끊겨도 기본 러닝 기록과 오프라인 가이드에 영향을 주지 않는다.

### Phase 5 — 운영 고도화

- 이탈 임계값을 모임·페이스 그룹별 설정
- 체크포인트별 인원 집계
- 리더용 운영 요약
- 도움 요청 수신 및 확인 흐름
- Garmin Courses API 승인 시 웹 원클릭 클라우드 전송 추가
- Activity API 승인 시 모임 완료·참석 보조 연결

## 15. 테스트 계획

### 15.1 FIT 및 코스

- 짧은 코스, 30km 이상 장거리, 왕복, 루프, 자체 교차 코스
- 한글·영문·숫자 코스명과 긴 이름
- 고도 없음·고도 있음·급경사
- 웨이포인트 없음·다수·동일 지점 중복
- 265 저장 공간 부족과 중복 이름
- 잘못된 MIME type, 손상된 FIT, 서버 다운로드 중단

### 15.2 기본 러닝 연동

- Trazo 앱에서 Course Intent 실행
- 기본 러닝을 직접 열어 저장 코스 선택
- 기록 시작·일시정지·종료
- 내비게이션 중 Trazo Data Field 이동
- 일반 러닝과 트랙 러닝의 Data Field 지원 여부
- 코스 삭제 후 앱·기본 러닝 목록 상태

### 15.3 그룹 러닝

- 2명, 5명, 20명 규모
- 참가자 추월, 역주행, 중도 합류·이탈
- 루프 코스에서 가까운 다른 구간 오판 여부
- 강 건너 평행 코스와 고가도로
- 휴대폰 Bluetooth·인터넷 단절과 복구
- 앱 백그라운드 제한, 저전력 모드
- GPS 오차가 큰 도심과 교량·터널
- 모임 종료 후 위치 접근 차단과 TTL 삭제

## 16. 관측 지표

기술 지표:

- FIT 다운로드 성공률과 평균 소요 시간
- 워치 저장 성공률 및 실패 코드 분포
- 코스 Intent 전환 성공률
- 라이브 pulse 성공률·p50/p95 왕복 지연
- 참가자 위치 freshness
- 배터리 시간당 추가 소모량
- 코스 투영 오류 및 순서 뒤바뀜 비율

제품 지표:

- 웹 전송 요청 대비 워치 저장 완료율
- 저장 코스 대비 기본 러닝 시작률
- 모임 참가자 중 워치 연동 비율
- 같이달리기 Data Field 활성 사용자 비율
- 주간 성공 모임 수: 코스가 연결되고 실제 참가자 3명 이상인 모임
- 모임 참가 신청 대비 참석률과 4주 재참가율

## 17. 주요 위험과 대응

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| Connect IQ 기기별 동작 차이 | 저장·Intent·Data Field 기능 편차 | 265만 1차 지원하고 실기기 회귀 테스트 후 지원 기기를 확대한다. |
| Garmin Connect Mobile 연결 불안정 | 그룹 정보가 늦거나 끊김 | 기능을 준실시간으로 정의하고 freshness 표시, 오프라인 체크포인트를 보장한다. |
| FIT 파일 크기와 BLE 속도 | 코스 다운로드 지연 | track point 단순화와 크기 상한을 두고 진행률·취소·재시도를 제공한다. |
| Data Field 입력 제한 | 도움 요청 UX 취약 | 수신·이탈 알림을 우선하고 전송은 향후 모바일 companion 또는 검증된 터치 흐름으로 제한한다. |
| 코스 교차·왕복 구간 투영 오류 | 팀원 앞뒤 순서 오류 | 이전 progress, 방향, 속도와 체크포인트를 포함한 map matching을 사용한다. |
| 위치 정보 오남용 | 신뢰 및 법적 위험 | 참가자 한정, 시간 제한, 최소 공개, TTL 삭제, 감사 로그를 기본값으로 만든다. |
| 기존 단일 `backend/main.py`의 복잡도 | 기능 확장과 테스트 어려움 | Garmin, crew, event, live-session router/service/model을 별도 모듈로 분리한다. |

## 18. 이번 범위에서 제외할 기능

- Trazo Connect IQ 앱이 직접 Garmin 기본 기록 기능을 복제하는 것
- 사용자의 확인 없이 기본 러닝을 열거나 활동 기록을 자동 시작하는 것
- 1초 단위 실시간 팀원 지도
- 휴대폰 없이 Forerunner 265 단독으로 서버와 통신하는 것
- Trazo 도움 요청을 공식 긴급 구조·사고 감지 기능으로 제공하는 것
- 모든 Garmin 모델을 첫 출시부터 지원하는 것
- Garmin Courses API 또는 Activity API 승인을 1차 출시의 선행 조건으로 두는 것

## 19. 바로 착수할 작업

1. Garmin Connect IQ 개발자 계정, SDK와 Forerunner 265 테스트 기기를 준비한다.
2. 최소 Watch App에서 Trazo 서버의 정적 FIT Course를 다운로드하고 저장하는 스파이크를 만든다.
3. 저장된 코스가 기본 러닝의 코스 목록과 Intent에서 동작하는 모습을 영상으로 기록한다.
4. 최소 Data Field에서 현재 위치와 서버 왕복 지연을 측정한다.
5. 현행 `buildFit()` 결과를 Garmin FIT SDK validator와 실기기에서 검증한다.
6. 위 스파이크 결과로 Course 파일 크기, 통신 주기, 실제 메뉴 흐름을 확정한다.
7. 검증이 끝나면 Phase 1의 서버 모델·API와 웹 전송 UI를 구현한다.

Phase 0에서 `PersistedContent 저장 → 기본 러닝 코스 목록 노출 → Course Intent → Data Field 네트워크 통신` 네 가지를 모두 확인하기 전에는 크루 실시간 기능을 본 개발로 확대하지 않는다. 이 네 항목이 전체 제품의 기술적 기반이다.
