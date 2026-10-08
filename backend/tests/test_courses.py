import os
import unittest

os.environ['DATABASE_URL'] = 'sqlite://'
os.environ['COURSE_API_TOKENS'] = '{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":1,"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb":2}'
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine
import backend.main as api


class CourseAccessTests(unittest.TestCase):
    def setUp(self):
        # 이 테스트는 Firebase 없이 COURSE_API_TOKENS만 쓰는 기존 배포 방식을 확인합니다.
        # Docker 컨테이너처럼 FIREBASE_PROJECT_ID가 설정된 환경에서도 같은 조건이 되도록 비워 둡니다.
        from unittest.mock import patch
        no_firebase = patch.object(api, 'FIREBASE_PROJECT_ID', '')
        no_firebase.start()
        self.addCleanup(no_firebase.stop)
        api.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(api.engine)
        self.client = TestClient(api.app)
        self.owner = {'Authorization': 'Bearer ' + 'a' * 32}
        self.other = {'Authorization': 'Bearer ' + 'b' * 32}

    def test_authentication_and_ownership(self):
        data = {'title': 'test', 'markers': [], 'polylines': []}
        self.assertEqual(self.client.get('/courses').status_code, 401)
        self.assertEqual(self.client.post('/courses', json=data).status_code, 401)
        self.assertEqual(self.client.get('/courses', headers={'Authorization': 'Bearer invalid'}).status_code, 401)
        course_id = self.client.post('/courses', json=data, headers=self.owner).json()['course_id']
        self.assertEqual(len(self.client.get('/courses', headers=self.owner).json()), 1)
        self.assertEqual(self.client.get('/courses', headers=self.other).json(), [])
        for method in ('put', 'delete'):
            kwargs = {'json': {'title': 'stolen'}} if method == 'put' else {}
            self.assertEqual(getattr(self.client, method)(f'/courses/{course_id}', headers=self.other, **kwargs).status_code, 404)
        self.assertEqual(self.client.put(f'/courses/{course_id}', headers=self.owner, json={'title': 'updated'}).status_code, 200)
        self.assertEqual(self.client.delete(f'/courses/{course_id}', headers=self.owner).status_code, 200)
        self.assertEqual(self.client.get('/courses', headers=self.owner).json(), [])
        self.assertEqual(self.client.put(f'/courses/{course_id}', headers=self.owner, json={'title': 'restore'}).status_code, 404)

def use_firebase(test):
    """Firebase 토큰 검증을 흉내 냅니다. '<이름>-token'을 보내면 UID가 '<이름>-token'인 구글 계정으로 로그인합니다."""
    from unittest.mock import patch
    project = patch.object(api, 'FIREBASE_PROJECT_ID', 'test-project')
    verifier = patch.object(api.id_token, 'verify_firebase_token')
    project.start()
    test.verify = verifier.start()
    test.addCleanup(project.stop)
    test.addCleanup(verifier.stop)
    def verify(token, request, audience, clock_skew_in_seconds=0):
        # 서버 시계가 조금 늦어도 방금 발급된 토큰을 받아들이도록 오차를 허용해야 합니다.
        assert clock_skew_in_seconds >= 30
        if not token.endswith('-token'):
            raise ValueError('Invalid token')
        return {'sub': token, 'iss': 'https://securetoken.google.com/test-project',
                'firebase': {'sign_in_provider': 'google.com'}}
    test.verify.side_effect = verify


class FirebaseAccessTests(CourseAccessTests):
    def setUp(self):
        super().setUp()
        use_firebase(self)
        self.owner = {'Authorization': 'Bearer owner-token'}
        self.other = {'Authorization': 'Bearer other-token'}

    def test_rejects_wrong_issuer_provider_and_empty_uid(self):
        for changes in ({'iss': 'wrong-project'}, {'sub': ''}, {'firebase': {'sign_in_provider': 'password'}}):
            self.verify.side_effect = None
            self.verify.return_value = {'sub': 'owner-token', 'iss': 'https://securetoken.google.com/test-project',
                                        'firebase': {'sign_in_provider': 'google.com'}, **changes}
            self.assertEqual(self.client.get('/courses', headers=self.owner).status_code, 401)

    def test_legacy_courses_are_not_claimed(self):
        from sqlmodel import Session
        with Session(api.engine) as session:
            course = api.Course(title='legacy', markers_json='[]', polylines_json='[]', user_id=1)
            session.add(course)
            session.commit()
            session.refresh(course)
            course_id = course.id
        self.assertEqual(self.client.get('/courses', headers=self.owner).json(), [])
        self.assertEqual(self.client.delete(f'/courses/{course_id}', headers=self.owner).status_code, 404)
        self.assertEqual(self.client.get('/courses', headers={'Authorization': 'Bearer ' + 'a' * 32}).status_code, 401)

    def test_verification_service_unavailable(self):
        self.verify.side_effect = api.TransportError('offline')
        self.assertEqual(self.client.get('/courses', headers=self.owner).status_code, 503)

    def test_existing_schema_migration(self):
        from sqlalchemy import text, inspect
        with api.engine.begin() as connection:
            connection.execute(text('DROP TABLE course'))
            connection.execute(text('CREATE TABLE course (id INTEGER PRIMARY KEY, title VARCHAR NOT NULL, description VARCHAR, markers_json VARCHAR NOT NULL, polylines_json VARCHAR NOT NULL, user_id INTEGER NOT NULL, created_at VARCHAR NOT NULL, is_deleted BOOLEAN NOT NULL)'))
        with TestClient(api.app):
            columns = {column['name'] for column in inspect(api.engine).get_columns('course')}
            self.assertTrue(set(api.COURSE_MIGRATIONS) <= columns)
        with TestClient(api.app):
            self.assertEqual(self.client.get('/courses', headers=self.owner).status_code, 200)

    def test_course_sport(self):
        data = {'title': 'run', 'markers': [], 'polylines': [], 'sport': 'run'}
        course_id = self.client.post('/courses', json=data, headers=self.owner).json()['course_id']
        self.assertEqual(self.client.get('/courses', headers=self.owner).json()[0]['sport'], 'run')
        self.assertEqual(self.client.put(f'/courses/{course_id}', headers=self.owner, json={'sport': 'bike'}).status_code, 200)
        self.assertEqual(self.client.get('/courses', headers=self.owner).json()[0]['sport'], 'bike')
        self.assertEqual(self.client.post('/courses', json={**data, 'sport': 'swim'}, headers=self.owner).status_code, 422)
        legacy = self.client.post('/courses', json={'title': 'legacy', 'markers': [], 'polylines': []}, headers=self.owner).json()['course_id']
        self.assertEqual({c['id']: c['sport'] for c in self.client.get('/courses', headers=self.owner).json()}[legacy], 'bike')


class CommunityTests(unittest.TestCase):
    def setUp(self):
        api.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(api.engine)
        self.client = TestClient(api.app)
        use_firebase(self)
        self.owner = {'Authorization': 'Bearer owner-token'}
        self.other = {'Authorization': 'Bearer other-token'}
        self.third = {'Authorization': 'Bearer third-token'}
        self.polylines = [[{'lat': 37.5, 'lng': 127.0, 'ele': 10}, {'lat': 37.51, 'lng': 127.0, 'ele': 30}]]

    def nickname(self, headers, nickname):
        return self.client.put('/me', headers=headers, json={'nickname': nickname})

    def create(self, headers=None, **extra):
        data = {'title': '한강 코스', 'markers': [], 'polylines': self.polylines, **extra}
        response = self.client.post('/courses', headers=headers or self.owner, json=data)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()['course']

    def test_nickname_rules_and_uniqueness(self):
        self.assertEqual(self.client.get('/me', headers=self.owner).json(), {'nickname': None})
        self.assertEqual(self.client.get('/me').status_code, 401)
        for invalid in ('ab', 'a' * 17, '띄어 쓰기', 'bad!name'):
            self.assertEqual(self.nickname(self.owner, invalid).status_code, 422)
        self.assertEqual(self.nickname(self.owner, ' 라이더_01 ').json(), {'nickname': '라이더_01'})
        self.assertEqual(self.nickname(self.other, '라이더_01').status_code, 409)
        self.assertEqual(self.nickname(self.other, 'Admin').status_code, 409)
        self.assertEqual(self.client.get('/nicknames/check', params={'nickname': '라이더_01'}).json()['reason'], 'taken')
        # 내 닉네임은 내가 다시 써도 됩니다.
        self.assertTrue(self.client.get('/nicknames/check', params={'nickname': '라이더_01'}, headers=self.owner).json()['available'])
        self.assertEqual(self.nickname(self.other, 'Runner').status_code, 200)
        self.assertEqual(self.nickname(self.owner, 'runner').status_code, 409)
        self.assertEqual(self.nickname(self.owner, '새이름').json(), {'nickname': '새이름'})
        self.assertEqual(self.nickname(self.other, '라이더_01').status_code, 200)

    def test_folders(self):
        folder = self.client.post('/folders', headers=self.owner, json={'name': ' 주말 '}).json()
        self.assertEqual(folder['name'], '주말')
        self.assertEqual(self.client.post('/folders', headers=self.owner, json={'name': '주말'}).status_code, 409)
        self.assertEqual(self.client.post('/folders', headers=self.owner, json={'name': ' '}).status_code, 422)
        self.assertEqual(self.client.get('/folders', headers=self.other).json(), [])
        course = self.create(folder_id=folder['id'])
        self.assertEqual(course['folder_id'], folder['id'])
        # 다른 사람의 폴더에는 넣을 수 없습니다.
        self.assertEqual(self.client.post('/courses', headers=self.other, json={'title': 'x', 'markers': [], 'polylines': [], 'folder_id': folder['id']}).status_code, 404)
        self.assertEqual(self.client.put(f"/folders/{folder['id']}", headers=self.other, json={'name': '탈취'}).status_code, 404)
        self.assertEqual(self.client.put(f"/folders/{folder['id']}", headers=self.owner, json={'name': '평일'}).json()['name'], '평일')
        # 폴더를 보내지 않으면 그대로, null이면 폴더에서 뺍니다.
        self.client.put(f"/courses/{course['id']}", headers=self.owner, json={'title': '이름만'})
        self.assertEqual(self.client.get('/courses', headers=self.owner).json()[0]['folder_id'], folder['id'])
        self.client.put(f"/courses/{course['id']}", headers=self.owner, json={'folder_id': None})
        self.assertIsNone(self.client.get('/courses', headers=self.owner).json()[0]['folder_id'])
        self.client.put(f"/courses/{course['id']}", headers=self.owner, json={'folder_id': folder['id']})
        self.assertEqual(self.client.delete(f"/folders/{folder['id']}", headers=self.owner).status_code, 200)
        courses = self.client.get('/courses', headers=self.owner).json()
        self.assertEqual(len(courses), 1)
        self.assertIsNone(courses[0]['folder_id'])

    def test_visibility_and_shared_access(self):
        private = self.create()
        self.assertEqual(private['visibility'], 'private')
        self.assertIsNone(private['share_token'])
        # 닉네임 없이는 전체 공개할 수 없습니다.
        self.assertEqual(self.client.put(f"/courses/{private['id']}", headers=self.owner, json={'visibility': 'public'}).status_code, 403)
        link = self.client.put(f"/courses/{private['id']}", headers=self.owner, json={'visibility': 'link'}).json()['course']
        token = link['share_token']
        self.assertTrue(token)
        shared = self.client.get(f'/shared/{token}').json()
        self.assertEqual((shared['title'], shared['visibility'], shared['is_owner']), ('한강 코스', 'link', False))
        self.assertEqual(shared['polylines'], self.polylines)
        self.assertTrue(self.client.get(f'/shared/{token}', headers=self.owner).json()['is_owner'])
        # 링크 공유 코스는 커뮤니티에 뜨지 않고, 좋아요·댓글을 쓸 수 없습니다.
        self.assertEqual(self.client.get('/community').json()['items'], [])
        self.nickname(self.other, '구경꾼')
        self.assertEqual(self.client.post(f'/shared/{token}/like', headers=self.other).status_code, 404)
        self.assertEqual(self.client.get(f'/shared/{token}/comments').status_code, 404)
        # 비공개로 바꾸면 링크가 막히고, 다시 공유하면 같은 링크를 씁니다.
        self.client.put(f"/courses/{private['id']}", headers=self.owner, json={'visibility': 'private'})
        self.assertEqual(self.client.get(f'/shared/{token}').status_code, 404)
        self.nickname(self.owner, '주인장')
        public = self.client.put(f"/courses/{private['id']}", headers=self.owner, json={'visibility': 'public'}).json()['course']
        self.assertEqual(public['share_token'], token)
        items = self.client.get('/community').json()['items']
        self.assertEqual([(item['token'], item['nickname']) for item in items], [(token, '주인장')])
        self.assertGreater(items[0]['distance_km'], 1)
        self.assertEqual(items[0]['ascent_m'], 20)
        self.client.delete(f"/courses/{private['id']}", headers=self.owner)
        self.assertEqual(self.client.get(f'/shared/{token}').status_code, 404)
        self.assertEqual(self.client.get('/community').json()['items'], [])
        self.assertEqual(self.client.get('/shared/unknown').status_code, 404)

    def test_copy_counts_each_account_once(self):
        self.nickname(self.owner, '주인장')
        token = self.create(visibility='link')['share_token']
        self.assertEqual(self.client.post(f'/shared/{token}/copy', headers=self.other, json={}).status_code, 403)
        self.nickname(self.other, '담는사람')
        self.nickname(self.third, '세번째')
        folder = self.client.post('/folders', headers=self.other, json={'name': '담은 코스'}).json()
        copied = self.client.post(f'/shared/{token}/copy', headers=self.other, json={'folder_id': folder['id']}).json()
        self.assertEqual(copied['share_count'], 1)
        self.assertEqual((copied['course']['folder_id'], copied['course']['visibility']), (folder['id'], 'private'))
        self.assertIsNone(copied['course']['share_token'])
        # 담은 코스를 지우고 다시 담아도 횟수는 그대로입니다.
        self.client.delete(f"/courses/{copied['course']['id']}", headers=self.other)
        self.assertEqual(self.client.post(f'/shared/{token}/copy', headers=self.other, json={}).json()['share_count'], 1)
        self.assertEqual(self.client.post(f'/shared/{token}/copy', headers=self.third, json={}).json()['share_count'], 2)
        self.assertEqual(self.client.get(f'/shared/{token}').json()['share_count'], 2)
        self.assertEqual(len(self.client.get('/courses', headers=self.other).json()), 1)
        self.assertEqual(self.client.post(f'/shared/{token}/copy', headers=self.owner, json={}).status_code, 400)
        self.assertEqual(self.client.post(f'/shared/{token}/copy', headers=self.third, json={'folder_id': folder['id']}).status_code, 404)
        self.assertEqual(self.client.post(f'/shared/{token}/copy', json={}).status_code, 401)

    def test_likes_comments_and_community_sorting(self):
        self.nickname(self.owner, '주인장')
        self.nickname(self.other, '구경꾼')
        first = self.create(visibility='public', sport='run')['share_token']
        second = self.create(headers=self.other, visibility='public', title='남산 업힐')['share_token']
        self.assertEqual(self.client.post(f'/shared/{first}/like', headers=self.other).json(), {'liked': True, 'like_count': 1})
        self.assertEqual(self.client.post(f'/shared/{first}/like', headers=self.other).json()['like_count'], 1)
        self.assertTrue(self.client.get(f'/shared/{first}', headers=self.other).json()['liked'])
        self.assertEqual(self.client.post(f'/shared/{first}/like').status_code, 401)

        recent = [item['token'] for item in self.client.get('/community').json()['items']]
        self.assertEqual(recent, [second, first])
        self.assertEqual([item['token'] for item in self.client.get('/community', params={'sort': 'likes'}).json()['items']], [first, second])
        self.assertEqual([item['token'] for item in self.client.get('/community', params={'sport': 'run'}).json()['items']], [first])
        self.assertEqual([item['token'] for item in self.client.get('/community', params={'q': '구경'}).json()['items']], [second])
        self.assertEqual([item['token'] for item in self.client.get('/community', params={'q': '%'}).json()['items']], [])
        page = self.client.get('/community', params={'limit': 1}).json()
        self.assertTrue(page['has_more'])
        self.assertFalse(self.client.get('/community', params={'limit': 1, 'offset': 1}).json()['has_more'])
        self.assertTrue(self.client.get('/community', params={'sort': 'likes'}, headers=self.other).json()['items'][0]['liked'])

        comment = self.client.post(f'/shared/{first}/comments', headers=self.other, json={'body': ' 좋은 코스네요 '}).json()
        self.assertEqual((comment['body'], comment['nickname'], comment['is_mine']), ('좋은 코스네요', '구경꾼', True))
        self.assertEqual(self.client.post(f'/shared/{first}/comments', headers=self.other, json={'body': '  '}).status_code, 422)
        self.assertEqual(self.client.post(f'/shared/{first}/comments', headers=self.other, json={'body': 'x' * 501}).status_code, 422)
        self.assertEqual(self.client.put(f"/comments/{comment['id']}", headers=self.owner, json={'body': '수정'}).status_code, 404)
        edited = self.client.put(f"/comments/{comment['id']}", headers=self.other, json={'body': '최고예요'}).json()
        self.assertEqual(edited['body'], '최고예요')
        self.assertIsNotNone(edited['updated_at'])
        comments = self.client.get(f'/shared/{first}/comments', headers=self.owner).json()
        self.assertEqual([(c['body'], c['is_mine'], c['can_delete']) for c in comments], [('최고예요', False, True)])
        self.assertEqual(self.client.get(f'/shared/{first}').json()['comment_count'], 1)
        # 다른 사람 코스의 다른 사람 댓글은 지울 수 없고, 코스 주인은 지울 수 있습니다.
        self.nickname(self.third, '세번째')
        self.assertEqual(self.client.delete(f"/comments/{comment['id']}", headers=self.third).status_code, 404)
        self.assertEqual(self.client.delete(f"/comments/{comment['id']}", headers=self.owner).status_code, 200)
        self.assertEqual(self.client.get(f'/shared/{first}/comments').json(), [])

        self.assertEqual(self.client.delete(f'/shared/{first}/like', headers=self.other).json(), {'liked': False, 'like_count': 0})


class RouteRequestTests(unittest.TestCase):
    def test_options_are_mapped_per_profile(self):
        body = api.build_route_request(['37.5,127.0', '37.6,127.1'], 'run', ['avoid_stairs', 'avoid_stairs', 'prefer_trails'])
        self.assertEqual(body['points'], [[127.0, 37.5], [127.1, 37.6]])
        self.assertEqual(body['profile'], 'run')
        self.assertEqual(len(body['custom_model']['priority']), 2)
        self.assertNotIn('custom_model', api.build_route_request(['37.5,127.0', '37.6,127.1'], 'bike', []))

    def test_rejects_unknown_profile_option_and_points(self):
        from fastapi import HTTPException
        for args in ((['37.5,127.0', '37.6,127.1'], 'car', []),
                     (['37.5,127.0', '37.6,127.1'], 'bike', ['avoid_stairs']),
                     (['37.5,127.0', '37.6,127.1'], 'run', ['road_class == STEPS']),
                     (['37.5,127.0'], 'bike', []),
                     (['37.5,127.0', '91,127.1'], 'bike', []),
                     (['37.5,127.0', 'abc'], 'bike', [])):
            with self.assertRaises(HTTPException):
                api.build_route_request(*args)


if __name__ == '__main__':
    unittest.main()
