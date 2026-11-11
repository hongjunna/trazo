"""검색 로봇과 방문자에게 동일한 코스 HTML을 제공합니다."""
import json
import math
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

# AI 인사이트 관련 상수 (backend/course_insight.py와 동기화)
LEVEL_LABELS = {1: '입문', 2: '쉬움', 3: '보통', 4: '어려움', 5: '매우 어려움'}
LEVEL_DESCRIPTIONS = {
    'run': {
        1: '평탄한 지형에서 5km 이하로 달리는 코스입니다. 러닝 입문자나 회복 주에 적합합니다.',
        2: '완만한 기복이 있는 5~10km 코스입니다. 주 2~3회 러닝 경험이 있다면 무리 없이 소화 가능합니다.',
        3: '고도 변화가 뚜렷한 10~20km 코스입니다. 지속적인 페이스 조절이 필요하며 중급자 이상에게 적합합니다.',
        4: '가파른 오르막이 포함된 20km 이상 코스입니다. 언덕 훈련 경험이 풍부한 상급자에게 권장됩니다.',
        5: '극한의 고도 변화와 장거리가 결합된 코스입니다. 전문적인 지구력과 기술이 필요합니다.'
    },
    'bike': {
        1: '평탄한 지형에서 20km 이하로 달리는 코스입니다. 라이딩 입문자나 회복 라이딩에 적합합니다.',
        2: '완만한 기복이 있는 20~50km 코스입니다. 주말 라이딩 경험이 있다면 편안하게 즐길 수 있습니다.',
        3: '고도 변화가 뚜렷한 50~100km 코스입니다. 업힐 경험이 있는 중급자 이상에게 적합합니다.',
        4: '가파른 업힐이 포함된 100km 이상 코스입니다. 긴 오르막 경험이 풍부한 상급자에게 권장됩니다.',
        5: '극한의 업힐과 장거리가 결합된 코스입니다. 전문적인 등반 능력과 지구력이 필요합니다.'
    }
}
TERRAIN_KO = {'flat': '평지', 'rolling': '완만한 언덕', 'hilly': '언덕', 'mountainous': '산악'}
SHAPE_KO = {'loop': '순환', 'out_and_back': '왕복', 'point_to_point': '편도'}
TRAINING_KO = {
    'interval': '인터벌', 'tempo': '템포', 'hill_repeat': '언덕 반복',
    'lsd': 'LSD(장거리)', 'recovery': '회복', 'race_pace': '레이스 페이스'
}
THEME_LABELS = {
    'scenic': '경관', 'climb': '업힐', 'technical': '테크니컬',
    'city': '도심', 'coastal': '해안', 'forest': '숲길',
    'historic': '역사/문화', 'cafe': '카페', 'training': '훈련'
}

def get_difficulty_label(level):
    return LEVEL_LABELS.get(level, '알 수 없음')

def get_difficulty_description(level, sport):
    return LEVEL_DESCRIPTIONS.get(sport, {}).get(level, '')

def get_terrain_label(terrain):
    return TERRAIN_KO.get(terrain, terrain)

def get_shape_label(shape):
    return SHAPE_KO.get(shape, shape)

def get_training_label(training):
    return TRAINING_KO.get(training, training)

def get_theme_label(theme):
    return THEME_LABELS.get(theme, theme)

environment = Environment(loader=FileSystemLoader(Path(__file__).parent / 'templates'), autoescape=select_autoescape(['html']))

# 템플릿에서 사용할 전역 함수 등록
environment.globals.update(
    get_difficulty_label=get_difficulty_label,
    get_difficulty_description=get_difficulty_description,
    get_terrain_label=get_terrain_label,
    get_shape_label=get_shape_label,
    get_training_label=get_training_label,
    get_theme_label=get_theme_label
)

def render_course_page(course, stats, nickname, related, insight=None):
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
    summary = f'{course.title} · {sport} 코스 {stats["distance_km"]:.2f}km · 상승 고도 {stats["ascent_m"]}m. Trazo에서 코스를 저장하고 내 경로로 편집하세요.'
    # JSON script에 사용자 입력을 넣지 않으며, 스크립트 종료 문자도 이스케이프합니다.
    map_segments = [segment[::max(1,len(segment)//1000)] + ([segment[-1]] if len(segment)>1 else []) for segment in segments]
    return environment.get_template('course.html').render(
        title=course.title, description=course.description, nickname=nickname or '라이더', sport=sport,
        visibility='전체 공개' if course.visibility=='public' else '링크 공유',
        robots='index, follow, max-image-preview:large' if course.visibility=='public' else 'noindex, follow',
        url=f'https://trazo.runvia.app/c/{course.share_token}', summary=summary,
        distance=f'{stats["distance_km"]:.2f}', ascent=f'{stats["ascent_m"]:,}', copies=course.share_count,
        start_url=f'/?course={course.share_token}&action=save', view_url=f'/?course={course.share_token}',
        route_svg=route_svg, elevation_svg=elevation_svg, min_ele=round(low), max_ele=round(high),
        map_json=json.dumps(map_segments).replace('<','\\u003c'), related=related, insight=insight)
