import httpx
import json
import logging
import os
import math
import re
import secrets
from google.oauth2 import id_token
from google.auth.transport.requests import Request
from google.auth.exceptions import GoogleAuthError, TransportError
from cachecontrol import CacheControl
import requests
from sqlalchemy import func, inspect, or_, text, update
from sqlalchemy.exc import IntegrityError
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
# 서버 시계가 구글보다 조금 늦으면(Windows Docker 등) 방금 발급된 토큰이 "미래에 발급됨"으로 거부됩니다.
FIREBASE_CLOCK_SKEW_SECONDS = 60
logger = logging.getLogger("trazo.auth")

def authenticate(credentials: Optional[HTTPAuthorizationCredentials]):
    """토큰이 없으면 None, 있으면 검증한 사용자(Firebase UID 또는 이전 방식의 정수 ID)를 돌려줍니다."""
    if not credentials or credentials.scheme.lower() != "bearer":
        return None
    if FIREBASE_PROJECT_ID:
        try:
            claims = id_token.verify_firebase_token(
                credentials.credentials, firebase_request, audience=FIREBASE_PROJECT_ID,
                clock_skew_in_seconds=FIREBASE_CLOCK_SKEW_SECONDS,
            )
            uid = claims.get("sub")
            if (claims.get("iss") != f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"
                    or not isinstance(uid, str) or not 0 < len(uid) <= 128
                    or claims.get("firebase", {}).get("sign_in_provider") != "google.com"):
                raise ValueError("Invalid Firebase identity")
            return uid
        except TransportError:
            raise HTTPException(status_code=503, detail="Authentication service unavailable")
        except (ValueError, GoogleAuthError) as error:
            # 원인(만료, 시계 오차, 다른 프로젝트 토큰 등)을 로그로 남겨 확인할 수 있게 합니다.
            logger.warning("Firebase 토큰 검증 실패: %s", error)
            raise HTTPException(status_code=401, detail="Invalid Firebase ID token", headers={"WWW-Authenticate": "Bearer"})
    for token, user_id in COURSE_API_TOKENS.items():
        if secrets.compare_digest(credentials.credentials.encode(), token.encode()):
            return user_id
    raise HTTPException(status_code=401, detail="Valid access token required", headers={"WWW-Authenticate": "Bearer"})

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    user_id = authenticate(credentials)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Valid access token required", headers={"WWW-Authenticate": "Bearer"})
    return user_id

# 공유 코스·커뮤니티는 로그인 없이 볼 수 있고, 로그인했으면 좋아요·내 댓글 여부를 함께 알려줍니다.
def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    return authenticate(credentials)

# 닉네임·폴더·커뮤니티 기능은 구글 계정(Firebase)으로 로그인한 경우에만 사용합니다.
def get_google_user(user_id: str | int = Depends(get_current_user)) -> str:
    if not isinstance(user_id, str):
        raise HTTPException(status_code=403, detail="Google account required")
    return user_id

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
    # 공개 범위: private(나만 보기) · link(링크가 있는 사람만) · public(커뮤니티에 공개)
    visibility: str = Field(default="private")
    # 공유 링크 주소. 처음 공유할 때 만들고, 비공개로 바꿨다가 다시 공유해도 같은 주소를 씁니다.
    share_token: Optional[str] = Field(default=None)
    # 다른 사람이 내 코스에 담은 횟수 (계정마다 한 번, 담은 코스를 지워도 줄지 않음)
    share_count: int = Field(default=0)
    folder_id: Optional[int] = Field(default=None)
    # 공유받아 담은 코스면 원본 코스 ID
    source_course_id: Optional[int] = Field(default=None)
    # 마지막으로 전체 공개한 시각 (커뮤니티 최신순 정렬)
    published_at: Optional[str] = Field(default=None)

def utc_now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

class UserProfile(SQLModel, table=True):
    firebase_uid: str = Field(primary_key=True, max_length=128)
    nickname: str
    # 대소문자만 다른 닉네임도 같은 닉네임으로 봅니다.
    nickname_key: str = Field(unique=True)
    created_at: str = Field(default_factory=utc_now)
    updated_at: str = Field(default_factory=utc_now)

class Folder(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    firebase_uid: str = Field(index=True)
    name: str
    created_at: str = Field(default_factory=utc_now)

# 코스를 담은 계정 기록. 공유 횟수를 계정마다 한 번만 세고, 담은 코스를 지워도 지우지 않습니다.
class CourseShare(SQLModel, table=True):
    course_id: int = Field(primary_key=True)
    firebase_uid: str = Field(primary_key=True)
    created_at: str = Field(default_factory=utc_now)

class CourseLike(SQLModel, table=True):
    course_id: int = Field(primary_key=True)
    firebase_uid: str = Field(primary_key=True)
    created_at: str = Field(default_factory=utc_now)

class CourseComment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(index=True)
    firebase_uid: str
    body: str
    created_at: str = Field(default_factory=utc_now)
    updated_at: Optional[str] = None

# create_all은 기존 테이블에 열을 추가하지 않으므로, 이전 버전에서 만든 course 테이블에 빠진 열을 추가합니다.
COURSE_MIGRATIONS = {
    # 기존 코스를 처음 로그인한 계정에 자동 배정하지 않습니다.
    "firebase_uid": "VARCHAR(128)",
    # 서비스가 러닝을 지원하기 전에 저장된 코스는 모두 자전거 코스입니다.
    "sport": "VARCHAR(16) NOT NULL DEFAULT 'bike'",
    # 커뮤니티 기능 전에 저장된 코스는 모두 비공개입니다.
    "visibility": "VARCHAR(16) NOT NULL DEFAULT 'private'",
    "share_token": "VARCHAR(32)",
    "share_count": "INTEGER NOT NULL DEFAULT 0",
    "folder_id": "INTEGER",
    "source_course_id": "INTEGER",
    "published_at": "VARCHAR",
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    with engine.begin() as connection:
        columns = {column["name"] for column in inspect(connection).get_columns("course")}
        for name, definition in COURSE_MIGRATIONS.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE course ADD COLUMN {name} {definition}"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_course_share_token ON course (share_token)"))
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
Visibility = Literal["private", "link", "public"]

class CreateCourseRequest(BaseModel):
    title: str
    markers: List[dict]
    polylines: List[List[dict]]
    sport: Sport = "bike"
    visibility: Visibility = "private"
    folder_id: Optional[int] = None

# ⚡ [수정] 코스 수정 요청 모델 (경로 데이터 추가)
class UpdateCourseRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    markers: Optional[List[dict]] = None          # ⚡ 추가됨
    polylines: Optional[List[List[dict]]] = None  # ⚡ 추가됨
    sport: Optional[Sport] = None
    visibility: Optional[Visibility] = None
    # null을 보내면 폴더에서 빼고, 보내지 않으면 그대로 둡니다.
    folder_id: Optional[int] = None

class NicknameRequest(BaseModel):
    nickname: str

class FolderRequest(BaseModel):
    name: str

class CopyCourseRequest(BaseModel):
    folder_id: Optional[int] = None

class CommentRequest(BaseModel):
    body: str

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

# --- 6-1. 공통 확인 ---

def owns(course: Course, user_id: str | int) -> bool:
    if isinstance(user_id, str):
        return course.firebase_uid == user_id
    return course.firebase_uid is None and course.user_id == user_id

def get_owned_course(session: Session, course_id: int, user_id: str | int) -> Course:
    course = session.get(Course, course_id)
    if not course or course.is_deleted or not owns(course, user_id):
        raise HTTPException(status_code=404, detail="Course not found")
    return course

def check_folder(session: Session, folder_id: Optional[int], user_id: str | int) -> Optional[int]:
    if folder_id is None:
        return None
    folder = session.get(Folder, folder_id)
    if not folder or not isinstance(user_id, str) or folder.firebase_uid != user_id:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder_id

# 다른 사람에게 이름이 보이는 기능(전체 공개, 담기, 좋아요, 댓글)은 닉네임을 정한 뒤에 사용할 수 있습니다.
def require_profile(session: Session, user_id: str | int) -> UserProfile:
    profile = session.get(UserProfile, user_id) if isinstance(user_id, str) else None
    if not profile:
        raise HTTPException(status_code=403, detail="Nickname required")
    return profile

def apply_visibility(session: Session, course: Course, visibility: str, user_id: str | int):
    if visibility == "public":
        require_profile(session, user_id)
        if course.visibility != "public":
            course.published_at = utc_now()
    if visibility != "private" and not course.share_token:
        course.share_token = secrets.token_urlsafe(9)
    course.visibility = visibility

# --- 6-2. 내 코스 ---

@app.post("/courses")
def create_course(course_data: CreateCourseRequest, session: Session = Depends(get_session), user_id: str | int = Depends(get_current_user)):
    new_course = Course(
        title=course_data.title,
        markers_json=json.dumps(course_data.markers),
        polylines_json=json.dumps(course_data.polylines),
        user_id=user_id if isinstance(user_id, int) else 0,
        firebase_uid=user_id if isinstance(user_id, str) else None,
        sport=course_data.sport,
        folder_id=check_folder(session, course_data.folder_id, user_id),
        is_deleted=False
    )
    apply_visibility(session, new_course, course_data.visibility, user_id)
    session.add(new_course)
    session.commit()
    session.refresh(new_course)
    return {"status": "success", "course_id": new_course.id, "title": new_course.title, "course": new_course}

@app.get("/courses")
def read_courses(session: Session = Depends(get_session), user_id: str | int = Depends(get_current_user)):
    owner_filter = Course.firebase_uid == user_id if isinstance(user_id, str) else (Course.user_id == user_id) & Course.firebase_uid.is_(None)
    courses = session.exec(select(Course).where(Course.is_deleted == False, owner_filter)).all()
    return courses

# ⚡ [수정] 코스 업데이트 (제목 + 경로 데이터)
@app.put("/courses/{course_id}")
def update_course(course_id: int, course_data: UpdateCourseRequest, session: Session = Depends(get_session), user_id: str | int = Depends(get_current_user)):
    course = get_owned_course(session, course_id, user_id)

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
    if course_data.visibility is not None:
        apply_visibility(session, course, course_data.visibility, user_id)
    if "folder_id" in course_data.model_fields_set:
        course.folder_id = check_folder(session, course_data.folder_id, user_id)

    session.add(course)
    session.commit()
    session.refresh(course)
    return {"status": "success", "course": course}

@app.delete("/courses/{course_id}")
def delete_course(course_id: int, session: Session = Depends(get_session), user_id: str | int = Depends(get_current_user)):
    course = get_owned_course(session, course_id, user_id)

    course.is_deleted = True
    session.add(course)
    session.commit()
    return {"status": "success", "deleted_id": course_id, "message": "Soft deleted"}

# --- 6-3. 닉네임 ---

# 한글·영문·숫자·밑줄 3~16자. 공백과 기호는 다른 닉네임으로 위장하기 쉬워 받지 않습니다.
NICKNAME_PATTERN = re.compile(r"[0-9A-Za-z가-힣_]{3,16}")
RESERVED_NICKNAMES = {"admin", "administrator", "trazo", "트라소", "관리자", "운영자"}

def normalize_nickname(raw: str) -> str:
    nickname = raw.strip()
    if not NICKNAME_PATTERN.fullmatch(nickname):
        raise HTTPException(status_code=422, detail="Nickname must be 3-16 Korean letters, English letters, digits or underscores")
    return nickname

def nickname_taken(session: Session, nickname: str, user_id: Optional[str]) -> bool:
    key = nickname.lower()
    if key in RESERVED_NICKNAMES:
        return True
    owner = session.exec(select(UserProfile).where(UserProfile.nickname_key == key)).first()
    return owner is not None and owner.firebase_uid != user_id

@app.get("/me")
def read_me(session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    profile = session.get(UserProfile, user_id)
    return {"nickname": profile.nickname if profile else None}

@app.put("/me")
def update_me(data: NicknameRequest, session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    nickname = normalize_nickname(data.nickname)
    if nickname_taken(session, nickname, user_id):
        raise HTTPException(status_code=409, detail="Nickname already taken")
    profile = session.get(UserProfile, user_id)
    if profile:
        profile.nickname = nickname
        profile.nickname_key = nickname.lower()
        profile.updated_at = utc_now()
    else:
        profile = UserProfile(firebase_uid=user_id, nickname=nickname, nickname_key=nickname.lower())
    session.add(profile)
    try:
        session.commit()
    except IntegrityError:
        # 거의 같은 순간에 다른 사람이 같은 닉네임을 정한 경우
        session.rollback()
        raise HTTPException(status_code=409, detail="Nickname already taken")
    return {"nickname": profile.nickname}

@app.get("/nicknames/check")
def check_nickname(nickname: str, session: Session = Depends(get_session), user_id: str | int | None = Depends(get_optional_user)):
    try:
        value = normalize_nickname(nickname)
    except HTTPException:
        return {"available": False, "reason": "invalid"}
    if nickname_taken(session, value, user_id if isinstance(user_id, str) else None):
        return {"available": False, "reason": "taken"}
    return {"available": True, "reason": None}

# --- 6-4. 폴더 ---

FOLDER_NAME_MAX = 30
FOLDER_LIMIT = 50

def folder_name(raw: str) -> str:
    name = raw.strip()
    if not 1 <= len(name) <= FOLDER_NAME_MAX:
        raise HTTPException(status_code=422, detail=f"Folder name must be 1-{FOLDER_NAME_MAX} characters")
    return name

def get_owned_folder(session: Session, folder_id: int, user_id: str) -> Folder:
    folder = session.get(Folder, folder_id)
    if not folder or folder.firebase_uid != user_id:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder

def check_folder_name(session: Session, name: str, user_id: str, folder_id: Optional[int] = None):
    duplicate = session.exec(select(Folder).where(Folder.firebase_uid == user_id, Folder.name == name)).first()
    if duplicate and duplicate.id != folder_id:
        raise HTTPException(status_code=409, detail="Folder name already exists")

@app.get("/folders")
def read_folders(session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    return session.exec(select(Folder).where(Folder.firebase_uid == user_id).order_by(Folder.id)).all()

@app.post("/folders")
def create_folder(data: FolderRequest, session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    name = folder_name(data.name)
    check_folder_name(session, name, user_id)
    count = session.exec(select(func.count()).select_from(Folder).where(Folder.firebase_uid == user_id)).one()
    if count >= FOLDER_LIMIT:
        raise HTTPException(status_code=400, detail=f"Up to {FOLDER_LIMIT} folders are allowed")
    folder = Folder(firebase_uid=user_id, name=name)
    session.add(folder)
    session.commit()
    session.refresh(folder)
    return folder

@app.put("/folders/{folder_id}")
def rename_folder(folder_id: int, data: FolderRequest, session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    folder = get_owned_folder(session, folder_id, user_id)
    name = folder_name(data.name)
    check_folder_name(session, name, user_id, folder_id)
    folder.name = name
    session.add(folder)
    session.commit()
    session.refresh(folder)
    return folder

# 폴더를 지워도 안에 있던 코스는 지우지 않고 '폴더 없음'으로 옮깁니다.
@app.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    folder = get_owned_folder(session, folder_id, user_id)
    session.exec(update(Course).where(Course.firebase_uid == user_id, Course.folder_id == folder_id).values(folder_id=None))
    session.delete(folder)
    session.commit()
    return {"status": "success", "deleted_id": folder_id}

# --- 6-5. 공유 코스 · 커뮤니티 ---

COMMENT_MAX = 500
PREVIEW_POINTS = 80

def course_summary(course: Course) -> dict:
    """커뮤니티 목록에 쓰는 거리·상승 고도와, 미리보기용으로 줄인 경로"""
    try:
        points = [p for segment in json.loads(course.polylines_json) for p in segment
                  if isinstance(p, dict) and isinstance(p.get("lat"), (int, float)) and isinstance(p.get("lng"), (int, float))]
    except (ValueError, TypeError):
        points = []
    distance = ascent = 0.0
    for a, b in zip(points, points[1:]):
        distance += haversine_distance(a["lat"], a["lng"], b["lat"], b["lng"])
        climb = (b.get("ele") or 0) - (a.get("ele") or 0)
        if climb > 0:
            ascent += climb
    step = max(1, len(points) // PREVIEW_POINTS)
    sampled = points[::step]
    if points and sampled[-1] is not points[-1]:
        sampled.append(points[-1])
    return {
        "distance_km": round(distance / 1000, 2),
        "ascent_m": round(ascent),
        "preview": [{"lat": round(p["lat"], 5), "lng": round(p["lng"], 5)} for p in sampled],
    }

def get_shared_course(session: Session, token: str, public_only: bool = False) -> Course:
    course = session.exec(select(Course).where(Course.share_token == token)).first()
    if (not course or course.is_deleted or course.visibility == "private"
            or (public_only and course.visibility != "public")):
        raise HTTPException(status_code=404, detail="Shared course not found")
    return course

def nickname_of(session: Session, user_id: Optional[str]) -> Optional[str]:
    profile = session.get(UserProfile, user_id) if user_id else None
    return profile.nickname if profile else None

def count_rows(session: Session, model, course_id: int) -> int:
    return session.exec(select(func.count()).select_from(model).where(model.course_id == course_id)).one()

def has_liked(session: Session, course_id: int, user_id) -> bool:
    return isinstance(user_id, str) and session.get(CourseLike, (course_id, user_id)) is not None

@app.get("/shared/{token}")
def read_shared_course(token: str, session: Session = Depends(get_session), user_id: str | int | None = Depends(get_optional_user)):
    course = get_shared_course(session, token)
    is_public = course.visibility == "public"
    return {
        "token": course.share_token,
        "title": course.title,
        "description": course.description,
        "sport": course.sport,
        "visibility": course.visibility,
        "markers": json.loads(course.markers_json),
        "polylines": json.loads(course.polylines_json),
        "nickname": nickname_of(session, course.firebase_uid),
        "is_owner": user_id is not None and owns(course, user_id),
        "share_count": course.share_count,
        # 좋아요·댓글은 전체 공개 코스에서만 사용합니다.
        "like_count": count_rows(session, CourseLike, course.id) if is_public else 0,
        "comment_count": count_rows(session, CourseComment, course.id) if is_public else 0,
        "liked": is_public and has_liked(session, course.id, user_id),
        "created_at": course.created_at,
        "published_at": course.published_at,
    }

@app.post("/shared/{token}/copy")
def copy_shared_course(token: str, data: CopyCourseRequest, session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    course = get_shared_course(session, token)
    if course.firebase_uid == user_id:
        raise HTTPException(status_code=400, detail="Course is already yours")
    require_profile(session, user_id)
    copied = dict(
        title=course.title,
        description=course.description,
        markers_json=course.markers_json,
        polylines_json=course.polylines_json,
        sport=course.sport,
        firebase_uid=user_id,
        user_id=0,
        folder_id=check_folder(session, data.folder_id, user_id),
        source_course_id=course.id,
    )
    new_course = Course(**copied)
    session.add(new_course)
    # 같은 계정이 여러 번 담아도 한 번만 셉니다. 담은 코스를 지워도 기록은 남겨 횟수가 줄지 않습니다.
    if session.get(CourseShare, (course.id, user_id)) is None:
        session.add(CourseShare(course_id=course.id, firebase_uid=user_id))
        session.exec(update(Course).where(Course.id == course.id).values(share_count=Course.share_count + 1))
    try:
        session.commit()
    except IntegrityError:
        # 같은 계정의 담기 요청이 동시에 들어와 기록이 이미 생긴 경우: 횟수는 그대로 두고 코스만 담습니다.
        session.rollback()
        new_course = Course(**copied)
        session.add(new_course)
        session.commit()
    session.refresh(new_course)
    session.refresh(course)
    return {"status": "success", "course": new_course, "share_count": course.share_count}

@app.post("/shared/{token}/like")
def like_course(token: str, session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    course = get_shared_course(session, token, public_only=True)
    require_profile(session, user_id)
    if not has_liked(session, course.id, user_id):
        session.add(CourseLike(course_id=course.id, firebase_uid=user_id))
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
    return {"liked": True, "like_count": count_rows(session, CourseLike, course.id)}

@app.delete("/shared/{token}/like")
def unlike_course(token: str, session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    course = get_shared_course(session, token, public_only=True)
    like = session.get(CourseLike, (course.id, user_id))
    if like:
        session.delete(like)
        session.commit()
    return {"liked": False, "like_count": count_rows(session, CourseLike, course.id)}

def comment_body(raw: str) -> str:
    body = raw.strip()
    if not 1 <= len(body) <= COMMENT_MAX:
        raise HTTPException(status_code=422, detail=f"Comment must be 1-{COMMENT_MAX} characters")
    return body

def comment_view(comment: CourseComment, nickname: Optional[str], course: Course, user_id) -> dict:
    is_mine = isinstance(user_id, str) and comment.firebase_uid == user_id
    return {
        "id": comment.id,
        "nickname": nickname,
        "body": comment.body,
        "created_at": comment.created_at,
        "updated_at": comment.updated_at,
        "is_mine": is_mine,
        # 코스 주인은 자기 코스에 달린 댓글을 지울 수 있습니다.
        "can_delete": is_mine or (user_id is not None and owns(course, user_id)),
    }

def get_comment(session: Session, comment_id: int) -> tuple[CourseComment, Course]:
    comment = session.get(CourseComment, comment_id)
    course = session.get(Course, comment.course_id) if comment else None
    if not comment or not course or course.is_deleted or course.visibility != "public":
        raise HTTPException(status_code=404, detail="Comment not found")
    return comment, course

@app.get("/shared/{token}/comments")
def read_comments(token: str, session: Session = Depends(get_session), user_id: str | int | None = Depends(get_optional_user)):
    course = get_shared_course(session, token, public_only=True)
    rows = session.exec(
        select(CourseComment, UserProfile.nickname)
        .join(UserProfile, UserProfile.firebase_uid == CourseComment.firebase_uid, isouter=True)
        .where(CourseComment.course_id == course.id)
        .order_by(CourseComment.id)
    ).all()
    return [comment_view(comment, nickname, course, user_id) for comment, nickname in rows]

@app.post("/shared/{token}/comments")
def create_comment(token: str, data: CommentRequest, session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    course = get_shared_course(session, token, public_only=True)
    profile = require_profile(session, user_id)
    comment = CourseComment(course_id=course.id, firebase_uid=user_id, body=comment_body(data.body))
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment_view(comment, profile.nickname, course, user_id)

@app.put("/comments/{comment_id}")
def update_comment(comment_id: int, data: CommentRequest, session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    comment, course = get_comment(session, comment_id)
    if comment.firebase_uid != user_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment.body = comment_body(data.body)
    comment.updated_at = utc_now()
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment_view(comment, nickname_of(session, user_id), course, user_id)

@app.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, session: Session = Depends(get_session), user_id: str = Depends(get_google_user)):
    comment, course = get_comment(session, comment_id)
    if comment.firebase_uid != user_id and not owns(course, user_id):
        raise HTTPException(status_code=404, detail="Comment not found")
    session.delete(comment)
    session.commit()
    return {"status": "success", "deleted_id": comment_id}

def escape_like(keyword: str) -> str:
    return keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

@app.get("/community")
def read_community(
    sport: Optional[Sport] = None,
    sort: Literal["recent", "popular", "likes"] = "recent",
    q: str = "",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
    session: Session = Depends(get_session),
    user_id: str | int | None = Depends(get_optional_user),
):
    like_count = select(func.count()).select_from(CourseLike).where(CourseLike.course_id == Course.id).correlate(Course).scalar_subquery()
    comment_count = select(func.count()).select_from(CourseComment).where(CourseComment.course_id == Course.id).correlate(Course).scalar_subquery()
    statement = (
        select(Course, UserProfile.nickname, like_count.label("like_count"), comment_count.label("comment_count"))
        .join(UserProfile, UserProfile.firebase_uid == Course.firebase_uid, isouter=True)
        .where(Course.is_deleted == False, Course.visibility == "public")
    )
    if sport:
        statement = statement.where(Course.sport == sport)
    keyword = q.strip()[:50]
    if keyword:
        pattern = f"%{escape_like(keyword)}%"
        statement = statement.where(or_(Course.title.ilike(pattern, escape="\\"), UserProfile.nickname.ilike(pattern, escape="\\")))
    order = {
        "recent": (Course.published_at.desc(), Course.id.desc()),
        "popular": (Course.share_count.desc(), like_count.desc(), Course.id.desc()),
        "likes": (like_count.desc(), Course.share_count.desc(), Course.id.desc()),
    }[sort]
    rows = session.exec(statement.order_by(*order).offset(offset).limit(limit + 1)).all()
    page = rows[:limit]
    liked = set()
    if isinstance(user_id, str) and page:
        liked = set(session.exec(select(CourseLike.course_id).where(
            CourseLike.firebase_uid == user_id, CourseLike.course_id.in_([row[0].id for row in page]))).all())
    items = [{
        "token": course.share_token,
        "title": course.title,
        "sport": course.sport,
        "nickname": nickname,
        "is_owner": user_id is not None and owns(course, user_id),
        "share_count": course.share_count,
        "like_count": likes,
        "comment_count": comments,
        "liked": course.id in liked,
        "published_at": course.published_at,
        **course_summary(course),
    } for course, nickname, likes, comments in page]
    return {"items": items, "has_more": len(rows) > limit}

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