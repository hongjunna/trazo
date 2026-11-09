# 심사자용 안내 (ChatGPT·Claude 공통)

두 마켓 모두 심사자가 **추가 설정 없이, 문자·이메일 인증 없이** 로그인할 수 있는 테스트 계정을 요구합니다. Trazo는 구글 로그인만 쓰므로, 심사자 전용 아이디·비밀번호 로그인을 서버 설정으로 켭니다.

## 1. 심사 계정 준비 (운영자가 한 번)

1. 심사용 구글 계정을 하나 만들어 https://trazo.runvia.app 에 로그인하고 닉네임을 정합니다. (운영 계정이나 개인 계정은 쓰지 않습니다. 심사자가 그 계정의 비공개 코스까지 보게 됩니다.)
2. 커뮤니티에서 러닝·자전거 코스를 10개 이상 **내 코스에 담기**하고, 직접 만든 코스도 몇 개 저장합니다. 최소한 다음이 있어야 테스트 케이스가 잘 돌아갑니다.
   - 서울 한강 근처(여의도·반포) 러닝 코스 3~12km 2개 이상
   - 오르막이 있는 러닝 코스(상승 고도 100m 이상) 1개 이상
   - 순환(출발점으로 돌아오는) 자전거 코스 20~70km 1개 이상
3. 관리자 페이지 → 회원에서 이 계정의 Firebase UID를 복사합니다.
4. 서버 `.env`에 아래 세 값을 넣고 `./deploy.sh live up`으로 다시 배포합니다.

```
REVIEWER_LOGIN_ID=trazo-reviewer
REVIEWER_LOGIN_PASSWORD=<12자 이상 무작위 비밀번호>
REVIEWER_UID=<3에서 복사한 UID>
```

세 값이 모두 있어야 동의 화면 아래에 “App reviewer? Sign in with reviewer credentials” 링크가 나타납니다. 비밀번호를 5번 틀리면 15분 동안 막힙니다. 심사가 끝나면 값을 비워 끌 수 있지만, OpenAI는 이후 버전 심사에도 같은 계정을 쓰므로 유지하는 것을 권장합니다.

## 2. 포털에 붙여 넣을 심사자 안내 (영문)

```
Trazo is a running and cycling route planner for South Korea. The MCP server is read-only.

How to connect:
1. Add the server https://trazo.runvia.app/mcp (OAuth).
2. When the Trazo authorization page opens, click "App reviewer? Sign in with reviewer credentials" below the Google button.
3. Enter the reviewer ID and password below, then click "Sign in and allow". You will be redirected back automatically. No Google sign-in, SMS or email verification is required.

Reviewer ID: trazo-reviewer
Password: <REVIEWER_LOGIN_PASSWORD>

The reviewer account already contains saved running and cycling routes around Seoul, so all tools return data.

Suggested prompts:
- "Show my Trazo running routes between 3 and 12 km." (search_courses)
- "Find running routes on Trazo near Yeouido Hangang Park in Seoul." (find_place, search_courses)
- "Use Trazo to find my hilliest running route and tell me if it suits hill repeats." (search_courses, get_course)
- "What is the elevation profile of this Trazo route? https://trazo.runvia.app/c/az0e0VJQZ1HR" (get_course)

Write requests (create, edit, delete) are intentionally not supported.
Contact: trazo@junlab.xyz
```

## 3. 도구 annotation 근거 (OpenAI 포털 입력용)

| 도구 | readOnlyHint | destructiveHint | openWorldHint | 근거 |
|---|---|---|---|---|
| `search_courses` | true | false | false | Only reads routes from the signed-in user's Trazo account and public Trazo routes; never changes data; bounded to Trazo. |
| `get_course` | true | false | false | Returns details of one Trazo route the user can access; no writes; bounded to Trazo. |
| `find_place` | true | false | true | Read-only lookup of public place names via the Kakao Local search API (open-ended external public data); does not change any data. |
