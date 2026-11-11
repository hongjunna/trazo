# Trazo–Garmin 연동 가능성 검토

> 작성 기준일: 2026-11-09 · 구현이 아닌 사전 가능성 검토 · Garmin의 공개 공식 문서와 현재 Trazo 코드를 기준으로 작성했다. 실제 API 필드, 호출 한도, 비용 및 출시 권한은 Garmin Developer Portal 접근 후 계약 문서로 다시 확인해야 한다.

## 1. 결론

**두 기능 모두 기술적으로 가능하다.** 완료된 러닝·사이클링 활동 기록은 Garmin Connect Developer Program의 **Activity API**로 Trazo에 가져올 수 있고, Trazo에서 만든 경로는 **Courses API**로 사용자의 Garmin Connect 계정에 게시하여 호환되는 시계나 Edge 장치로 동기화할 수 있다. Garmin은 이 두 흐름을 공식 사용 사례로 제공한다. [Garmin Connect Developer Program 개요](https://developer.garmin.com/gc-developer-program/)

다만 “Trazo 서버가 사용자의 Garmin 장치에 직접 파일을 밀어 넣는 것”은 아니다. 일반적인 공식 흐름은 다음과 같다.

`Garmin 장치 → Garmin Connect 동기화 → Activity API → Trazo`

`Trazo → Courses API → Garmin Connect → 다음 동기화 때 호환 장치`

따라서 장치가 Garmin Connect와 동기화되어야 하며 실시간 전송은 아니다. 사용자가 Garmin 계정을 Trazo에 OAuth 2.0으로 연결하고 데이터 접근에 동의해야 한다. 상용 다중 사용자 서비스인 Trazo는 개인용 API 키가 아니라 **Business용 Garmin Connect Developer Program**에 신청해야 한다. 개인 API는 본인 데이터 실험용이며 여러 최종 사용자에게 제공하는 상용 앱 용도가 아니다. [Personal API FAQ](https://developer.garmin.com/gc-developer-program/personal/personal-faq), [Business Program FAQ](https://developer.garmin.com/gc-developer-program/enterprise/program-faq/)

가능성을 나누어 평가하면 다음과 같다.

| 기능                                           | 기술 가능성    | 외부 의존성                                                                | 현재 Trazo 준비도                                      | 판단                                       |
| ---------------------------------------------- | -------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| 새 Garmin 활동 기록 자동 수신                  | 높음           | Garmin 사업자 승인, OAuth, Activity API 권한                               | FIT를 읽을 수 있으나 현재 파서는 코스 편집용 최소 구현 | 가능. 서버용 정식 FIT 수집 파이프라인 필요 |
| 과거 활동 일괄 가져오기                        | 중간           | Starter는 공개 안내상 historical data 미제공, Enterprise는 1개월 이상 옵션 | 별도 저장 모델 없음                                    | 초기에는 제외하거나 파일 업로드로 보완     |
| Trazo 경로를 Garmin Connect로 전송             | 높음           | Courses API 권한                                                           | FIT/GPX/TCX 코스와 코스 포인트를 이미 생성             | 가장 자연스러운 1차 연동 기능              |
| Garmin 장치까지 자동 동기화                    | 높음           | 장치가 course 기능을 지원하고 Garmin Connect와 동기화되어야 함             | Trazo가 장치별 통신을 구현할 필요 없음                 | Garmin Connect가 담당                      |
| Trazo에서 구조화 워크아웃을 만들어 장치로 전송 | 높음           | Training API 권한                                                          | 현재 워크아웃 도메인은 없음                            | 경로 전송과 별도 후속 기능                 |
| 운동 중 실시간 데이터 수신                     | 낮음/별도 과제 | Garmin Health SDK나 Connect IQ 등 별도 제품·모바일 앱 검토                 | 현재 웹 서비스 구조와 맞지 않음                        | 이번 연동 범위에서 제외                    |

## 2. 용어를 먼저 구분해야 한다

Garmin에서 서로 다른 세 가지 객체를 혼동하면 범위가 크게 달라진다.

- **Activity(활동 기록):** 사용자가 이미 완료한 러닝·라이딩 결과다. GPS 트랙, 시간, 거리, 랩, 심박수, 파워, 케이던스 등이 포함될 수 있다. Trazo가 “워크아웃 기록을 불러온다”는 요구는 대부분 이것에 해당한다.
- **Course(코스/경로):** 앞으로 따라갈 지도 위 경로와 course point다. Trazo에서 만든 경로를 장치에 보내는 요구는 이것에 해당한다.
- **Workout(구조화 운동):** 예를 들어 `10분 워밍업 → 1km×5 인터벌 → 10분 쿨다운`처럼 단계와 목표 심박·파워·페이스가 있는 훈련 처방이다. 이는 Courses API가 아니라 **Training API** 영역이다. Garmin은 Training API로 workout과 training plan을 Garmin Connect 캘린더에 게시하고 호환 장치로 동기화할 수 있다고 설명한다. [Training API](https://developer.garmin.com/gc-developer-program/enterprise/training-api/)

이번 요구에는 Activity API와 Courses API만 있으면 된다. 사용자가 Trazo에서 인터벌 훈련까지 설계하게 할 계획이 생길 때 Training API를 별도 제품으로 검토하는 것이 좋다.

## 3. Garmin 활동 기록을 Trazo로 가져오기

### 3.1 공식적으로 가능한 데이터 흐름

Garmin Activity API는 장치나 사이클링 컴퓨터가 기록한 활동의 JSON 요약 또는 FIT 파일을 제공한다. 사용자가 최초 동의한 뒤 장치를 Garmin Connect와 동기화하면 데이터가 API를 통해 파트너 플랫폼에 전달된다. 러닝·사이클링뿐 아니라 수영, 요가, 근력운동 등 30종 이상의 활동이 대상이지만 Trazo는 우선 run/bike만 받아도 된다. [Activity API](https://developer.garmin.com/gc-developer-program/enterprise/activity-api/)

Business Starter 공개 안내는 delivery가 **push only**, historical data는 **미제공**, 사용자 수는 **제한적**이라고 명시한다. 따라서 초기 연동은 “연결 이후 새로 동기화된 활동”을 받는 방식으로 설계하고, 과거 기록 전체 가져오기를 제품 약속으로 걸면 안 된다. Enterprise는 push 또는 ping/pull, 1개월 이상의 historical data, 무제한 사용자 옵션을 안내하지만 가격과 정확한 조건은 개별 협의 대상이다. [프로그램 등급 비교](https://developer.garmin.com/gc-developer-program)

### 3.2 Trazo에서 활용할 수 있는 데이터

원본 FIT Activity 파일에는 활동 시작·종료 시각, 종목, GPS record, 랩, 거리, 고도, 심박, 속도, 파워, 케이던스, 장치 정보 등이 포함될 수 있다. 모든 장치가 모든 필드를 기록하는 것은 아니므로 각 metric은 nullable로 다뤄야 한다. Garmin의 FIT 명세는 Activity 파일의 필수·선택 메시지를 구분하고 있으며 공식 FIT SDK는 JavaScript, Python, Java 등 여러 언어를 지원한다. [FIT Activity 파일 구조](https://developer.garmin.com/fit/articles/file-types/activity.html), [FIT SDK](https://developer.garmin.com/fit/)

Trazo에서는 다음 용도로 바로 연결할 수 있다.

- Garmin에서 기록된 러닝·라이딩의 거리, 시간, 페이스/속도, 상승 고도, GPS 경로 표시
- 활동 트랙을 새 Trazo 코스로 가져와 수정·저장
- 예정된 Trazo 코스와 실제 활동 트랙을 공간적으로 매칭해 완주 표시
- 클럽 이벤트 출석 보조 증거와 실제 주행 경로 비교
- 코스 이탈 구간, 예상 시간 대비 실제 시간, 위험·우회 구간의 후보 생성

다만 활동을 공개 코스나 클럽 출석으로 자동 전환하면 안 된다. Garmin 연결 동의, 활동 저장 동의, 공개/비공개 선택은 서로 분리하고 기본값은 비공개로 두는 편이 안전하다.

### 3.3 현재 코드에서 추가로 필요한 것

현재 `frontend/src/utils/fit.js`의 `parseFit()`은 FIT 코스와 활동에서 좌표·고도·종목·코스 포인트를 읽어 “편집 가능한 코스”로 바꾸는 작은 브라우저 구현이다. 심박수, 파워, 케이던스, 랩, 정지 시간, 장치 정보, multisport session과 알 수 없는 developer field를 보존하지 않는다. 자동 Garmin 연동의 운영용 ingestion parser로 그대로 사용하기에는 부족하다.

서버에는 별도 `Activity` 도메인이 필요하다.

| 엔터티/구성           | 필요한 내용                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GarminConnection`    | Trazo 사용자 ID, Garmin 외부 사용자 ID, scope, 연결/해제 시각, 암호화한 token 또는 Garmin이 요구하는 자격 증명 참조 |
| `Activity`            | 공급자, 외부 activity ID, 종목, 시작 시각·timezone, elapsed/moving time, 거리·상승, 공개 범위, 원본 파일 상태       |
| `ActivityStream`      | GPS line, 고도·심박·파워·케이던스 등 시계열 또는 원본 FIT object storage 위치                                       |
| `ActivityCourseMatch` | Trazo course/version 또는 club event와의 매칭 점수, 사용자 확인 상태                                                |
| 수신 endpoint         | Garmin push 검증, 빠른 응답, raw event 보관, queue 전달, 재시도와 dead-letter 처리                                  |
| idempotency           | Garmin 외부 activity ID와 event ID에 unique constraint를 두어 재전송 중복 방지                                      |
| 삭제/해제 처리        | 사용자가 Garmin 연결을 끊거나 삭제를 요구할 때 토큰 폐기와 파생 데이터 처리                                         |

FIT 처리는 Garmin 공식 SDK와 공식 검증 도구를 서버 측에 사용하는 편이 안전하다. 원본 FIT는 object storage에 암호화 보관하고, 화면 조회에 필요한 정규화 통계와 PostGIS geometry만 DB에 저장하는 구조가 적합하다. 원본을 영구 보관할지 여부는 Garmin 계약과 사용자의 명시적 동의에 따라 결정해야 한다.

## 4. Trazo 경로를 Garmin 장치로 전송하기

### 4.1 공식 Courses API 방식

Garmin Courses API는 파트너 서비스가 course와 course point를 Garmin Connect에 게시할 수 있게 한다. 사용자가 동의한 뒤 Trazo가 경로를 게시하면 Garmin Connect가 호환 장치와의 상호작용을 담당하고, 사용자는 장치의 기본 Courses 메뉴에서 경로를 실행할 수 있다. 새 course/workout 호환 장치도 사용자의 계정에 추가되면 자동 지원된다고 Garmin은 설명한다. [Courses API](https://developer.garmin.com/gc-developer-program/enterprise/courses-api/)

예상 UX는 다음과 같다.

1. 사용자가 계정 설정에서 `Garmin Connect 연결`을 선택하고 OAuth 2.0 동의를 완료한다.
2. Trazo 코스 화면에서 `Garmin으로 보내기`를 누른다.
3. Trazo 서버가 현재 `CourseVersion`을 Garmin Courses API 형식으로 변환하여 게시한다.
4. 성공하면 `Garmin Connect에 전송됨 · 장치를 동기화하세요` 상태를 보여준다.
5. 호환 장치는 Garmin Connect 앱·Wi-Fi·Garmin Express 등의 다음 동기화 때 코스를 받는다.

장치가 오프라인이거나 동기화되지 않았다고 해서 Trazo API 호출 자체가 실패한 것은 아니다. UI에는 `Garmin Connect 게시 상태`와 `실제 장치 동기화 여부는 Garmin Connect에서 확인`을 구분해 안내해야 한다. 공개 문서만으로 Trazo가 개별 장치의 다운로드 완료 상태까지 받을 수 있다고 가정해서는 안 된다.

### 4.2 현재 Trazo의 준비도

Trazo는 이미 `buildFit()`에서 FIT course, lap, event, record, course point를 만들고 GPX·TCX도 내보낸다. 웨이포인트 16종을 Garmin course point에 대응시키고 거리·예상 시각까지 계산하므로 데이터 원천은 충분하다. Courses API가 요구하는 JSON schema에 맞춘 서버 변환기를 추가하면 된다.

다만 현재 FIT writer는 “필요한 메시지만 직접 작성하는 프로토콜 1.0 최소 구현”이며 프로필 버전도 코드에 고정되어 있다. 기존 다운로드 기능에는 유용하지만 공식 연동 품질을 보장하려면 다음을 확인해야 한다.

- 공식 FIT SDK validator로 자전거·러닝, 한글/영문 이름, 장거리, 다수 course point 회귀 테스트
- Garmin 장치별 course name 제한과 Unicode 표시 확인. Garmin 지원 문서는 다수 장치가 코스 이름의 첫 15자만 구분할 수 있다고 안내한다.
- course point 종류·이름·위치가 Courses API와 실제 장치에서 보존되는지 실기기 검증
- 고도값, 거리 단위, timestamp, 시작/종료 event가 장치별로 일관되게 표시되는지 검증
- 동일 Trazo 코스를 다시 전송할 때 새 코스를 만들지, 기존 Garmin course를 갱신할지에 대한 버전 정책

### 4.3 API 승인 전에도 가능한 수동 방식

직접 연동 전에도 현재 기능으로 실용적인 MVP를 제공할 수 있다. Garmin Connect는 타사 FIT·GPX·TCX 코스 파일을 가져올 수 있고, 모바일에서는 파일을 열어 Garmin Connect로 공유할 수 있다. 저장한 코스는 Garmin Connect의 `Send to Device`를 통해 다음 동기화 때 호환 장치로 전달된다. [타사 코스 가져오기](https://support.garmin.com/en-US/?faq=wKuZXCaZRP4mWPX5aRz5h5), [장치로 보내기](https://support.garmin.com/en-US/?faq=C4mcn2I4cGAL7vkq3qTCMA)

따라서 승인 전 UX는 다음처럼 개선할 수 있다.

- 모바일: `FIT 내보내기` 후 OS 공유 시트에서 Garmin Connect를 선택하도록 안내
- 데스크톱: FIT/GPX/TCX를 내려받고 Garmin Connect Web의 Courses → Import로 가져오는 안내
- 지원 문서에 “가져온 타사 코스의 waypoint/course point가 일부 장치에서 보존되지 않을 수 있음”을 명시. Garmin도 수동 import 시 course point가 유지되지 않을 수 있다고 경고한다.

이 방식은 별도 API 승인 없이 바로 가능하지만 사용자 조작이 여러 단계다. 반면 Courses API 방식은 한 번 연결한 뒤 `Garmin으로 보내기` 한 번으로 줄어드는 것이 핵심 가치다.

## 5. 인증·승인과 공개 문서의 불확실성

Garmin Connect Developer Program API는 OAuth 2.0을 사용하며, 신청이 승인되어야 상세 API 문서와 Developer Portal을 사용할 수 있다. Garmin FAQ는 일반적인 integration 기간을 1~4주로 안내하지만 이는 개발 기간에 대한 일반 설명이지 Trazo의 승인이나 출시 시점을 보장하는 SLA가 아니다. [Program FAQ](https://developer.garmin.com/gc-developer-program/enterprise/program-faq/)

2026-11-09 현재 공개 페이지에는 **확인해야 할 모순**이 있다.

- 최신 프로그램 등급 개요는 Starter Business에 Activity, Courses, Training API가 포함되고 push-only·historical data 없음·제한 사용자라고 표시한다.
- 각 Activity/Courses/Training 상세 페이지 하단은 해당 API가 “Enterprise Access only”라고 표시한다.

이는 프로그램 개편 중 공개 페이지가 완전히 정합화되지 않았거나, Starter의 core subset과 Enterprise 전체 기능을 구분하는 표현일 수 있다. 따라서 사업 일정에는 `Starter에서 Activity 수신과 Course 게시를 실제 사용자에게 출시할 수 있는가`를 Garmin에 서면 확인하는 게이트를 둬야 한다. 공개 문구만으로 무료·무제한·즉시 프로덕션 사용이 가능하다고 판단하면 안 된다.

신청 전 Garmin에 확인할 질문은 다음과 같다.

1. Starter에서 Activity API와 Courses API의 프로덕션 사용이 가능한가? 각각 어떤 endpoint와 데이터 범위가 제공되는가?
2. Starter 사용자 수, rate limit, push 재시도 정책과 production verification 요건은 무엇인가?
3. 새로 연결한 사용자의 과거 활동 backfill은 전혀 불가능한가? Enterprise의 기간과 비용은 어떻게 정해지는가?
4. Courses API가 course point, 고도, 이름의 Unicode를 어떤 장치 범위까지 보장하는가?
5. 게시한 course의 생성·갱신·삭제와 상태 조회, 장치 전달 확인 범위는 어디까지인가?
6. 연결 해제·사용자 삭제 webhook과 Garmin 유래 데이터의 의무 삭제 기간은 무엇인가?
7. Garmin 유래 활동에서 파생한 통계, 코스 매칭, 클럽 출석 데이터를 얼마나 오래 보관할 수 있는가?
8. 로고, `Connect with Garmin` 버튼, 장치 모델과 데이터 출처 표시에 필요한 검수 절차는 무엇인가?

## 6. 개인정보·브랜드·운영 고려사항

Garmin 활동은 정밀 위치, 운동 시간, 심박·건강 지표와 집·직장 추정 가능성이 있는 민감한 데이터다. 다음 원칙을 연동 설계에 포함해야 한다.

- OAuth scope를 활동 읽기와 코스 쓰기로 분리하고, 기능별 목적과 보관 기간을 연결 전에 설명한다.
- access/refresh credential은 브라우저나 기존 Firebase profile에 넣지 않고 서버에서 암호화 저장한다.
- Garmin 연결 해제, 원본 활동 삭제, Trazo 계정 삭제가 각각 무엇을 지우는지 명확하게 제공한다.
- 활동 위치 공개 기본값은 비공개로 하고 시작·종료 숨김 또는 privacy zone을 고려한다.
- Garmin push의 서명/인증 검증, idempotency, rate limit, queue 재시도, 감사 로그를 둔다.
- Garmin 장치 유래 데이터가 표시되는 카드·대시보드·내보내기에 요구되는 Garmin 및 장치 모델 attribution을 적용한다. Garmin은 downstream/export data에도 출처 표시를 요구할 수 있다. [Garmin API Brand Guidelines](https://developer.garmin.com/downloads/brand/Garmin-Developer-API-Brand-Guidelines.pdf)

비공식 Garmin Connect endpoint를 브라우저 자동화하거나 사용자의 Garmin ID/비밀번호를 Trazo가 받아 로그인하는 라이브러리는 사용하지 않는 것이 좋다. 불안정하고 보안 위험이 크며 공식 사업자 API의 사용자 동의·지원·브랜드 체계를 우회하게 된다.

## 7. 권장 도입 순서

### 1단계 — 승인 없이 가능한 품질 개선

- 현재 FIT 코스 파일을 Garmin 공식 FIT SDK validator와 실제 Edge/Forerunner 장치로 검증
- `Garmin Connect로 가져오기` 도움말과 모바일 공유 시트 UX 추가
- 활동 FIT 수동 업로드는 기존 코스 import와 분리해, 활동 기록으로 저장할 데이터 모델을 먼저 설계

### 2단계 — Garmin 프로그램 신청과 기술 스파이크

- Trazo의 실제 서비스 URL, 개인정보처리방침, 데이터 삭제 흐름, Activity/Courses 사용 목적을 준비해 Business 신청
- 승인 후 Developer Portal의 실제 schema와 제한을 확인
- 테스트 사용자로 OAuth 연결, activity push 수신, 한 개 course 게시를 end-to-end 검증
- Starter/Enterprise 범위와 비용을 확인한 뒤 출시 범위를 확정

### 3단계 — Courses API 우선 출시

Courses API를 먼저 권장한다. 현재 코스 데이터가 이미 준비되어 있고 사용자 가치가 명확하며, Garmin에서 받은 건강·활동 데이터를 장기 보관하는 부담도 상대적으로 적다. 버튼 상태는 `전송 중 → Garmin Connect 게시 완료 → 실패/재시도`로 설계한다.

### 4단계 — Activity API 출시

- 연결 이후 새 run/bike activity부터 비공개로 수신
- 요약 데이터와 실제 트랙을 보여주고 사용자가 `Trazo 코스로 만들기`, `예정 코스와 연결`, `클럽 모임 완료로 제출`을 직접 선택
- 중복, 삭제, multisport, indoor activity, GPS 없는 activity, 장치 재업로드를 처리
- 과거 활동 backfill은 Enterprise 조건이 확인될 때 별도로 제공

### 5단계 — 사용성이 확인된 뒤 Training API 검토

클럽 훈련이나 코칭이 제품 방향에 들어갈 때 구조화 workout과 training plan 전송을 추가한다. 단순 경로 전송과 UI·데이터 모델이 다르므로 Courses 기능에 섞지 않는다.

## 8. 최종 판단

Trazo는 Garmin 연동에 **좋은 출발점**을 이미 갖고 있다. 국제 코스 파일, FIT course와 course point, 활동 FIT 경로 import를 지원하므로 경로 변환 자체보다 공식 계정 연결, 안정적인 서버 수신, 개인정보 수명주기와 운영 품질이 주된 작업이다.

권장 제품 순서는 `수동 Garmin Connect 가져오기 UX 개선 → Business 프로그램 신청 → Courses API 한 번에 보내기 → Activity API 새 활동 자동 수신`이다. Courses API는 현재 Trazo의 경로 제작 강점을 곧바로 확장하므로 우선순위가 가장 높다. Activity API는 향후 코스 완주, 클럽 출석, 실제 경로 피드백에 큰 가치가 있지만 데이터 모델과 개인정보 운영을 먼저 갖춘 뒤 도입하는 것이 안전하다.

결론적으로 **구현 가능성은 높고 제품 적합성도 높다.** 가장 큰 불확실성은 기술이 아니라 Garmin의 Starter/Enterprise 실제 권한, 사용자 한도, 상업 조건과 승인이다. 따라서 개발 일정을 확정하기 전에 Garmin Business 신청과 Courses/Activity 권한의 서면 확인을 첫 번째 의사결정 게이트로 두는 것이 맞다.

## 9. Garmin 신청서 답변 초안

아래 문장은 신청서의 텍스트 영역에 그대로 붙여 넣을 수 있는 영어 초안이다. `Trazo`의 현재 기능과 계획된 Garmin 연동 범위를 기준으로 작성했다. 세 번째 답변의 `Junlab(On-premises)`와 `Seoul, South Korea`은 실제 운영 서버 업체와 리전으로 반드시 바꿔야 한다. 아직 정하지 않았다면 신청 전에 확정하는 것이 좋다.

### 9.1 Application overview, user experience and API usage

**Question:** Provide a brief overview of your application, the user experience and how the APIs will be used.

```text
Trazo is a web-based route planning and community service for runners and cyclists. Users can create and edit routes, review distance, elevation and gradient, add course points, import or export common course formats, and save or share routes with others.

Users will connect their Garmin Connect account to Trazo through OAuth 2.0 and provide explicit consent for the requested Garmin permissions. We plan to use the Courses API to let a user send a route they have selected or created in Trazo to their Garmin Connect account. Garmin Connect will then make the course available for synchronization with the user's compatible Garmin device.

We plan to use the Activity API to receive new running and cycling activities after the user has synchronized a Garmin device with Garmin Connect. Trazo will display the activity summary and route privately to the user and allow the user to choose whether to turn the recorded track into an editable Trazo route, compare it with a planned course, or associate it with a club event. Garmin activities will not be published or shared automatically. The initial integration will not provide real-time tracking and will not request unrelated health or wellness data.
```

사용자가 만든 코스 전송만 먼저 신청할 경우에는 마지막 문단의 Activity API 설명을 빼고 Courses API만 적는 편이 승인 범위를 명확하게 만든다. 두 API를 동시에 신청한다면 위 문장을 그대로 사용해도 된다.

### 9.2 Business model

**Question:** Describe the business model for the products or services using this API access.

```text
Trazo is currently offered as a consumer web service, with a planned freemium business model. Core route planning, course file export and basic Garmin connectivity are intended to remain available to individual users at no charge. We plan to offer optional paid features for clubs and organizers, such as advanced member and event administration, shared route libraries, route version management, attendance insights and organization-level analytics.

Garmin connectivity will support the core Trazo experience and will not be used to sell or broker Garmin device-sourced data. We will not sell Garmin data, use it for targeted advertising, or license it to third parties. Any future paid feature that uses Garmin-derived information will provide a direct user-facing route, activity or club-management function and will remain subject to the user's consent and Garmin's applicable program terms.
```

실제 수익 모델이 아직 완전히 정해지지 않았다면 `planned freemium business model`이라는 표현이 적합하다. 반대로 Garmin 연동 자체를 유료 구독에 넣을 계획이라면 “basic Garmin connectivity remains free”라고 쓰면 안 되므로 실제 정책에 맞춰 수정해야 한다.

### 9.3 Third-party services processing Garmin data

**Question:** Please identify any third-party services, including analytics, machine learning or AI platforms, that will process, analyze or store Garmin device-sourced data.

```text
Garmin device-sourced data will be processed by Trazo's backend and stored in Trazo-controlled application infrastructure hosted by Junlab(On-premises) in Seoul, South Korea. Normalized activity summaries and GPS geometry will be stored in the application database. Raw FIT files will be processed only as needed for import and validation and will not be retained longer than necessary for that purpose. Access will be limited to the authorized user and authorized Trazo operations personnel.

Firebase Authentication is used for Trazo account authentication, but Garmin activity data, GPS tracks, health metrics and Garmin OAuth credentials will not be sent to Firebase Authentication. Google Analytics is used for general page and product-usage measurement, but no Garmin device-sourced activity metrics, GPS/location data, course contents, device identifiers or OAuth credentials will be included in analytics events.

No machine learning or AI platform will receive, process or store Garmin device-sourced data as part of the initial integration. Garmin data will not be exposed through Trazo's AI/MCP integration. We do not use data brokers or advertising platforms to process Garmin device-sourced data. If this architecture changes, we will update our disclosures, obtain any required user consent and Garmin approval, and comply with the applicable Garmin program terms before enabling the change.
```

#### 제출 전에 확인할 부분

- `Junlab(On-premises)`와 `Seoul, South Korea`을 실제 값으로 교체한다. 예: `Amazon Web Services (AWS)`와 `Asia Pacific (Seoul)`. 실제로 해당 업체와 리전을 사용할 때만 그렇게 적는다.
- PostgreSQL이 같은 운영 서버에서 직접 실행되더라도 서버를 제공하는 클라우드·IDC 사업자는 Garmin 관점에서 Garmin 데이터를 저장하는 제3자 처리자일 수 있으므로 적는 편이 안전하다.
- 백업이 별도 NAS나 클라우드 스토리지에 저장된다면 그 업체와 리전도 추가한다. 현재 `db-backup`이 외부 백업 디스크를 사용할 수 있으므로 실제 운영 구성을 확인한다.
- Cloudflare 같은 CDN·reverse proxy가 Garmin API 수신 endpoint 앞에 있고 request body나 로그를 처리한다면 함께 공개할지 Garmin에 확인한다.
- Sentry, Datadog, Logtail 같은 오류·로그 서비스가 있다면 Garmin payload, GPS 좌표, token을 보내지 않도록 필터링하고 사용 서비스 목록에도 반영한다.
- 현재 MCP는 사용자 코스를 읽을 수 있으므로, Garmin 활동에서 생성된 코스를 MCP 검색 대상에 포함하지 않도록 출처와 동의 상태를 분리해야 위 답변이 사실이 된다.
- 추후 AI 추천에 Garmin 활동을 사용하려면 먼저 Garmin 승인, 개인정보 고지, 명시적 사용자 동의와 해당 AI 업체 공개가 필요하다.

### 9.4 더 짧은 버전이 필요한 경우

입력 글자 수가 짧다면 다음 축약본을 사용할 수 있다.

**Application overview**

```text
Trazo is a web-based route planning and community service for runners and cyclists. Users create, edit, save and share routes with elevation and course-point information. With explicit OAuth 2.0 consent, the Courses API will send user-selected Trazo routes to Garmin Connect for synchronization with compatible Garmin devices. The Activity API will receive new running and cycling activities after Garmin Connect synchronization so users can privately review them, convert a recorded track into an editable route, compare it with a planned course, or optionally associate it with a club event. Activities will never be published automatically, and the initial integration will not provide real-time tracking or request unrelated wellness data.
```

**Business model**

```text
Trazo plans to operate a freemium model. Core route planning, course export and basic Garmin connectivity will be available to individual users, while optional paid plans will provide advanced club, event and shared-route management features. Trazo will not sell, broker, license or use Garmin device-sourced data for targeted advertising.
```

**Third-party services**

```text
Garmin device-sourced data will be processed by Trazo and stored in Trazo-controlled infrastructure hosted by Junlab(On-premises) in Seoul, South Korea. Firebase Authentication handles Trazo sign-in but will not receive Garmin activity data or OAuth credentials. Google Analytics receives only general product-usage events and no Garmin metrics, GPS/location data, course content, device identifiers or credentials. No machine learning, AI, advertising or data-broker platform will process Garmin device-sourced data in the initial integration, and Garmin data will not be exposed through Trazo's AI/MCP integration.
```
