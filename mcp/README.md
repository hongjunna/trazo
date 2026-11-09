# Trazo MCP — AI 마켓 등록 자료

Trazo MCP 서버(`https://trazo.runvia.app/mcp`)를 ChatGPT와 Claude의 공식 디렉터리(마켓)에 올리기 위한 파일과 절차입니다. 서버 구현은 `backend/main.py`의 “AI 연결” 섹션에 있습니다.

> 절차와 제한은 2026-11-09에 공식 문서로 확인했습니다. 마켓 정책은 자주 바뀌니 제출 직전에 아래 링크의 문서를 한 번 더 확인하세요.
> - OpenAI: [Package your plugin](https://developers.openai.com/plugins/build/plugins) · [Upload and submit](https://developers.openai.com/plugins/deploy/submission) · [Remote MCP review requirements](https://developers.openai.com/plugins/deploy/app-review) · [Submission errors](https://developers.openai.com/plugins/deploy/submission-errors)
> - Anthropic: [Submit a connector](https://claude.com/docs/connectors/building/submission) · [Review criteria](https://claude.com/docs/connectors/building/review-criteria.md) · [Authentication](https://claude.com/docs/connectors/building/authentication.md)

```
mcp/
├── README.md              ← 이 문서 (등록 절차)
├── reviewer-info.md       ← 심사 계정 준비, 심사자 안내문, 도구 annotation 근거 (공통)
├── assets/                ← 로고 (SVG, PNG 512·1024)
├── openai/                ← ChatGPT 플러그인 ZIP 내용
│   ├── plugin.json        ← 매니페스트 (목록 정보, 테스트 케이스 5+3, 공개 국가, 한국어 번역)
│   ├── mcp.json           ← 원격 MCP 서버 + OAuth(DCR)
│   ├── skills/trazo-route-coach/SKILL.md   ← 도구 사용 가이드 (ZIP에 스킬이 1개 이상 있어야 함)
│   ├── assets/            ← logo.svg, composer-icon.svg
│   └── build.sh           ← dist/trazo-<버전>.zip 생성
└── claude/
    ├── listing.md         ← Connectors Directory 포털 단계별 입력값
    └── plugin/            ← (선택) Claude Code·Cowork용 플러그인 번들
```

## 0. 공통 준비 (한 번)

| 항목 | 상태 |
|---|---|
| 공개 HTTPS MCP 서버, OAuth 2.1 + PKCE(S256), 동적 등록(DCR)과 CIMD | ✅ 배포됨 |
| 모든 도구에 `title`, `readOnlyHint`/`destructiveHint`/`openWorldHint` | ✅ |
| 웹사이트 `https://trazo.runvia.app/en/ai/` | ✅ |
| 지원 `https://trazo.runvia.app/support/` | ✅ |
| 개인정보처리방침 `https://trazo.runvia.app/en/privacy/` | ✅ (AI·카카오·Garmin 데이터 처리 포함) |
| 이용약관 `https://trazo.runvia.app/en/terms/` | ✅ |
| **심사용 테스트 계정** | ⬜ `reviewer-info.md` 1번대로 준비 |
| **데모 영상 URL** (OpenAI 필수) | ⬜ 아래 참고 |

**데모 영상:** ChatGPT에 Trazo를 연결하는 과정과 테스트 케이스 질문 3~4개에 답하는 화면을 1~3분 정도로 녹화해 YouTube(일부 공개)나 공개 링크로 올립니다. 영상에 실제 개인 코스가 나오지 않게 심사 계정으로 녹화하세요.

## 1. ChatGPT (OpenAI 플러그인 디렉터리)

**자격:** OpenAI Platform 조직의 Owner(또는 Apps Management Write 권한)여야 하고, 조직의 **개인 또는 사업자 인증**(Settings → Organization → General)을 마쳐야 합니다. 인증한 이름이 개발자 이름으로 표시되며, 인증하지 않은 이름으로 게시하면 거절됩니다. EU 데이터 보관(EU data residency) 프로젝트는 MCP 플러그인을 제출할 수 없습니다.

1. **ZIP 만들기**: `./mcp/openai/build.sh` → `mcp/openai/dist/trazo-1.0.0.zip`
2. https://platform.openai.com/plugins 에서 **Upload new or existing plugin → Upload plugin**으로 ZIP을 올리고 **With MCP**를 고릅니다.
3. 자동 검사(**Metadata & Skills**, **MCPs**) 결과를 확인합니다. 오류가 나면 `plugin.json`을 고치고 `version`을 올려 다시 만듭니다.
4. **MCPs → Connect**에서
   - MCP Server URL: `https://trazo.runvia.app/mcp`
   - Authentication: OAuth (동적 등록이라 클라이언트 ID·시크릿 입력 없음)
   - **Domain verification**: 포털이 보여주는 토큰을 서버 `.env`의 `OPENAI_APPS_CHALLENGE=<토큰>`에 넣고 `./deploy.sh live up` 후 **Verify Domain**. 서버가 `https://trazo.runvia.app/.well-known/openai-apps-challenge`에서 토큰만 그대로 돌려줍니다.
5. **Scan tools** → 도구 3개의 annotation과 근거(`reviewer-info.md` 3번 표)를 입력합니다.
6. **Review information → Review details**에 심사 계정(`reviewer-info.md` 2번 안내문), 데모 영상 URL을 넣습니다. 계정 정보는 ZIP에 넣으면 안 됩니다.
7. **Submit for review** → 동의 항목 체크 → 제출. 결과는 이메일로 옵니다(반려 시 그 메일에 답장해 이의 제기).
8. 승인되면 **Publish plugin**. 게시해도 디렉터리 노출은 OpenAI가 선정하며, 게시 후에는 링크로 바로 설치할 수 있습니다.

**업데이트:** 도구를 바꾸는 서버 배포는 새 ZIP이 필요 없습니다(OpenAI가 매일 스캔, 배포 직후 포털에서 **Rescan**). 이름·설명·아이콘·스킬을 바꿀 때만 `version`을 올린 새 ZIP으로 다시 심사받습니다. MCP 주소의 출처(`https://trazo.runvia.app`)는 버전 사이에 바꿀 수 없습니다.

## 2. Claude (Connectors Directory)

**자격:** 유료 Claude 요금제(Pro·Max·Team·Enterprise)면 제출할 수 있습니다. Team·Enterprise는 조직 Owner가 제출합니다. 별도 파트너 신청은 없습니다.

1. 먼저 내 Claude에 Trazo를 커스텀 커넥터로 추가해 세 도구가 모두 정상 동작하는지 확인합니다(연동센터 절차).
2. https://claude.ai/directory/manage → **Submit new** → **MCP connector**.
3. `claude/listing.md`의 값을 단계별(Connection → Tools → Listing → Use cases → Company → Authentication → Data handling → Test & launch → Compliance)로 입력하고 **Review and submit**.
4. 제출하면 자동 검사를 거쳐 기본으로 **Community** 커넥터로 올라가고, Anthropic이 판단하면 기능 테스트를 하는 **Verified** 심사로 넘어갑니다. 진행 상태와 피드백은 같은 포털에서 봅니다. 문의: `mcp-review@anthropic.com`(심사), `directory@anthropic.com`(디렉터리·정책).

**심사에서 특히 보는 것:** 유효한 입력에 모든 도구가 정상 응답할 것(일반적인 “Internal Server Error”는 탈락), 읽기·쓰기 도구 분리, 도구 이름 64자 이내, OAuth 2.0, 공개 문서와 개인정보처리방침. Trazo는 모두 충족합니다.

### (선택) Claude Code·Cowork 플러그인
`claude/plugin/`은 Trazo MCP 서버와 코스 추천 스킬을 묶은 플러그인입니다. 같은 포털(**Submit new → Plugin**)로 제출하거나, 공개 GitHub 저장소에 올려 사용자가 `/plugin marketplace add <저장소>`로 설치하게 할 수 있습니다. 대부분의 사용자에게는 위 커넥터 등록이 우선입니다.

## 3. 직접 연결(마켓 등록 전)

마켓 등록 전에도 사용자는 연동센터(`https://trazo.runvia.app/connect`)의 안내대로 주소를 직접 추가해 쓸 수 있습니다.
