"""코스 경로를 AI가 쓰기 좋은 숫자(거리·고도·경사·위치)로 요약합니다. DB나 웹 요청에 의존하지 않습니다."""
import json
import math
from bisect import bisect_left

EARTH_RADIUS_M = 6371000
# 경사는 100m마다 계산합니다. 점 사이 간격이 짧으면 고도 잡음 때문에 경사가 크게 튑니다.
GRADE_STEP_M = 100
# 종목별 경사 구간 기준 (README의 경사 구간 표시와 같습니다): 평지 · 완만 · 보통 · 급경사
GRADE_BANDS = {"bike": (3, 6, 10), "run": (2, 5, 8)}
# 이 거리 안에서 끝나면 출발점으로 돌아오는 코스로 봅니다.
RETURN_RADIUS_M = 300
# 근처 검색에 쓰는 경로 점은 이 간격보다 촘촘하게 남기지 않습니다.
NEAR_SAMPLE_M = 150
NEAR_SAMPLE_MAX = 400


def haversine(lat1, lng1, lat2, lng2):
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((phi2 - phi1) / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def valid_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def route_points(polylines_json: str) -> list:
    try:
        segments = json.loads(polylines_json)
    except (TypeError, ValueError):
        return []
    if not isinstance(segments, list):
        return []
    points = []
    for segment in segments:
        if not isinstance(segment, list):
            continue
        for p in segment:
            if (isinstance(p, dict) and valid_number(p.get("lat")) and valid_number(p.get("lng"))
                    and -90 <= p["lat"] <= 90 and -180 <= p["lng"] <= 180):
                points.append((p["lat"], p["lng"], p["ele"] if valid_number(p.get("ele")) else None))
    return points


def interpolate(km_list, values, target):
    i = bisect_left(km_list, target)
    if i <= 0:
        return values[0]
    if i >= len(km_list):
        return values[-1]
    span = km_list[i] - km_list[i - 1]
    t = (target - km_list[i - 1]) / span if span else 0
    return values[i - 1] + (values[i] - values[i - 1]) * t


def round_point(lat, lng):
    return {"lat": round(lat, 5), "lng": round(lng, 5)}


def classify_route(points, cumulative, total):
    """순환(loop) · 왕복(out_and_back) · 편도(point_to_point)를 구분합니다."""
    if total < 500:
        return "point_to_point"
    start, end = points[0], points[-1]
    if haversine(start[0], start[1], end[0], end[1]) > RETURN_RADIUS_M:
        return "point_to_point"
    # 왕복 코스는 갈 때와 올 때 같은 길을 지나므로 a% 지점과 (100-a)% 지점이 가깝습니다.
    lats = [p[0] for p in points]
    lngs = [p[1] for p in points]
    close = 0
    for fraction in (0.1, 0.2, 0.3, 0.4):
        a = (interpolate(cumulative, lats, total * fraction), interpolate(cumulative, lngs, total * fraction))
        b = (interpolate(cumulative, lats, total * (1 - fraction)), interpolate(cumulative, lngs, total * (1 - fraction)))
        close += haversine(a[0], a[1], b[0], b[1]) < 120
    return "out_and_back" if close >= 3 else "loop"


def analyze_route(polylines_json: str, sport: str = "bike") -> dict:
    """경로 하나를 요약합니다. 경로가 없으면 거리 0인 결과를 돌려줍니다."""
    points = route_points(polylines_json)
    if len(points) < 2:
        return {"distance_km": 0.0, "ascent_m": 0, "descent_m": 0, "route_type": "point_to_point",
                "start": round_point(*points[0][:2]) if points else None, "end": None, "bounds": None,
                "has_elevation": False, "elevation": None, "grades": None, "climbs": [], "splits": [],
                "_cumulative": [0.0] * len(points), "_points": points, "_near": [p[:2] for p in points]}
    cumulative = [0.0]
    for a, b in zip(points, points[1:]):
        cumulative.append(cumulative[-1] + haversine(a[0], a[1], b[0], b[1]))
    total = cumulative[-1]
    elevations = [p[2] for p in points]
    has_elevation = sum(e is not None for e in elevations) >= len(points) * 0.8
    ascent = descent = 0.0
    if has_elevation:
        # 고도가 빠진 점은 앞 점의 고도로 채웁니다.
        filled, last = [], next(e for e in elevations if e is not None)
        for e in elevations:
            last = e if e is not None else last
            filled.append(last)
        elevations = filled
        for a, b in zip(elevations, elevations[1:]):
            if b > a:
                ascent += b - a
            else:
                descent += a - b
    lats = [p[0] for p in points]
    lngs = [p[1] for p in points]
    result = {
        "distance_km": round(total / 1000, 2),
        "ascent_m": round(ascent),
        "descent_m": round(descent),
        "route_type": classify_route(points, cumulative, total),
        "start": round_point(*points[0][:2]),
        "end": round_point(*points[-1][:2]),
        "bounds": {"south": round(min(lats), 5), "west": round(min(lngs), 5),
                   "north": round(max(lats), 5), "east": round(max(lngs), 5)},
        "has_elevation": has_elevation,
        "elevation": None,
        "grades": None,
        "climbs": [],
        "splits": [],
    }
    if has_elevation:
        result.update(elevation_details(cumulative, elevations, total, sport))
    # 근처 검색용으로 줄인 경로. 처음과 끝 점은 항상 남깁니다.
    step = max(NEAR_SAMPLE_M, total / NEAR_SAMPLE_MAX)
    near, next_at = [], 0.0
    for (lat, lng, _), at in zip(points, cumulative):
        if at >= next_at:
            near.append((lat, lng))
            next_at = at + step
    if near[-1] != points[-1][:2]:
        near.append(points[-1][:2])
    result["_near"] = near
    result["_cumulative"] = cumulative
    result["_points"] = points
    return result


def elevation_details(cumulative, elevations, total, sport):
    count = max(1, round(total / GRADE_STEP_M))
    step = total / count
    sampled = [interpolate(cumulative, elevations, step * i) for i in range(count + 1)]
    grades = [(b - a) / step * 100 for a, b in zip(sampled, sampled[1:])]
    flat, gentle, moderate = GRADE_BANDS.get(sport, GRADE_BANDS["bike"])
    bands = {"flat": 0, "gentle": 0, "moderate": 0, "steep": 0}
    for grade in grades:
        magnitude = abs(grade)
        key = "flat" if magnitude < flat else "gentle" if magnitude < gentle else "moderate" if magnitude < moderate else "steep"
        bands[key] += 1
    climbs = find_climbs(grades, sampled, step, flat)
    # 1km 단위 구간(긴 코스는 최대 60개 구간)
    split_km = max(1, math.ceil(total / 1000 / 60))
    splits, at = [], 0.0
    while at < total - 1:
        end = min(total, at + split_km * 1000)
        a, b = interpolate(cumulative, elevations, at), interpolate(cumulative, elevations, end)
        gain = loss = 0.0
        inside = [i for i in range(len(cumulative)) if at < cumulative[i] < end]
        previous = a
        for value in [elevations[i] for i in inside] + [b]:
            if value > previous:
                gain += value - previous
            else:
                loss += previous - value
            previous = value
        splits.append({"from_km": round(at / 1000, 2), "to_km": round(end / 1000, 2), "end_elevation_m": round(b),
                       "gain_m": round(gain), "loss_m": round(loss), "avg_grade_pct": round((b - a) / max(end - at, 1) * 100, 1)})
        at = end
    return {
        "elevation": {"min_m": round(min(elevations)), "max_m": round(max(elevations)),
                      "start_m": round(elevations[0]), "end_m": round(elevations[-1])},
        "grades": {
            "max_uphill_pct": round(max(max(grades), 0), 1),
            "max_downhill_pct": round(min(min(grades), 0), 1),
            # 100m 구간 경사의 절댓값 기준으로 나눈 거리 비율(%)
            "thresholds_pct": {"flat_below": flat, "gentle_below": gentle, "moderate_below": moderate},
            "share_pct": {key: round(value / len(grades) * 100) for key, value in bands.items()},
        },
        "climbs": climbs,
        "splits": splits,
    }


def find_climbs(grades, sampled, step, threshold):
    """경사 기준 이상이 이어지는 오르막을 찾습니다. 짧은 평지(200m 이하)는 오르막에 포함합니다."""
    climbs, start, flat_run = [], None, 0
    for i, grade in enumerate(grades + [-100]):
        if grade >= threshold:
            if start is None:
                start = i
            flat_run = 0
        elif start is not None:
            flat_run += 1
            if flat_run > 2 or i == len(grades):
                end = i - flat_run + 1
                length = (end - start) * step
                gain = sampled[end] - sampled[start]
                if length >= 300 and gain >= 10:
                    climbs.append({"start_km": round(start * step / 1000, 2), "length_km": round(length / 1000, 2),
                                   "gain_m": round(gain), "avg_grade_pct": round(gain / length * 100, 1),
                                   "max_grade_pct": round(max(grades[start:end]), 1)})
                start, flat_run = None, 0
    climbs.sort(key=lambda climb: climb["gain_m"], reverse=True)
    return climbs[:8]


def distance_to_route_m(near_points, lat, lng) -> float:
    """기준점에서 경로(점 사이 선분 포함)까지의 가장 가까운 거리(m)."""
    if not near_points:
        return math.inf
    scale = math.cos(math.radians(lat))
    to_xy = lambda p: ((p[1] - lng) * scale * 111320, (p[0] - lat) * 110540)
    best = math.inf
    previous = to_xy(near_points[0])
    best = math.hypot(*previous)
    for point in near_points[1:]:
        current = to_xy(point)
        dx, dy = current[0] - previous[0], current[1] - previous[1]
        length = dx * dx + dy * dy
        t = 0 if length == 0 else max(0, min(1, -(previous[0] * dx + previous[1] * dy) / length))
        best = min(best, math.hypot(previous[0] + dx * t, previous[1] + dy * t))
        previous = current
    return best


def sample_route(analysis: dict, count: int = 60) -> list:
    """지도에 그리거나 지나는 곳을 짐작할 수 있게 경로를 일정 간격의 점으로 줄입니다."""
    points, cumulative = analysis["_points"], analysis["_cumulative"]
    if not points:
        return []
    total = cumulative[-1]
    if total == 0:
        return [round_point(*points[0][:2]) | {"km": 0.0}]
    lats, lngs = [p[0] for p in points], [p[1] for p in points]
    return [round_point(interpolate(cumulative, lats, total * i / (count - 1)), interpolate(cumulative, lngs, total * i / (count - 1)))
            | {"km": round(total * i / (count - 1) / 1000, 2)} for i in range(count)]


def locate_on_route(analysis: dict, lat: float, lng: float) -> float:
    """경로 위에서 기준점과 가장 가까운 지점의 출발점 기준 거리(km)."""
    points, cumulative = analysis["_points"], analysis["_cumulative"]
    if not points:
        return 0.0
    best = min(range(len(points)), key=lambda i: (points[i][0] - lat) ** 2 + ((points[i][1] - lng) * math.cos(math.radians(lat))) ** 2)
    return round(cumulative[best] / 1000, 2)
