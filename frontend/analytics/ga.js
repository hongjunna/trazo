/* Google Analytics 4 로더. 운영 빌드(vite build)가 VITE_GA_MEASUREMENT_ID를 넣어 /ga.js로 내보냅니다.
   앱(index.html)·사용 안내(/guide/)·공유 코스 랜딩페이지(/c/<토큰>)가 함께 사용합니다. */
/* global __GA_MEASUREMENT_ID__ */
(function () {
  var id = __GA_MEASUREMENT_ID__;
  // 운영 도메인에서만 수집합니다. 로컬·개발 서버나 미리보기, 중복 로드에서는 아무것도 하지 않습니다.
  if (!id || location.hostname !== 'trazo.runvia.app' || window.__trazoGa) return;
  window.__trazoGa = true;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  // 링크 공유 코스(/c/<토큰>, ?course=<토큰>)는 주소를 아는 사람만 열 수 있으므로 토큰과 코스 이름을 보내지 않습니다.
  var SHARE_PATH = /^\/c\/[A-Za-z0-9_-]{6,64}(?=\/?$)/;
  function redact(href) {
    if (!href) return '';
    try {
      var url = new URL(href);
      if (url.origin !== location.origin) return url.href;
      url.pathname = url.pathname.replace(SHARE_PATH, '/c/TOKEN');
      if (url.searchParams.has('course')) url.searchParams.set('course', 'TOKEN');
      return url.href;
    } catch {
      return '';
    }
  }

  // 광고 기능은 쓰지 않습니다. 방문 통계(analytics_storage)만 사용합니다.
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted',
  });
  gtag('js', new Date());
  // page_view는 아래에서 직접 보냅니다 (토큰 제거, SPA 주소 변경 반영).
  gtag('config', id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });

  var last = null;
  function pageView() {
    var page = redact(location.href);
    if (page === last) return;
    // 이후 스크롤·외부 링크 클릭 등 자동 수집 이벤트에도 토큰을 지운 주소가 쓰이도록 함께 설정합니다.
    gtag('set', {
      page_location: page,
      page_referrer: last === null ? redact(document.referrer) : last,
      page_title: page === location.href ? document.title : '공유 코스',
    });
    gtag('event', 'page_view');
    last = page;
  }
  pageView();
  // 앱은 공유 코스를 열고 닫을 때 history.replaceState로 주소를 바꿉니다.
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var result = original.apply(this, arguments);
      pageView();
      return result;
    };
  });
  window.addEventListener('popstate', pageView);

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(script);
})();
