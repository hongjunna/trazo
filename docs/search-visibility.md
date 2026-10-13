# Trazo 검색 노출 운영 안내

소유권 인증은 완료됐더라도 페이지 수집·색인·검색 순위는 별도입니다. 이번 변경은 검색엔진이 읽을 수 있는 서비스 본문과 한국어·영어 안내 페이지를 제공하고, 검색 설정 파일과 대표 URL을 명시합니다. 순위나 색인 시점을 보장하지 않습니다. 운영 검증은 실제 도메인 `trazo.runvia.app`을 기준으로 진행합니다. 이전에 다른 도메인을 대상으로 얻은 접속 실패 결과는 실제 서비스 상태를 설명하지 않습니다.

## 코드에 반영한 항목

| 항목 | 반영 내용 |
|---|---|
| robots.txt | 일반 검색 로봇 허용, API·지도 타일 경로 수집 제외, 사이트맵 위치 안내 |
| sitemap.xml | 사이트맵 인덱스: 정적 페이지 사이트맵과 DB의 전체 공개 코스 사이트맵 |
| 제목·설명 | 홈의 자전거·러닝 코스, GPX 경로 플래너 용도 명시; 안내 페이지는 언어별 제목·설명 |
| 로봇 메타 | 홈·안내·전체 공개 코스 index/follow; 링크 공유 코스 noindex/follow |
| canonical | 홈과 안내 페이지에 대표 URL 명시 |
| Open Graph·Twitter | 제목·설명·이미지·URL 제공 |
| 다국어 | `/guide/`, `/en/guide/`에 번역 본문 및 서로를 가리키는 hreflang |
| 본문 | 홈의 초기 HTML에 서비스 설명과 안내 링크; 안내 페이지는 JS 없이 전체 내용 제공 |
| 구조화 데이터 | 홈에 WebSite 및 브랜드 대체 이름 트라소 |
| HTTP 상태 | 없는 경로·누락된 검색 설정 파일은 404 |

영어 안내는 한국어 앱으로 연결합니다. 현재 GraphHopper 데이터는 대한민국이며 세계 전체 길찾기 또는 영어 UI를 제공한다고 표현하지 않습니다. 전체 공개 코스는 `/c/<토큰>`에서 서버 렌더링 랜딩페이지를 제공하며 검색 대상입니다. 링크 공유는 같은 랜딩페이지를 제공하되 noindex, 비공개·삭제 코스는 정보 없는 404 응답입니다. 사이트맵 인덱스 `/sitemap.xml`은 정적 페이지 `/sitemap-pages.xml`과 전체 공개 코스 `/sitemap-courses-1.xml` 등을 연결합니다. 코스 사이트맵은 10,000개 단위로 나눠 자동 생성되며, 공개 범위 변경과 삭제를 반영합니다. 페이지와 동적 사이트맵 응답은 no-store입니다. Cloudflare에서 Cache Everything 등 캐시 규칙으로 이를 덮어쓰지 않아야 합니다. 코스 랜딩페이지는 거리·고도·경로 미리보기·공개 추천 코스·로그인 후 담기 안내를 제공합니다. `/?course=<토큰>&action=save`로 앱에 진입하면 해당 코스를 유지하고 로그인·닉네임 등록 후 담기를 이어갑니다.

## 배포 후 확인

기존 배포 절차로 프론트엔드 및 백엔드를 재빌드·배포합니다. CDN에 이전 HTML·404 응답이 남아 있다면 해당 URL 캐시를 갱신합니다. 운영 서버 배포와 검색엔진 계정 제출은 이 로컬 수정에 포함되지 않았습니다.

```bash
curl -i https://trazo.runvia.app/robots.txt
curl -i https://trazo.runvia.app/sitemap.xml
curl -i https://trazo.runvia.app/guide/
curl -i https://trazo.runvia.app/en/guide/
curl -i https://trazo.runvia.app/this-page-does-not-exist
curl -s https://trazo.runvia.app/
```

앞의 네 URL은 200, 없는 주소는 404여야 합니다. robots.txt는 text/plain, 사이트맵은 XML이어야 하며, HTML이나 Cloudflare 인증 화면이면 안 됩니다. 홈 HTML에 SSI 주석으로 만든 중복 제목이 남지 않았는지, canonical·robots·설명·OG 태그가 한 벌씩 있는지 확인합니다. 전체 공개 코스의 제목·설명·canonical·index와 링크 공유 코스의 noindex를 확인합니다. 비공개 전환·삭제 후 404인지 확인하고 Cloudflare의 이전 코스 응답 캐시도 갱신합니다. `/guide`와 `/en/guide`에서 슬래시가 붙은 주소로 이동할 때 HTTPS와 대표 도메인이 유지되는지도 확인합니다. 외부 프록시에서 HTTPS를 종료하는 구성이라면 리디렉션의 Location 헤더를 특히 확인합니다.

## 검색엔진에 제출할 작업

1. **Google Search Console**: 사이트맵 `https://trazo.runvia.app/sitemap.xml`을 제출합니다. 홈, `/guide/`, `/en/guide/` 각각 URL 검사 → 실제 URL 테스트를 수행하고 색인 생성을 요청합니다. 페이지 색인 보고서에서 제외 사유와 Google이 선택한 canonical을 확인합니다. 인증 성공만으로 색인이 완료된 것은 아닙니다.
2. **네이버 서치어드바이저**: `https://trazo.runvia.app`을 등록하고 소유권을 확인합니다. 요청 → 사이트맵 제출에 같은 사이트맵을 넣고 웹페이지 수집 요청으로 홈과 한국어 안내를 요청합니다. DNS 인증을 Google에서 완료했더라도 네이버 인증은 별도입니다. 네이버가 제공하는 HTML 파일/메타 태그는 실제 값을 받은 뒤 적용합니다.
3. **Bing Webmaster Tools**: 이미 인증한 Google Search Console 사이트를 가져오거나 직접 소유권을 확인합니다. 사이트맵 제출 및 URL 검사로 수집 상태를 확인합니다.
4. **Cloudflare**: Security Events에서 실제 Googlebot·Bingbot·Yeti 요청이 차단되거나 Challenge 대상인지 확인합니다. 국가 제한·WAF·봇 규칙에서 검증된 검색 로봇을 고려합니다. User-Agent 문자열만으로 무조건 허용하지 않습니다. robots.txt 최종 응답에 Cloudflare가 추가한 차단 규칙이 있는지도 확인합니다.

## 검색 유입을 늘리는 후속 운영

검색 실적에서 브랜드 검색(Trazo, 트라소), 한국어 검색(자전거 코스 만들기, 러닝 코스 만들기, GPX 경로 만들기), 영어 검색(cycling route planner South Korea, running routes Korea)의 노출·클릭을 구분해 추이를 확인합니다. 실제 사용자 질문을 바탕으로 한국어·영어 사용 가이드, 한국 여행자를 위한 코스 계획 사례, 파일 형식별 기기 활용법을 작성하고 안내 페이지에서 링크합니다. 관련 커뮤니티와 서비스 소개 채널에 유용한 내용과 대표 URL을 함께 알립니다. 자동 대량 링크 등록보다 실제 사용자가 참고할 콘텐츠와 연결을 우선합니다.

## 공식 참고 문서

- [Google: 개발자를 위한 검색 가이드](https://developers.google.com/search/docs/fundamentals/get-started-developers)
- [Google: 언어별 페이지와 hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [네이버: 사이트 검색 BASIC](https://searchadvisor.naver.com/doc/wmt_guide_ps_websearch.pdf)
- [Bing: 사이트 등록과 Google Search Console 가져오기](https://www2.bing.com/webmasters/help/add-and-verify-site-12184f8b)
- [Cloudflare: 검증된 검색 로봇 허용](https://developers.cloudflare.com/waf/custom-rules/use-cases/allow-traffic-from-verified-bots/)

## 검증 결과와 배포

백엔드 테스트 20개(사이트맵 공개 범위·페이지 분할·비공개 전환·HTML 이스케이프·관련 코스 정보 보호 포함), 프론트엔드 빌드·린트, nginx 문법 및 실제 프록시 경로 검증을 통과했습니다. 데스크톱·모바일 화면과 랜딩페이지에서 앱 코스 뷰어로의 연결을 확인했습니다. 실제 Google 계정 로그인과 운영 카카오 지도 표시는 배포 후 확인이 필요합니다.

전체 공개 코스의 동적 사이트맵과 랜딩페이지는 프론트엔드·백엔드를 함께 재빌드·배포해야 작동합니다. Cloudflare의 이전 코스·사이트맵 응답 캐시를 갱신하고, 이 경로의 no-store 헤더를 캐시 규칙이 덮어쓰지 않도록 확인하세요. 검색엔진이 이미 색인한 내용을 제거하는 데는 재수집 시간이 필요합니다.
