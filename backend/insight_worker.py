"""전체 공개 코스의 AI 분석 작업기 (docker-compose의 insight-worker, 운영 전용).

1. 분석 대기(pending) 코스를 모아 OSM에서 경로 근처 장소를 찾고, Junlab AI 브릿지(NVIDIA AI API, docs/ai연동가이드.md)에 바로 요청합니다.
2. 기본 모델이 실패하면(404 등 오류·응답 형식 불량) 브릿지의 대체 모델(JUNLAB_AI_FALLBACK_MODELS)을 차례로, 그다음 Groq 무료 API로 다시 요청합니다.
3. Groq도 실패하면(한도 초과 등) 재시도 대기(queued)로 두고 관리자 디스코드로 알린 뒤, 일정 시간(기본 30분)마다 다시 시도합니다.
결과는 검증해 바로 공개하고(신뢰도가 낮으면 검토 대기), 관리자 디스코드로 알립니다.
분석할 코스가 생기면 기다리지 않고 바로 처리하며, 할 일이 없을 때만 잠깐(기본 10초) 쉬었다가 다시 확인합니다.
규칙 분석(난이도·추천 훈련)은 백엔드가 코스를 저장할 때 바로 계산하고, 여기서는 AI 부분(소개 문장·테마)만 다룹니다.
"""
import datetime
import json
import logging
import os
import time

import httpx
from sqlmodel import Session, select

import main
from main import Course, CourseInsight, engine, utc_now
import course_geo
import course_insight

log = logging.getLogger("trazo.insight")

BRIDGE_URL = os.getenv("JUNLAB_AI_BASE_URL", "").strip().rstrip("/")
BRIDGE_KEY = os.getenv("JUNLAB_AI_API_KEY", "").strip()
BRIDGE_MODEL = os.getenv("JUNLAB_AI_MODEL", "").strip() or "google/gemma-4-31b-it"
# 기본 모델이 실패하면 차례로 시도하는 브릿지 모델 (그다음은 Groq). 2026-11 비교에서 빠르고 숫자를 정확히 옮긴 순서입니다.
BRIDGE_FALLBACK_MODELS = [m.strip() for m in (os.getenv("JUNLAB_AI_FALLBACK_MODELS", "").strip()
                          or "nvidia/nemotron-3.5-super-vl-120b-a12b,nvidia/nemotron-3-ultra-550b-a55b").split(",") if m.strip()]
BRIDGE_MODELS = list(dict.fromkeys([BRIDGE_MODEL] + BRIDGE_FALLBACK_MODELS))
# 답하기 전에 추론부터 하는 모델: 추론을 끄지 않으면 토큰을 추론에 다 써서 본문이 비어 옵니다.
THINKING_MODEL_PREFIXES = ("nvidia/nemotron", "deepseek-ai/", "qwen/")
GROQ_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "").strip() or "openai/gpt-oss-120b"
# railnow와 같은 Groq 무료 한도(하루 20만 토큰)를 나눠 쓰므로 하루 요청 수를 제한합니다 (건당 약 2천 토큰).
GROQ_DAILY_LIMIT = int(os.getenv("COURSE_INSIGHT_GROQ_DAILY_LIMIT", "30"))
# 브릿지·Groq가 모두 실패한 코스를 다시 시도하기까지 기다리는 시간
RETRY_AFTER_S = float(os.getenv("COURSE_INSIGHT_RETRY_MINUTES", "30")) * 60
DISCORD_WEBHOOK = os.getenv("COURSE_INSIGHT_DISCORD_WEBHOOK", "").strip()
OSM_PBF = os.getenv("OSM_PBF", "/data/south-korea-latest.osm.pbf")
# 할 일이 없을 때 다음 확인까지 기다리는 시간. 처리할 코스가 있으면 기다리지 않고 바로 이어서 처리합니다.
IDLE_S = float(os.getenv("COURSE_INSIGHT_IDLE_SECONDS", "10"))
# 한 번에 장소를 찾는 코스 수 (OSM 파일을 한 번 훑는 데 약 2~3분, 메모리는 경로 주변 점 수에 비례)
BATCH = 6
MAX_ATTEMPTS = 3

groq_usage = {"day": None, "count": 0}


def bridge_enabled() -> bool:
    return bool(BRIDGE_URL and BRIDGE_KEY)


def messages(prompt: str) -> list:
    return [{"role": "system", "content": course_insight.SYSTEM_PROMPT}, {"role": "user", "content": prompt}]


# --- Junlab AI 브릿지 (NVIDIA AI API) ---

def bridge_call(prompt: str, model: str = BRIDGE_MODEL) -> str:
    body = {"model": model, "temperature": 0.2, "max_tokens": 1500,
            "response_format": {"type": "json_object"}, "messages": messages(prompt)}
    if model.startswith(THINKING_MODEL_PREFIXES):
        body["chat_template_kwargs"] = {"thinking": False, "enable_thinking": False}
    response = httpx.post(f"{BRIDGE_URL}/chat/completions", json=body, timeout=180,
                          headers={"Authorization": f"Bearer {BRIDGE_KEY}"})
    if response.status_code != 200:
        raise RuntimeError(f"HTTP {response.status_code}")
    return response.json()["choices"][0]["message"].get("content") or ""


# --- Groq (대체 경로) ---

def groq_call(prompt: str) -> str:
    today = datetime.date.today().isoformat()
    if groq_usage["day"] != today:
        groq_usage.update(day=today, count=0)
    if groq_usage["count"] >= GROQ_DAILY_LIMIT:
        raise RuntimeError("Groq 하루 요청 한도에 도달했습니다")
    groq_usage["count"] += 1
    body = {"model": GROQ_MODEL, "temperature": 0.2, "max_tokens": 1500, "reasoning_effort": "low",
            "response_format": {"type": "json_object"}, "messages": messages(prompt)}
    response = httpx.post("https://api.groq.com/openai/v1/chat/completions", json=body, timeout=60,
                          headers={"Authorization": f"Bearer {GROQ_KEY}"})
    if response.status_code != 200:
        raise RuntimeError(f"HTTP {response.status_code}" + (" (한도 초과)" if response.status_code == 429 else ""))
    return response.json()["choices"][0]["message"].get("content") or ""


# --- 알림 ---

def notify(insight: CourseInsight, course: Course, warnings: list):
    if not DISCORD_WEBHOOK:
        return
    level = insight.difficulty or 0
    rules = json.loads(insight.rules_json or "{}")
    training = ", ".join(course_insight.TRAINING_KO.get(t, t) for t in rules.get("training") or []) or "-"
    themes = ", ".join(json.loads(insight.themes_json or "[]")) or "-"
    issues = json.loads(insight.issues_json or "[]")
    status = "바로 공개됨" if insight.ai_status == "published" else ("검토 대기 (신뢰도 낮음)" if main.INSIGHT_AUTO_PUBLISH else "검토 대기")
    lines = [
        f"🗺️ **코스 AI 분석 · {status}** #{course.id} {course.title}",
        f"{'●' * level}{'○' * (5 - level)} {course_insight.LEVEL_LABELS.get(level, '-')} · 추천 훈련: {training} · 테마: {themes}",
        f"**특징** {insight.feature_ko}",
        f"**안내** {insight.route_ko}",
    ]
    if issues:
        lines.append("⚠️ " + " / ".join(issues))
    lines.append(f"모델: {insight.ai_provider} {insight.ai_model}")
    if course.share_token:
        lines.append(f"코스: {main.PUBLIC_BASE_URL}/c/{course.share_token}")
    lines.append(f"검토: {main.PUBLIC_BASE_URL}/admin/")
    try:
        httpx.post(DISCORD_WEBHOOK, json={"content": "\n".join(lines)[:1900]}, timeout=10).raise_for_status()
    except httpx.HTTPError as error:
        log.warning("디스코드 알림 실패: %s", error)


def notify_deferred(items: list):
    """브릿지·Groq가 모두 실패해 재시도 대기로 넘어간 코스들을 알립니다. items: [(course, 사유)]"""
    if not DISCORD_WEBHOOK or not items:
        return
    lines = [f"⏳ **코스 AI 분석 실패 · 재시도 대기 {len(items)}개** ({RETRY_AFTER_S / 60:.0f}분 뒤 다시 시도)"]
    lines += [f"#{course.id} {course.title} — {reason}" for course, reason in items]
    lines.append(f"검토: {main.PUBLIC_BASE_URL}/admin/")
    try:
        httpx.post(DISCORD_WEBHOOK, json={"content": "\n".join(lines)[:1900]}, timeout=10).raise_for_status()
    except httpx.HTTPError as error:
        log.warning("디스코드 알림 실패: %s", error)


# --- 결과 저장 ---

def current(session: Session, course_id: int):
    """아직 전체 공개이고 분석 입력이 그대로인 코스와 분석. 바뀌었으면 (None, None)."""
    course = session.get(Course, course_id)
    insight = session.get(CourseInsight, course_id)
    if (not course or not insight or course.is_deleted or course.visibility != "public"
            or insight.input_hash != course_insight.input_hash(course)):
        return None, None
    return course, insight


def fail(session: Session, insight: CourseInsight, error: str):
    insight.ai_attempts += 1
    insight.ai_error = error[:300]
    insight.ai_job_id = None
    insight.ai_status = "pending" if insight.ai_attempts < MAX_ATTEMPTS else "failed"
    insight.updated_at = utc_now()
    session.add(insight)
    log.warning("코스 #%s AI 분석 실패 (%s회): %s", insight.course_id, insight.ai_attempts, error)


def confident(parsed: dict, warnings: list) -> bool:
    """검증 경고나 AI가 짚은 자료 문제가 없으면 신뢰할 만한 결과로 봅니다."""
    return not warnings and not parsed["data_issues"]


def finish(session: Session, course: Course, insight: CourseInsight, parsed: dict, warnings: list, provider: str, model: str):
    """검증한 응답을 저장합니다. 신뢰도가 낮으면 운영진 확인(검토 대기)을 거칩니다."""
    insight.feature_ko = parsed["feature_ko"]
    insight.route_ko = parsed["route_ko"]
    insight.themes_json = json.dumps(parsed["themes"])
    insight.issues_json = json.dumps(parsed["data_issues"] + warnings, ensure_ascii=False)
    insight.ai_hash = insight.input_hash
    insight.ai_provider, insight.ai_model = provider, model
    insight.prompt_version = course_insight.PROMPT_VERSION
    insight.ai_status = "published" if main.INSIGHT_AUTO_PUBLISH and confident(parsed, warnings) else "review"
    insight.ai_job_id = None
    insight.ai_error = None
    insight.updated_at = utc_now()
    session.add(insight)
    session.commit()
    log.info("코스 #%s AI 분석 완료 (%s %s) → %s", course.id, provider, model, insight.ai_status)
    notify(insight, course, warnings)


def defer(session: Session, insight: CourseInsight, error: str):
    """모든 AI가 일시적으로 실패: 시도 횟수는 그대로 두고 재시도 대기로 둡니다."""
    insight.ai_status = "queued"
    insight.ai_error = error[:300]
    insight.ai_job_id = None
    insight.ai_requested_at = utc_now()
    insight.updated_at = utc_now()
    session.add(insight)
    log.warning("코스 #%s AI 분석 재시도 대기: %s", insight.course_id, error)


def analyze(session: Session, course: Course, insight: CourseInsight) -> str | None:
    """브릿지 모델들 → Groq 순서로 요청합니다. 저장했거나 응답 형식 오류로 실패 처리했으면 None,
    모든 AI를 쓸 수 없어 재시도 대기로 넘겼으면 그 사유.
    신뢰도가 낮은 결과가 나오면 다음 모델로 한 번 더 시도하고, 끝내 깔끔한 결과가 없으면 첫 결과를 검토 대기로 둡니다."""
    analysis = course_geo.analyze_route(course.polylines_json, course.sport)
    rules = course_insight.rule_insight(analysis, course.sport)
    errors, bad_format = [], []
    candidate = None
    providers = []
    if bridge_enabled():
        for model in BRIDGE_MODELS:
            providers.append(("nvidia", model, lambda prompt, model=model: bridge_call(prompt, model)))
    if GROQ_KEY:
        providers.append(("groq", GROQ_MODEL, groq_call))
    for provider, model, call in providers:
        if candidate and provider == "groq":
            break  # 하루 한도가 있는 Groq는 쓸 만한 결과가 아직 없을 때만 씁니다.
        try:
            raw = call(insight.ai_prompt)
        except (httpx.HTTPError, RuntimeError, KeyError, IndexError, TypeError, ValueError) as error:
            errors.append(f"{model}: {error}")
            log.warning("코스 #%s %s 요청 실패: %s", course.id, model, error)
            continue
        parsed, warnings = course_insight.parse_response(raw, analysis, rules)
        if not parsed:
            problem = "; ".join(warnings) or "응답 형식 오류"
            bad_format.append(f"{model}: {problem}")
            log.warning("코스 #%s %s 응답 형식 오류: %s", course.id, model, problem)
            continue
        if confident(parsed, warnings):
            finish(session, course, insight, parsed, warnings, provider, model)
            return None
        log.info("코스 #%s %s 결과 신뢰도 낮음 (%s), 다음 모델로 다시 시도", course.id, model,
                 "; ".join(warnings + parsed["data_issues"]))
        candidate = candidate or (parsed, warnings, provider, model)
    if candidate:
        finish(session, course, insight, *candidate)
        return None
    if bad_format:
        # 응답은 받았지만 쓸 수 없었음: 시도 횟수를 세고, 거듭되면 실패로 둡니다.
        fail(session, insight, "; ".join(errors + bad_format))
        return None
    reason = "; ".join(errors) or "사용할 AI가 없음"
    defer(session, insight, reason)
    return reason


# --- 주기 작업 ---

def prepare_prompts(session: Session, rows: list):
    """장소를 찾아 AI에게 넘길 자료를 만듭니다 (아직 없는 코스만)."""
    need = [(insight, course) for insight, course in rows if not insight.ai_prompt]
    if not need:
        return
    analyses = {course.id: course_geo.analyze_route(course.polylines_json, course.sport) for _, course in need}
    places = {}
    if os.path.exists(OSM_PBF):
        try:
            import osm_places
            started = time.time()
            places = osm_places.find_places(OSM_PBF, {course.id: (analyses[course.id], course.sport) for _, course in need})
            log.info("장소 찾기 %d개 코스, %.0f초", len(need), time.time() - started)
        except Exception:
            log.exception("OSM 장소 찾기 실패 (장소 없이 진행)")
    else:
        log.warning("OSM 파일이 없어 장소 없이 진행합니다: %s", OSM_PBF)
    for insight, course in need:
        analysis = analyses[course.id]
        route = course_geo.sample_route(analysis, 60)
        areas = []
        for name in main.area_names(route[::6] + [route[-1]] if route else []):
            if name and name not in areas:
                areas.append(name)
        waypoints = [w.get("name") or w.get("note") for w in main.load_waypoints(course) if isinstance(w, dict)]
        rules = course_insight.rule_insight(analysis, course.sport)
        course_places = places.get(course.id, [])
        insight.places_json = json.dumps(course_places, ensure_ascii=False)
        insight.areas_json = json.dumps(areas, ensure_ascii=False)
        insight.ai_prompt = course_insight.build_prompt(course, analysis, rules, waypoints, areas, course_places)
        session.add(insight)
    session.commit()


def submit_pending() -> int:
    """분석할 코스를 한 묶음 처리하고, 실제로 AI에 요청한 코스 수를 돌려줍니다."""
    retry_before = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=RETRY_AFTER_S)).isoformat()
    with Session(engine) as session:
        due = (CourseInsight.ai_status == "pending") | (
            (CourseInsight.ai_status == "queued")
            & ((CourseInsight.ai_requested_at == None) | (CourseInsight.ai_requested_at < retry_before)))  # noqa: E711
        rows = session.exec(
            select(CourseInsight, Course).join(Course, Course.id == CourseInsight.course_id).where(
                due, Course.is_deleted == False, Course.visibility == "public")
            .order_by(CourseInsight.updated_at).limit(BATCH)).all()
        if not rows:
            return 0
        prepare_prompts(session, rows)
        deferred, handled = [], 0
        for insight, course in rows:
            course, insight = current(session, insight.course_id)
            if not course or not insight.ai_prompt:
                continue
            was_queued = insight.ai_status == "queued"
            reason = analyze(session, course, insight)
            session.commit()
            handled += 1
            # 이미 재시도 대기였던 코스는 다시 알리지 않습니다 (처음 넘어갈 때만 알림).
            if reason and not was_queued:
                deferred.append((course, reason))
        notify_deferred(deferred)
        return handled


def release_hidden():
    """재시도 대기 중 비공개로 바뀌거나 경로가 바뀐 코스는 대기에서 뺍니다 (다시 공개·저장할 때 새로 요청)."""
    with Session(engine) as session:
        ids = session.exec(select(CourseInsight.course_id).where(CourseInsight.ai_status == "queued")).all()
        for course_id in ids:
            insight = session.get(CourseInsight, course_id)
            course = session.get(Course, course_id)
            if insight and (not course or course.is_deleted or course.visibility != "public"):
                insight.ai_status, insight.ai_job_id = "pending", None
                session.add(insight)
        session.commit()


def run():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not bridge_enabled() and not GROQ_KEY:
        log.warning("JUNLAB_AI_BASE_URL·JUNLAB_AI_API_KEY와 GROQ_API_KEY가 모두 없어 AI 분석을 하지 않습니다.")
    log.info("코스 AI 분석 작업기 시작 (브릿지 %s, 모델 %s, Groq %s, 재시도 %.0f분, 자동 공개 %s)",
             "켜짐" if bridge_enabled() else "꺼짐", " → ".join(BRIDGE_MODELS), "켜짐" if GROQ_KEY else "꺼짐",
             RETRY_AFTER_S / 60, main.INSIGHT_AUTO_PUBLISH)
    while True:
        handled = 0
        try:
            if bridge_enabled() or GROQ_KEY:
                release_hidden()
                handled = submit_pending()
        except Exception:
            log.exception("작업 중 오류")
        # 방금 처리한 코스가 있으면 남은 코스를 바로 이어서 처리합니다.
        if not handled:
            time.sleep(IDLE_S)


if __name__ == "__main__":
    run()
