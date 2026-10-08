import httpx
import json
import os
import math
import secrets
from google.oauth2 import id_token
from google.auth.transport.requests import Request
from google.auth.exceptions import GoogleAuthError, TransportError
from cachecontrol import CacheControl
import requests
from sqlalchemy import inspect, text
from typing import List, Literal, Optional, Any
from fastapi import FastAPI, Query, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from contextlib import asynccontextmanager
from sqlmodel import Field, Session, SQLModel, create_engine, select
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import datetime
from xml.sax.saxutils import escape

# --- 1. 데이터베이스 설정 ---
DATABASE_URL = os.environ["DATABASE_URL"]
# Mapping of server-issued secret tokens to positive user IDs. Never accept a client user_id.
COURSE_API_TOKENS = json.loads(os.getenv("COURSE_API_TOKENS", "{}"))
if not isinstance(COURSE_API_TOKENS, dict) or any(not isinstance(token, str) or len(token) < 32 or type(user_id) is not int or user_id <= 0 for token, user_id in COURSE_API_TOKENS.items()):
    raise ValueError("COURSE_API_TOKENS must map tokens of at least 32 characters to positive user IDs")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
# Public signing keys are cached; token verification does not require a service-account key.
firebase_request = Request(session=CacheControl(requests.Session()))
bearer = HTTPBearer(auto_error=False)

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    if credentials and credentials.scheme.lower() == "bearer":
        if FIREBASE_PROJECT_ID:
            try:
                claims = id_token.verify_firebase_token(credentials.credentials, firebase_request, audience=FIREBASE_PROJECT_ID)
                uid = claims.get("sub")
                if (claims.get("iss") != f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"
                        or not isinstance(uid, str) or not 0 < len(uid) <= 128
                        or claims.get("firebase", {}).get("sign_in_provider") != "google.com"):
                    raise ValueError("Invalid Firebase identity")
                return uid
            except TransportError:
                raise HTTPException(status_code=503, detail="Authentication service unavailable")
            except (ValueError, GoogleAuthError):
                raise HTTPException(status_code=401, detail="Invalid Firebase ID token", headers={"WWW-Authenticate": "Bearer"})
        for token, user_id in COURSE_API_TOKENS.items():
            if secrets.compare_digest(credentials.credentials.encode(), token.encode()):
                return user_id
    raise HTTPException(status_code=401, detail="Valid access token required", headers={"WWW-Authenticate": "Bearer"})
engine = create_engine(DATABASE_URL)

# --- 2. DB 모델 정의 ---
class Course(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: Optional[str] = None
    markers_json: str 
    polylines_json: str 
    firebase_uid: Optional[str] = Field(default=None)
    sport: str = Field(default="bike")
    user_id: int = Field(default=1) 
    created_at: str = Field(default_factory=lambda: datetime.datetime.now().isoformat())
    is_deleted: bool = Field(default=False)

@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    # create_all does not add columns to an existing table. Preserve legacy ownership.
    with engine.begin() as connection:
        columns = {column["name"] for column in inspect(connection).get_columns("course")}
        if "firebase_uid" not in columns:
            connection.execute(text("ALTER TABLE course ADD COLUMN firebase_uid VARCHAR(128)"))
        # 서비스가 러닝을 지원하기 전에 저장된 코스는 모두 자전거 코스입니다.
        if "sport" not in columns:
            connection.execute(text("ALTER TABLE course ADD COLUMN sport VARCHAR(16) NOT NULL DEFAULT 'bike'"))
    yield

app = FastAPI(title="Trazo API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GRAPHHOPPER_URL = os.getenv("GRAPHHOPPER_URL", "http://graphhopper:8989")

# --- 3. Pydantic 모델 ---
Sport = Literal["bike", "run"]

class CreateCourseRequest(BaseModel):
    title: str
    markers: List[dict]
    polylines: List[List[dict]]
    sport: Sport = "bike"

# ⚡ [수정] 코스 수정 요청 모델 (경로 데이터 추가)
class UpdateCourseRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    markers: Optional[List[dict]] = None          # ⚡ 추가됨
    polylines: Optional[List[List[dict]]] = None  # ⚡ 추가됨
    sport: Optional[Sport] = None

class TCXPoint(BaseModel):
    lat: float
    lng: float
    ele: float

class TCXExportRequest(BaseModel):
    trackPoints: List[TCXPoint]
    name: Optional[str] = None
    # 코스 파일의 예상 시간 계산에 쓰는 평균 속도 (m/s)
    speedMps: Optional[float] = None

class Instruction(BaseModel):
    distance: float
    heading: Optional[float] = None
    sign: int
    text: str
    time: int
    street_name: Optional[str] = ""
    last_heading: Optional[float] = None

class Path(BaseModel):
    distance: float
    weight: float
    time: int
    points: Any 
    decoded_points: Optional[List[List[float]]] = None 
    instructions: List[Instruction]
    ascend: float
    descend: float
    details: Optional[dict] = {}
    snapped_waypoints: Optional[Any] = None
    points_encoded: Optional[bool] = False
    bbox: Optional[List[float]] = None

class RouteResponse(BaseModel):
    hints: Optional[dict] = {}
    info: dict
    paths: List[Path]

# --- 4. 경로 프로필과 옵션 ---

# 화면의 종목은 GraphHopper 프로필 이름과 같습니다.
ROUTE_PROFILES = {"bike", "run"}

UNPAVED = " || ".join(f"surface == {s}" for s in ("UNPAVED", "COMPACTED", "FINE_GRAVEL", "GRAVEL", "GROUND", "DIRT", "GRASS", "SAND"))

# 클라이언트가 임의 규칙을 보낼 수 없도록, 허용된 옵션 이름만 GraphHopper 규칙으로 바꿉니다.
# 옵션은 길의 선호도를 조금씩만 조정합니다. 값이 너무 크면(예: 0.3) 곧게 갈 수 있는 길도 크게 돌아가므로,
# 서울 시내 68개 구간으로 확인했을 때 최단 거리 대비 평균 4~5% 이내로 우회하도록 맞춘 값입니다.
ROUTE_OPTIONS = {
    "bike": {
        "prefer_bikeway": [{"if": "road_class == CYCLEWAY || bike_network != MISSING", "multiply_by": "1.2"}],
        "avoid_big_roads": [
            {"if": "road_class == PRIMARY || road_class == TRUNK", "multiply_by": "0.85"},
            {"else_if": "road_class == SECONDARY", "multiply_by": "0.95"},
        ],
        "avoid_unpaved": [{"if": f"{UNPAVED} || road_class == TRACK", "multiply_by": "0.3"}],
        "avoid_hills": [{"if": "average_slope >= 6", "multiply_by": "0.5"}],
    },
    "run": {
        "prefer_trails": [{
            "if": "road_class == FOOTWAY || road_class == PATH || road_class == PEDESTRIAN || road_class == CYCLEWAY"
                  " || road_class == LIVING_STREET || foot_network != MISSING",
            "multiply_by": "1.4",
        }],
        # 보도가 있는 일반 간선도로(2·3차로급)는 그대로 두고, 대로만 덜 지나갑니다.
        "avoid_big_roads": [{"if": "road_class == PRIMARY || road_class == TRUNK", "multiply_by": "0.7"}],
        "avoid_stairs": [{"if": "road_class == STEPS", "multiply_by": "0.1"}],
        "avoid_unpaved": [{"if": UNPAVED, "multiply_by": "0.4"}],
        "avoid_hills": [{"if": "average_slope >= 5", "multiply_by": "0.5"}],
    },
}

def build_route_request(points: List[str], profile: str, options: List[str]) -> dict:
    if profile not in ROUTE_PROFILES:
        raise HTTPException(status_code=400, detail="Unknown route profile")
    if not 2 <= len(points) <= 50:
        raise HTTPException(status_code=400, detail="Between 2 and 50 points are required")
    coordinates = []
    for p in points:
        try:
            lat, lng = (float(v) for v in p.split(","))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid point")
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise HTTPException(status_code=400, detail="Invalid point")
        coordinates.append([lng, lat])
    priority = []
    for option in dict.fromkeys(options):
        rules = ROUTE_OPTIONS[profile].get(option)
        if rules is None:
            raise HTTPException(status_code=400, detail=f"Unknown route option for {profile}: {option}")
        priority.extend(rules)
    body = {
        "points": coordinates,
        "profile": profile,
        # 찍은 점이 올림픽대로·고가 진입로 같은 자동차 전용급 도로나 터널에 붙으면 크게 돌아가므로 그런 길에는 붙이지 않습니다.
        # 다리는 일부러 다리를 건너는 코스를 만들 수 있도록 허용합니다.
        "snap_preventions": ["motorway", "trunk", "tunnel", "ferry"],
        "elevation": True,
        "points_encoded": False,
        "instructions": False,
    }
    if priority:
        body["custom_model"] = {"priority": priority}
    return body

# --- 5. 헬퍼 함수들 ---

def smooth_elevation(elevations: List[float], window_size: int = 3, iterations: int = 3) -> List[float]:
    if not elevations:
        return []
    smoothed = list(elevations)
    for _ in range(iterations):
        temp_smoothed = []
        n = len(smoothed)
        for i in range(n):
            start = max(0, i - window_size)
            end = min(n, i + window_size + 1)
            window = smoothed[start:end]
            avg = sum(window) / len(window)
            temp_smoothed.append(avg)
        smoothed = temp_smoothed
    return smoothed

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000 
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2) * math.sin(dlambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

async def get_elevation_for_path(start_lat, start_lng, end_lat, end_lng, client):
    dist = haversine_distance(start_lat, start_lng, end_lat, end_lng)
    step_size = 50 
    num_steps = max(2, min(100, int(dist / step_size))) 
    
    points = []
    
    for i in range(num_steps + 1):
        ratio = i / num_steps
        lat = start_lat + (end_lat - start_lat) * ratio
        lng = start_lng + (end_lng - start_lng) * ratio
        
        try:
            params = [
                ("point", f"{lat},{lng}"),
                ("point", f"{lat},{lng}"),
                ("profile", "run"), 
                ("elevation", "true"),
                ("points_encoded", "false")
            ]
            resp = await client.get(f"{GRAPHHOPPER_URL}/route", params=params, timeout=2.0)
            if resp.status_code == 200:
                ele = resp.json()["paths"][0]["points"]["coordinates"][0][2]
                points.append([lat, lng, ele])
            else:
                points.append([lat, lng, 0])
        except:
            points.append([lat, lng, 0])
            
    return points

# --- 6. API 엔드포인트 ---

def get_session():
    with Session(engine) as session:
        yield session

@app.post("/courses")
def create_course(course_data: CreateCourseRequest, session: Session = Depends(get_session), user_id: str | int = Depends(get_current_user)):
    new_course = Course(
        title=course_data.title,
        markers_json=json.dumps(course_data.markers),
        polylines_json=json.dumps(course_data.polylines),
        user_id=user_id if isinstance(user_id, int) else 0,
        firebase_uid=user_id if isinstance(user_id, str) else None,
        sport=course_data.sport,
        is_deleted=False
    )
    session.add(new_course)
    session.commit()
    session.refresh(new_course)
    return {"status": "success", "course_id": new_course.id, "title": new_course.title}

@app.get("/courses")
def read_courses(session: Session = Depends(get_session), user_id: str | int = Depends(get_current_user)):
    owner_filter = Course.firebase_uid == user_id if isinstance(user_id, str) else (Course.user_id == user_id) & Course.firebase_uid.is_(None)
    courses = session.exec(select(Course).where(Course.is_deleted == False, owner_filter)).all()
    return courses

# ⚡ [수정] 코스 업데이트 (제목 + 경로 데이터)
@app.put("/courses/{course_id}")
def update_course(course_id: int, course_data: UpdateCourseRequest, session: Session = Depends(get_session), user_id: str | int = Depends(get_current_user)):
    course = session.get(Course, course_id)
    if not course or course.is_deleted or (course.firebase_uid != user_id if isinstance(user_id, str) else course.firebase_uid is not None or course.user_id != user_id):
        raise HTTPException(status_code=404, detail="Course not found")
    
    # 제목/설명 수정
    if course_data.title:
        course.title = course_data.title
    if course_data.description:
        course.description = course_data.description
    
    # ⚡ 경로 데이터 수정 로직 추가
    if course_data.markers is not None:
        course.markers_json = json.dumps(course_data.markers)
    if course_data.polylines is not None:
        course.polylines_json = json.dumps(course_data.polylines)
    if course_data.sport is not None:
        course.sport = course_data.sport
        
    session.add(course)
    session.commit()
    session.refresh(course)
    return {"status": "success", "course": course}

@app.delete("/courses/{course_id}")
def delete_course(course_id: int, session: Session = Depends(get_session), user_id: str | int = Depends(get_current_user)):
    course = session.get(Course, course_id)
    if not course or course.is_deleted or (course.firebase_uid != user_id if isinstance(user_id, str) else course.firebase_uid is not None or course.user_id != user_id):
        raise HTTPException(status_code=404, detail="Course not found")
    
    course.is_deleted = True
    session.add(course)
    session.commit()
    return {"status": "success", "deleted_id": course_id, "message": "Soft deleted"}

@app.get("/route")
async def get_route(
    point: List[str] = Query(...), 
    profile: str = "bike",
    mode: str = "turn-by-turn",
    option: List[str] = Query(default=[]),
):
    if mode != 'straight':
        route_request = build_route_request(point, profile, option)
    async with httpx.AsyncClient() as client:
        if mode == 'straight':
            start_parts = point[0].split(',')
            end_parts = point[1].split(',')
            
            start_lat, start_lng = float(start_parts[0]), float(start_parts[1])
            end_lat, end_lng = float(end_parts[0]), float(end_parts[1])

            decoded_points = await get_elevation_for_path(start_lat, start_lng, end_lat, end_lng, client)
            
            elevations = [p[2] for p in decoded_points]
            smoothed_ele = smooth_elevation(elevations, window_size=2, iterations=1)
            for i, p in enumerate(decoded_points):
                p[2] = smoothed_ele[i]

            return {
                "hints": {},
                "info": {"copyrights": ["GraphHopper"]},
                "paths": [{
                    "distance": haversine_distance(start_lat, start_lng, end_lat, end_lng), 
                    "weight": 0,
                    "time": 0,
                    "transfers": 0,
                    "points_encoded": False,
                    "points": {
                        "type": "LineString",
                        "coordinates": [[p[1], p[0], p[2]] for p in decoded_points]
                    },
                    "decoded_points": decoded_points, 
                    "instructions": [],
                    "ascend": 0,
                    "descend": 0,
                    "snapped_waypoints": {
                        "type": "LineString",
                        "coordinates": [
                            [start_lng, start_lat, decoded_points[0][2]],
                            [end_lng, end_lat, decoded_points[-1][2]]
                        ]
                    }
                }]
            }

        try:
            # 요청별 경로 옵션(custom_model)은 POST 요청에서만 전달할 수 있습니다.
            response = await client.post(f"{GRAPHHOPPER_URL}/route", json=route_request, timeout=30.0)
            if response.status_code != 200:
                return {"info": {"errors": [{"message": "GraphHopper Error"}]}, "paths": []}
            
            data = response.json()
            paths = data.get("paths", [])
            
            for path in paths:
                points_data = path.get("points", {})
                if isinstance(points_data, str): 
                    path["decoded_points"] = []
                    continue
                
                raw_coords = points_data.get("coordinates", [])
                
                raw_elevations = [c[2] if len(c) > 2 else 0 for c in raw_coords]
                smoothed_elevations = smooth_elevation(raw_elevations, window_size=3, iterations=2)
                
                path["decoded_points"] = [
                    [c[1], c[0], smoothed_elevations[i]] 
                    for i, c in enumerate(raw_coords)
                ]
                
            return data
        except Exception as e:
            return {"info": {"errors": [{"message": str(e)}]}, "paths": []}

@app.post("/export/tcx")
async def export_tcx(request: TCXExportRequest):
    points = request.trackPoints
    
    if not points:
        return Response(content="No points provided", status_code=400)

    trackpoints_xml = ""
    current_time = datetime.datetime.utcnow()
    
    total_dist = 0.0
    prev_pt = points[0]
    
    trackpoints_xml += f"""
    <Trackpoint>
        <Time>{current_time.strftime("%Y-%m-%dT%H:%M:%SZ")}</Time>
        <Position>
            <LatitudeDegrees>{prev_pt.lat}</LatitudeDegrees>
            <LongitudeDegrees>{prev_pt.lng}</LongitudeDegrees>
        </Position>
        <AltitudeMeters>{prev_pt.ele:.2f}</AltitudeMeters>
        <DistanceMeters>0.0</DistanceMeters>
    </Trackpoint>"""

    AVG_SPEED_MPS = request.speedMps if request.speedMps and 0.5 <= request.speedMps <= 20 else 5.5
    course_name = escape((request.name or "Trazo Course").strip()[:80] or "Trazo Course")

    for i in range(1, len(points)):
        curr_pt = points[i]
        
        dist = haversine_distance(prev_pt.lat, prev_pt.lng, curr_pt.lat, curr_pt.lng)
        
        if dist < 1.0:
            continue
            
        total_dist += dist
        seconds_diff = dist / AVG_SPEED_MPS
        current_time += datetime.timedelta(seconds=max(1, int(seconds_diff)))
        
        trackpoints_xml += f"""
        <Trackpoint>
            <Time>{current_time.strftime("%Y-%m-%dT%H:%M:%SZ")}</Time>
            <Position>
                <LatitudeDegrees>{curr_pt.lat}</LatitudeDegrees>
                <LongitudeDegrees>{curr_pt.lng}</LongitudeDegrees>
            </Position>
            <AltitudeMeters>{curr_pt.ele:.2f}</AltitudeMeters>
            <DistanceMeters>{total_dist:.2f}</DistanceMeters>
        </Trackpoint>"""
        
        prev_pt = curr_pt

    final_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Courses>
    <Course>
      <Name>{course_name}</Name>
      <Lap>
        <TotalTimeSeconds>{(total_dist / AVG_SPEED_MPS):.1f}</TotalTimeSeconds>
        <DistanceMeters>{total_dist:.1f}</DistanceMeters>
        <BeginPosition>
          <LatitudeDegrees>{points[0].lat}</LatitudeDegrees>
          <LongitudeDegrees>{points[0].lng}</LongitudeDegrees>
        </BeginPosition>
        <EndPosition>
          <LatitudeDegrees>{prev_pt.lat}</LatitudeDegrees>
          <LongitudeDegrees>{prev_pt.lng}</LongitudeDegrees>
        </EndPosition>
        <Intensity>Active</Intensity>
        <Track>
          {trackpoints_xml}
        </Track>
      </Lap>
    </Course>
  </Courses>
</TrainingCenterDatabase>"""

    return Response(
        content=final_xml,
        media_type="application/vnd.garmin.tcx+xml",
        headers={"Content-Disposition": "attachment; filename=trazo_course.tcx"}
    )