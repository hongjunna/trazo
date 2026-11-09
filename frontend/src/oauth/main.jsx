// src/oauth/main.jsx
// AI 연결 화면 진입점. /ai/ 는 연결 방법 안내와 연결 관리, /oauth/authorize 는 AI 서비스 로그인 동의 화면입니다.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../styles/app.css'
import './oauth.css'
import OAuthApp from './OAuthApp.jsx'
import FeedbackProvider from '../components/ui/FeedbackProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FeedbackProvider>
      <OAuthApp />
    </FeedbackProvider>
  </StrictMode>,
)
