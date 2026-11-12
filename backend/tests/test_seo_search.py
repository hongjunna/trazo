import json
import unittest
from types import SimpleNamespace

from backend import course_pages, seo_search


def document(token, sport='run', level=1, km=4, training=(), distance=None, title='서울 공원 코스'):
    course = SimpleNamespace(title=title, sport=sport)
    insight = {'difficulty': level, 'terrain': 'flat', 'shape': 'loop', 'training': list(training), 'distance': distance}
    seo = course_pages.seo_view(course, {'distance_km': km, 'ascent_m': 20}, insight)
    return {
        'fields': {'title': seo_search.normalize(seo['page_title']), 'description': seo_search.normalize(seo['summary']),
                   'body': seo_search.normalize(' '.join(seo['keywords']))},
        'names': ['서울', '공원'], 'sport': sport, 'difficulty': level, 'terrain': 'flat', 'shape': 'loop',
        'distance_km': km, 'training': list(training), 'distance_kind': distance,
        'page': {'token': token, 'title': seo['page_title'], 'description': seo['summary']},
    }


class NaturalLanguageSEOTests(unittest.TestCase):
    def setUp(self):
        self.docs = [document('easy-run'), document('hard-run', level=5, km=42),
                     document('easy-bike', sport='bike', km=15),
                     document('long-bike', sport='bike', level=4, km=100, training=['endurance'], distance='long'),
                     document('unknown', level=None)]

    def tokens(self, query):
        return [item['token'] for item in seo_search.search(query, self.docs)['results']]

    def test_requested_queries_select_suitable_sport_and_difficulty(self):
        self.assertEqual(self.tokens('초보 러닝 추천'), ['easy-run'])
        self.assertEqual(self.tokens('초보 자전거 코스 추천'), ['easy-bike'])
        self.assertEqual(self.tokens('그란폰도 대비 코스'), ['long-bike'])

    def test_polite_phrases_spacing_josa_and_punctuation(self):
        for query in ('초보자도 달리기 좋은 길 추천해 주세요!', '서울에서 입문 러닝 코스 찾아주세요',
                      '부담 없는 러닝 코스 추천해주세요'):
            self.assertEqual(self.tokens(query), ['easy-run'], query)
        self.assertEqual(self.tokens('그란 폰도 대비 장거리 라이딩'), ['long-bike'])

    def test_unknown_locations_do_not_match_only_on_sport_or_intent(self):
        self.assertEqual(self.tokens('부산 초보 러닝 추천'), [])
        self.assertEqual(self.tokens('부산 그란폰도 대비 코스'), [])

    def test_marathon_does_not_implicitly_mean_42km(self):
        self.assertIsNone(seo_search.parse_query('초보 마라톤 추천')['distance'])
        self.assertEqual(seo_search.parse_query('하프마라톤 대비 러닝')['distance'], 21.1)
        self.assertEqual(seo_search.parse_query('풀마라톤 대비')['terms'], [])
        self.assertEqual(seo_search.parse_query('서울 5km에서 달릴 코스')['distance'], 5)
        self.assertNotIn('러닝', seo_search.parse_query('brunch')['concepts'])

    def test_real_page_copy_contains_only_supported_intents(self):
        self.assertIn('초보 러닝 추천 코스', self.docs[0]['page']['description'])
        self.assertNotIn('초보', self.docs[1]['page']['description'])
        self.assertIn('그란폰도 대비', self.docs[3]['page']['description'])
        self.assertNotIn('초보', self.docs[4]['page']['description'])
        self.assertEqual(self.tokens('인터벌 훈련 러닝 코스'), [])


class SEOIndexIntegrationTests(unittest.TestCase):
    def test_public_course_rules_reach_search_and_rendered_page(self):
        from backend.tests.test_courses import api
        from sqlalchemy.pool import StaticPool
        from sqlmodel import Session, SQLModel, create_engine
        from unittest.mock import patch
        engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        SQLModel.metadata.create_all(engine)
        points = [{'lat': 37.5, 'lng': 127.0, 'ele': 20}, {'lat': 37.53, 'lng': 127.0, 'ele': 20}]
        with patch.object(api, 'engine', engine), Session(engine) as session:
            public = api.Course(title='도심 공원', sport='run', visibility='public', share_token='public',
                                markers_json='[]', polylines_json=json.dumps([points]))
            private = api.Course(title='비공개 코스', sport='run', visibility='private', share_token='private',
                                 markers_json='[]', polylines_json=json.dumps([points]))
            session.add(public); session.add(private); session.commit(); session.refresh(public)
            session.add(api.CourseInsight(course_id=public.id, input_hash='test', difficulty=1,
                                          rules_json=json.dumps({'terrain': 'flat', 'shape': 'loop', 'training': ['recovery']})))
            session.commit()
            docs = api.seo_documents(session)
            result = seo_search.search('초보 러닝 추천', docs)
            self.assertEqual([item['token'] for item in result['results']], ['public'])
            from fastapi.testclient import TestClient
            html = TestClient(api.app).get('/pages/c/public').text
            self.assertIn('초보 러닝 추천 코스', html)


if __name__ == '__main__':
    unittest.main()
