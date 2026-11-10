import os
import unittest
from unittest.mock import patch

os.environ.setdefault('DATABASE_URL', 'sqlite://')
os.environ.setdefault('COURSE_API_TOKENS', '{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":1,"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb":2}')
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine
import backend.main as api
from backend import tracks


def ring(lat, lng, size=0.0006):
    points = [(lat, lng), (lat + size, lng), (lat + size, lng + size * 1.6), (lat, lng + size * 1.6), (lat, lng)]
    return [{'lat': a, 'lon': b} for a, b in points]


def bounds(lat, lng, size):
    return {'minlat': lat - size, 'minlon': lng - size, 'maxlat': lat + size, 'maxlon': lng + size}


# Overpass 응답 모양: 트랙(geometry 포함)과 트랙을 둘러싼 시설·행정구역(bounds만)
OVERPASS = {'elements': [
    {'type': 'way', 'id': 1, 'tags': {'leisure': 'track', 'sport': 'running', 'name': '육상 트랙', 'lanes': '8'}, 'geometry': ring(37.5, 127.0)},
    {'type': 'way', 'id': 2, 'tags': {'leisure': 'track', 'sport': 'athletics'}, 'geometry': ring(37.6, 127.1)},
    {'type': 'way', 'id': 3, 'tags': {'leisure': 'track', 'sport': 'running', 'name': '한강 러닝 트랙'}, 'geometry': ring(37.7, 127.2)},
    {'type': 'way', 'id': 4, 'tags': {'leisure': 'track', 'sport': 'running'}, 'geometry': ring(10.0, 10.0)},
    # 육상 트랙이 아닌 것: 가늘고 긴 공중보행로, 이름이 보행로, 공원 둘레 조깅 코스(너무 김)
    {'type': 'way', 'id': 5, 'tags': {'leisure': 'track', 'sport': 'running'}, 'geometry': [
        {'lat': 37.56, 'lon': 126.99}, {'lat': 37.568, 'lon': 126.99}, {'lat': 37.568, 'lon': 126.9905}, {'lat': 37.56, 'lon': 126.9905}, {'lat': 37.56, 'lon': 126.99}]},
    {'type': 'way', 'id': 6, 'tags': {'leisure': 'track', 'sport': 'running', 'name': '세운상가 공중보행로'}, 'geometry': ring(37.57, 126.99)},
    {'type': 'way', 'id': 7, 'tags': {'leisure': 'track', 'sport': 'running'}, 'geometry': ring(37.45, 127.0, 0.003)},
    {'type': 'way', 'id': 10, 'tags': {'leisure': 'sports_centre', 'name': '반포종합운동장'}, 'bounds': bounds(37.5005, 127.001, 0.01)},
    {'type': 'way', 'id': 11, 'tags': {'amenity': 'school', 'name': '어느초등학교'}, 'bounds': bounds(37.6005, 127.101, 0.01)},
    {'type': 'relation', 'id': 12, 'tags': {'boundary': 'administrative', 'admin_level': '7', 'name': '서초구'}, 'bounds': bounds(37.5, 127.0, 0.5)},
]}


class TrackTests(unittest.TestCase):
    def setUp(self):
        api.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(api.engine)
        for name, value in (('ADMIN_USERNAME', 'admin'), ('ADMIN_PASSWORD', 'correct-horse-battery'), ('admin_login_failures', [])):
            patcher = patch.object(api, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(api.app)
        token = self.client.post('/admin/login', json={'username': 'admin', 'password': 'correct-horse-battery'}).json()['token']
        self.admin = {'Authorization': f'Bearer {token}'}

    def test_parse_skips_school_and_foreign_tracks_and_names_by_venue(self):
        parsed = {item['osm_ref']: item for item in tracks.parse_tracks(OVERPASS)}
        self.assertEqual(set(parsed), {'way/1', 'way/3'})
        # '육상 트랙' 같은 흔한 이름은 둘러싼 시설 이름으로 바꿉니다.
        self.assertEqual(parsed['way/1']['name'], '반포종합운동장')
        self.assertEqual(parsed['way/1']['region'], '서초구')
        self.assertEqual(parsed['way/1']['lanes'], 8)
        self.assertEqual(parsed['way/3']['name'], '한강 러닝 트랙')

    def test_athletics_shape_filter(self):
        oval = [tuple(p) for p in tracks.oval_path(37.5, 127.0, 30, 400)]
        self.assertTrue(tracks.is_athletics_track(oval))
        self.assertFalse(tracks.is_athletics_track(oval, '공중보행로'))
        self.assertFalse(tracks.is_athletics_track(oval[:-10]))  # 닫히지 않은 선

    def test_oval_is_about_lap_length(self):
        path = tracks.oval_path(37.5, 127.0, 75, 400)
        self.assertEqual(path[0], path[-1])
        self.assertAlmostEqual(tracks.path_length_m([tuple(p) for p in path]), 400, delta=3)

    def test_import_keeps_admin_edits_and_map_lists_visible_tracks(self):
        with Session(api.engine) as session:
            self.assertEqual(api.import_osm_tracks(session, OVERPASS)['created'], 2)
        listed = self.client.get('/admin/tracks', headers=self.admin).json()['items']
        first = next(item for item in listed if item['osm_ref'] == 'way/1')
        self.client.put(f"/admin/tracks/{first['id']}", headers=self.admin, json={'name': '반포 트랙'})
        with Session(api.engine) as session:
            self.assertEqual(api.import_osm_tracks(session, OVERPASS)['updated'], 2)
        names = {item['name'] for item in self.client.get('/community/tracks').json()['items']}
        self.assertEqual(names, {'반포 트랙', '한강 러닝 트랙'})
        # OSM 트랙을 지우면 숨기기만 합니다.
        self.assertTrue(self.client.delete(f"/admin/tracks/{first['id']}", headers=self.admin).json()['hidden'])
        self.assertEqual(len(self.client.get('/community/tracks').json()['items']), 1)

    def test_manual_track_with_oval_and_bounds(self):
        self.assertEqual(self.client.post('/admin/tracks', json={'name': 'x', 'lat': 37.5, 'lng': 127}).status_code, 401)
        created = self.client.post('/admin/tracks', headers=self.admin, json={
            'name': '반포종합운동장', 'lat': 37.5006, 'lng': 126.9942, 'shape': 'oval', 'bearing': 75, 'size_m': 360}).json()['track']
        self.assertEqual(created['source'], 'manual')
        self.assertIsNone(created['length_m'])
        self.assertGreater(len(created['path']), 50)
        inside = self.client.get('/community/tracks', params={'south': 37.4, 'west': 126.9, 'north': 37.6, 'east': 127.1}).json()['items']
        outside = self.client.get('/community/tracks', params={'south': 35, 'west': 129, 'north': 36, 'east': 130}).json()['items']
        self.assertEqual(len(inside), 1)
        self.assertEqual(outside, [])
        updated = self.client.put(f"/admin/tracks/{created['id']}", headers=self.admin, json={'shape': {'shape': 'pin'}, 'length_m': 400}).json()['track']
        self.assertIsNone(updated['path'])
        self.assertEqual(updated['length_m'], 400)
        self.assertEqual(self.client.delete(f"/admin/tracks/{created['id']}", headers=self.admin).json()['hidden'], False)
        self.assertEqual(self.client.get('/community/tracks').json()['items'], [])
