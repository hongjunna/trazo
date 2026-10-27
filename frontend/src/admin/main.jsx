// src/admin/main.jsx
// 관리자 페이지(/admin/) 진입점. 코스 편집 화면과 따로 빌드합니다.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../styles/app.css'
import './admin.css'
import AdminApp from './AdminApp.jsx'
import FeedbackProvider from '../components/ui/FeedbackProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FeedbackProvider>
      <AdminApp />
    </FeedbackProvider>
  </StrictMode>,
)
