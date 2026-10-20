/* Google Analytics 4 로더. 운영 빌드(vite build)가 VITE_GA_MEASUREMENT_ID를 넣어 /ga.js로 내보냅니다.
   앱(index.html)·사용 안내(/guide/)·개인정보처리방침(/privacy/)·공유 코스 랜딩페이지(/c/<토큰>)가 함께 사용합니다. */
/* global __GA_MEASUREMENT_ID__ */
(function () {
  var id = __GA_MEASUREMENT_ID__;
  // 운영 도메인에서만 수집합니다. 로컬·개발 서버나 미리보기, 중복 로드에서는 아무것도 하지 않습니다.
  if (!id || location.hostname !== 'trazo.runvia.app' || window.__trazoGa) return;
  window.__trazoGa = true;

  // 방문자의 선택('granted' | 'denied'). 개인정보처리방침 페이지에서도 같은 키로 바꿉니다.
  var CHOICE_KEY = 'trazo:analytics';
  var choice = null;
  try { choice = localStorage.getItem(CHOICE_KEY); } catch { /* 저장소를 못 쓰면 선택 없음으로 봅니다 */ }

  // 거부했거나 브라우저의 GPC(Global Privacy Control)가 켜져 있으면 GA를 불러오지 않고, 남은 GA 쿠키를 지웁니다.
  if (choice === 'denied' || (choice !== 'granted' && navigator.globalPrivacyControl)) {
    document.cookie.split(';').forEach(function (cookie) {
      var name = cookie.split('=')[0].trim();
      if (!/^_ga/.test(name)) return;
      document.cookie = name + '=; Max-Age=0; path=/';
      document.cookie = name + '=; Max-Age=0; path=/; domain=' + location.hostname;
    });
    return;
  }

  // 유럽(EU·EEA·영국·스위스) 방문자는 동의하기 전까지 GA를 불러오지 않습니다 (GDPR).
  // 위치를 서버에 묻지 않도록 브라우저 시간대로 판단하고, 놓친 경우는 아래 지역별 동의 기본값이 막습니다.
  var timeZone = '';
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* 시간대를 모르면 유럽이 아닌 것으로 봅니다 */ }
  var inEurope = /^(Europe\/|Atlantic\/(Azores|Madeira|Canary|Reykjavik|Faroe)|Arctic\/Longyearbyen)/.test(timeZone);
  if (choice !== 'granted' && inEurope) {
    askConsent();
    return;
  }
  start();

  function askConsent() {
    var box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Cookie consent');
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:560px;margin:0 auto;'
      + 'padding:16px;border-radius:14px;background:#0b4f57;color:#fff;font:14px/1.5 system-ui,sans-serif;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.25)';
    box.innerHTML = '<p style="margin:0 0 12px">Trazo uses Google Analytics cookies to understand how the site is used. '
      + 'Analytics stays off unless you accept. 이용 통계를 위해 Google Analytics 쿠키를 사용합니다. '
      + '<a href="/privacy/#en" style="color:#fff;text-decoration:underline">Privacy policy</a></p>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
      + '<button type="button" data-choice="denied">Decline</button>'
      + '<button type="button" data-choice="granted">Accept</button></div>';
    // 거부와 동의를 같은 모양으로 보여 줍니다.
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (button) {
      button.style.cssText = 'min-width:96px;padding:8px 16px;border:1px solid #fff;border-radius:10px;'
        + 'background:#fff;color:#0b4f57;font:600 14px system-ui,sans-serif;cursor:pointer';
      button.addEventListener('click', function () {
        var value = button.getAttribute('data-choice');
        try { localStorage.setItem(CHOICE_KEY, value); } catch { /* 저장하지 못하면 다음 방문에 다시 묻습니다 */ }
        box.remove();
        if (value === 'granted') start();
      });
    });
    document.body.appendChild(box);
  }

  function start() {
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;

    // 광고 기능은 쓰지 않습니다. 방문 통계(analytics_storage)만 사용하며, 유럽 지역은 동의 전 거부가 기본값입니다.
    gtag('consent', 'default', {
      analytics_storage: 'denied',
      region: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
        'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'],
    });
    gtag('consent', 'default', {
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted',
    });
    if (choice === 'granted' || inEurope) gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('js', new Date());
    // page_view는 아래에서 직접 보냅니다 (토큰 제거, SPA 주소 변경 반영). 쿠키는 이 서비스 도메인에만 둡니다.
    gtag('config', id, {
      send_page_view: false,
      cookie_domain: location.hostname,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

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
  }
})();
