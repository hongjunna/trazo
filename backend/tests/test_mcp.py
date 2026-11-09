import base64
import hashlib
import json
import math
import os
import unittest
import urllib.parse
from unittest.mock import patch

os.environ.setdefault('DATABASE_URL', 'sqlite://')
os.environ.setdefault('COURSE_API_TOKENS', '{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":1,"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb":2}')
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine
import backend.main as api
from backend import course_geo

BASE = 'https://trazo.example'
REDIRECT = 'https://claude.ai/api/mcp/auth_callback'
VERIFIER = 'v' * 43 + 'erifier-1234567890'
CHALLENGE = base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest()).rstrip(b'=').decode()


def line(lat, lng, to_lat, to_lng, count, ele=lambda i: 10):
    return [{'lat': lat + (to_lat - lat) * i / count, 'lng': lng + (to_lng - lng) * i / count, 'ele': ele(i)} for i in range(count + 1)]


# 여의도 한강공원 근처를 도는 약 4.4km 순환 코스
YEOUIDO_LOOP = [line(37.528, 126.925, 37.528, 126.940, 20) + line(37.528, 126.940, 37.518, 126.940, 10)[1:]
                + line(37.518, 126.940, 37.518, 126.925, 20)[1:] + line(37.518, 126.925, 37.528, 126.925, 10)[1:]]
# 남산 오르막을 올라갔다 같은 길로 내려오는 왕복 코스
NAMSAN_HILL = [line(37.545, 126.980, 37.551, 126.988, 30, lambda i: 40 + i * 6) + line(37.551, 126.988, 37.545, 126.980, 30, lambda i: 220 - i * 6)[1:]]


class McpTests(unittest.TestCase):
    def setUp(self):
        api.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(api.engine)
        api.analysis_cache.clear()
        api.oauth_register_log.clear()
        for name, value in (('PUBLIC_BASE_URL', BASE), ('KAKAO_REST_API_KEY', ''), ('FIREBASE_PROJECT_ID', 'test-project')):
            patcher = patch.object(api, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        verifier = patch.object(api.id_token, 'verify_firebase_token')
        verify = verifier.start()
        self.addCleanup(verifier.stop)
        def check(token, request, audience, clock_skew_in_seconds=0):
            if not token.endswith('-token'):
                raise ValueError('Invalid token')
            return {'sub': token, 'iss': 'https://securetoken.google.com/test-project', 'firebase': {'sign_in_provider': 'google.com'}}
        verify.side_effect = check
        self.client = TestClient(api.app)
        self.owner = {'Authorization': 'Bearer owner-token'}
        self.other = {'Authorization': 'Bearer other-token'}

    # --- 도우미 ---
    def save_course(self, headers, title, polylines, sport='run', visibility='private', **extra):
        response = self.client.post('/courses', headers=headers, json={'title': title, 'markers': [], 'polylines': polylines,
                                                                       'sport': sport, 'visibility': visibility, **extra})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()['course']

    def register(self, **metadata):
        body = {'client_name': 'Claude', 'redirect_uris': [REDIRECT], 'token_endpoint_auth_method': 'none', **metadata}
        return self.client.post('/oauth/register', json=body)

    def authorize(self, client_id, headers=None, **changes):
        body = {'client_id': client_id, 'redirect_uri': REDIRECT, 'response_type': 'code', 'code_challenge': CHALLENGE,
                'code_challenge_method': 'S256', 'state': 'xyz', 'resource': BASE + '/mcp', 'approve': True, **changes}
        return self.client.post('/oauth/authorize', json=body, headers=headers or {})

    def login(self, headers=None):
        """AI 서비스가 하는 OAuth 로그인 전체 과정을 거쳐 액세스 토큰을 받습니다."""
        client_id = self.register().json()['client_id']
        redirect = self.authorize(client_id, headers or self.owner).json()['redirect_to']
        code = urllib.parse.parse_qs(urllib.parse.urlsplit(redirect).query)['code'][0]
        tokens = self.client.post('/oauth/token', data={'grant_type': 'authorization_code', 'code': code, 'client_id': client_id,
                                                        'redirect_uri': REDIRECT, 'code_verifier': VERIFIER}).json()
        return client_id, tokens

    def rpc(self, token, method, params=None, request_id=1):
        response = self.client.post('/mcp', headers={'Authorization': f'Bearer {token}'},
                                    json={'jsonrpc': '2.0', 'id': request_id, 'method': method, 'params': params or {}})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def call(self, token, tool, **arguments):
        result = self.rpc(token, 'tools/call', {'name': tool, 'arguments': arguments})['result']
        self.assertEqual(json.loads(result['content'][0]['text']), result.get('structuredContent', json.loads(result['content'][0]['text'])))
        return result

    # --- OAuth ---
    def test_discovery_metadata(self):
        resource = self.client.get('/.well-known/oauth-protected-resource/mcp').json()
        self.assertEqual(resource['resource'], BASE + '/mcp')
        self.assertEqual(resource['authorization_servers'], [BASE])
        metadata = self.client.get('/.well-known/oauth-authorization-server').json()
        self.assertEqual(metadata['issuer'], BASE)
        self.assertEqual(metadata['code_challenge_methods_supported'], ['S256'])
        self.assertEqual(metadata['authorization_endpoint'], BASE + '/oauth/authorize')
        unauthorized = self.client.post('/mcp', json={'jsonrpc': '2.0', 'id': 1, 'method': 'initialize'})
        self.assertEqual(unauthorized.status_code, 401)
        self.assertIn(f'resource_metadata="{BASE}/.well-known/oauth-protected-resource/mcp"', unauthorized.headers['www-authenticate'])
        self.assertEqual(self.client.post('/mcp', headers={'Authorization': 'Bearer nope'}, json={}).status_code, 401)
        self.assertEqual(self.client.get('/mcp').status_code, 405)

    def test_client_registration_rules(self):
        for uris in ([], ['http://evil.example/cb'], ['javascript:alert(1)'], ['https://ok.example/cb#frag'], 'https://ok.example'):
            self.assertEqual(self.register(redirect_uris=uris).status_code, 400, uris)
        for uris in ([REDIRECT], ['http://localhost:33418/callback', 'http://127.0.0.1:9000/cb'], ['cursor://anysphere.cursor-mcp/oauth/callback']):
            self.assertEqual(self.register(redirect_uris=uris).status_code, 201, uris)
        confidential = self.register(token_endpoint_auth_method='client_secret_post').json()
        self.assertTrue(confidential['client_secret'])
        info = self.client.get('/oauth/client', params={'client_id': confidential['client_id'], 'redirect_uri': REDIRECT})
        self.assertEqual(info.json()['client_name'], 'Claude')
        self.assertEqual(info.json()['redirect_host'], 'claude.ai')
        self.assertEqual(self.client.get('/oauth/client', params={'client_id': confidential['client_id'], 'redirect_uri': 'https://evil.example/cb'}).status_code, 400)
        self.assertEqual(self.client.get('/oauth/client', params={'client_id': 'unknown', 'redirect_uri': REDIRECT}).status_code, 400)

    def test_registration_rate_limit(self):
        for _ in range(api.OAUTH_REGISTER_MAX_PER_IP):
            self.assertEqual(self.register().status_code, 201)
        self.assertEqual(self.register().status_code, 429)

    def test_authorization_flow(self):
        client_id = self.register().json()['client_id']
        # 등록하지 않은 주소로는 오류도 돌려보내지 않습니다.
        self.assertEqual(self.authorize(client_id, self.owner, redirect_uri='https://evil.example/cb').status_code, 400)
        denied = self.authorize(client_id, approve=False).json()['redirect_to']
        self.assertTrue(denied.startswith(REDIRECT + '?'))
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlsplit(denied).query)['error'], ['access_denied'])
        self.assertEqual(self.authorize(client_id).status_code, 401)
        for changes, error in (({'code_challenge_method': 'plain'}, 'invalid_request'), ({'response_type': 'token'}, 'unsupported_response_type'),
                               ({'resource': 'https://other.example/mcp'}, 'invalid_target')):
            redirect = self.authorize(client_id, self.owner, **changes).json()['redirect_to']
            self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlsplit(redirect).query)['error'], [error])
        redirect = self.authorize(client_id, self.owner).json()['redirect_to']
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(redirect).query)
        self.assertEqual(query['state'], ['xyz'])
        self.assertEqual(query['iss'], [BASE])
        code = query['code'][0]
        exchange = {'grant_type': 'authorization_code', 'code': code, 'client_id': client_id, 'redirect_uri': REDIRECT, 'code_verifier': VERIFIER}
        other_client = self.register().json()['client_id']
        self.assertEqual(self.client.post('/oauth/token', data={**exchange, 'client_id': other_client}).json()['error'], 'invalid_grant')
        tokens = self.client.post('/oauth/token', data=exchange)
        self.assertEqual(tokens.status_code, 200, tokens.text)
        self.assertEqual(tokens.headers['cache-control'], 'no-store')
        # 코드는 한 번만 쓸 수 있습니다.
        self.assertEqual(self.client.post('/oauth/token', data=exchange).json()['error'], 'invalid_grant')
        # 잘못된 code_verifier를 보내면 코드가 사라집니다.
        code = urllib.parse.parse_qs(urllib.parse.urlsplit(self.authorize(client_id, self.owner).json()['redirect_to']).query)['code'][0]
        self.assertEqual(self.client.post('/oauth/token', data={**exchange, 'code': code, 'code_verifier': 'x' * 43}).json()['error'], 'invalid_grant')
        self.assertEqual(self.client.post('/oauth/token', data={**exchange, 'code': code}).json()['error'], 'invalid_grant')
        self.assertEqual(self.client.post('/oauth/token', data={**exchange, 'grant_type': 'password'}).json()['error'], 'unsupported_grant_type')
        self.assertEqual(self.client.post('/oauth/token', data={**exchange, 'client_id': 'unknown'}).status_code, 401)

    def test_confidential_client_and_refresh(self):
        registered = self.register(token_endpoint_auth_method='client_secret_basic').json()
        client_id, secret = registered['client_id'], registered['client_secret']
        basic = {'Authorization': 'Basic ' + base64.b64encode(f'{client_id}:{secret}'.encode()).decode()}
        code = urllib.parse.parse_qs(urllib.parse.urlsplit(self.authorize(client_id, self.owner).json()['redirect_to']).query)['code'][0]
        exchange = {'grant_type': 'authorization_code', 'code': code, 'redirect_uri': REDIRECT, 'code_verifier': VERIFIER}
        self.assertEqual(self.client.post('/oauth/token', data={**exchange, 'client_id': client_id}).status_code, 401)
        tokens = self.client.post('/oauth/token', data=exchange, headers=basic).json()
        refreshed = self.client.post('/oauth/token', data={'grant_type': 'refresh_token', 'refresh_token': tokens['refresh_token']}, headers=basic).json()
        self.assertNotEqual(refreshed['access_token'], tokens['access_token'])
        # 쓴 갱신 토큰은 다시 쓸 수 없습니다.
        self.assertEqual(self.client.post('/oauth/token', data={'grant_type': 'refresh_token', 'refresh_token': tokens['refresh_token']}, headers=basic).json()['error'], 'invalid_grant')
        self.assertIn('result', self.rpc(refreshed['access_token'], 'ping'))
        self.client.post('/oauth/revoke', data={'token': refreshed['refresh_token']}, headers=basic)
        self.assertEqual(self.client.post('/mcp', headers={'Authorization': f"Bearer {refreshed['access_token']}"}, json={}).status_code, 401)

    def test_expired_access_token(self):
        _, tokens = self.login()
        with patch.object(api.time, 'time', return_value=api.time.time() + api.OAUTH_ACCESS_SECONDS + 5):
            self.assertEqual(self.client.post('/mcp', headers={'Authorization': f"Bearer {tokens['access_token']}"},
                                              json={'jsonrpc': '2.0', 'id': 1, 'method': 'ping'}).status_code, 401)

    def test_connections_list_and_disconnect(self):
        client_id, tokens = self.login()
        connections = self.client.get('/oauth/connections', headers=self.owner).json()
        self.assertEqual([(c['client_id'], c['client_name']) for c in connections], [(client_id, 'Claude')])
        self.assertEqual(self.client.get('/oauth/connections', headers=self.other).json(), [])
        self.client.delete(f'/oauth/connections/{client_id}', headers=self.other)
        self.assertIn('result', self.rpc(tokens['access_token'], 'ping'))
        self.client.delete(f'/oauth/connections/{client_id}', headers=self.owner)
        self.assertEqual(self.client.post('/mcp', headers={'Authorization': f"Bearer {tokens['access_token']}"}, json={}).status_code, 401)
        self.assertEqual(self.client.get('/oauth/connections', headers=self.owner).json(), [])

    # --- MCP ---
    def test_protocol(self):
        _, tokens = self.login()
        token = tokens['access_token']
        init = self.rpc(token, 'initialize', {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'test', 'version': '1'}})['result']
        self.assertEqual(init['protocolVersion'], '2025-06-18')
        self.assertEqual(init['serverInfo']['name'], 'trazo')
        self.assertIn('tools', init['capabilities'])
        self.assertEqual(self.rpc(token, 'initialize', {'protocolVersion': '1999-01-01'})['result']['protocolVersion'], '2025-11-25')
        notification = self.client.post('/mcp', headers={'Authorization': f'Bearer {token}'}, json={'jsonrpc': '2.0', 'method': 'notifications/initialized'})
        self.assertEqual(notification.status_code, 202)
        tools = {tool['name']: tool for tool in self.rpc(token, 'tools/list')['result']['tools']}
        self.assertEqual(set(tools), {'search_courses', 'get_course'})
        self.assertTrue(all(tool['annotations']['readOnlyHint'] for tool in tools.values()))
        schema = tools['search_courses']['inputSchema']
        self.assertEqual(schema['properties']['near_lat']['type'], 'number')
        self.assertNotIn('anyOf', json.dumps(schema))
        self.assertEqual(self.rpc(token, 'resources/list')['error']['code'], -32601)
        self.assertEqual(self.rpc(token, 'tools/call', {'name': 'nope'})['error']['code'], -32602)
        bad = self.call(token, 'search_courses', near_lat=37.5)
        self.assertTrue(bad['isError'])
        broken = self.client.post('/mcp', headers={'Authorization': f'Bearer {token}'}, content=b'{not json')
        self.assertEqual(broken.json()['error']['code'], -32700)
        with patch.object(api, 'KAKAO_REST_API_KEY', 'key'):
            self.assertIn('find_place', {tool['name'] for tool in self.rpc(token, 'tools/list')['result']['tools']})

    def test_search_visibility(self):
        self.client.put('/me', headers=self.other, json={'nickname': 'runner'})
        self.client.put('/me', headers=self.owner, json={'nickname': 'owner'})
        mine = self.save_course(self.owner, '내 비밀 코스', YEOUIDO_LOOP)
        self.save_course(self.owner, '내 공개 코스', NAMSAN_HILL, visibility='public')
        other_public = self.save_course(self.other, '남의 공개 코스', YEOUIDO_LOOP, visibility='public')
        other_link = self.save_course(self.other, '남의 링크 코스', YEOUIDO_LOOP, visibility='link')
        self.save_course(self.other, '남의 비공개 코스', YEOUIDO_LOOP)
        deleted = self.save_course(self.owner, '지운 코스', YEOUIDO_LOOP)
        self.client.delete(f"/courses/{deleted['id']}", headers=self.owner)
        _, tokens = self.login()
        token = tokens['access_token']
        titles = lambda **args: sorted(c['title'] for c in self.call(token, 'search_courses', **args)['structuredContent']['courses'])
        self.assertEqual(titles(), ['남의 공개 코스', '내 공개 코스', '내 비밀 코스'])
        self.assertEqual(titles(scope='mine'), ['내 공개 코스', '내 비밀 코스'])
        self.assertEqual(titles(scope='public'), ['남의 공개 코스', '내 공개 코스'])
        self.assertEqual(titles(query='runner'), ['남의 공개 코스'])
        courses = {c['title']: c for c in self.call(token, 'search_courses')['structuredContent']['courses']}
        self.assertEqual(courses['내 비밀 코스']['owner'], 'me')
        self.assertIsNone(courses['내 비밀 코스']['url'])
        self.assertEqual(courses['남의 공개 코스']['owner'], 'runner')
        self.assertEqual(courses['남의 공개 코스']['url'], f"{BASE}/c/{other_public['share_token']}")
        self.assertEqual(courses['남의 공개 코스']['course_ref'], other_public['share_token'])
        self.assertEqual(courses['내 비밀 코스']['course_ref'], str(mine['id']))
        # 링크 공유 코스는 검색되지 않지만 링크를 받으면 읽을 수 있습니다.
        linked = self.call(token, 'get_course', course_ref=f"{BASE}/c/{other_link['share_token']}")
        self.assertEqual(linked['structuredContent']['title'], '남의 링크 코스')
        self.assertEqual(self.call(token, 'get_course', course_ref=f"https://trazo.runvia.app/?course={other_link['share_token']}")['structuredContent']['title'], '남의 링크 코스')
        # 다른 사람의 비공개 코스와 지운 코스는 번호로도 읽을 수 없습니다.
        other_private_id = str(other_link['id'] + 1)
        for ref in (other_private_id, str(deleted['id']), str(other_public['id'])):
            self.assertTrue(self.call(token, 'get_course', course_ref=ref)['isError'], ref)
        self.assertEqual(self.call(token, 'get_course', course_ref=str(mine['id']))['structuredContent']['title'], '내 비밀 코스')
        # 다른 계정으로 로그인한 AI는 내 비공개 코스를 읽을 수 없습니다.
        _, other_tokens = self.login(self.other)
        self.assertTrue(self.call(other_tokens['access_token'], 'get_course', course_ref=str(mine['id']))['isError'])
        self.assertNotIn('내 비밀 코스', [c['title'] for c in self.call(other_tokens['access_token'], 'search_courses')['structuredContent']['courses']])

    def test_search_filters(self):
        self.save_course(self.owner, '여의도 순환', YEOUIDO_LOOP)
        self.save_course(self.owner, '남산 언덕', NAMSAN_HILL)
        self.save_course(self.owner, '여의도 자전거', YEOUIDO_LOOP, sport='bike')
        _, tokens = self.login()
        token = tokens['access_token']
        search = lambda **args: self.call(token, 'search_courses', **args)['structuredContent']['courses']
        self.assertEqual([c['title'] for c in search(sport='bike')], ['여의도 자전거'])
        near = search(sport='run', near_lat=37.5265, near_lng=126.9330, radius_km=1)
        self.assertEqual([c['title'] for c in near], ['여의도 순환'])
        self.assertLess(near[0]['distance_from_point_km'], 0.3)
        self.assertEqual(near[0]['route_type'], 'loop')
        self.assertEqual([c['title'] for c in search(sport='run', near_lat=37.5265, near_lng=126.9330, radius_km=20)], ['여의도 순환', '남산 언덕'])
        self.assertEqual([c['title'] for c in search(sport='run', min_ascent_m=100)], ['남산 언덕'])
        self.assertEqual([c['title'] for c in search(sport='run', max_ascent_m=10)], ['여의도 순환'])
        self.assertEqual([c['title'] for c in search(route_type='out_and_back')], ['남산 언덕'])
        self.assertEqual([c['title'] for c in search(sport='run', min_distance_km=3, max_distance_km=6)], ['여의도 순환'])
        self.assertEqual([c['title'] for c in search(sport='run', sort='ascent_desc')], ['남산 언덕', '여의도 순환'])
        # 경로를 고치면 기억해 둔 분석 결과 대신 새 경로로 다시 계산합니다.
        loop = next(c for c in search(sport='run') if c['title'] == '여의도 순환')
        self.client.put(f"/courses/{loop['course_ref']}", headers=self.owner, json={'polylines': [line(37.5, 127.0, 37.6, 127.0, 50)]})
        changed = next(c for c in search(sport='run') if c['title'] == '여의도 순환')
        self.assertAlmostEqual(changed['distance_km'], 11.1, delta=0.1)
        self.assertEqual(changed['route_type'], 'point_to_point')

    def test_course_detail(self):
        waypoint = {'lat': 37.551, 'lng': 126.988, 'type': 'summit', 'name': '남산 정상', 'note': '물 보충'}
        course = self.save_course(self.owner, '남산 언덕', NAMSAN_HILL, waypoints=[waypoint])
        _, tokens = self.login()
        detail = self.call(tokens['access_token'], 'get_course', course_ref=str(course['id']))['structuredContent']
        self.assertEqual(detail['route_type'], 'out_and_back')
        self.assertEqual(detail['ascent_m'], 180)
        self.assertEqual(detail['elevation'], {'min_m': 40, 'max_m': 220, 'start_m': 40, 'end_m': 40})
        self.assertEqual(len(detail['climbs']), 1)
        self.assertAlmostEqual(detail['climbs'][0]['start_km'], 0, delta=0.15)
        self.assertGreater(detail['grades']['max_uphill_pct'], 10)
        self.assertEqual(detail['waypoints'][0]['name'], '남산 정상')
        self.assertAlmostEqual(detail['waypoints'][0]['km'], detail['distance_km'] / 2, delta=0.1)
        self.assertEqual(len(detail['route_sample']), 60)
        self.assertEqual(sum(split['gain_m'] for split in detail['splits']), 180)
        self.assertNotIn('areas_passed', detail)

    def test_kakao_location(self):
        self.save_course(self.owner, '여의도 순환', YEOUIDO_LOOP)
        _, tokens = self.login()
        token = tokens['access_token']
        calls = []
        def kakao(path, params):
            calls.append(path)
            if path.endswith('coord2regioncode.json'):
                name = '서울특별시 영등포구 여의도동' if params['y'] < 37.53 else '서울특별시 마포구 망원동'
                return {'documents': [{'region_type': 'H', 'address_name': '행정동'}, {'region_type': 'B', 'address_name': name}]}
            if path.endswith('keyword.json'):
                return {'documents': [{'place_name': '여의도한강공원', 'category_name': '여행 > 공원', 'road_address_name': '서울 영등포구 여의동로 330', 'x': '126.9341', 'y': '37.5284'}]}
            return {'documents': []}
        with patch.object(api, 'KAKAO_REST_API_KEY', 'key'), patch.object(api, 'kakao_get', side_effect=kakao):
            place = self.call(token, 'find_place', query='여의도한강공원')['structuredContent']['places'][0]
            self.assertEqual((place['lat'], place['lng']), (37.5284, 126.9341))
            course = self.call(token, 'search_courses', near_lat=place['lat'], near_lng=place['lng'])['structuredContent']['courses'][0]
            self.assertEqual(course['start']['area'], '서울특별시 영등포구 여의도동')
            detail = self.call(token, 'get_course', course_ref=course['course_ref'])['structuredContent']
            self.assertEqual(detail['areas_passed'], ['서울특별시 영등포구 여의도동'])
            # 같은 좌표는 다시 묻지 않습니다.
            before = len(calls)
            self.call(token, 'search_courses')
            self.assertEqual(len(calls), before)
        with patch.object(api, 'KAKAO_REST_API_KEY', 'key'), patch.object(api, 'kakao_get', return_value=None):
            self.assertTrue(self.call(token, 'find_place', query='여의도')['isError'])


class CourseGeoTests(unittest.TestCase):
    def test_route_types(self):
        dumps = lambda polylines: json.dumps(polylines)
        self.assertEqual(course_geo.analyze_route(dumps(YEOUIDO_LOOP), 'run')['route_type'], 'loop')
        self.assertEqual(course_geo.analyze_route(dumps(NAMSAN_HILL), 'run')['route_type'], 'out_and_back')
        self.assertEqual(course_geo.analyze_route(dumps([line(37.5, 127.0, 37.52, 127.0, 20)]), 'run')['route_type'], 'point_to_point')

    def test_invalid_routes(self):
        for raw in ('', 'null', '{}', '[[{"lat": "x"}]]', '[[{"lat": 37.5, "lng": 127.0}]]'):
            result = course_geo.analyze_route(raw)
            self.assertEqual(result['distance_km'], 0, raw)
            self.assertEqual(course_geo.sample_route(result), [] if raw != '[[{"lat": 37.5, "lng": 127.0}]]' else [{'lat': 37.5, 'lng': 127.0, 'km': 0.0}])

    def test_without_elevation(self):
        result = course_geo.analyze_route(json.dumps([[{'lat': 37.5, 'lng': 127.0}, {'lat': 37.51, 'lng': 127.0}]]))
        self.assertFalse(result['has_elevation'])
        self.assertIsNone(result['grades'])
        self.assertAlmostEqual(result['distance_km'], 1.11, delta=0.01)

    def test_distance_to_route_uses_segments(self):
        # 경로 점에서는 멀어도 선분 위에서는 가까운 지점
        near = [(37.50, 127.00), (37.50, 127.10)]
        self.assertLess(course_geo.distance_to_route_m(near, 37.5005, 127.05), 60)
        self.assertAlmostEqual(course_geo.distance_to_route_m(near, 37.51, 127.0), 1105, delta=15)
        self.assertTrue(math.isinf(course_geo.distance_to_route_m([], 37.5, 127.0)))


if __name__ == '__main__':
    unittest.main()
