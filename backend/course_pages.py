"""검색 로봇과 방문자에게 동일한 코스 HTML을 제공합니다."""
import json
import math
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

try:
    from . import course_insight
except ImportError:
    import course_insight

environment = Environment(loader=FileSystemLoader(Path(__file__).parent / 'templates'), autoescape=select_autoescape(['html']))


def insight_page_view(insight, sport_code):
    """insight_view() 결과를 랜딩 페이지에 보여줄 한글 문구로 바꿉니다. 규칙 기반 값과 AI 문장을 나눠 둡니다."""
    if not insight:
        return None
    level = insight.get("difficulty")
    tags = [course_insight.DISTANCE_KO.get(insight.get("distance")), course_insight.SHAPE_KO.get(insight.get("shape")),
            course_insight.TERRAIN_KO.get(insight.get("terrain"))]
    themes = [course_insight.THEME_KO[t] for t in insight.get("themes") or [] if t in course_insight.THEME_KO]
    return {
        "level": level if level in course_insight.LEVEL_LABELS else None,
        "level_label": course_insight.LEVEL_LABELS.get(level),
        "level_desc": course_insight.LEVEL_DESCRIPTIONS.get(sport_code, {}).get(level, ""),
        "tags": [t for t in tags if t],
        "training": [course_insight.TRAINING_KO.get(t, t) for t in insight.get("training") or []],
        "themes": themes,
        "feature": insight.get("feature"),
        "route": insight.get("route"),
        "ai_state": insight.get("ai_state"),
    }

# --- 검색 노출용 위치·코스 특징 ---
# 코스가 지나는 법정동(카카오), 주변 장소(OSM), 규칙 분석(거리·형태·지형)으로 검색어에 맞는 제목·설명·본문을 만듭니다.
# 키워드를 늘어놓지 않고 실제 데이터로 확인한 사실만 씁니다.

SIDO_SHORT = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천", "광주광역시": "광주",
    "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기", "강원특별자치도": "강원",
    "강원도": "강원", "충청북도": "충북", "충청남도": "충남", "전북특별자치도": "전북", "전라북도": "전북",
    "전라남도": "전남", "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주",
}
METRO_SIDO = {"서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"}
SHAPE_TITLE = {"loop": "순환", "out_and_back": "왕복", "point_to_point": "편도"}
# 검색 수요가 큰 순서 (공원·호수·강 → 해변·트랙 → 산). 그 밖의 장소는 뒤로 갑니다.
PLACE_KINDS = ("leisure=park", "natural=water", "waterway=river", "natural=beach", "leisure=track", "natural=peak")


def parse_area(name):
    """'경기도 수원시 영통구 하동' → {'sido': '경기', 'city': '수원', 'gu': '영통구', 'dong': '하동'}"""
    parts = (name or "").split()
    if not parts:
        return None
    sido = SIDO_SHORT.get(parts[0], parts[0])
    city = gu = dong = None
    for part in parts[1:]:
        if part.endswith("시") and not city:
            city = part[:-1]
        elif part.endswith(("구", "군")) and not gu:
            gu = part
        elif part.endswith(("동", "읍", "면", "가", "리")):
            dong = dong or part
    if sido in METRO_SIDO:
        city = sido
    return {"sido": sido, "city": city, "gu": gu, "dong": dong}


def region_view(area_names):
    """지나는 동네 목록 → 대표 지역 이름과 화면용 위치 문구."""
    parsed = [a for a in (parse_area(n) for n in area_names) if a and a["city"]]
    if not parsed:
        return None
    cities = list(dict.fromkeys(a["city"] for a in parsed))
    main_city = max(cities, key=lambda c: sum(a["city"] == c for a in parsed))
    gus = list(dict.fromkeys(a["gu"] for a in parsed if a["city"] == main_city and a["gu"]))
    dongs = list(dict.fromkeys(a["dong"] for a in parsed if a["dong"]))
    first = next(a for a in parsed if a["city"] == main_city)
    # 제목에 쓸 짧은 지역 이름: 수원 영통구 / 서울 영등포구 / 춘천 / 원주·충주
    if len(cities) > 1 and len(gus) <= 1:
        short = "·".join(cities[:2])
    else:
        short = " ".join(x for x in (main_city, gus[0] if gus else None) if x)
    sido_label = "" if first["sido"] == main_city else first["sido"] + " "
    full = f"{sido_label}{main_city}{'시' if first['sido'] not in METRO_SIDO else ''} {', '.join(gus[:3])}".strip()
    return {"short": short, "full": full, "sido": first["sido"], "city": main_city, "gus": gus[:3], "cities": cities[:4],
            "dongs": dongs[:6]}


def course_keywords(region, sport_label, shape, terrain, km, places):
    """페이지 아래 '관련 키워드' (데이터로 확인한 것만, 최대 6개)"""
    words = []
    if region:
        words.append(f"{region['city']} {sport_label} 코스")
        words += [f"{gu} {sport_label} 코스" for gu in region["gus"][:1]]
    words += [f"{p['name']} {sport_label}" for p in places[:2]]
    if shape:
        words.append(f"{shape} {sport_label} 코스")
    if terrain == "flat":
        words.append(f"평지 {sport_label} 코스")
    if km:
        words.append(f"{round(km)}km {sport_label} 코스")
    return list(dict.fromkeys(words))[:6]


def format_km(km):
    return f"{km:.1f}" if km < 100 else f"{km:.0f}"


def seo_view(course, stats, insight=None, place_data=None):
    """검색용 제목·설명·위치 정보. 전체 공개 코스는 분석 결과의 지역·장소·형태·지형을 씁니다.
    공유 페이지와 관리자 SEO 테스트가 함께 씁니다. insight는 insight_view() 결과입니다."""
    sport = '러닝' if course.sport == 'run' else '자전거'
    place_data = place_data or {"areas": [], "places": []}
    region = region_view(place_data["areas"])
    km = stats["distance_km"]
    shape = SHAPE_TITLE.get((insight or {}).get("shape"))
    terrain = (insight or {}).get("terrain")
    terrain_ko = course_insight.TERRAIN_KO.get(terrain)
    level = (insight or {}).get("difficulty")
    seen, places = set(), []
    rank = {kind: i for i, kind in enumerate(PLACE_KINDS)}
    for place in sorted(place_data["places"], key=lambda p: rank.get(p.get("kind"), len(PLACE_KINDS))):
        if place["name"] not in seen:
            seen.add(place["name"]); places.append(place)
    places = places[:6]
    kind_words = " ".join(x for x in (f"{format_km(km)}km" if km else None, shape) if x)
    # 검색 결과 제목은 한글 30자 안팎에서 잘립니다. 사이트 이름(Trazo)은 검색엔진이 따로 보여주므로 붙이지 않고,
    # 코스 이름에 이미 있는 '순환' 같은 말은 되풀이하지 않습니다.
    title_kind = " ".join(x for x in (f"{format_km(km)}km" if km else None, shape if shape and shape not in course.title else None) if x)
    page_title = f'{course.title} – {(region["short"] + " ") if region else ""}{title_kind} {sport} 코스'
    lead = f'{region["full"]} ' if region else ''
    sentences = [f'{lead}{kind_words} {sport} 코스.']
    facts = [x for x in (terrain_ko, f'상승 {stats["ascent_m"]:,}m' if stats["ascent_m"] else None,
                         f'난이도 {course_insight.LEVEL_LABELS[level]}' if level in course_insight.LEVEL_LABELS else None) if x]
    if facts:
        sentences.append(', '.join(facts) + '.')
    if places:
        sentences.append('·'.join(p['name'] for p in places[:3]) + ' 경유.')
    sentences.append('고도 그래프·GPX 무료 다운로드.')
    summary = ' '.join(sentences)
    return {"page_title": page_title, "summary": summary, "region": region, "places": places, "shape": shape,
            "terrain": terrain, "terrain_ko": terrain_ko, "keywords": course_keywords(region, sport, shape, terrain, km, places)}


def render_course_page(course, stats, nickname, related, insight=None, place_data=None):
    segments = [[p for p in segment if all(isinstance(p.get(k), (int, float)) and math.isfinite(p[k]) for k in ('lat', 'lng'))]
                for segment in json.loads(course.polylines_json)]
    segments = [segment for segment in segments if segment]
    points = [p for segment in segments for p in segment]
    sampled = points[::max(1, len(points) // 600)]
    if points and (not sampled or sampled[-1] != points[-1]): sampled.append(points[-1])
    route_svg = ''
    if sampled:
        latitude = sum(p['lat'] for p in sampled) / len(sampled)
        coords = [(p['lng'] * math.cos(math.radians(latitude)), -p['lat']) for p in sampled]
        xs, ys = zip(*coords)
        scale = min(720 / max(max(xs)-min(xs), 0.00001), 360 / max(max(ys)-min(ys), 0.00001))
        route_svg = ' '.join(f'{400+(x-(min(xs)+max(xs))/2)*scale:.1f},{220+(y-(min(ys)+max(ys))/2)*scale:.1f}' for x,y in coords)
    elevations = [p['ele'] for p in sampled if isinstance(p.get('ele'), (int,float)) and math.isfinite(p['ele'])]
    low, high = (min(elevations), max(elevations)) if elevations else (0,0)
    elevation_svg = ' '.join(f'{20+i*760/max(len(elevations)-1,1):.1f},{140-(e-low)*120/max(high-low,1):.1f}' for i,e in enumerate(elevations))
    sport = '러닝' if course.sport == 'run' else '자전거'
    # JSON script에 사용자 입력을 넣지 않으며, 스크립트 종료 문자도 이스케이프합니다.
    map_segments = [segment[::max(1,len(segment)//1000)] + ([segment[-1]] if len(segment)>1 else []) for segment in segments]
    # 고도 프로필에 표시할 웨이포인트 (위치·종류·이름만)
    try:
        raw_waypoints = json.loads(course.waypoints_json or '[]')
    except ValueError:
        raw_waypoints = []
    waypoints = [{k: w[k] for k in ('lat', 'lng', 'type', 'name') if k in w} for w in raw_waypoints if isinstance(w, dict)
                 and all(isinstance(w.get(k), (int, float)) and math.isfinite(w[k]) for k in ('lat', 'lng'))] if isinstance(raw_waypoints, list) else []
    seo = seo_view(course, stats, insight, place_data)
    page_title, summary, region, places = seo["page_title"], seo["summary"], seo["region"], seo["places"]
    page_url = f'https://trazo.runvia.app/c/{course.share_token}'
    start = points[0] if points else None
    place_ld = {"@type": "Place", "name": course.title}
    if region:
        place_ld["address"] = {"@type": "PostalAddress", "addressCountry": "KR", "addressRegion": region["sido"],
                               "addressLocality": " ".join(x for x in (region["city"], region["gus"][0] if region["gus"] else None) if x)}
    if start:
        place_ld["geo"] = {"@type": "GeoCoordinates", "latitude": round(start["lat"], 5), "longitude": round(start["lng"], 5)}
    json_ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebPage", "name": page_title, "description": summary, "url": page_url,
         "inLanguage": "ko", "about": place_ld, "isPartOf": {"@type": "WebSite", "name": "Trazo", "url": "https://trazo.runvia.app/"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Trazo", "item": "https://trazo.runvia.app/"},
            {"@type": "ListItem", "position": 2, "name": "커뮤니티 코스", "item": "https://trazo.runvia.app/community"},
            {"@type": "ListItem", "position": 3, "name": course.title, "item": page_url}]},
    ]}
    return environment.get_template('course.html').render(
        page_title=page_title, region=region, places=places, shape=seo["shape"], terrain_ko=seo["terrain_ko"],
        keywords=seo["keywords"],
        gpx_url=f'/c/{course.share_token}.gpx',
        json_ld=json.dumps(json_ld, ensure_ascii=False).replace('<', '\\u003c'),
        title=course.title, description=course.description, nickname=nickname or '라이더', sport=sport,
        visibility='전체 공개' if course.visibility=='public' else '부분 공개',
        robots='index, follow, max-image-preview:large' if course.visibility=='public' else 'noindex, follow',
        url=page_url, summary=summary,
        distance=f'{stats["distance_km"]:.2f}', ascent=f'{stats["ascent_m"]:,}', copies=course.share_count,
        start_url=f'/?course={course.share_token}&action=save', view_url=f'/?course={course.share_token}',
        route_svg=route_svg, elevation_svg=elevation_svg, min_ele=round(low), max_ele=round(high),
        map_json=json.dumps(map_segments).replace('<','\\u003c'), waypoints_json=json.dumps(waypoints, ensure_ascii=False).replace('<','\\u003c'),
        sport_code='run' if course.sport == 'run' else 'bike', related=related, insight=insight_page_view(insight, 'run' if course.sport == 'run' else 'bike'))
