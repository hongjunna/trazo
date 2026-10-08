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

class FirebaseAccessTests(CourseAccessTests):
    def setUp(self):
        super().setUp()
        from unittest.mock import patch
        self.project = patch.object(api, 'FIREBASE_PROJECT_ID', 'test-project')
        self.verifier = patch.object(api.id_token, 'verify_firebase_token')
        self.project.start()
        self.verify = self.verifier.start()
        self.addCleanup(self.project.stop)
        self.addCleanup(self.verifier.stop)
        self.owner = {'Authorization': 'Bearer owner-token'}
        self.other = {'Authorization': 'Bearer other-token'}
        def verify(token, request, audience, clock_skew_in_seconds=0):
            # 서버 시계가 조금 늦어도 방금 발급된 토큰을 받아들이도록 오차를 허용해야 합니다.
            assert clock_skew_in_seconds >= 30
            if token not in ('owner-token', 'other-token'):
                raise ValueError('Invalid token')
            return {'sub': token, 'iss': 'https://securetoken.google.com/test-project',
                    'firebase': {'sign_in_provider': 'google.com'}}
        self.verify.side_effect = verify

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
            self.assertIn('firebase_uid', columns)
            self.assertIn('sport', columns)
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
