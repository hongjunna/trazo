import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// /ga.js (GA4 로더): 운영 빌드에서만 VITE_GA_MEASUREMENT_ID를 넣고, 그 밖에는 아무것도 하지 않는 빈 스크립트입니다.
const EMPTY_GA = '// Google Analytics: 측정 ID가 없거나 운영 빌드가 아니어서 수집하지 않습니다.\n'
function analytics() {
  let source = EMPTY_GA
  return {
    name: 'trazo-analytics',
    configResolved(config) {
      const id = config.env.VITE_GA_MEASUREMENT_ID?.trim()
      if (config.command !== 'build' || !config.isProduction || !id) return
      if (!/^G-[A-Z0-9]+$/.test(id)) throw new Error(`VITE_GA_MEASUREMENT_ID 형식이 올바르지 않습니다: ${id}`)
      source = readFileSync(new URL('./analytics/ga.js', import.meta.url), 'utf8').replace('__GA_MEASUREMENT_ID__;', `${JSON.stringify(id)};`)
    },
    configureServer(server) {
      server.middlewares.use('/ga.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(EMPTY_GA)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'ga.js', source })
    },
  }
}

// 개발 서버에서 /oauth/authorize 를 로그인 동의 화면으로, /ai/ 를 AI 연동 소개 페이지로 보여줍니다
// (운영에서는 nginx.conf가 같은 일을 합니다. 상단 메뉴 화면 주소는 Vite가 index.html로 보여줍니다).
function aiConnectPages() {
  return {
    name: 'trazo-ai-connect-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [path, search = ''] = req.url.split('?')
        // AI 연동 소개 페이지는 public/ai/index.html 정적 파일입니다.
        if (req.method === 'GET' && (path === '/ai' || path === '/ai/')) {
          req.url = '/ai/index.html'
        }
        if (req.method === 'GET' && path === '/oauth/authorize') {
          req.url = '/oauth/index.html' + (search ? `?${search}` : '')
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), analytics(), aiConnectPages()],
  // 관리자 페이지(/admin/)는 코스 편집 화면과 따로 빌드합니다.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin/index.html', import.meta.url)),
        // AI 서비스 로그인 동의 화면(/oauth/authorize)
        oauth: fileURLToPath(new URL('./oauth/index.html', import.meta.url)),
      },
    },
  },
  server: {
    proxy: {
      '^/c/': {
        target: process.env.DEV_API_PROXY || 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/c\//, '/pages/c/').replace(/\/$/, ''),
      },
      '^/sitemap\\.xml$': {
        target: process.env.DEV_API_PROXY || 'http://localhost:8001',
        rewrite: () => '/seo/sitemap.xml',
      },
      '^/sitemap-courses-[0-9]+\\.xml$': {
        target: process.env.DEV_API_PROXY || 'http://localhost:8001',
        rewrite: (path) => path.replace(/^\/sitemap-courses-([0-9]+)\.xml$/, '/seo/sitemap-courses/$1.xml'),
      },
      // AI 서비스가 직접 호출하는 MCP 서버와 OAuth 주소
      '^/(mcp$|\\.well-known/(oauth-|openai-apps-challenge)|oauth/(token|register|revoke)$)': {
        target: process.env.DEV_API_PROXY || 'http://localhost:8001',
      },
      '/api': {
        target: process.env.DEV_API_PROXY || 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // 코스 이미지 저장에 쓰는 카카오 지도 타일 (운영에서는 nginx.conf가 같은 일을 합니다)
      '/map-tiles/mts': {
        target: 'https://mts.kakaocdn.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/map-tiles\/mts/, ''),
      },
      '/map-tiles/map': {
        target: 'https://map.kakaocdn.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/map-tiles\/map/, ''),
      },
    },
  },
})
