// src/utils/seo.js
// 앱 안에서 화면을 옮길 때 검색용 태그(제목·설명·대표 주소·미리보기)를 그 화면에 맞게 바꿉니다.
// 처음 받는 HTML은 nginx가 주소에 맞춰 같은 태그를 넣어 보내므로(index.html SSI), 자바스크립트를 실행하지 않는 봇도 같은 내용을 봅니다.
import { SITE_URL, metaForPath } from './pages';

const setMeta = (attr, key, content) => {
    let node = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!node) {
        node = document.createElement('meta');
        node.setAttribute(attr, key);
        document.head.appendChild(node);
    }
    node.setAttribute('content', content);
};

const setCanonical = (href) => {
    let node = document.head.querySelector('link[rel="canonical"]');
    if (!node) {
        node = document.createElement('link');
        node.setAttribute('rel', 'canonical');
        document.head.appendChild(node);
    }
    node.setAttribute('href', href);
};

export const applyPageMeta = (pathname) => {
    const meta = metaForPath(pathname);
    const url = `${SITE_URL}${meta.path === '/' ? '/' : meta.path}`;
    document.title = meta.title;
    setMeta('name', 'description', meta.description);
    setMeta('name', 'robots', meta.index === false ? 'noindex, follow' : 'index, follow, max-image-preview:large');
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:title', meta.title);
    setMeta('property', 'og:description', meta.description);
    setMeta('name', 'twitter:title', meta.title);
    setMeta('name', 'twitter:description', meta.description);
    setCanonical(url);
};
