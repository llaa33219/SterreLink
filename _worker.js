// Cloudflare Worker for SterreLink

// 환경 변수 (바인딩에서 설정)
// GOOGLE_CLIENT_ID - 구글 OAuth 클라이언트 ID
// JWT_SECRET - JWT 토큰 서명용 시크릿
// KV_NAMESPACE - KV 스토리지 네임스페이스 바인딩

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs';

class SterreLinkWorker {
    constructor(env) {
        this.env = env;
        this.kv = env.KV_NAMESPACE;
    }

    async handleRequest(request) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS 헤더 설정
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        // OPTIONS 요청 처리 (CORS preflight)
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // API 라우팅
            if (path.startsWith('/api/')) {
                const response = await this.handleApiRequest(request, path);
                return this.addCorsHeaders(response, corsHeaders);
            }

            // 정적 파일 서빙
            return this.handleStaticFiles(path);
        } catch (error) {
            console.error('Worker error:', error);
            const response = new Response(JSON.stringify({ error: 'Internal Server Error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
            return this.addCorsHeaders(response, corsHeaders);
        }
    }

    addCorsHeaders(response, corsHeaders) {
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([key, value]) => {
            newHeaders.set(key, value);
        });
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });
    }

    async handleApiRequest(request, path) {
        const url = new URL(request.url);
        const method = request.method;

        // 설정 API (인증 불필요)
        if (path === '/api/config' && method === 'GET') {
            return this.handleConfig(request);
        }

        // 인증 관련 API
        if (path === '/api/auth/google' && method === 'POST') {
            return this.handleGoogleAuth(request);
        }

        if (path === '/api/auth/status' && method === 'GET') {
            return this.handleAuthStatus(request);
        }

        if (path === '/api/auth/logout' && method === 'POST') {
            return this.handleLogout(request);
        }

        // 사이트 관련 API (인증 필요)
        const user = await this.authenticateUser(request);
        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (path === '/api/sites' && method === 'GET') {
            return this.handleGetSites(user);
        }

        if (path === '/api/sites' && method === 'POST') {
            return this.handleAddSite(request, user);
        }

        if (path === '/api/sites/batch' && method === 'POST') {
            return this.handleBatchAddSites(request, user);
        }

        if (path.startsWith('/api/sites/') && method === 'DELETE') {
            const siteId = path.split('/')[3];
            return this.handleDeleteSite(siteId, user);
        }

        return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async handleConfig(request) {
        return new Response(JSON.stringify({
            googleClientId: this.env.GOOGLE_CLIENT_ID
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async handleGoogleAuth(request) {
        try {
            const body = await request.json();
            const { credential } = body;

            if (!credential) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Credential is required'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Google JWT 토큰 검증
            const userData = await this.verifyGoogleJWT(credential);

            if (!userData) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Invalid token'
                }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 사용자 데이터 저장
            const user = {
                id: userData.sub,
                email: userData.email,
                name: userData.name,
                picture: userData.picture,
                created_at: new Date().toISOString()
            };

            await this.kv.put(`user:${user.id}`, JSON.stringify(user));

            // JWT 토큰 생성
            const jwtToken = await this.generateJWT(user);

            // 응답에 쿠키 설정
            const response = new Response(JSON.stringify({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    picture: user.picture
                }
            }), {
                headers: { 'Content-Type': 'application/json' }
            });

            response.headers.set('Set-Cookie', `auth_token=${jwtToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`);

            return response;

        } catch (error) {
            console.error('Google auth error:', error);
            return new Response(JSON.stringify({
                success: false,
                error: 'Authentication failed'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    async verifyGoogleJWT(token) {
        try {
            // JWT 토큰을 파싱
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid JWT format');
            }

            const header = JSON.parse(this.base64UrlDecode(parts[0]));
            const payload = JSON.parse(this.base64UrlDecode(parts[1]));

            // 기본 검증
            if (payload.aud !== this.env.GOOGLE_CLIENT_ID) {
                throw new Error('Invalid audience');
            }

            if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
                throw new Error('Invalid issuer');
            }

            if (payload.exp < Math.floor(Date.now() / 1000)) {
                throw new Error('Token expired');
            }

            // 간단한 검증만 수행 (실제 운영에서는 서명 검증도 필요)
            return payload;

        } catch (error) {
            console.error('JWT verification failed:', error);
            return null;
        }
    }

    async handleAuthStatus(request) {
        const user = await this.authenticateUser(request);
        
        if (user) {
            return new Response(JSON.stringify({
                isLoggedIn: true,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    picture: user.picture
                }
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            return new Response(JSON.stringify({ isLoggedIn: false }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    async handleLogout(request) {
        const response = new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });

        // 쿠키 삭제
        response.headers.set('Set-Cookie', 'auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');

        return response;
    }

    async handleGetSites(user) {
        try {
            const sitesData = await this.kv.get(`sites:${user.id}`);
            const sites = sitesData ? JSON.parse(sitesData) : [];

            return new Response(JSON.stringify({
                success: true,
                sites: sites
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Get sites error:', error);
            return new Response(JSON.stringify({
                success: false,
                error: 'Failed to load sites'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    async handleAddSite(request, user) {
        try {
            const body = await request.json();
            const { title, url } = body;

            if (!title || !url) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Title and URL are required'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 기존 사이트 목록 가져오기
            const sitesData = await this.kv.get(`sites:${user.id}`);
            const sites = sitesData ? JSON.parse(sitesData) : [];

            // 새 사이트 추가
            const newSite = {
                id: this.generateId(),
                title: title.trim(),
                url: url.trim(),
                created_at: new Date().toISOString()
            };

            sites.push(newSite);

            // 저장
            await this.kv.put(`sites:${user.id}`, JSON.stringify(sites));

            return new Response(JSON.stringify({
                success: true,
                site: newSite
            }), {
                headers: { 'Content-Type': 'application/json' }
            });

        } catch (error) {
            console.error('Add site error:', error);
            return new Response(JSON.stringify({
                success: false,
                error: 'Failed to add site'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    async handleBatchAddSites(request, user) {
        try {
            const body = await request.json();
            const { bookmarks } = body;

            if (!bookmarks || !Array.isArray(bookmarks) || bookmarks.length === 0) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Bookmarks array is required'
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // 기존 사이트 목록 가져오기
            const sitesData = await this.kv.get(`sites:${user.id}`);
            const sites = sitesData ? JSON.parse(sitesData) : [];

            // 기존 URL 목록 생성 (중복 방지)
            const existingUrls = new Set(sites.map(site => site.url));
            
            const newSites = [];
            let addedCount = 0;
            let skippedCount = 0;

            // 북마크들을 처리
            for (const bookmark of bookmarks) {
                const { title, url } = bookmark;
                
                if (!title || !url) {
                    skippedCount++;
                    continue;
                }

                const trimmedUrl = url.trim();
                const trimmedTitle = title.trim();

                // 중복 URL 체크
                if (existingUrls.has(trimmedUrl)) {
                    skippedCount++;
                    continue;
                }

                // 새 사이트 생성
                const newSite = {
                    id: this.generateId(),
                    title: trimmedTitle,
                    url: trimmedUrl,
                    created_at: new Date().toISOString()
                };

                newSites.push(newSite);
                existingUrls.add(trimmedUrl);
                addedCount++;
            }

            // 새 사이트들을 기존 목록에 추가
            sites.push(...newSites);

            // 저장
            await this.kv.put(`sites:${user.id}`, JSON.stringify(sites));

            return new Response(JSON.stringify({
                success: true,
                added: addedCount,
                skipped: skippedCount,
                total: bookmarks.length,
                sites: newSites
            }), {
                headers: { 'Content-Type': 'application/json' }
            });

        } catch (error) {
            console.error('Batch add sites error:', error);
            return new Response(JSON.stringify({
                success: false,
                error: 'Failed to add sites'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    async handleDeleteSite(siteId, user) {
        try {
            // 기존 사이트 목록 가져오기
            const sitesData = await this.kv.get(`sites:${user.id}`);
            const sites = sitesData ? JSON.parse(sitesData) : [];

            // 사이트 삭제
            const filteredSites = sites.filter(site => site.id !== siteId);

            // 저장
            await this.kv.put(`sites:${user.id}`, JSON.stringify(filteredSites));

            return new Response(JSON.stringify({
                success: true
            }), {
                headers: { 'Content-Type': 'application/json' }
            });

        } catch (error) {
            console.error('Delete site error:', error);
            return new Response(JSON.stringify({
                success: false,
                error: 'Failed to delete site'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    async authenticateUser(request) {
        const cookieHeader = request.headers.get('Cookie');
        if (!cookieHeader) {
            return null;
        }

        const authToken = this.extractCookieValue(cookieHeader, 'auth_token');
        if (!authToken) {
            return null;
        }

        try {
            const payload = await this.verifyJWT(authToken);
            return payload;
        } catch (error) {
            console.error('JWT verification error:', error);
            return null;
        }
    }

    extractCookieValue(cookieHeader, name) {
        const cookies = cookieHeader.split(';');
        for (const cookie of cookies) {
            const [key, value] = cookie.trim().split('=');
            if (key === name) {
                return value;
            }
        }
        return null;
    }

    async generateJWT(user) {
        const header = { alg: 'HS256', typ: 'JWT' };
        const payload = {
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
            exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30일
        };

        const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
        const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

        const signature = await this.sign(`${encodedHeader}.${encodedPayload}`, this.env.JWT_SECRET);

        return `${encodedHeader}.${encodedPayload}.${signature}`;
    }

    async verifyJWT(token) {
        const [header, payload, signature] = token.split('.');
        
        const expectedSignature = await this.sign(`${header}.${payload}`, this.env.JWT_SECRET);
        
        if (signature !== expectedSignature) {
            throw new Error('Invalid signature');
        }

        const decodedPayload = JSON.parse(this.base64UrlDecode(payload));
        
        if (decodedPayload.exp < Math.floor(Date.now() / 1000)) {
            throw new Error('Token expired');
        }

        return decodedPayload;
    }

    async sign(data, secret) {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const dataBuffer = encoder.encode(data);

        const key = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', key, dataBuffer);
        return this.base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
    }

    base64UrlEncode(str) {
        return btoa(str)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    base64UrlDecode(str) {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) {
            str += '=';
        }
        return atob(str);
    }

    generateId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    async handleStaticFiles(path) {
        // 정적 파일 컨텐츠 (실제 구현에서는 별도 파일에서 가져오거나 임베드)
        const files = {
            '/': await this.getIndexHTML(),
            '/index.html': await this.getIndexHTML(),
            '/style.css': await this.getStyleCSS(),
            '/script.js': await this.getScriptJS(),
        };

        if (files[path]) {
            const contentType = this.getContentType(path);
            return new Response(files[path], {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=3600'
                }
            });
        }

        return new Response('Not Found', { status: 404 });
    }

    getContentType(path) {
        if (path.endsWith('.css')) return 'text/css';
        if (path.endsWith('.js')) return 'application/javascript';
        if (path.endsWith('.json')) return 'application/json';
        return 'text/html';
    }

    async getIndexHTML() {
        // 여기에 index.html의 내용을 임베드하거나 별도 파일에서 읽어옴
        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SterreLink - 우주 바로가기</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="space-container">
        <!-- 우주 배경 별들 -->
        <div class="stars"></div>
        <div class="stars2"></div>
        <div class="stars3"></div>
        
        <!-- 중앙 항성 (구글 로고 또는 추가 버튼) -->
        <div class="star-system">
            <div class="central-star" id="centralStar">
                <div class="star-glow"></div>
                <div class="star-core" id="starCore">
                    <img id="starIcon" src="" alt="Central Star">
                </div>
            </div>
            
            <!-- 궤도들 -->
            <div class="orbit-container" id="orbitContainer">
                <!-- 궤도와 행성들이 동적으로 추가됨 -->
            </div>
        </div>
        
        <!-- 사용자 인터페이스 -->
        <div class="ui-overlay">
            <div class="user-info" id="userInfo">
                <div class="user-avatar" id="userAvatar"></div>
                <div class="user-name" id="userName">로그인이 필요합니다</div>
            </div>
            
            <div class="controls">
                <button class="control-btn" id="addSiteBtn" title="새 사이트 추가">+</button>
                <button class="control-btn" id="logoutBtn" title="로그아웃">⚙️</button>
            </div>
        </div>
        
        <!-- 사이트 추가 모달 -->
        <div class="modal" id="addSiteModal">
            <div class="modal-content">
                <span class="close" id="closeModal">&times;</span>
                <h2>새 사이트 추가</h2>
                <form id="addSiteForm">
                    <div class="form-group">
                        <label for="siteTitle">사이트 제목:</label>
                        <input type="text" id="siteTitle" name="title" required>
                    </div>
                    <div class="form-group">
                        <label for="siteUrl">사이트 URL:</label>
                        <input type="url" id="siteUrl" name="url" required>
                    </div>
                    <button type="submit">추가</button>
                </form>
            </div>
        </div>
        
        <!-- 사이트 상세 정보 툴팁 -->
        <div class="site-tooltip" id="siteTooltip">
            <div class="tooltip-content">
                <div class="tooltip-title"></div>
                <div class="tooltip-url"></div>
            </div>
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>`;
    }

    async getStyleCSS() {
        // 핵심 CSS 스타일 임베드
        return `
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Arial', sans-serif;
    background: #000;
    color: #fff;
    overflow: hidden;
    height: 100vh;
    cursor: grab;
}

.space-container {
    position: relative;
    width: 100vw;
    height: 100vh;
    background: radial-gradient(ellipse at center, #0a0a0a 0%, #000 100%);
    overflow: hidden;
}

.stars, .stars2, .stars3 {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: transparent;
}

.stars {
    animation: animateStars 50s linear infinite;
    box-shadow: 100px 200px #fff, 300px 300px #fff, 500px 100px #fff, 700px 400px #fff, 900px 300px #fff;
}

@keyframes animateStars {
    0% { transform: translateY(0px); }
    100% { transform: translateY(-2000px); }
}

.star-system {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
}

.central-star {
    position: relative;
    width: 80px;
    height: 80px;
    cursor: pointer;
    z-index: 100;
}

.star-glow {
    position: absolute;
    width: 120px;
    height: 120px;
    top: -20px;
    left: -20px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%);
    border-radius: 50%;
    animation: pulse 3s ease-in-out infinite;
}

@keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.7; }
    50% { transform: scale(1.1); opacity: 1; }
}

.star-core {
    position: absolute;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: radial-gradient(circle, #ffd700 0%, #ffa500 50%, #ff4500 100%);
    display: flex;
    justify-content: center;
    align-items: center;
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.8);
    transition: all 0.3s ease;
}

.star-core:hover {
    transform: scale(1.1);
    box-shadow: 0 0 30px rgba(255, 215, 0, 1);
}

#starIcon {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
}

.orbit-container {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
}

.orbit {
    position: absolute;
    top: 50%;
    left: 50%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    animation: rotate linear infinite;
}

@keyframes rotate {
    0% { transform: translate(-50%, -50%) rotate(0deg); }
    100% { transform: translate(-50%, -50%) rotate(360deg); }
}

.planet {
    position: absolute;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #333;
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
}

.planet:hover {
    transform: scale(1.2);
    box-shadow: 0 0 20px rgba(255, 255, 255, 0.6);
}

.planet img {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
}

.ui-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1000;
}

.user-info {
    position: absolute;
    top: 20px;
    left: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(0, 0, 0, 0.7);
    padding: 10px 15px;
    border-radius: 25px;
    backdrop-filter: blur(10px);
    pointer-events: auto;
}

.user-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #333;
    background-size: cover;
    background-position: center;
}

.controls {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    gap: 10px;
}

.control-btn {
    width: 50px;
    height: 50px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;
    pointer-events: auto;
}

.control-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.1);
}

.modal {
    display: none;
    position: fixed;
    z-index: 2000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
}

.modal-content {
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    margin: 15% auto;
    padding: 30px;
    border-radius: 15px;
    width: 80%;
    max-width: 500px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.close {
    color: #aaa;
    float: right;
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
    transition: color 0.3s ease;
}

.close:hover {
    color: #fff;
}

.modal h2 {
    margin-bottom: 20px;
    color: #fff;
    text-align: center;
}

.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    color: #ddd;
}

.form-group input {
    width: 100%;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 16px;
}

.form-group input:focus {
    outline: none;
    border-color: #ffd700;
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
}

.form-group button {
    width: 100%;
    padding: 12px;
    background: linear-gradient(135deg, #ffd700 0%, #ffa500 100%);
    color: #000;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
}

.form-group button:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(255, 215, 0, 0.4);
}

.site-tooltip {
    position: fixed;
    z-index: 1500;
    background: rgba(0, 0, 0, 0.9);
    color: #fff;
    padding: 10px 15px;
    border-radius: 8px;
    font-size: 14px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    max-width: 300px;
}

.site-tooltip.show {
    opacity: 1;
}

.tooltip-title {
    font-weight: bold;
    margin-bottom: 5px;
}

.tooltip-url {
    color: #aaa;
    font-size: 12px;
}

.context-menu {
    background: rgba(0, 0, 0, 0.9) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 8px !important;
    padding: 8px !important;
    z-index: 3000 !important;
    backdrop-filter: blur(10px);
}

.context-menu-item {
    padding: 8px 16px;
    cursor: pointer;
    color: #fff;
    border-radius: 4px;
    transition: background-color 0.2s ease;
}

.context-menu-item:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

/* 탭 UI */
.tab-container {
    display: flex;
    margin-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.tab-btn {
    flex: 1;
    padding: 10px 20px;
    background: transparent;
    border: none;
    color: #aaa;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.3s ease;
    font-size: 14px;
}

.tab-btn:hover {
    color: #fff;
}

.tab-btn.active {
    color: #ffd700;
    border-bottom-color: #ffd700;
}

.tab-content {
    display: none;
}

.tab-content.active {
    display: block;
}

/* 북마크 가져오기 UI */
.import-section {
    margin-bottom: 20px;
}

.help-text {
    display: block;
    margin-top: 5px;
    color: #888;
    font-size: 12px;
}

.form-group input[type="file"] {
    padding: 8px;
    border: 2px dashed rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    cursor: pointer;
    transition: all 0.3s ease;
}

.form-group input[type="file"]:hover {
    border-color: rgba(255, 215, 0, 0.5);
    background: rgba(255, 215, 0, 0.1);
}

.form-group input[type="file"]:focus {
    outline: none;
    border-color: #ffd700;
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
}

.import-progress {
    margin: 20px 0;
    text-align: center;
}

.progress-bar {
    width: 100%;
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #ffd700, #ffa500);
    width: 0%;
    transition: width 0.3s ease;
}

.progress-text {
    color: #fff;
    font-size: 14px;
}

.bookmark-preview {
    margin-top: 20px;
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 15px;
    background: rgba(0, 0, 0, 0.3);
}

.bookmark-preview h3 {
    margin-bottom: 15px;
    color: #ffd700;
    font-size: 16px;
}

.preview-list {
    margin-bottom: 15px;
}

.preview-item {
    display: flex;
    align-items: center;
    padding: 8px;
    margin-bottom: 5px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    transition: background 0.2s ease;
}

.preview-item:hover {
    background: rgba(255, 255, 255, 0.1);
}

.preview-item input[type="checkbox"] {
    margin-right: 10px;
    cursor: pointer;
}

.preview-favicon {
    width: 16px;
    height: 16px;
    margin-right: 10px;
    border-radius: 2px;
}

.preview-info {
    flex: 1;
}

.preview-title {
    font-weight: bold;
    color: #fff;
    margin-bottom: 2px;
}

.preview-url {
    color: #aaa;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.preview-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}

.preview-actions button {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s ease;
}

#confirmImport {
    background: linear-gradient(135deg, #ffd700 0%, #ffa500 100%);
    color: #000;
}

#confirmImport:hover {
    transform: translateY(-1px);
    box-shadow: 0 3px 10px rgba(255, 215, 0, 0.4);
}

#cancelImport {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}

#cancelImport:hover {
    background: rgba(255, 255, 255, 0.2);
}

@media (max-width: 768px) {
    .central-star {
        width: 60px;
        height: 60px;
    }
    
    .star-core {
        width: 60px;
        height: 60px;
    }
    
    #starIcon {
        width: 40px;
        height: 40px;
    }
    
    .planet {
        width: 32px;
        height: 32px;
    }
    
    .planet img {
        width: 24px;
        height: 24px;
    }
    
    .modal-content {
        width: 90%;
        margin: 20% auto;
        padding: 20px;
    }
}
        `;
    }

    async getScriptJS() {
        // 핵심 JavaScript 로직 임베드
        return `
class SterreLink {
         constructor() {
         this.user = null;
         this.sites = [];
         this.isLoggedIn = false;
         this.tooltip = null;
         this.dragData = { isDragging: false, lastX: 0, lastY: 0 };
         this.googleClientId = null;
         this.init();
     }

     init() {
         this.setupEventListeners();
         this.initializeGoogleAuth();
         this.checkAuthStatus();
         this.setupTooltip();
         this.setupDragAndDrop();
     }

     async initializeGoogleAuth() {
         try {
             const response = await fetch('/api/config');
             const config = await response.json();
             this.googleClientId = config.googleClientId;

             if (window.google?.accounts?.id) {
                 window.google.accounts.id.initialize({
                     client_id: this.googleClientId,
                     callback: this.handleGoogleResponse.bind(this),
                     auto_select: false,
                     cancel_on_tap_outside: false
                 });
             }
         } catch (error) {
             console.error('Google Auth 초기화 실패:', error);
         }
     }

    setupEventListeners() {
        document.getElementById('centralStar').addEventListener('click', () => {
            if (!this.isLoggedIn) {
                this.initiateGoogleAuth();
            } else {
                this.showAddSiteModal();
            }
        });

        document.getElementById('addSiteBtn').addEventListener('click', () => {
            this.showAddSiteModal();
        });

        document.getElementById('closeModal').addEventListener('click', () => {
            this.hideAddSiteModal();
        });

        document.getElementById('addSiteForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addSite();
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

                 document.getElementById('addSiteModal').addEventListener('click', (e) => {
             if (e.target.id === 'addSiteModal') {
                 this.hideAddSiteModal();
             }
         });

         document.addEventListener('keydown', (e) => {
             if (e.key === 'Escape') {
                 this.hideAddSiteModal();
             }
         });

         // 탭 전환 이벤트
         document.querySelectorAll('.tab-btn').forEach(btn => {
             btn.addEventListener('click', (e) => {
                 this.switchTab(e.target.dataset.tab);
             });
         });

         // 북마크 가져오기 이벤트
         document.getElementById('importBookmarks').addEventListener('click', () => {
             this.handleBookmarkImport();
         });

         document.getElementById('confirmImport').addEventListener('click', () => {
             this.confirmBookmarkImport();
         });

         document.getElementById('cancelImport').addEventListener('click', () => {
             this.cancelBookmarkImport();
         });
     }

    setupTooltip() {
        this.tooltip = document.getElementById('siteTooltip');
    }

    setupDragAndDrop() {
        const container = document.querySelector('.space-container');
        container.addEventListener('mousedown', (e) => {
            this.dragData.isDragging = true;
            this.dragData.lastX = e.clientX;
            this.dragData.lastY = e.clientY;
        });

        container.addEventListener('mousemove', (e) => {
            if (this.dragData.isDragging) {
                const deltaX = e.clientX - this.dragData.lastX;
                const deltaY = e.clientY - this.dragData.lastY;
                this.dragData.lastX = e.clientX;
                this.dragData.lastY = e.clientY;
            }
        });

        container.addEventListener('mouseup', () => {
            this.dragData.isDragging = false;
        });
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            
            if (data.isLoggedIn) {
                this.user = data.user;
                this.isLoggedIn = true;
                this.updateUI();
                this.loadSites();
            } else {
                this.setupGuestMode();
            }
        } catch (error) {
            console.error('인증 상태 확인 실패:', error);
            this.setupGuestMode();
        }
    }

    setupGuestMode() {
        const starIcon = document.getElementById('starIcon');
        starIcon.src = 'https://developers.google.com/identity/images/g-logo.png';
        starIcon.alt = 'Google 로그인';
        
        document.getElementById('userName').textContent = '로그인이 필요합니다';
        document.getElementById('addSiteBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'none';
    }

    updateUI() {
        const starIcon = document.getElementById('starIcon');
        const userName = document.getElementById('userName');
        const userAvatar = document.getElementById('userAvatar');
        
        if (this.user) {
            starIcon.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTMwIDVMMzMuMzIgMjFIMzBMMjcuNjggMjFMMzAgNVoiIGZpbGw9IiNGRkQ3MDAiLz4KPHBhdGggZD0iTTMwIDU1TDMzLjMyIDM5SDMwTDI3LjY4IDM5TDMwIDU1WiIgZmlsbD0iI0ZGRDcwMCIvPgo8cGF0aCBkPSJNNTUgMzBMNTAgMjdMNTAgMzNMNTUgMzBaIiBmaWxsPSIjRkZENzAwIi8+CjxwYXRoIGQ9Ik01IDMwTDEwIDI3TDEwIDMzTDUgMzBaIiBmaWxsPSIjRkZENzAwIi8+CjxjaXJjbGUgY3g9IjMwIiBjeT0iMzAiIHI9IjEwIiBmaWxsPSIjRkZENzAwIi8+Cjwvc3ZnPgo=';
            userName.textContent = this.user.name;
            userAvatar.style.backgroundImage = \`url(\${this.user.picture})\`;
            
            document.getElementById('addSiteBtn').style.display = 'block';
            document.getElementById('logoutBtn').style.display = 'block';
        }
    }

         async initiateGoogleAuth() {
         try {
             if (window.google?.accounts?.id) {
                 window.google.accounts.id.prompt();
             } else {
                 alert('Google 인증이 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
             }
         } catch (error) {
             console.error('Google 인증 시작 실패:', error);
         }
     }

     async handleGoogleResponse(response) {
         try {
             const loginResponse = await fetch('/api/auth/google', {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json',
                 },
                 body: JSON.stringify({
                     credential: response.credential
                 })
             });

             const data = await loginResponse.json();

             if (data.success) {
                 this.user = data.user;
                 this.isLoggedIn = true;
                 this.updateUI();
                 this.loadSites();
             } else {
                 alert('로그인에 실패했습니다: ' + data.error);
             }
         } catch (error) {
             console.error('Google 인증 처리 실패:', error);
             alert('로그인 중 오류가 발생했습니다.');
         }
     }

    async loadSites() {
        try {
            const response = await fetch('/api/sites');
            const data = await response.json();
            
            if (data.success) {
                this.sites = data.sites;
                this.renderSites();
            }
        } catch (error) {
            console.error('사이트 로드 실패:', error);
        }
    }

    renderSites() {
        const orbitContainer = document.getElementById('orbitContainer');
        orbitContainer.innerHTML = '';
        
        this.sites.forEach((site, index) => {
            this.createOrbit(site, index);
        });
    }

    createOrbit(site, index) {
        const orbitContainer = document.getElementById('orbitContainer');
        
        const orbitRadius = 150 + (index * 80);
        
        const titleLength = site.title.length;
        const urlLength = site.url.length;
        const speedFactor = Math.max(10, Math.min(100, titleLength + urlLength));
        const duration = speedFactor * 2;
        
        const orbit = document.createElement('div');
        orbit.className = 'orbit';
        orbit.style.width = \`\${orbitRadius * 2}px\`;
        orbit.style.height = \`\${orbitRadius * 2}px\`;
        orbit.style.animationDuration = \`\${duration}s\`;
        
        const planet = document.createElement('div');
        planet.className = 'planet';
        planet.style.top = '0';
        planet.style.left = '50%';
        planet.style.transform = 'translateX(-50%)';
        planet.dataset.siteId = site.id;
        planet.dataset.title = site.title;
        planet.dataset.url = site.url;
        
        const favicon = document.createElement('img');
        favicon.src = this.getFaviconUrl(site.url);
        favicon.alt = site.title;
        favicon.onerror = () => {
            favicon.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjNDQ0Ii8+CjxwYXRoIGQ9Ik04IDRWMTJNNCA4SDEyIiBzdHJva2U9IiNGRkYiIHN0cm9rZS13aWR0aD0iMSIvPgo8L3N2Zz4K';
        };
        
        planet.appendChild(favicon);
        
        planet.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(site.url, '_blank');
        });
        
        planet.addEventListener('mouseenter', (e) => {
            this.showTooltip(e, site.title, site.url);
        });
        
        planet.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });
        
        planet.addEventListener('mousemove', (e) => {
            this.updateTooltipPosition(e);
        });
        
        planet.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, site);
        });
        
        orbit.appendChild(planet);
        orbitContainer.appendChild(orbit);
    }

    getFaviconUrl(url) {
        try {
            const domain = new URL(url).hostname;
            return \`https://www.google.com/s2/favicons?domain=\${domain}&sz=32\`;
        } catch (error) {
            return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjNDQ0Ii8+CjxwYXRoIGQ9Ik04IDRWMTJNNCA4SDEyIiBzdHJva2U9IiNGRkYiIHN0cm9rZS13aWR0aD0iMSIvPgo8L3N2Zz4K';
        }
    }

    showTooltip(event, title, url) {
        const tooltip = this.tooltip;
        tooltip.querySelector('.tooltip-title').textContent = title;
        tooltip.querySelector('.tooltip-url').textContent = url;
        tooltip.classList.add('show');
        this.updateTooltipPosition(event);
    }

    updateTooltipPosition(event) {
        const tooltip = this.tooltip;
        const rect = tooltip.getBoundingClientRect();
        
        let x = event.clientX + 10;
        let y = event.clientY - 10;
        
        if (x + rect.width > window.innerWidth) {
            x = event.clientX - rect.width - 10;
        }
        if (y < 0) {
            y = event.clientY + 10;
        }
        
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    }

    hideTooltip() {
        this.tooltip.classList.remove('show');
    }

    showContextMenu(event, site) {
        const contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';
        contextMenu.innerHTML = \`
            <div class="context-menu-item" onclick="sterreLink.deleteSite('\${site.id}')">
                삭제
            </div>
        \`;
        
        contextMenu.style.position = 'fixed';
        contextMenu.style.left = event.clientX + 'px';
        contextMenu.style.top = event.clientY + 'px';
        
        document.body.appendChild(contextMenu);
        
        const closeMenu = (e) => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 100);
    }

    showAddSiteModal() {
        document.getElementById('addSiteModal').style.display = 'block';
        document.getElementById('siteTitle').focus();
    }

    hideAddSiteModal() {
        document.getElementById('addSiteModal').style.display = 'none';
        document.getElementById('addSiteForm').reset();
    }

    async addSite() {
        const title = document.getElementById('siteTitle').value.trim();
        const url = document.getElementById('siteUrl').value.trim();
        
        if (!title || !url) {
            alert('제목과 URL을 모두 입력해주세요.');
            return;
        }
        
        let validUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            validUrl = 'https://' + url;
        }
        
        try {
            const response = await fetch('/api/sites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: title,
                    url: validUrl
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.hideAddSiteModal();
                this.loadSites();
            } else {
                alert('사이트 추가에 실패했습니다: ' + data.error);
            }
        } catch (error) {
            console.error('사이트 추가 실패:', error);
            alert('사이트 추가 중 오류가 발생했습니다.');
        }
    }

    async deleteSite(siteId) {
        if (!confirm('정말로 이 사이트를 삭제하시겠습니까?')) {
            return;
        }
        
        try {
            const response = await fetch(\`/api/sites/\${siteId}\`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.loadSites();
            } else {
                alert('사이트 삭제에 실패했습니다: ' + data.error);
            }
        } catch (error) {
            console.error('사이트 삭제 실패:', error);
            alert('사이트 삭제 중 오류가 발생했습니다.');
        }
    }

    async logout() {
        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST'
            });
            
            if (response.ok) {
                this.user = null;
                this.isLoggedIn = false;
                this.sites = [];
                this.setupGuestMode();
                this.renderSites();
            }
        } catch (error) {
                         console.error('로그아웃 실패:', error);
         }
     }

     // 탭 전환 기능
     switchTab(tabName) {
         document.querySelectorAll('.tab-btn').forEach(btn => {
             btn.classList.remove('active');
         });
         document.querySelectorAll('.tab-content').forEach(content => {
             content.classList.remove('active');
         });
         document.querySelector(\`[data-tab="\${tabName}"]\`).classList.add('active');
         document.getElementById(\`\${tabName}-tab\`).classList.add('active');
         
         if (tabName === 'import') {
             this.resetImportState();
         }
     }

     resetImportState() {
         document.getElementById('importProgress').style.display = 'none';
         document.getElementById('bookmarkPreview').style.display = 'none';
         document.getElementById('bookmarkFile').value = '';
         document.getElementById('progressFill').style.width = '0%';
         this.pendingBookmarks = [];
     }

     async handleBookmarkImport() {
         const fileInput = document.getElementById('bookmarkFile');
         const file = fileInput.files[0];
         
         if (!file) {
             alert('HTML 파일을 선택해주세요.');
             return;
         }

         try {
             document.getElementById('importProgress').style.display = 'block';
             this.updateProgress(0, '파일 읽는 중...');

             const fileContent = await this.readFile(file);
             this.updateProgress(30, '북마크 파싱 중...');

             const bookmarks = this.parseBookmarkHTML(fileContent);
             this.updateProgress(70, '북마크 정리 중...');

             if (bookmarks.length === 0) {
                 alert('북마크를 찾을 수 없습니다.');
                 this.resetImportState();
                 return;
             }

             this.showBookmarkPreview(bookmarks);
             this.updateProgress(100, '완료!');

             setTimeout(() => {
                 document.getElementById('importProgress').style.display = 'none';
             }, 1000);

         } catch (error) {
             console.error('북마크 가져오기 실패:', error);
             alert('파일을 읽는 중 오류가 발생했습니다.');
             this.resetImportState();
         }
     }

     readFile(file) {
         return new Promise((resolve, reject) => {
             const reader = new FileReader();
             reader.onload = (e) => resolve(e.target.result);
             reader.onerror = (e) => reject(e);
             reader.readAsText(file, 'UTF-8');
         });
     }

     parseBookmarkHTML(htmlContent) {
         const parser = new DOMParser();
         const doc = parser.parseFromString(htmlContent, 'text/html');
         const bookmarks = [];

         const linkElements = doc.querySelectorAll('a[href]');
         
         linkElements.forEach(link => {
             const href = link.getAttribute('href');
             const title = link.textContent.trim();
             
             if (href && title && this.isValidURL(href)) {
                 bookmarks.push({
                     title: title,
                     url: href
                 });
             }
         });

         const uniqueBookmarks = [];
         const seenUrls = new Set();

         bookmarks.forEach(bookmark => {
             if (!seenUrls.has(bookmark.url)) {
                 seenUrls.add(bookmark.url);
                 uniqueBookmarks.push(bookmark);
             }
         });

         return uniqueBookmarks;
     }

     isValidURL(string) {
         try {
             const url = new URL(string);
             return url.protocol === 'http:' || url.protocol === 'https:';
         } catch {
             return false;
         }
     }

     updateProgress(percent, text) {
         document.getElementById('progressFill').style.width = percent + '%';
         document.getElementById('progressText').textContent = text;
     }

     showBookmarkPreview(bookmarks) {
         this.pendingBookmarks = bookmarks;
         const previewList = document.getElementById('previewList');
         previewList.innerHTML = '';

         bookmarks.forEach((bookmark, index) => {
             const previewItem = document.createElement('div');
             previewItem.className = 'preview-item';
             previewItem.innerHTML = \`
                 <input type="checkbox" id="bookmark-\${index}" checked>
                 <img src="\${this.getFaviconUrl(bookmark.url)}" alt="" class="preview-favicon" onerror="this.style.display='none'">
                 <div class="preview-info">
                     <div class="preview-title">\${bookmark.title}</div>
                     <div class="preview-url">\${bookmark.url}</div>
                 </div>
             \`;
             previewList.appendChild(previewItem);
         });

         document.getElementById('bookmarkPreview').style.display = 'block';
     }

     async confirmBookmarkImport() {
         const checkboxes = document.querySelectorAll('#previewList input[type="checkbox"]');
         const selectedBookmarks = [];

         checkboxes.forEach((checkbox, index) => {
             if (checkbox.checked) {
                 selectedBookmarks.push(this.pendingBookmarks[index]);
             }
         });

         if (selectedBookmarks.length === 0) {
             alert('가져올 북마크를 선택해주세요.');
             return;
         }

         try {
             const response = await fetch('/api/sites/batch', {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json',
                 },
                 body: JSON.stringify({
                     bookmarks: selectedBookmarks
                 })
             });

             const data = await response.json();

             if (data.success) {
                 alert(\`\${selectedBookmarks.length}개의 북마크가 성공적으로 추가되었습니다!\`);
                 this.hideAddSiteModal();
                 this.loadSites();
             } else {
                 alert('북마크 추가에 실패했습니다: ' + data.error);
             }

         } catch (error) {
             console.error('북마크 추가 실패:', error);
             alert('북마크 추가 중 오류가 발생했습니다.');
         }
     }

     cancelBookmarkImport() {
         this.resetImportState();
     }
 }
 
 const sterreLink = new SterreLink();
        `;
    }
}

// Cloudflare Workers 진입점
export default {
    async fetch(request, env, ctx) {
        const worker = new SterreLinkWorker(env);
        return worker.handleRequest(request);
    }
}; 