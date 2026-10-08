# 1. 빌드 단계
FROM node:22-alpine AS development
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "80"]

FROM development AS build
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
RUN test -n "$VITE_FIREBASE_API_KEY" && test -n "$VITE_FIREBASE_AUTH_DOMAIN" \
    && test -n "$VITE_FIREBASE_PROJECT_ID" && test -n "$VITE_FIREBASE_APP_ID" \
    || (echo "Firebase 설정이 누락됐습니다. docker compose로 빌드하고 .env의 VITE_FIREBASE 값을 확인해주세요." >&2; exit 1)
RUN npm run build

# 2. 실행 단계 (Nginx)
FROM nginx:alpine
# 빌드된 결과물을 Nginx 폴더로 복사
COPY --from=build /app/dist /usr/share/nginx/html
# React Router 새로고침 시 404 방지 설정
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]