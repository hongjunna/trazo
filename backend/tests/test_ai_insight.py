"""AI 분석 결과에 대한 단위 테스트"""

import unittest
from unittest.mock import Mock, patch
import json

from backend import course_insight


class TestAIInsight(unittest.TestCase):
    
    def test_parse_response_with_elevation(self):
        """고도 정보가 있는 코스의 경우 정상 처리"""
        analysis = {
            "distance_km": 10.0,
            "has_elevation": True,
            "elevation_suspect": False,
            "climbs": [],
            "grades": {},
            "ascent_m": 0,
            "descent_m": 0,
            "elevation": None,
            "splits": [],
        }
        
        rules = {
            "has_elevation": True,
            "elevation_suspect": False,
            "terrain": "flat",
            "shape": "loop",
            "training": ["recovery"],
        }
        
        raw_response = '''{
            "feature_ko": "평지로 이루어진 10km 루트입니다.",
            "route_ko": "고속도로를 따라 달리며 편안한 산책길입니다.",
            "themes": ["urban", "park"]
        }'''
        
        parsed, warnings = course_insight.parse_response(raw_response, analysis, rules)
        
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["feature_ko"], "평지로 이루어진 10km 루트입니다.")
        self.assertEqual(parsed["route_ko"], "고속도로를 따라 달리며 편안한 산책길입니다.")
        self.assertEqual(parsed["themes"], ["urban", "park"])
        self.assertEqual(warnings, [])
    
    def test_parse_response_without_elevation(self):
        """고도 정보가 없는 코스의 경우 지형 표현 자동 제거"""
        analysis = {
            "distance_km": 10.0,
            "has_elevation": False,
            "elevation_suspect": True,
            "climbs": [],
            "grades": {},
            "ascent_m": 0,
            "descent_m": 0,
            "elevation": None,
            "splits": [],
        }
        
        rules = {
            "has_elevation": False,
            "elevation_suspect": True,
            "terrain": "flat",
            "shape": "loop",
            "training": ["recovery"],
        }
        
        raw_response = '''{
            "feature_ko": "오르막으로 이루어진 10km 루트입니다.",
            "route_ko": "고속도로를 따라 달리며 편안한 산책길입니다.",
            "themes": ["urban", "park"]
        }'''
        
        parsed, warnings = course_insight.parse_response(raw_response, analysis, rules)
        
        self.assertIsNotNone(parsed)
        # 오르막 표현이 제거되었는지 확인
        self.assertNotIn("오르막", parsed["feature_ko"])
        self.assertIn("10km 루트입니다", parsed["feature_ko"])
        self.assertEqual(len(warnings), 1)
        self.assertIn("고도 정보를 쓸 수 없는 코스인데 특징 문장에 지형", warnings[0])
    
    def test_parse_response_theme_validation(self):
        """테마 유효성 검증 테스트"""
        analysis = {
            "distance_km": 10.0,
            "has_elevation": True,
            "elevation_suspect": False,
            "climbs": [],
            "grades": {},
            "ascent_m": 0,
            "descent_m": 0,
            "elevation": None,
            "splits": [],
            "places_along_route": [
                {"name": "대청호", "kind": "natural=water"},
                {"name": "자연공원", "kind": "leisure=nature_reserve"}
            ]
        }
        
        rules = {
            "has_elevation": True,
            "elevation_suspect": False,
            "terrain": "flat",
            "shape": "loop",
            "training": ["recovery"],
        }
        
        raw_response = '''{
            "feature_ko": "산길로 이루어진 10km 루트입니다.",
            "route_ko": "고속도로를 따라 달리며 편안한 산책길입니다.",
            "themes": ["lake"]
        }'''
        
        parsed, warnings = course_insight.parse_response(raw_response, analysis, rules)
        
        # 테마와 실제 OSM 장소가 일치하지 않아 경고가 있어야 함
        self.assertIsNotNone(parsed)
        self.assertIn("lake", parsed["themes"])
        self.assertTrue(len(warnings) >= 1)
        self.assertIn("AI 생성 테마와 근처 장소 유형이 일치하지 않음", warnings[0])


if __name__ == '__main__':
    unittest.main()