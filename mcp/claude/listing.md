# Claude Connectors Directory 등록 정보

포털(https://claude.ai/directory/manage → **Submit new** → **MCP connector**)의 단계별로 아래 값을 붙여 넣습니다. 글자 수 제한은 2026-11-09 기준 공식 문서([Submit a connector](https://claude.com/docs/connectors/building/submission))에 따른 것입니다.

## 1. Connection
- Server URL: `https://trazo.runvia.app/mcp`

## 2. Tools
도구 3개가 자동으로 불러와집니다. 모두 `title`과 `readOnlyHint: true`가 있어 경고 없이 통과해야 합니다.

| 도구 | title | readOnlyHint | 설명 |
|---|---|---|---|
| `search_courses` | 코스 검색 | true | 내 코스·공개 코스 검색 (종목·거리·고도·형태·좌표 반경) |
| `get_course` | 코스 상세 | true | 코스 하나의 고도·경사·오르막·구간·웨이포인트 |
| `find_place` | 장소 좌표 찾기 | true | 장소 이름 → 좌표 (카카오 지도 검색) |

## 3. Listing
- **Server name** (100자 이내): `Trazo`
- **One-liner** (200자 이내):
  `Recommend and analyse running and cycling routes in South Korea from your Trazo routes and public community routes, with real distance, elevation and gradient data.`
- **Description** (2,000자 이내):

```
Trazo is a running and cycling route planner for South Korea. Connect your Trazo account and Claude can read the routes you saved (including private and link-shared ones) and the routes the community has made public, and explain them with real data instead of guesses.

What Claude can do with Trazo:
- Recommend routes by sport, distance, elevation gain and route type (loop, out-and-back, point-to-point).
- Find routes near a place, such as the Han River or Yeouido, by converting a Korean place name to coordinates and searching routes that pass nearby.
- Check whether a route fits a workout: main climbs (start, length, gain, average grade), gradient distribution, per-kilometre elevation splits, and waypoints such as water stops.
- Analyse a route from a Trazo share link.

Example prompts:
- "Recommend a flat 10 km running route along the Han River."
- "Which of my Trazo routes is best for hill repeats?"
- "Find a 40 km cycling loop that starts near Yeouido."

The connector is read-only. It never creates, edits or deletes routes, and it does not access email addresses, likes or comments. Users sign in with their Trazo (Google) account through OAuth and can disconnect at any time at https://trazo.runvia.app/connect. Route information is for reference; always check real road conditions and exercise safely.
```

- **Categories** (1~5개): Sports & Fitness(또는 Health & Fitness), Travel, Maps & Location — 포털 목록에 있는 가장 가까운 항목을 고릅니다.
- **Documentation URL**: `https://trazo.runvia.app/en/ai/`
- **Privacy policy URL**: `https://trazo.runvia.app/en/privacy/`
- **Support contact**: `trazo@junlab.xyz` (지원 페이지: `https://trazo.runvia.app/support/`)
- **Icon**: `mcp/assets/trazo-logo-512.png` (정사각형 PNG, SVG가 허용되면 `mcp/assets/trazo-logo.svg`)
- **URL slug** (게시 후 변경 불가): `trazo`

## 4. Use cases
- Primary use cases: running and cycling route recommendations in South Korea; checking routes against training plans (intervals, tempo, hill repeats, long runs); finding routes near a place; analysing a shared route.
- Prerequisites: a free Trazo account (sign in with Google at https://trazo.runvia.app). Saved routes make results richer, but public routes work without any.
- Reads or writes: **Read only**.

## 5. Company
- Company name: Junlab
- Website: `https://trazo.runvia.app`
- Primary contact: 운영자 이름 / `trazo@junlab.xyz`

## 6. Authentication
- Authentication requirement: **Required** (OAuth)
- Authentication method: **OAuth – Dynamic Client Registration (`oauth_dcr`)**. Client ID metadata documents(CIMD)도 지원하므로 Claude의 기본 방식도 동작합니다. 포털에 넣을 클라이언트 ID·시크릿은 없습니다.
- 서버가 이미 충족하는 항목: 인증 없이 호출하면 `401` + `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp"`, 보호 리소스 메타데이터의 `resource`가 `https://trazo.runvia.app/mcp`와 정확히 일치, `code_challenge_methods_supported: ["S256"]`, 토큰 엔드포인트 form 요청 지원, 갱신 토큰 교체(rotation), 갱신 실패 시 `invalid_grant`, 리다이렉트 `https://claude.ai/api/mcp/auth_callback`과 Claude Code의 localhost 주소 허용.

## 7. Data handling
- API: **Our own first-party API** (Trazo 서버의 자체 데이터). 장소 검색(`find_place`)과 지역 이름은 카카오 로컬 API를 서버에서 대신 호출합니다(사용자 식별 정보는 보내지 않음).
- Personal health data: **No** (심박수 등 건강 데이터를 다루지 않음)
- Sponsored content: **No**

## 8. Test & launch
`reviewer-info.md`의 내용을 붙여 넣습니다. 제출 전에 세 도구를 모두 직접 호출해 봤다는 확인란에 체크합니다(Claude에 커스텀 커넥터로 추가해 확인하거나 MCP Inspector 사용).

## 9. Compliance
정책 동의 7개를 모두 읽고 체크합니다.
