import os
import unittest
from unittest.mock import patch

os.environ.setdefault('DATABASE_URL', 'sqlite://')
os.environ.setdefault('COURSE_API_TOKENS', '{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":1,"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb":2}')
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine
import backend.main as api

SEED_EMAIL = 'seed@example.com'
LOOP = [[{'lat': 37.528, 'lng': 126.925, 'ele': 10}, {'lat': 37.528, 'lng': 126.94, 'ele': 12},
         {'lat': 37.518, 'lng': 126.94, 'ele': 10}, {'lat': 37.528, 'lng': 126.925, 'ele': 10}]]
BUSAN = [[{'lat': 35.15, 'lng': 129.11, 'ele': 5}, {'lat': 35.16, 'lng': 129.16, 'ele': 5}]]


class PersonaTests(unittest.TestCase):
    """운영 계정 코스의 가상 작성자, 가상 계정 관리, 좋아요 봇, 코스 지도"""

    def setUp(self):
        api.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(api.engine)
        api.known_seed_uids.clear()
        api.analysis_cache.clear()
        for name, value in (('FIREBASE_PROJECT_ID', 'test-project'), ('SEED_ACCOUNT_EMAILS', {SEED_EMAIL}),
                            ('ADMIN_USERNAME', 'admin'), ('ADMIN_PASSWORD', 'correct-horse-battery'),
                            ('admin_login_failures', []), ('LIKE_BOT_TOKEN', 'bot-secret-token')):
            patcher = patch.object(api, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        verifier = patch.object(api.id_token, 'verify_firebase_token')
        verify = verifier.start()
        self.addCleanup(verifier.stop)

        def check(token, request, audience, clock_skew_in_seconds=0):
            if not token.endswith('-token'):
                raise ValueError('Invalid token')
            # seed-token 계정만 운영 계정 이메일로 로그인합니다.
            email = SEED_EMAIL if token == 'seed-token' else f'{token}@example.com'
            return {'sub': token, 'iss': 'https://securetoken.google.com/test-project', 'email': email, 'email_verified': True,
                    'firebase': {'sign_in_provider': 'google.com'}}
        verify.side_effect = check
        self.client = TestClient(api.app)
        self.seed = {'Authorization': 'Bearer seed-token'}
        self.user = {'Authorization': 'Bearer user-token'}
        for headers, nickname in ((self.seed, 'operator'), (self.user, 'realuser')):
            self.assertEqual(self.client.put('/me', headers=headers, json={'nickname': nickname}).status_code, 200)
        token = self.client.post('/admin/login', json={'username': 'admin', 'password': 'correct-horse-battery'}).json()['token']
        self.admin = {'Authorization': f'Bearer {token}'}

    def publish(self, headers, title, polylines=LOOP, visibility='public', sport='run'):
        response = self.client.post('/courses', headers=headers, json={'title': title, 'markers': [], 'polylines': polylines,
                                                                       'sport': sport, 'visibility': visibility})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()['course']

    def add_personas(self, *nicknames):
        return self.client.post('/admin/virtual-accounts', headers=self.admin, json={'nicknames': list(nicknames)}).json()

    def community(self):
        return {item['title']: item for item in self.client.get('/community').json()['items']}

    def test_seed_courses_show_virtual_author(self):
        before = self.publish(self.seed, '배정 전 코스')
        self.assertEqual(self.community()['배정 전 코스']['nickname'], 'operator')
        result = self.add_personas('러너김', '자전거박', 'bad name!', 'realuser', '러너김')
        self.assertEqual([item['nickname'] for item in result['created']], ['러너김', '자전거박'])
        self.assertEqual(len(result['errors']), 3)
        # 가상 계정을 만들면 기존 운영 계정 코스에 바로 배정합니다.
        self.assertEqual(result['assigned'], 1)
        self.assertIn(self.community()['배정 전 코스']['nickname'], {'러너김', '자전거박'})
        course = self.publish(self.seed, '새 코스')
        shared = self.client.get(f"/shared/{course['share_token']}", headers=self.seed).json()
        self.assertIn(shared['nickname'], {'러너김', '자전거박'})
        # 운영 계정은 여전히 자기 코스로 관리합니다.
        self.assertTrue(shared['is_owner'])
        self.assertEqual(len(self.client.get('/courses', headers=self.seed).json()), 2)
        # 실제 사용자의 코스는 그대로 보입니다.
        self.publish(self.user, '진짜 사용자 코스')
        self.assertEqual(self.community()['진짜 사용자 코스']['nickname'], 'realuser')
        # 닉네임 검색도 보이는 작성자 기준입니다.
        persona = self.community()['새 코스']['nickname']
        titles = [item['title'] for item in self.client.get('/community', params={'q': persona}).json()['items']]
        self.assertIn('새 코스', titles)
        # 가상 계정 닉네임은 실제 사용자가 가져갈 수 없습니다.
        self.assertEqual(self.client.put('/me', headers=self.user, json={'nickname': '러너김'}).status_code, 409)
        page = self.client.get(f"/pages/c/{course['share_token']}").text
        self.assertIn(persona, page)
        self.assertNotIn('operator', page)
        detail = self.client.get(f"/admin/courses/{before['id']}", headers=self.admin).json()
        self.assertEqual(detail['nickname'], 'operator')
        self.assertIn(detail['display_nickname'], {'러너김', '자전거박'})

    def test_series_courses_share_author(self):
        # 제목 머리말이 같은 시리즈([제주 3km], [제주 5km] …)는 거리와 상관없이 같은 작성자로 보입니다.
        self.add_personas(*[f'가상계정{i}' for i in range(12)])
        titles = [f'[제주 {km}km] 코스{km}' for km in (3, 5, 7, 4, 10)]
        for title in titles:
            self.publish(self.seed, title)
        self.publish(self.seed, '[부산 5km] 해운대')
        authors = {self.community()[title]['nickname'] for title in titles}
        self.assertEqual(len(authors), 1)
        for _ in range(3):
            self.client.post('/admin/virtual-accounts/assign', headers=self.admin, json={'mode': 'all'})
            self.assertEqual(len({self.community()[title]['nickname'] for title in titles}), 1)
        self.assertEqual(api.series_key('［제주 10K］ 이호'), '제주')
        self.assertIsNone(api.series_key('[5km] 이름 없는 시리즈'))
        self.assertIsNone(api.series_key('제주 5km'))

    def test_assignment_stays_and_reassigns_on_delete(self):
        self.add_personas('하나아이디')
        course = self.publish(self.seed, '고정 코스')
        self.assertEqual(self.community()['고정 코스']['nickname'], '하나아이디')
        # 비공개로 바꿨다가 다시 공개해도 같은 작성자로 보입니다.
        self.client.put(f"/courses/{course['id']}", headers=self.seed, json={'visibility': 'private'})
        self.add_personas('둘아이디')
        self.client.put(f"/courses/{course['id']}", headers=self.seed, json={'visibility': 'public'})
        self.assertEqual(self.community()['고정 코스']['nickname'], '하나아이디')
        accounts = {item['nickname']: item for item in self.client.get('/admin/virtual-accounts', headers=self.admin).json()['items']}
        self.assertEqual(accounts['하나아이디']['course_count'], 1)
        uid = accounts['하나아이디']['firebase_uid']
        self.assertEqual(self.client.delete(f'/admin/virtual-accounts/{uid}', headers=self.admin).status_code, 200)
        self.assertEqual(self.community()['고정 코스']['nickname'], '둘아이디')
        self.assertEqual(self.client.post('/admin/virtual-accounts/assign', headers=self.admin, json={'mode': 'all'}).json()['assigned'], 1)
        info = self.client.get('/admin/virtual-accounts', headers=self.admin).json()
        self.assertEqual([seed['email'] for seed in info['seed_accounts']], [SEED_EMAIL])
        self.assertEqual(info['unassigned_count'], 0)
        summary = self.client.get('/admin/summary', headers=self.admin).json()
        self.assertEqual(summary['virtual_accounts'], 1)
        self.assertEqual(summary['users'], 2)
        users = {item['nickname']: item for item in self.client.get('/admin/users', headers=self.admin).json()['items']}
        self.assertTrue(users['둘아이디']['is_virtual'])
        self.assertTrue(users['operator']['is_seed'])

    def test_unverified_email_is_not_seed(self):
        with patch.object(api, 'SEED_ACCOUNT_EMAILS', {'user-token@example.com'}):
            self.add_personas('가상하나')
            api.id_token.verify_firebase_token.side_effect = lambda token, *a, **k: {
                'sub': token, 'iss': 'https://securetoken.google.com/test-project', 'email': 'user-token@example.com',
                'email_verified': False, 'firebase': {'sign_in_provider': 'google.com'}}
            self.publish(self.user, '미인증')
            self.assertEqual(self.community()['미인증']['nickname'], 'realuser')

    def test_admin_endpoints_require_admin(self):
        self.assertEqual(self.client.get('/admin/virtual-accounts', headers=self.user).status_code, 401)
        for path in ('/admin/virtual-accounts', '/admin/virtual-accounts/assign'):
            self.assertEqual(self.client.post(path, headers=self.user, json={'nicknames': ['abc']}).status_code, 401)
        self.assertEqual(self.client.delete('/admin/virtual-accounts/virtual:x', headers=self.user).status_code, 401)

    def test_like_bot(self):
        bot = {'Authorization': 'Bearer bot-secret-token'}
        self.assertEqual(self.client.post('/internal/like-bot/like', headers=self.user).status_code, 401)
        self.assertEqual(self.client.post('/internal/like-bot/like', headers=bot).json()['status'], 'skipped')
        self.add_personas('봇하나', '봇둘이')
        self.publish(self.user, '좋아요 받을 코스')
        self.publish(self.user, '비공개', visibility='private')
        liked = [self.client.post('/internal/like-bot/like', headers=bot).json() for _ in range(3)]
        self.assertEqual([item['status'] for item in liked], ['liked', 'liked', 'skipped'])
        self.assertEqual({item['nickname'] for item in liked[:2]}, {'봇하나', '봇둘이'})
        self.assertEqual(self.community()['좋아요 받을 코스']['like_count'], 2)
        # 가상 계정이 작성자로 보이는 코스에는 그 계정이 좋아요를 누르지 않습니다.
        self.publish(self.seed, '운영 코스')
        persona = self.community()['운영 코스']['nickname']
        result = self.client.post('/internal/like-bot/like', headers=bot).json()
        self.assertEqual(result['title'], '운영 코스')
        self.assertNotEqual(result['nickname'], persona)
        self.assertEqual(self.client.get('/admin/summary', headers=self.admin).json()['virtual_likes'], 3)
        # 프록시를 거친 외부 요청은 토큰이 맞아도 받지 않습니다.
        self.assertEqual(self.client.post('/internal/like-bot/like', headers={**bot, 'X-Real-IP': '1.2.3.4'}).status_code, 404)
        with patch.object(api, 'LIKE_BOT_TOKEN', ''):
            self.assertEqual(self.client.post('/internal/like-bot/like', headers=bot).status_code, 404)

    def test_course_map(self):
        self.publish(self.user, '서울 러닝')
        self.publish(self.user, '부산 자전거', BUSAN, sport='bike')
        self.publish(self.user, '비공개', visibility='private')
        items = self.client.get('/community/map').json()['items']
        self.assertEqual(sorted(item['title'] for item in items), ['부산 자전거', '서울 러닝'])
        self.assertEqual([item['title'] for item in self.client.get('/community/map', params={'sport': 'bike'}).json()['items']], ['부산 자전거'])
        seoul = self.client.get('/community/map', params={'south': 37.4, 'west': 126.8, 'north': 37.7, 'east': 127.2}).json()['items']
        self.assertEqual([item['title'] for item in seoul], ['서울 러닝'])
        self.assertEqual(seoul[0]['path'][0], [37.528, 126.925])
        self.assertEqual(seoul[0]['nickname'], 'realuser')


if __name__ == '__main__':
    unittest.main()
