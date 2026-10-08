import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
let firebaseAuth = null;
try {
  if (Object.values(config).every(Boolean)) {
    firebaseAuth = getAuth(initializeApp(config));
    firebaseAuth.languageCode = 'ko';
  }
} catch {
  // 잘못된 설정이 있어도 화면과 로그인 설정 안내를 표시합니다.
}
export const auth = firebaseAuth;
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
export const loginWithGoogle = () => signInWithPopup(auth, provider);
export const logout = () => signOut(auth);
export const authErrorMessage = (error) => ({
  'auth/popup-blocked': '팝업이 차단됐습니다. 팝업을 허용하고 다시 시도하세요.',
  'auth/popup-closed-by-user': '로그인을 취소했습니다.',
  'auth/cancelled-popup-request': '이미 로그인이 진행 중입니다.',
  'auth/unauthorized-domain': '현재 도메인이 Firebase 로그인 허용 목록에 없습니다.',
  'auth/operation-not-allowed': 'Firebase에서 구글 로그인을 활성화해주세요.',
  'auth/network-request-failed': '네트워크 연결을 확인하고 다시 시도하세요.',
}[error.code] || '로그인 처리에 실패했습니다. 잠시 후 다시 시도하세요.');
