# 육상 트랙: OpenStreetMap에서 공공 트랙을 가져오고, 지도에 그릴 트랙 모양을 만듭니다.
# DB·API는 main.py에 있고, 여기에는 네트워크 요청과 순수 계산만 둡니다.
import math
import re
import time
from typing import Iterable, Optional

import httpx

# 주 서버가 바쁘면(429·502·504) 미러로 넘어갑니다.
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
USER_AGENT = "Trazo/1.0 (+https://trazo.runvia.app)"

# 공원·경기장·체육시설 안의 육상 트랙과 이름이 있는 육상 트랙을 고르고, 트랙이 들어 있는 시설·행정구역도 함께 받습니다.
# 학교 운동장은 대부분 외부인이 쓸 수 없어 가져온 뒤 거릅니다.
TRACK_QUERY = """
[out:json][timeout:280];
area["ISO3166-1"="KR"][admin_level=2]->.kr;
(way["leisure"~"^(stadium|sports_centre|park)$"](area.kr);relation["leisure"~"^(stadium|sports_centre|park)$"](area.kr);)->.venues;
.venues map_to_area->.va;
(way["leisure"="track"]["sport"~"athletics|running"](area.va);
 relation["leisure"="track"]["sport"~"athletics|running"](area.va);
 way["leisure"="track"]["sport"~"athletics|running"]["name"](area.kr);)->.t;
.t out geom;
node(w.t)->.tn;
.tn is_in->.ins;
(way(pivot.ins);relation(pivot.ins);)->.containers;
.containers out tags bb;
"""

VENUE_LEISURE = {"stadium", "sports_centre", "park", "sports_hall", "recreation_ground"}
SCHOOL_AMENITY = {"school", "kindergarten"}
GENERIC_NAME = re.compile(r"^(?:\d+\s*m\s*)?(?:육상\s*)?(?:트랙|운동장(?:\s*트랙)?|track|running track|playground.*|축구장|400m.*)$", re.IGNORECASE)
MAX_PATH_POINTS = 160
# 육상 트랙 모양만 남깁니다. 공중보행로·산책로·공원 둘레 조깅 코스도 leisure=track으로 그려진 경우가 있어,
# 닫힌 고리이고 한 바퀴가 이 범위이며 타원에 가까운(가늘고 길지 않은) 것만 육상 트랙으로 봅니다.
# 1레인 400m 트랙은 바깥 둘레를 그리면 480~550m까지 나옵니다. 200m 트랙은 180m 안팎으로 그려지기도 합니다.
TRACK_LENGTH_RANGE = (180, 560)
# 4πA/P² (원 1, 400m 표준 트랙 약 0.8, 가는 보행로는 0.2 이하)
MIN_COMPACTNESS = 0.55
CLOSED_GAP_M = 15
NOT_TRACK_NAME = re.compile(r"보행로|산책로|둘레길|데크|보도|산책길|조깅|경마|승마|자전거|walkway|promenade|trail", re.IGNORECASE)
# 남·서·북·동. 국경 영역 계산이 어긋나 다른 나라 트랙이 섞여 들어오는 것을 막습니다.
KOREA_BOX = (32.8, 124.0, 38.9, 132.0)


def fetch_overpass(query: str = TRACK_QUERY, timeout: float = 300) -> dict:
    last_error: Optional[Exception] = None
    for attempt, url in enumerate(OVERPASS_URLS * 2):
        try:
            response = httpx.post(url, data={"data": query}, headers={"User-Agent": USER_AGENT}, timeout=timeout)
            if response.status_code == 200 and response.headers.get("content-type", "").startswith("application/json"):
                return response.json()
            last_error = RuntimeError(f"{url} → HTTP {response.status_code}")
        except (httpx.HTTPError, ValueError) as error:
            last_error = error
        time.sleep(min(30, 5 * (attempt + 1)))
    raise RuntimeError(f"Overpass 요청 실패: {last_error}")


def haversine_m(a: tuple, b: tuple) -> float:
    lat1, lng1 = map(math.radians, a)
    lat2, lng2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def path_length_m(path: list) -> float:
    return sum(haversine_m(path[i], path[i + 1]) for i in range(len(path) - 1))


def thin_path(path: list, limit: int = MAX_PATH_POINTS) -> list:
    if len(path) <= limit:
        return path
    step = math.ceil(len(path) / limit)
    thinned = path[::step]
    return thinned if thinned[-1] == path[-1] else thinned + [path[-1]]


def _ring(element: dict) -> Optional[list]:
    """way는 그대로, relation(멀티폴리곤)은 가장 긴 바깥 고리를 트랙 선으로 씁니다."""
    if element.get("geometry"):
        return [(p["lat"], p["lon"]) for p in element["geometry"]]
    best = None
    for member in element.get("members", []):
        if member.get("role") not in ("outer", "") or not member.get("geometry"):
            continue
        points = [(p["lat"], p["lon"]) for p in member["geometry"]]
        if best is None or path_length_m(points) > path_length_m(best):
            best = points
    return best


def compactness(ring: list) -> float:
    """닫힌 고리가 얼마나 둥근지 (4πA/P²). 위경도를 가운데 기준 평면 좌표(m)로 바꿔 넓이를 셉니다."""
    lat0 = sum(p[0] for p in ring) / len(ring)
    k = math.cos(math.radians(lat0))
    xy = [((lng - ring[0][1]) * 111320 * k, (lat - ring[0][0]) * 111320) for lat, lng in ring]
    area = abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(xy, xy[1:] + xy[:1]))) / 2
    perimeter = path_length_m(ring)
    return 4 * math.pi * area / perimeter ** 2 if perimeter else 0


def is_athletics_track(ring: list, name: str = "") -> bool:
    if name and NOT_TRACK_NAME.search(name):
        return False
    if haversine_m(ring[0], ring[-1]) > CLOSED_GAP_M:
        return False
    length = path_length_m(ring)
    return TRACK_LENGTH_RANGE[0] <= length <= TRACK_LENGTH_RANGE[1] and compactness(ring) >= MIN_COMPACTNESS


def _box_area(bounds: dict) -> float:
    return (bounds["maxlat"] - bounds["minlat"]) * (bounds["maxlon"] - bounds["minlon"])


def _contains(bounds: dict, lat: float, lng: float) -> bool:
    return bounds["minlat"] <= lat <= bounds["maxlat"] and bounds["minlon"] <= lng <= bounds["maxlon"]


def parse_tracks(data: dict) -> list[dict]:
    """Overpass 결과를 Track 행으로 바꿀 값 목록으로 정리합니다."""
    elements = data.get("elements", [])
    tracks, containers, seen = [], [], set()
    for element in elements:
        tags = element.get("tags", {})
        ref = f"{element['type']}/{element['id']}"
        if tags.get("leisure") == "track" and (element.get("geometry") or element.get("members")):
            if ref not in seen:
                seen.add(ref)
                tracks.append(element)
        elif element.get("bounds") and tags:
            containers.append(element)

    results = []
    for element in tracks:
        tags = element["tags"]
        ring = _ring(element)
        if not ring or len(ring) < 4:
            continue
        lat = sum(p[0] for p in ring) / len(ring)
        lng = sum(p[1] for p in ring) / len(ring)
        if not (KOREA_BOX[0] <= lat <= KOREA_BOX[2] and KOREA_BOX[1] <= lng <= KOREA_BOX[3]):
            continue
        if not is_athletics_track(ring, tags.get("name", "")):
            continue
        around = sorted((c for c in containers if _contains(c["bounds"], lat, lng) and c["id"] != element["id"]), key=lambda c: _box_area(c["bounds"]))
        # 학교 운동장 트랙은 외부인이 쓰기 어려워 뺍니다 (대학교는 둡니다).
        if any(c["tags"].get("amenity") in SCHOOL_AMENITY for c in around):
            continue
        venue = next((c["tags"]["name"] for c in around if c["tags"].get("name") and (
            c["tags"].get("leisure") in VENUE_LEISURE or c["tags"].get("amenity") in {"university", "college"})), None)
        region = next((c["tags"]["name"] for c in around if c["tags"].get("boundary") == "administrative" and c["tags"].get("admin_level") in {"6", "7"} and c["tags"].get("name")), None)
        own = (tags.get("name:ko") or tags.get("name") or "").strip()
        if own and not GENERIC_NAME.match(own):
            name = own
        elif venue:
            name = venue
        else:
            name = f"{region} 육상 트랙" if region else "육상 트랙"
        length = path_length_m(ring)
        # 트랙 넓이 전체를 그린 면(area=yes)은 바깥 둘레라 1레인보다 깁니다. 370m 이상이면 400m 트랙으로 봅니다.
        lap = 400 if length >= 370 else (200 if 180 <= length <= 215 else round(length / 10) * 10)
        lanes = tags.get("lanes")
        results.append({
            "osm_ref": f"{element['type']}/{element['id']}",
            "name": name[:60],
            "region": region,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "path": [[round(a, 6), round(b, 6)] for a, b in thin_path(ring)],
            "length_m": lap,
            "lanes": int(lanes) if lanes and lanes.isdigit() else None,
            "surface": tags.get("surface"),
        })
    return results


def oval_path(lat: float, lng: float, bearing_deg: float = 0, lap_m: float = 400, points: int = 72) -> list:
    """표준 400m 트랙 비율(직선 84.39m, 곡선 반지름 36.5m)로 1레인 모양의 타원을 만듭니다. bearing은 직선 방향(북쪽 0°, 시계 방향)."""
    scale = lap_m / 400
    straight, radius = 84.39 * scale, 36.5 * scale
    half = straight / 2
    local = []
    per_curve = points // 2
    # 직선 방향을 x축으로 두고, 오른쪽 곡선 → 왼쪽 곡선 순서로 점을 찍습니다.
    for i in range(per_curve + 1):
        angle = -math.pi / 2 + math.pi * i / per_curve
        local.append((half + radius * math.cos(angle), radius * math.sin(angle)))
    for i in range(per_curve + 1):
        angle = math.pi / 2 + math.pi * i / per_curve
        local.append((-half + radius * math.cos(angle), radius * math.sin(angle)))
    local.append(local[0])
    theta = math.radians(bearing_deg)
    meters_lat = 111320.0
    meters_lng = 111320.0 * math.cos(math.radians(lat))
    path = []
    for x, y in local:
        # x(직선 방향)를 bearing 방향으로, y를 그 왼쪽 직각 방향으로 돌립니다.
        north = x * math.cos(theta) - y * math.sin(theta)
        east = x * math.sin(theta) + y * math.cos(theta)
        path.append([round(lat + north / meters_lat, 6), round(lng + east / meters_lng, 6)])
    return path


def in_bounds(items: Iterable[dict], south: float, west: float, north: float, east: float) -> list:
    return [item for item in items if south <= item["lat"] <= north and west <= item["lng"] <= east]
