# SterreLink 🌟

우주 테마의 바로가기 사이트 - 항성 주위를 공전하는 행성들로 북마크를 관리하세요!

## 🚀 주요 기능

- **우주 테마 UI**: 항성과 행성이 공전하는 아름다운 우주 배경
- **구글 계정 연동**: 간편한 Google OAuth 로그인
- **지능적 궤도 시스템**: 사이트 제목과 URL 길이에 따른 공전 속도 자동 조절
- **파비콘 자동 표시**: 각 북마크의 파비콘을 행성으로 표시
- **반응형 줌**: 마우스 휠과 버튼으로 우주 탐험
- **우클릭 삭제**: 행성 우클릭으로 북마크 삭제
- **KV 저장소**: Cloudflare KV를 이용한 안전한 데이터 저장

## 🛠️ 기술 스택

- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Backend**: Cloudflare Pages Functions (_worker.js)
- **Database**: Cloudflare KV
- **Authentication**: Google OAuth 2.0
- **Deployment**: Cloudflare Pages

## 📦 설치 및 배포

### 1. 프로젝트 클론
```bash
git clone <repository-url>
cd SterreLink
```

### 2. Cloudflare Pages 배포
1. Cloudflare 대시보드에서 Pages로 이동
2. "Create a project" 클릭
3. Git 저장소 연결 또는 파일 업로드
4. 빌드 설정:
   - Build command: (비워두기)
   - Build output directory: /
   - Root directory: /

### 3. 환경 변수 설정

Cloudflare Pages 대시보드에서 다음 환경 변수를 설정하세요:

#### 필수 환경 변수
```
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
```

#### Google OAuth 설정
1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성
2. "APIs & Services" → "Credentials"로 이동
3. "Create Credentials" → "OAuth client ID" 선택
4. Application type: "Web application"
5. Authorized redirect URIs에 추가:
   ```
   https://your-domain.pages.dev/api/auth/callback
   ```
6. 생성된 Client ID와 Client Secret을 환경 변수로 설정

### 4. KV 네임스페이스 설정

1. Cloudflare 대시보드에서 "Workers & Pages" → "KV" 이동
2. "Create a namespace" 클릭
3. 네임스페이스 이름: `sterrelink-bookmarks` (또는 원하는 이름)
4. Pages 프로젝트 설정에서 "Functions" → "KV namespace bindings" 이동
5. 바인딩 추가:
   - Variable name: `KV_NAMESPACE`
   - KV namespace: 생성한 네임스페이스 선택

### 5. 커스텀 도메인 설정 (선택사항)
1. Cloudflare Pages 대시보드에서 "Custom domains" 탭
2. "Set up a custom domain" 클릭
3. 도메인 입력 후 DNS 설정 완료
4. Google OAuth 설정에서 새 도메인의 콜백 URL 추가

## 🎮 사용 방법

### 첫 방문 시
1. 화면 중앙의 항성(구글 로고)를 클릭하여 로그인
2. 구글 계정으로 인증 완료

### 북마크 관리
- **추가**: 로그인 후 항성 클릭 → 모달에서 제목과 URL 입력
- **접속**: 행성(북마크) 클릭
- **삭제**: 행성 우클릭 → 확인
- **제목 보기**: 행성에 마우스 호버

### 우주 탐험
- **줌 인/아웃**: 마우스 휠 또는 우측 상단 +/- 버튼
- **로그아웃**: 우측 상단 로그아웃 버튼

## 🌌 특별한 기능

### 지능적 궤도 시스템
각 북마크의 공전 속도는 다음 공식으로 계산됩니다:
```javascript
공전속도 = 20초 + ((제목길이 + URL길이 - 10) / 50) * 40초
```
- 최소 공전 시간: 20초
- 최대 공전 시간: 60초
- 긴 제목/URL일수록 느린 공전

### 궤도 배치
- 첫 번째 행성: 120px 반지름
- 이후 행성들: 80px씩 증가 (화면 크기에 따라 자동 조절)

### 파비콘 시스템
- Google Favicon API를 통해 자동 파비콘 로드
- 실패 시 기본 🌐 아이콘 표시

## 🔧 개발 환경

### 로컬 개발
```bash
# Wrangler CLI 설치
npm install -g wrangler

# 로컬 KV 네임스페이스 생성
wrangler kv:namespace create "sterrelink-bookmarks"
wrangler kv:namespace create "sterrelink-bookmarks" --preview

# 로컬 개발 서버 실행
wrangler pages dev . --kv KV_NAMESPACE=<namespace-id>
```

### 환경 변수 파일 (.env)
```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## 📱 반응형 지원

- 데스크톱: 전체 기능 지원
- 태블릿: 터치 제스처 지원
- 모바일: 축소된 UI로 최적화

## 🔒 보안 기능

- JWT 기반 인증 (30일 만료)
- HTTP-only 쿠키 사용
- CSRF 보호
- 사용자별 데이터 격리

## 🎨 커스터마이징

### 색상 변경
`styles.css`에서 다음 변수들을 수정하세요:
- `--star-color`: 항성 색상
- `--planet-color`: 행성 색상
- `--orbit-color`: 궤도 색상

### 궤도 속도 조정
`script.js`의 `calculateOrbitSpeed` 함수에서 공전 속도 공식을 수정할 수 있습니다.

## 🐛 문제 해결

### 로그인이 안 돼요
1. Google OAuth 설정에서 콜백 URL 확인
2. 환경 변수 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 확인
3. 브라우저 쿠키 설정 확인

### 북마크가 저장되지 않아요
1. KV 네임스페이스 바인딩 확인
2. 네임스페이스 권한 설정 확인
3. Cloudflare Pages 로그 확인

### 파비콘이 표시되지 않아요
- 일부 사이트는 파비콘을 제공하지 않습니다
- 기본 🌐 아이콘이 표시되는 것은 정상입니다

## 🤝 기여

버그 리포트와 기능 제안은 언제든 환영합니다!

## 📄 라이선스

MIT License

---

**SterreLink**: 우주 속에서 만나는 새로운 북마크 경험 🌟 