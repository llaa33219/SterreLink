# SterreLink 🌟

우주를 테마로 한 아름다운 바로가기 사이트입니다. 중앙의 항성을 중심으로 북마크된 사이트들이 행성처럼 공전하며, 사이트 제목과 URL 길이에 따라 공전 속도가 달라집니다.

## 🚀 특징

- 🌌 **우주 테마 UI**: 별이 빛나는 우주 배경에서 행성들이 공전
- 🔐 **Google 인증**: 간편한 Google 계정 연동
- ☁️ **Cloudflare 기반**: Pages + Workers + KV로 완전 서버리스
- 🌍 **파비콘 자동 로드**: 각 사이트의 파비콘을 자동으로 가져와 표시
- 💫 **동적 공전**: 사이트 정보에 따른 수학적 공전 속도 계산
- 📱 **반응형 디자인**: 모바일에서도 완벽하게 작동
- 📥 **북마크 가져오기**: 브라우저 북마크 HTML 파일 대량 업로드
- 🔄 **중복 제거**: 자동으로 중복 북마크 감지 및 제거
- 🎯 **선택적 가져오기**: 미리보기에서 원하는 북마크만 선택 가능

## 🛠️ 설정 방법

### 1. Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에서 새 프로젝트 생성
2. OAuth 2.0 클라이언트 ID 생성:
   - 애플리케이션 유형: 웹 애플리케이션
   - 승인된 JavaScript 원본: `https://your-domain.com`
   - 승인된 리디렉션 URI는 설정하지 않아도 됩니다 (클라이언트사이드 인증)
3. 클라이언트 ID 메모 (클라이언트 시크릿은 필요 없음)

### 2. Cloudflare 설정

#### KV 네임스페이스 생성
```bash
wrangler kv:namespace create "KV_NAMESPACE"
wrangler kv:namespace create "KV_NAMESPACE" --preview
```

#### 환경 변수 설정
```bash
# Google Client ID 설정 (wrangler.toml의 [vars]에 추가)
# GOOGLE_CLIENT_ID = "your_google_client_id.apps.googleusercontent.com"

# JWT 시크릿 설정 (임의의 강력한 문자열)
wrangler secret put JWT_SECRET
```

### 3. wrangler.toml 수정

```toml
name = "sterrelink"
main = "_worker.js"
compatibility_date = "2024-01-01"

[env.production]
account_id = "YOUR_ACCOUNT_ID"  # 실제 계정 ID로 교체

[[kv_namespaces]]
binding = "KV_NAMESPACE"
id = "YOUR_KV_NAMESPACE_ID"          # 위에서 생성한 KV ID로 교체
preview_id = "YOUR_PREVIEW_KV_ID"    # 프리뷰용 KV ID로 교체

[vars]
GOOGLE_CLIENT_ID = "your_google_client_id.apps.googleusercontent.com"
```

### 4. 배포

```bash
# 개발 환경에서 테스트
wrangler dev

# 프로덕션 배포
wrangler deploy
```

## 🎯 사용 방법

1. **로그인**: 중앙의 항성(구글 로고)을 클릭하여 Google 계정으로 로그인
2. **사이트 추가**: 
   - **수동 추가**: 로그인 후 항성을 클릭하거나 우상단의 + 버튼 클릭
   - **북마크 가져오기**: 탭에서 "북마크 가져오기" 선택 후 HTML 파일 업로드
3. **사이트 방문**: 공전하는 행성(파비콘)을 클릭하여 사이트 방문
4. **사이트 삭제**: 행성을 우클릭하여 삭제 메뉴 표시
5. **정보 보기**: 행성에 마우스를 올리면 사이트 제목과 URL 표시

### 📥 북마크 가져오기

브라우저에서 북마크를 대량으로 가져올 수 있습니다:

1. **Chrome**: 설정 → 북마크 → 북마크 및 설정 가져오기 → 내보내기
2. **Firefox**: 북마크 → 북마크 관리 → 가져오기 및 백업 → HTML로 내보내기
3. **Safari**: 파일 → 북마크 내보내기
4. **Edge**: 설정 → 즐겨찾기 → 즐겨찾기 내보내기

생성된 HTML 파일을 SterreLink의 "북마크 가져오기" 탭에서 업로드하면:
- 자동으로 북마크 파싱 및 중복 제거
- 미리보기에서 선택적으로 가져오기 가능
- 기존 북마크와 중복되는 URL은 자동으로 제외

## 🔧 기술 스택

- **Frontend**: Vanilla JavaScript, CSS3 (애니메이션)
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare KV
- **Authentication**: Google OAuth 2.0
- **Deployment**: Cloudflare Pages

## 🌟 주요 파일 구조

```
SterreLink/
├── index.html          # 메인 HTML 파일
├── style.css           # 스타일시트 (우주 테마)
├── script.js           # 프론트엔드 로직
├── _worker.js          # Cloudflare Worker (백엔드)
├── wrangler.toml       # Cloudflare 설정
└── README.md           # 이 파일
```

## 🎨 커스터마이징

### 공전 속도 조정
`script.js`의 `createOrbit` 함수에서 공전 속도 공식을 수정할 수 있습니다:

```javascript
const speedFactor = Math.max(10, Math.min(100, titleLength + urlLength));
const duration = speedFactor * 2; // 이 부분을 수정
```

### 궤도 간격 조정
```javascript
const orbitRadius = 150 + (index * 80); // 이 부분을 수정
```

### 색상 테마 변경
`style.css`에서 CSS 변수를 통해 색상을 변경할 수 있습니다.

## 📡 API 엔드포인트

### 인증 관련
- `GET /api/auth/google` - Google OAuth 시작
- `GET /api/auth/callback` - OAuth 콜백 처리
- `GET /api/auth/status` - 인증 상태 확인
- `POST /api/auth/logout` - 로그아웃

### 사이트 관리
- `GET /api/sites` - 사용자 사이트 목록 조회
- `POST /api/sites` - 단일 사이트 추가
- `POST /api/sites/batch` - 여러 사이트 일괄 추가 (북마크 가져오기)
- `DELETE /api/sites/{id}` - 사이트 삭제

### 북마크 배치 추가 요청 예시
```json
{
  "bookmarks": [
    {
      "title": "Google",
      "url": "https://google.com"
    },
    {
      "title": "GitHub",
      "url": "https://github.com"
    }
  ]
}
```

## 🔐 보안 고려사항

- JWT 시크릿은 강력한 랜덤 문자열로 설정
- Google OAuth 승인된 JavaScript 원본은 정확히 설정
- HTTPS를 통해서만 서비스 제공
- Google Client ID는 공개되어도 안전하지만, 도메인 제한으로 보안 강화

## 📝 라이선스

이 프로젝트는 MIT 라이선스 하에 제공됩니다.

## 🚀 배포된 사이트

배포 후 `https://your-domain.com`에서 확인할 수 있습니다.

---

**즐거운 우주 여행 되세요!** 🌌✨ 