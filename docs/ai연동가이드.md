# 데스크톱 AI 연동 가이드

웹서비스 서버(junlab)의 다른 서비스에서 **Junlab AI Service**(집 데스크톱 GPU의 로컬 AI)를 호출하는 방법.
OpenAI API와 같은 형식이라, 기존에 무료 AI API나 OpenAI SDK를 쓰던 코드는 `base_url`과 키만 바꾸면 된다.

> 마지막 갱신: 2026-11-10 · 브릿지 저장소: `hongjunna/desktop-ai` · 서버 위치: `~/dockers/desktop-ai`

---

## 0. 먼저 알아둘 특성

| 특성 | 영향 | 대응 |
|---|---|---|
| 데스크톱은 평소 **최대 절전** 상태 | 첫 요청은 깨우는 데 **1~2분** 걸림 | 타임아웃을 넉넉히 (300초 이상) |
| GPU(12GB) 하나에 **모델은 한 번에 하나만** 올라감 | 모델을 바꾸면 적재에 **30~60초** 추가 | 서비스마다 모델을 하나로 고정 |
| 요청은 사실상 **순서대로** 처리 | 다른 서비스가 쓰는 중이면 기다림 | 실시간 응답이 꼭 필요한 기능은 대체 경로 준비 |
| 데스크톱이 안 켜질 수 있음 (사용자가 끔 등) | `503 desktop_unavailable` | 기존 무료 API로 대체하거나 큐(비동기) 사용 |

**적합:** 요약, 분류, 태그 생성, 번역, 문장 다듬기, 배치 처리 등 몇 분 늦어도 되는 작업
**부적합:** 사용자가 화면 앞에서 즉시 응답을 기다리는 기능 (대체 경로 없이 이것만 쓰는 경우)

---

## 1. 연동 준비

### 1-1. API 키 발급

서비스마다 키를 따로 발급한다. 서버에서:

```bash
cd ~/dockers/desktop-ai
openssl rand -hex 24                 # 키 생성
vi .env                              # API_KEYS 에 "서비스이름:키" 를 쉼표로 추가
#   API_KEYS=admin:xxxx,railnow:yyyy,toporider:zzzz
./deploy.sh
```

- 키에서 **콜론 뒤의 값만** 실제 키다. `railnow:yyyy`라면 서비스에는 `yyyy`만 넣는다.
- 이름(`railnow`)은 로그와 작업 소유자 구분에 쓰인다. 자기 서비스 이름으로 짓는다.

### 1-2. 도커 네트워크 연결

서비스의 `docker-compose.yml`에 `junlab-ai` 네트워크를 추가한다.

```yaml
services:
  app:
    # ...
    networks: [default, junlab-ai]

networks:
  junlab-ai:
    external: true
```

이렇게 하면 컨테이너 안에서 **`http://junlab-ai:8000/v1`** 로 접근할 수 있다.
(서버 호스트에서 직접 부를 때는 `http://127.0.0.1:8790/v1`)

### 1-3. 서비스 환경 변수 (권장 이름)

```bash
# 서비스의 .env
JUNLAB_AI_BASE_URL=http://junlab-ai:8000/v1
JUNLAB_AI_API_KEY=yyyy
JUNLAB_AI_MODEL=gemma4:12b
JUNLAB_AI_CALLBACK_SECRET=   # 비동기 콜백을 받을 때만. 브릿지 .env 의 CALLBACK_SECRET 과 같은 값
```

---

## 2. 모델 선택

| 모델 | 크기 | 속도 (적재 후) | 특징 | 추천 용도 |
|---|---|---|---|---|
| **`gemma4:12b`** | 8.0GB | 빠름 (짧은 답 1~2초) | 한국어 정확도 좋음, 이미지 입력 지원 | **기본 추천** — 요약, 분류, 일반 대화 |
| `qwen3.5:9b` | 6.6GB | 빠름 | 가볍지만 사실관계 오류가 가끔 있음 | 간단한 분류·형식 변환 |
| `qwen3-coder:30b` | 18GB | 느림 (GPU+CPU 분할) | 코드 품질 높음 | 코드 생성·리뷰 (지연 감수 가능할 때) |

- `model`을 생략하면 브릿지 기본값(`.env`의 `DEFAULT_MODEL`)이 쓰인다. **명시하는 것을 권장**한다.
- 사용 가능한 전체 목록: `GET /v1/models` (데스크톱이 켜져 있어야 함)
- HyperCLOVA X SEED 14B는 Ollama가 지원하지 않는 전용 형식이라 현재 사용할 수 없다.

### 생각(reasoning) 옵션

| `reasoning_effort` | 동작 |
|---|---|
| 생략 | 브릿지 기본값 `none` 적용 — 생각 과정 생략, 빠름 |
| `"low"` / `"medium"` / `"high"` | 답하기 전에 생각함. 정확도↑, 속도↓, 토큰 사용↑ |

> ⚠️ 생각을 켤 때는 `max_tokens`를 넉넉히 준다. 생각에 토큰을 다 쓰면 `content`가 빈 문자열로 온다.

---

## 3. 방식 A — 동기 호출 (바로 응답)

`POST /v1/chat/completions` — OpenAI Chat Completions와 같다.

### Python (openai SDK)

```python
import os
from openai import OpenAI, APIStatusError, APITimeoutError

ai = OpenAI(
    base_url=os.environ["JUNLAB_AI_BASE_URL"],
    api_key=os.environ["JUNLAB_AI_API_KEY"],
    timeout=300,        # 데스크톱 깨우기(최대 150초) + 생성 시간
    max_retries=0,      # 503 은 직접 처리
)

def summarize(text: str) -> str:
    r = ai.chat.completions.create(
        model=os.environ.get("JUNLAB_AI_MODEL", "gemma4:12b"),
        messages=[
            {"role": "system", "content": "한국어로 세 문장 이내로 요약해."},
            {"role": "user", "content": text},
        ],
        temperature=0.3,
    )
    return r.choices[0].message.content
```

### Node.js (openai SDK)

```js
import OpenAI from "openai";

const ai = new OpenAI({
  baseURL: process.env.JUNLAB_AI_BASE_URL,
  apiKey: process.env.JUNLAB_AI_API_KEY,
  timeout: 300_000,
  maxRetries: 0,
});

const r = await ai.chat.completions.create({
  model: process.env.JUNLAB_AI_MODEL ?? "gemma4:12b",
  messages: [{ role: "user", content: "다음 문장을 존댓말로 바꿔줘: 내일 와" }],
});
console.log(r.choices[0].message.content);
```

### curl

```bash
curl http://junlab-ai:8000/v1/chat/completions \
  -H "Authorization: Bearer $JUNLAB_AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma4:12b","messages":[{"role":"user","content":"안녕"}]}'
```

### 스트리밍

`"stream": true` — OpenAI와 같은 SSE(`data: {...}` 청크, 마지막 `data: [DONE]`). SDK의 `stream=True`를 그대로 쓰면 된다.

### 데스크톱이 꺼져 있을 때의 동작

1. 브릿지가 데스크톱을 깨우고 **최대 150초** 동안 응답을 붙잡고 기다린다.
2. 그 안에 준비되면 정상 응답한다.
3. 준비되지 않으면 아래 응답이 온다.

```http
HTTP/1.1 503
Retry-After: 60

{"error": {"message": "데스크톱 AI 가 150초 안에 준비되지 않았습니다. ...", "type": "desktop_unavailable"}}
```

### 권장 패턴: 로컬 AI 우선, 실패하면 기존 무료 API로 대체

```python
def chat(messages, **kw):
    try:
        r = ai.chat.completions.create(model="gemma4:12b", messages=messages, **kw)
        return r.choices[0].message.content
    except (APIStatusError, APITimeoutError) as e:
        if isinstance(e, APIStatusError) and e.status_code not in (502, 503, 504):
            raise                       # 400(잘못된 요청)·401(키 오류)는 대체하지 말고 고칠 것
        return fallback_free_api(messages, **kw)   # 기존에 쓰던 무료 API
```

---

## 4. 방식 B — 비동기 작업 (큐 + 콜백)

늦게 받아도 되는 작업에 쓴다. 요청은 즉시 `202`로 끝나고, 데스크톱이 꺼져 있어도 큐에 남아 있다가 켜지면 순서대로 처리된다.

### 등록

`POST /v1/jobs`

```json
{
  "request": {
    "model": "gemma4:12b",
    "messages": [{"role": "user", "content": "이 글을 요약해줘: ..."}]
  },
  "callback_url": "http://127.0.0.1:8484/internal/ai-callback"
}
```

→ `202 {"id": "27577b16...", "status": "queued", "queued": 1}`

- `request`는 3장의 본문과 같다 (`stream`은 무시되고 항상 한 번에 받음).
- `callback_url`은 생략 가능 — 생략하면 조회 방식으로 받는다.

> ⚠️ **콜백 URL 주의:** 콜백은 서버 **호스트 네트워크**에서 보낸다.
> 컨테이너 이름(`http://myapp:3000`)은 **동작하지 않는다.**
> 서비스가 호스트에 열어 둔 포트(`http://127.0.0.1:<APP_PORT>/...`)나 공개 URL을 쓴다.

### 콜백 수신

처리가 끝나면 `callback_url`로 POST가 온다 (실패 시 3회 재시도).

```json
{"id": "27577b16...", "status": "done", "result": { ...chat completion 응답... }}
{"id": "27577b16...", "status": "error", "error": "HTTP 404: model not found"}
```

`CALLBACK_SECRET`이 설정돼 있으면 헤더로 서명이 붙는다. **반드시 검증한다.**

```
X-Junlab-Signature: sha256=<HMAC-SHA256(CALLBACK_SECRET, 요청 본문 원문) 의 hex>
```

```python
# Python (FastAPI 예시)
import hmac, hashlib, os
from fastapi import Request, HTTPException

@app.post("/internal/ai-callback")
async def ai_callback(req: Request):
    raw = await req.body()
    expected = "sha256=" + hmac.new(os.environ["JUNLAB_AI_CALLBACK_SECRET"].encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, req.headers.get("x-junlab-signature", "")):
        raise HTTPException(401)
    data = await req.json()
    if data["status"] == "done":
        text = data["result"]["choices"][0]["message"]["content"]
        ...  # data["id"] 로 어떤 작업인지 찾아서 저장
    return {"ok": True}
```

```js
// Node.js (Express 예시) — 반드시 원문(raw body)으로 서명 검증
import crypto from "node:crypto";
app.post("/internal/ai-callback", express.raw({ type: "application/json" }), (req, res) => {
  const expected = "sha256=" + crypto.createHmac("sha256", process.env.JUNLAB_AI_CALLBACK_SECRET)
    .update(req.body).digest("hex");
  const got = req.get("x-junlab-signature") ?? "";
  if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected)))
    return res.sendStatus(401);
  const data = JSON.parse(req.body);
  // data.status === "done" → data.result.choices[0].message.content
  res.json({ ok: true });
});
```

- 같은 작업의 콜백이 두 번 올 수 있다 (재시도). `id` 기준으로 **중복 처리를 막는다.**
- 콜백 응답은 15초 안에 2xx로 돌려준다. 무거운 후처리는 비동기로 넘긴다.

### 조회 (콜백 대신, 또는 콜백 유실 대비)

`GET /v1/jobs/{id}` — 자기 서비스 키로 등록한 작업만 보인다.

```json
{"id": "...", "status": "queued|running|done|error", "result": {...}, "error": null,
 "callback_status": "ok|failed|null", "created_at": 1794295976.1, "finished_at": 1794295977.0}
```

폴링한다면 **10초 이상 간격**을 권장한다.

---

## 5. 에러 정리

| 코드 | 의미 | 대응 |
|---|---|---|
| `401 invalid api key` | 키 누락/오타, `이름:` 까지 넣음 | 콜론 뒤 값만 `Authorization: Bearer <키>` |
| `400 invalid json` | 본문이 JSON 아님 | 요청 본문 확인 |
| `404` (model not found 등) | 없는 모델 이름 | `GET /v1/models`로 확인 |
| `503 desktop_unavailable` | 150초 안에 데스크톱이 준비 안 됨 | 대체 API 또는 큐 사용, `Retry-After` 후 재시도 |
| 응답 지연 | 데스크톱 깨우는 중 / 모델 교체 중 / 다른 작업 처리 중 | 타임아웃 300초 이상, `GET /status`로 상태 확인 |

---

## 6. 운영 참고

- **상태 확인:** `GET /status` → `desktop.awake`(Windows 켜짐), `desktop.ready`(AI 준비됨), `queued`(대기 작업 수)
- **전원 정책:** 브릿지가 깨운 데스크톱은 마지막 AI 사용 후 10분 지나고 사용자가 자리를 비우면 최대 절전으로 돌아간다. 사용자가 직접 켠 데스크톱은 끄지 않는다. 예외 상황은 관리자 디스코드로 알림이 간다.
- **보안:** 브릿지는 서버 내부(`127.0.0.1`, `junlab-ai` 도커 네트워크)에서만 열려 있다. 외부에 노출하지 않는다. 키는 서비스 `.env`에만 두고 코드·저장소에 넣지 않는다.
- **개인정보:** 요청 내용은 집 데스크톱에서 처리되고, 비동기 작업은 결과와 함께 브릿지 SQLite에 저장된다.
- **맥에서 직접 테스트:** [로컬테스트법.md](로컬테스트법.md) (SSH 터널 + Postman)
- **로그:** `cd ~/dockers/desktop-ai && docker compose logs --tail 50 worker`

---

## 7. 연동 체크리스트

- [ ] 브릿지 `.env`의 `API_KEYS`에 서비스 키 추가 후 `./deploy.sh`
- [ ] 서비스 compose에 `junlab-ai` external 네트워크 추가
- [ ] 서비스 `.env`에 `JUNLAB_AI_BASE_URL`, `JUNLAB_AI_API_KEY`, `JUNLAB_AI_MODEL`
- [ ] 클라이언트 타임아웃 300초 이상, SDK 자동 재시도 끄기
- [ ] `503` → 대체 API 또는 큐 처리
- [ ] (비동기) 콜백 URL은 `127.0.0.1:<포트>` 또는 공개 URL, 서명 검증, `id`로 중복 방지
