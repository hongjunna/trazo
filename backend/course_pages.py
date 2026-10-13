"""검색 로봇과 방문자에게 동일한 코스 HTML을 제공합니다."""
import json
import math
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

environment = Environment(loader=FileSystemLoader(Path(__file__).parent / 'templates'), autoescape=select_autoescape(['html']))

def render_course_page(course, stats, nickname, related):
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
        map_json=json.dumps(map_segments).replace('<','\\u003c'), related=related)
