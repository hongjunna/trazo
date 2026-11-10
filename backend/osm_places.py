"""코스 경로 근처의 이름 있는 장소(공원·강·호수·명소 등)를 대한민국 OSM 파일에서 찾습니다. insight_worker가 씁니다.
전국 파일을 한 번 훑으며 경로가 지나는 칸(약 100m 격자) 안의 점만 메모리에 두므로, 메모리를 적게 씁니다
(전국 색인을 만드는 osmium CLI는 1.5GB로도 부족했습니다). 여러 코스를 한 번에 처리하세요 (한 번 훑는 데 약 2~3분)."""
import osmium

import course_geo

CELL_DEG = 0.001
PLACE_MAX = 15
# 경로에서 이 거리 안의 장소만 씁니다.
RADIUS_M = {"run": 50, "bike": 70}
# 장소 종류별 우선순위 (작을수록 먼저). 도로·다리·작은 표지물은 넣지 않습니다.
KIND_RANK = {
    "waterway=river": 0, "leisure=park": 1, "natural=water": 1, "waterway=stream": 2, "tourism=attraction": 2,
    "historic=castle": 2, "historic=city_gate": 2, "leisure=garden": 3, "leisure=nature_reserve": 3, "tourism=museum": 3,
    "natural=peak": 3, "natural=beach": 3, "temple": 3, "historic=monument": 4, "leisure=stadium": 4, "leisure=track": 4,
    "railway=station": 4, "natural=wood": 5, "tourism=viewpoint": 5, "waterway=canal": 5,
}


def kind_of(tags) -> str | None:
    if "name" not in tags:
        return None
    for key in ("waterway", "leisure", "natural", "tourism", "historic", "railway"):
        value = tags.get(key)
        if value and f"{key}={value}" in KIND_RANK:
            return f"{key}={value}"
    if tags.get("amenity") == "place_of_worship" and tags.get("religion") == "buddhist":
        return "temple"
    return None


def name_of(tags) -> str:
    return tags.get("name:ko") or tags.get("name")


def cell(lat: float, lng: float) -> tuple:
    return int(lat // CELL_DEG), int(lng // CELL_DEG)


class _Collector(osmium.SimpleHandler):
    def __init__(self, cells: dict):
        super().__init__()
        self.cells = cells          # 칸 → 그 칸을 지나는 코스 번호들
        self.locations = {}         # 경로 칸 안의 점 위치
        self.found = {cid: [] for ids in cells.values() for cid in ids}

    def node(self, n):
        location = n.location
        if not location.valid():
            return
        lat, lng = location.lat, location.lon
        owners = self.cells.get(cell(lat, lng))
        if not owners:
            return
        self.locations[n.id] = (lat, lng)
        kind = kind_of(n.tags)
        if kind:
            for cid in owners:
                self.found[cid].append((name_of(n.tags), kind, [(lat, lng)]))

    def way(self, w):
        kind = kind_of(w.tags)
        if not kind:
            return
        points = [self.locations[ref.ref] for ref in w.nodes if ref.ref in self.locations]
        if not points:
            return
        name = name_of(w.tags)
        owners = set()
        for p in points:
            owners |= self.cells.get(cell(*p), set())
        for cid in owners:
            self.found[cid].append((name, kind, points))


def find_places(pbf_path: str, routes: dict) -> dict:
    """routes: {코스 번호: (course_geo.analyze_route 결과, 종목)} → {코스 번호: [{"km", "name", "kind"}, …] (km 순)}"""
    cells: dict = {}
    for cid, (analysis, _) in routes.items():
        for lat, lng in analysis["_near"]:
            row, col = cell(lat, lng)
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    cells.setdefault((row + dr, col + dc), set()).add(cid)
    if not cells:
        return {cid: [] for cid in routes}
    collector = _Collector(cells)
    collector.apply_file(pbf_path)
    collector.locations.clear()
    result = {}
    for cid, (analysis, sport) in routes.items():
        radius = RADIUS_M.get(sport, 70)
        best = {}
        for name, kind, points in collector.found.get(cid, []):
            # 경로에 가장 가까운 점 (긴 강·공원은 경로 근처 점만 남아 있습니다)
            gap, at = min((course_geo.distance_to_route_m(analysis["_near"], lat, lng), (lat, lng)) for lat, lng in points[:300])
            if gap > radius:
                continue
            km = course_geo.locate_on_route(analysis, *at)
            if name not in best or km < best[name]["km"]:
                best[name] = {"km": km, "name": name, "kind": kind}
        top = sorted(best.values(), key=lambda p: (KIND_RANK[p["kind"]], p["km"]))[:PLACE_MAX]
        result[cid] = sorted(top, key=lambda p: p["km"])
    return result
