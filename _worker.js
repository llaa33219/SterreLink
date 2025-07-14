// Google OAuth 관련 상수
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USER_INFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// JWT 관련 함수들
async function createJWT(payload, secret) {
    const header = {
        alg: 'HS256',
        typ: 'JWT'
    };
    
    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '');
    const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '');
    
    const data = `${encodedHeader}.${encodedPayload}`;
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '');
    
    return `${data}.${encodedSignature}`;
}

async function verifyJWT(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        
        const [headerB64, payloadB64, signatureB64] = parts;
        const data = `${headerB64}.${payloadB64}`;
        
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );
        
        const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
        const isValid = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(data));
        
        if (!isValid) return null;
        
        const payload = JSON.parse(atob(payloadB64));
        
        // 토큰 만료 확인
        if (payload.exp && payload.exp < Date.now() / 1000) {
            return null;
        }
        
        return payload;
    } catch (error) {
        return null;
    }
}

// UUID 생성 함수
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// CORS 헤더 설정
function setCORSHeaders(response) {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
}

// 사용자 정보 가져오기 (JWT에서)
async function getUser(request, env) {
    const cookies = request.headers.get('Cookie');
    if (!cookies) return null;
    
    const tokenMatch = cookies.match(/auth_token=([^;]+)/);
    if (!tokenMatch) return null;
    
    const token = tokenMatch[1];
    const secret = env.GOOGLE_CLIENT_SECRET || 'fallback-secret';
    
    return await verifyJWT(token, secret);
}

// 구글 OAuth 시작
async function handleGoogleAuth(request, env) {
    console.log('handleGoogleAuth called');
    
    // 환경 변수 확인
    if (!env.GOOGLE_CLIENT_ID) {
        console.error('GOOGLE_CLIENT_ID not found in environment variables');
        return new Response(JSON.stringify({ error: 'Google Client ID not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const redirectUri = `${new URL(request.url).origin}/api/auth/callback`;
    const state = generateUUID();
    
    console.log('Redirect URI:', redirectUri);
    console.log('Client ID:', env.GOOGLE_CLIENT_ID);
    
    const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state: state
    });
    
    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    
    return new Response(JSON.stringify({ authUrl }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// 구글 OAuth 콜백 처리
async function handleGoogleCallback(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    
    if (error) {
        return Response.redirect(`${url.origin}/?auth=error`, 302);
    }
    
    if (!code) {
        return Response.redirect(`${url.origin}/?auth=error`, 302);
    }
    
    try {
        // 액세스 토큰 교환
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: `${url.origin}/api/auth/callback`
            })
        });
        
        const tokenData = await tokenResponse.json();
        
        if (!tokenData.access_token) {
            return Response.redirect(`${url.origin}/?auth=error`, 302);
        }
        
        // 사용자 정보 가져오기
        const userResponse = await fetch(GOOGLE_USER_INFO_URL, {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`
            }
        });
        
        const userData = await userResponse.json();
        
        // JWT 생성
        const payload = {
            email: userData.email,
            name: userData.name,
            picture: userData.picture,
            exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30일
        };
        
        const secret = env.GOOGLE_CLIENT_SECRET || 'fallback-secret';
        const jwt = await createJWT(payload, secret);
        
        // 리다이렉트 응답에 쿠키 설정
        const response = Response.redirect(`${url.origin}/?auth=success`, 302);
        response.headers.set('Set-Cookie', `auth_token=${jwt}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`);
        
        return response;
    } catch (error) {
        console.error('OAuth callback error:', error);
        return Response.redirect(`${url.origin}/?auth=error`, 302);
    }
}

// 로그인 상태 확인
async function handleAuthStatus(request, env) {
    console.log('handleAuthStatus called');
    
    try {
        const user = await getUser(request, env);
        
        if (user) {
            console.log('User found:', user.email);
            return new Response(JSON.stringify({
                isLoggedIn: true,
                email: user.email,
                name: user.name,
                picture: user.picture
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        console.log('No user found');
        return new Response(JSON.stringify({ isLoggedIn: false }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error in handleAuthStatus:', error);
        return new Response(JSON.stringify({ 
            error: 'Internal server error',
            isLoggedIn: false 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 로그아웃
async function handleLogout(request, env) {
    const response = new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
    });
    
    response.headers.set('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    
    return response;
}

// 북마크 조회
async function handleGetBookmarks(request, env) {
    console.log('handleGetBookmarks called');
    
    const user = await getUser(request, env);
    if (!user) {
        console.log('Unauthorized: no user found');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    // KV 네임스페이스 확인
    if (!env.KV_NAMESPACE) {
        console.error('KV_NAMESPACE not found in environment');
        return new Response(JSON.stringify({ error: 'KV namespace not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    try {
        console.log('Fetching bookmarks for user:', user.email);
        const bookmarks = await env.KV_NAMESPACE.get(`bookmarks:${user.email}`, { type: 'json' });
        
        console.log('Bookmarks found:', bookmarks ? bookmarks.length : 0);
        return new Response(JSON.stringify({ bookmarks: bookmarks || [] }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching bookmarks:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 북마크 추가
async function handleAddBookmark(request, env) {
    const user = await getUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    try {
        const body = await request.json();
        const { title, url } = body;
        
        if (!title || !url) {
            return new Response(JSON.stringify({ error: 'Title and URL are required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // 기존 북마크 가져오기
        const existingBookmarks = await env.KV_NAMESPACE.get(`bookmarks:${user.email}`, { type: 'json' }) || [];
        
        // 새 북마크 생성
        const newBookmark = {
            id: generateUUID(),
            title: title,
            url: url,
            createdAt: new Date().toISOString()
        };
        
        // 북마크 추가
        const updatedBookmarks = [...existingBookmarks, newBookmark];
        
        // KV에 저장
        await env.KV_NAMESPACE.put(`bookmarks:${user.email}`, JSON.stringify(updatedBookmarks));
        
        return new Response(JSON.stringify({ bookmark: newBookmark }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error adding bookmark:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 북마크 삭제
async function handleDeleteBookmark(request, env) {
    const user = await getUser(request, env);
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    try {
        const url = new URL(request.url);
        const bookmarkId = url.pathname.split('/').pop();
        
        if (!bookmarkId) {
            return new Response(JSON.stringify({ error: 'Bookmark ID is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // 기존 북마크 가져오기
        const existingBookmarks = await env.KV_NAMESPACE.get(`bookmarks:${user.email}`, { type: 'json' }) || [];
        
        // 북마크 삭제
        const updatedBookmarks = existingBookmarks.filter(bookmark => bookmark.id !== bookmarkId);
        
        // KV에 저장
        await env.KV_NAMESPACE.put(`bookmarks:${user.email}`, JSON.stringify(updatedBookmarks));
        
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error deleting bookmark:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 메인 핸들러
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const pathname = url.pathname;
        const method = request.method;
        
        console.log(`${method} ${pathname}`);
        
        // OPTIONS 요청 처리 (CORS)
        if (method === 'OPTIONS') {
            console.log('Handling OPTIONS request');
            return setCORSHeaders(new Response(null, { status: 200 }));
        }
        
        // API 라우팅
        try {
            let response;
            
            // 인증 관련 API
            if (pathname === '/api/auth/google' && method === 'GET') {
                console.log('Routing to handleGoogleAuth');
                response = await handleGoogleAuth(request, env);
            } else if (pathname === '/api/auth/callback' && method === 'GET') {
                console.log('Routing to handleGoogleCallback');
                response = await handleGoogleCallback(request, env);
            } else if (pathname === '/api/auth/status' && method === 'GET') {
                console.log('Routing to handleAuthStatus');
                response = await handleAuthStatus(request, env);
            } else if (pathname === '/api/auth/logout' && method === 'POST') {
                console.log('Routing to handleLogout');
                response = await handleLogout(request, env);
            }
            
            // 북마크 관련 API
            else if (pathname === '/api/bookmarks' && method === 'GET') {
                console.log('Routing to handleGetBookmarks');
                response = await handleGetBookmarks(request, env);
            } else if (pathname === '/api/bookmarks' && method === 'POST') {
                console.log('Routing to handleAddBookmark');
                response = await handleAddBookmark(request, env);
            } else if (pathname.startsWith('/api/bookmarks/') && method === 'DELETE') {
                console.log('Routing to handleDeleteBookmark');
                response = await handleDeleteBookmark(request, env);
            }
            
            // API 경로인데 매칭되지 않은 경우 404 반환
            else if (pathname.startsWith('/api/')) {
                console.log('API endpoint not found:', pathname);
                response = new Response(JSON.stringify({ error: 'API endpoint not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            // 정적 파일 제공 (기본 동작)
            else {
                console.log('Serving static file:', pathname);
                
                // ASSETS 바인딩 확인
                if (!env.ASSETS) {
                    console.error('ASSETS binding not found');
                    return new Response('ASSETS binding not configured', { status: 500 });
                }
                
                try {
                    return env.ASSETS.fetch(request);
                } catch (error) {
                    console.error('Error serving static file:', error);
                    return new Response('Error serving static file', { status: 500 });
                }
            }
            
            return setCORSHeaders(response);
            
        } catch (error) {
            console.error('Handler error:', error);
            return setCORSHeaders(new Response(JSON.stringify({ error: 'Internal server error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
    }
}; 