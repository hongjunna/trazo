import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
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
