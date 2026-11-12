"""관리자 'SEO 테스트': 검색어를 넣으면 검색엔진이 우리 코스 페이지를 어떻게 볼지 흉내 내어 순위를 매깁니다.

실제 구글·빙·네이버 순위가 아니라, 검색엔진이 읽는 것과 같은 텍스트(페이지 제목·설명·본문)로
'이 검색어에 우리 페이지 중 무엇이, 얼마나 맞는지'를 보여줍니다. 실제 순위는 색인 여부, 다른 사이트와의 경쟁,
링크·클릭 신호에 따라 달라집니다. DB나 웹 요청에 의존하지 않습니다 (main.py가 문서를 만들어 넘깁니다).
"""
import re

# 검색어 표현 → 같은 뜻으로 보는 말 (문서 쪽 표현)
SYNONYMS = {
    "러닝": ("러닝", "달리기", "런", "조깅", "뛰기", "뛸", "달릴", "마라톤", "running", "run"),
    "자전거": ("자전거", "라이딩", "사이클", "싸이클", "로드", "라이드", "cycling", "bike", "그란폰도"),
    "순환": ("순환", "순환런", "루프", "한바퀴", "한 바퀴", "loop"),
    "왕복": ("왕복",),
    "편도": ("편도",),
    "평지": ("평지", "무언덕", "언덕없는", "평탄", "flat"),
    "언덕": ("언덕", "업힐", "오르막", "힐", "고갯길", "산길", "hill"),
    "공원": ("공원", "park"),
    "호수": ("호수", "저수지", "lake"),
    "강변": ("강변", "천변", "하천", "한강", "river"),
    "gpx": ("gpx", "지피엑스", "fit", "tcx", "코스파일", "코스 파일"),
}
SPORT_WORDS = {"러닝": "run", "자전거": "bike"}
PLACE_CONCEPTS = {"공원", "호수", "강변"}
TERRAIN_WORDS = {"평지": ("flat",), "언덕": ("rolling", "hilly", "mountain")}
SHAPE_WORDS = {"순환": "loop", "왕복": "out_and_back", "편도": "point_to_point"}
# 어디에나 붙어 순위를 가르지 못하는 말
STOPWORDS = {"코스", "추천", "근처", "주변", "좋은", "곳", "길", "어디", "코스추천", "추천해줘", "알려줘", "찾기", "인근", "부근"}
JOSA = ("에서", "에서의", "으로", "부터", "까지", "근처", "주변", "의", "에", "로", "을", "를", "은", "는", "이", "가")
DISTANCE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(km|키로|킬로|k)\b", re.I)
NAMED_DISTANCES = {"하프": 21.1, "풀코스": 42.2, "마라톤": 42.2, "10k": 10.0, "5k": 5.0}

FIELD_WEIGHTS = {"title": 3.0, "description": 2.0, "body": 1.0}


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def strip_josa(token: str) -> str:
    for suffix in JOSA:
        if len(token) > len(suffix) + 1 and token.endswith(suffix):
            return token[: -len(suffix)]
    return token


def parse_query(query: str) -> dict:
    """검색어 → 일반 낱말, 뜻으로 묶인 낱말(종목·지형·형태 등), 거리 조건"""
    text = normalize(query)
    distance = None
    match = DISTANCE_RE.search(text)
    if match:
        distance = float(match.group(1))
        text = text.replace(match.group(0), " ")
    for word, km in NAMED_DISTANCES.items():
        if word in text:
            distance = distance or km
    terms, concepts, ignored = [], [], []
    # 긴 표현부터 찾아 지웁니다 ('무언덕'을 '언덕'으로 다시 읽지 않도록).
    vocabulary = sorted(((w, key) for key, words in SYNONYMS.items() for w in words), key=lambda item: -len(item[0]))
    for raw in text.split():
        token = strip_josa(raw)
        if token in STOPWORDS:
            ignored.append(raw)
            continue
        rest = token
        for word, key in vocabulary:
            if word in rest:
                if key not in concepts:
                    concepts.append(key)
                # 장소를 뜻하는 말(공원·호수·강변)은 '광교호수공원'처럼 이름의 일부라 검색어에 남깁니다.
                if key not in PLACE_CONCEPTS:
                    rest = rest.replace(word, " ")
        # '순환런'·'한강런'처럼 '~런'으로 끝나면 러닝 코스를 찾는 말입니다.
        if token.endswith("런") and "러닝" not in concepts:
            concepts.append("러닝")
        for word in sorted(STOPWORDS, key=len, reverse=True):
            rest = rest.replace(word, " ")
        for part in rest.split():
            part = strip_josa(part)
            if part and part not in STOPWORDS and part not in NAMED_DISTANCES:
                terms.append(part)
    return {"terms": list(dict.fromkeys(terms)), "concepts": concepts, "distance": distance, "ignored": ignored}


def field_hit(term: str, fields: dict) -> str | None:
    """낱말이 가장 무게가 큰 어느 칸에 있는지"""
    for name in ("title", "description", "body"):
        if term and term in fields[name]:
            return name
    return None


def score_document(query: dict, doc: dict) -> dict:
    """doc: {"fields": {"title","description","body"}(소문자), "sport", "terrain", "shape", "distance_km"}"""
    fields = doc["fields"]
    score, matched, missing, notes = 0.0, [], [], []
    for term in query["terms"]:
        hit = field_hit(term, fields)
        # '광교' 대신 '광교호수공원'처럼 붙여 쓴 검색어도 문서의 지역·장소 이름이 들어 있으면 맞은 것으로 봅니다.
        if not hit:
            inner = [name for name in doc.get("names", []) if len(name) >= 2 and name in term]
            if inner:
                hit = field_hit(inner[0], fields)
        if hit:
            score += FIELD_WEIGHTS[hit] * (1.3 if term in doc.get("names", []) else 1.0)
            matched.append({"term": term, "field": hit})
        else:
            missing.append(term)
    for concept in query["concepts"]:
        words = SYNONYMS[concept]
        hit = next((field_hit(w, fields) for w in words if field_hit(w, fields)), None)
        ok = bool(hit)
        if concept in SPORT_WORDS:
            ok = doc["sport"] == SPORT_WORDS[concept]
            if not ok:
                score -= 4
                notes.append(f"종목이 달라요 ({'러닝' if doc['sport'] == 'run' else '자전거'} 코스)")
        elif concept in TERRAIN_WORDS:
            ok = doc.get("terrain") in TERRAIN_WORDS[concept]
        elif concept in SHAPE_WORDS:
            ok = doc.get("shape") == SHAPE_WORDS[concept]
        if ok:
            score += FIELD_WEIGHTS.get(hit, 1.5) if hit else 1.5
            matched.append({"term": concept, "field": hit or "data"})
        else:
            missing.append(concept)
    if query["distance"]:
        target, actual = query["distance"], doc.get("distance_km") or 0
        closeness = max(0.0, 1 - abs(actual - target) / max(target * 0.5, 1.0))
        score += 3 * closeness
        if closeness > 0.6:
            matched.append({"term": f"{target:g}km", "field": "data"})
        else:
            missing.append(f"{target:g}km")
            notes.append(f"거리 {actual:.1f}km")
    # 지역·장소 같은 낱말을 하나도 담지 않은 페이지는 종목·거리만 맞아도 이 검색어의 결과로 보지 않습니다.
    if query["terms"] and all(term in missing for term in query["terms"]):
        return {"score": 0, "coverage": 0, "matched": matched, "missing": missing, "notes": notes}
    wanted = len(query["terms"]) + len(query["concepts"]) + (1 if query["distance"] else 0)
    coverage = (wanted - len(missing)) / wanted if wanted else 0
    return {"score": round(max(score, 0) * (0.4 + 0.6 * coverage), 2), "coverage": round(coverage, 2),
            "matched": matched, "missing": missing, "notes": notes}


def text_units(text: str) -> float:
    """검색 결과에서 차지하는 대략적인 폭 (한글 1, 영문·숫자·기호 0.55)"""
    return sum(1.0 if ord(ch) > 0x2E80 else 0.55 for ch in text or "")


def snippet_checks(title: str, description: str) -> list:
    """검색 결과에서 잘리거나 부족해 보일 수 있는 점 (대략적인 기준)"""
    checks = []
    if text_units(title) > 32:
        checks.append("제목이 길어 구글 검색 결과에서 뒤가 잘릴 수 있어요 (한글 약 32자)")
    if text_units(description) > 80:
        checks.append("설명이 길어 검색 결과에서 뒤가 잘릴 수 있어요 (한글 약 80자)")
    if text_units(description) < 30:
        checks.append("설명이 짧아요. 위치·거리·특징을 더 담으면 좋아요")
    return checks


def search(query_text: str, docs: list, limit: int = 10) -> dict:
    query = parse_query(query_text)
    results = []
    for doc in docs:
        result = score_document(query, doc)
        if result["score"] > 0 and result["coverage"] > 0:
            results.append({**doc["page"], **result, "checks": snippet_checks(doc["page"]["title"], doc["page"]["description"])})
    results.sort(key=lambda r: (-r["score"], -r["coverage"]))
    return {"query": query, "total": len(results), "indexed": len(docs), "results": results[:limit]}
