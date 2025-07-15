// Google OAuth 관련 상수
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USER_INFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// JWT 관련 함수들
async function createJWT(payload, secret) {
    console.log('Creating JWT for payload:', payload.email);
    
    try {
        const header = {
            alg: 'HS256',
            typ: 'JWT'
        };
        
        // Base64URL 인코딩 (Cloudflare Workers 환경 최적화)
        const base64UrlEncode = (str) => {
            return btoa(str)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
        };
        
        const encodedHeader = base64UrlEncode(JSON.stringify(header));
        const encodedPayload = base64UrlEncode(JSON.stringify(payload));
        
        const data = `${encodedHeader}.${encodedPayload}`;
        console.log('JWT data created:', data.substring(0, 50) + '...');
        
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        
        const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
        const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
        
        const jwt = `${data}.${encodedSignature}`;
        console.log('JWT created successfully');
        
        return jwt;
    } catch (error) {
        console.error('JWT creation error:', error);
        throw error;
    }
}

async function verifyJWT(token, secret) {
    console.log('Verifying JWT token');
    
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            console.log('Invalid JWT format');
            return null;
        }
        
        const [headerB64, payloadB64, signatureB64] = parts;
        const data = `${headerB64}.${payloadB64}`;
        
        // Base64URL 디코딩 (Cloudflare Workers 환경 최적화)
        const base64UrlDecode = (str) => {
            // Base64URL을 Base64로 변환
            str = str.replace(/-/g, '+').replace(/_/g, '/');
            // 패딩 추가
            while (str.length % 4) {
                str += '=';
            }
            return atob(str);
        };
        
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );
        
        const signature = Uint8Array.from(base64UrlDecode(signatureB64), c => c.charCodeAt(0));
        const isValid = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(data));
        
        if (!isValid) {
            console.log('JWT signature verification failed');
            return null;
        }
        
        const payload = JSON.parse(base64UrlDecode(payloadB64));
        
        // 토큰 만료 확인
        if (payload.exp && payload.exp < Date.now() / 1000) {
            console.log('JWT token expired');
            return null;
        }
        
        console.log('JWT verified successfully for user:', payload.email);
        return payload;
    } catch (error) {
        console.error('JWT verification error:', error);
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
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
}

// --- START: NEW OAUTH2 LOGIC ---

/**
 * Handles the initiation of the Google OAuth2 flow.
 * It generates a state for CSRF protection, stores it in a cookie,
 * and returns the Google authorization URL.
 */
async function handleGoogleAuth(request, env) {
    console.log('Initiating Google Auth flow...');
    
    if (!env.GOOGLE_CLIENT_ID || !env.REDIRECT_URI) {
        console.error('Missing GOOGLE_CLIENT_ID or REDIRECT_URI in environment variables.');
        return new Response(JSON.stringify({ error: 'Server configuration error.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const state = generateUUID();
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', env.REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);

    const headers = new Headers({
        'Content-Type': 'application/json',
        'Set-Cookie': `oauth_state=${state}; Path=/; HttpOnly; Secure; Max-Age=600; SameSite=Lax` // 10 min expiry
    });

    return new Response(JSON.stringify({ authUrl: authUrl.toString() }), { headers });
}

/**
 * Exchanges the authorization code for an access token.
 */
async function exchangeCodeForToken(code, env) {
    console.log('Exchanging authorization code for token...');

    const body = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: env.REDIRECT_URI
    });
    
    console.log('Sending token request to Google with body:', Object.fromEntries(body.entries()));

    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Google token exchange failed:', response.status, errorText);
        throw new Error('Failed to exchange code for token.');
    }

    return await response.json();
}

/**
 * Fetches user information from Google using the access token.
 */
async function fetchGoogleUserInfo(accessToken) {
    console.log('Fetching user info from Google...');
    const response = await fetch(GOOGLE_USER_INFO_URL, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        console.error('Failed to fetch Google user info:', response.status, await response.text());
        throw new Error('Failed to fetch user info.');
    }

    return await response.json();
}

/**
 * Creates a new session for the user and stores it in KV.
 * Returns the session ID to be set as a cookie.
 */
async function createUserSession(userInfo, env) {
    console.log(`Creating session for user: ${userInfo.email}`);
    const sessionId = generateUUID();
    const sessionData = {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };

    await env.KV_NAMESPACE.put(`session:${sessionId}`, JSON.stringify(sessionData), {
        expirationTtl: 24 * 60 * 60 // 24 hours in seconds
    });

    console.log(`Session created with ID: ${sessionId}`);
    return sessionId;
}

/**
 * Handles the Google OAuth2 callback.
 * It verifies the state for CSRF protection, exchanges the code for a token,
 * fetches user info, creates a session, and redirects the user.
 */
async function handleGoogleCallback(request, env) {
    console.log('Handling Google Auth callback...');
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieHeader = request.headers.get('Cookie');
    
    const storedState = cookieHeader?.match(/oauth_state=([^;]+)/)?.[1];

    if (!state || !storedState || state !== storedState) {
        console.error('State mismatch or missing state. Possible CSRF attack.');
        return Response.redirect(`${url.origin}/?auth_error=state_mismatch`, 302);
    }
    
    if (!code) {
        console.error('Authorization code is missing in callback.');
        return Response.redirect(`${url.origin}/?auth_error=missing_code`, 302);
    }

    // Clear the state cookie now that it has been used.
    const headers = new Headers({
        'Location': `${url.origin}/`,
        'Set-Cookie': `oauth_state=; Path=/; HttpOnly; Secure; Max-Age=0; SameSite=Lax`
    });

    try {
        if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.REDIRECT_URI) {
            console.error('Server is missing Google OAuth environment variables.');
            throw new Error('Server configuration error.');
        }

        const tokenData = await exchangeCodeForToken(code, env);
        const userInfo = await fetchGoogleUserInfo(tokenData.access_token);
        const sessionId = await createUserSession(userInfo, env);
        
        // Set the session cookie and redirect to the home page
        headers.append('Set-Cookie', `auth_token=${sessionId}; Path=/; HttpOnly; Secure; Max-Age=${24 * 60 * 60}; SameSite=Lax`);
        
        return new Response(null, { status: 302, headers });

    } catch (error) {
        console.error('Error during auth callback processing:', error);
        // Redirect to home page with a generic error
        headers.set('Location', `${url.origin}/?auth_error=callback_failed`);
        return new Response(null, { status: 302, headers });
    }
}

// 사용자 정보 가져오기 (세션에서)
async function getUser(request, env) {
    console.log('Getting user from session...');
    
    const cookies = request.headers.get('Cookie');
    if (!cookies) {
        console.log('No cookies found');
        return null;
    }
    
    const tokenMatch = cookies.match(/auth_token=([^;]+)/);
    if (!tokenMatch) {
        console.log('No auth token found in cookies');
        return null;
    }
    
    const sessionId = tokenMatch[1];
    console.log('Session ID found:', sessionId);
    
    try {
        const sessionData = await env.KV_NAMESPACE.get(`session:${sessionId}`, { type: 'json' });
        
        if (!sessionData) {
            console.log('No session data found');
            return null;
        }
        
        // 세션 만료 확인
        if (sessionData.expiresAt < Date.now()) {
            console.log('Session expired');
            // 만료된 세션 삭제
            await env.KV_NAMESPACE.delete(`session:${sessionId}`);
            return null;
        }
        
        console.log('User session found:', sessionData.email);
        return sessionData;
    } catch (error) {
        console.error('Error getting user session:', error);
        return null;
    }
}


/**
 * Checks the user's authentication status based on the session cookie.
 */
async function handleAuthStatus(request, env) {
    console.log('Checking auth status...');
    try {
        const user = await getUser(request, env);
        if (user) {
            console.log('User is logged in:', user.email);
            return new Response(JSON.stringify({
                isLoggedIn: true,
                email: user.email,
                name: user.name,
                picture: user.picture
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            console.log('User is not logged in.');
            return new Response(JSON.stringify({ isLoggedIn: false }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        console.error('Error in handleAuthStatus:', error);
        return new Response(JSON.stringify({ isLoggedIn: false, error: 'Failed to check status' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Handles user logout by deleting the session from KV and clearing the cookie.
 */
async function handleLogout(request, env) {
    console.log('Handling logout...');
    const url = new URL(request.url);
    const cookieHeader = request.headers.get('Cookie');
    const tokenMatch = cookieHeader?.match(/auth_token=([^;]+)/);

    if (tokenMatch) {
        const sessionId = tokenMatch[1];
        console.log('Deleting session:', sessionId);
        await env.KV_NAMESPACE.delete(`session:${sessionId}`);
        console.log('Session deleted.');
    }

    const headers = new Headers({
        'Location': `${url.origin}/`,
        'Set-Cookie': `auth_token=; Path=/; HttpOnly; Secure; Max-Age=0; SameSite=Lax`
    });
    return new Response(null, { status: 302, headers });
}

/**
 * Fetches bookmarks for the authenticated user from KV.
 */
async function handleGetBookmarks(request, env, user) {
    console.log(`Fetching bookmarks for user: ${user.email}`);
    try {
        if (!env.KV_NAMESPACE) {
            console.error('KV_NAMESPACE is not bound.');
            return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        const bookmarks = await env.KV_NAMESPACE.get(`bookmarks:${user.email}`, { type: 'json' });
        return new Response(JSON.stringify({ bookmarks: bookmarks || [] }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching bookmarks:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch bookmarks' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

/**
 * Adds a new bookmark for the authenticated user.
 */
async function handleAddBookmark(request, env, user) {
    console.log(`Adding bookmark for user: ${user.email}`);
    try {
        const { title, url } = await request.json();
        if (!title || !url) {
            return new Response(JSON.stringify({ error: 'Title and URL are required' }), { status: 400, headers: { 'Content-Type': 'application/json' }});
        }

        const existingBookmarks = await env.KV_NAMESPACE.get(`bookmarks:${user.email}`, { type: 'json' }) || [];
        const newBookmark = {
            id: generateUUID(),
            title,
            url,
            createdAt: new Date().toISOString()
        };
        const updatedBookmarks = [...existingBookmarks, newBookmark];

        await env.KV_NAMESPACE.put(`bookmarks:${user.email}`, JSON.stringify(updatedBookmarks));

        return new Response(JSON.stringify({ bookmark: newBookmark }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('Error adding bookmark:', error);
        return new Response(JSON.stringify({ error: 'Failed to add bookmark' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

/**
 * Adds multiple bookmarks at once for the authenticated user.
 */
async function handleBulkAddBookmarks(request, env, user) {
    console.log(`Bulk adding bookmarks for user: ${user.email}`);
    try {
        const { bookmarks } = await request.json();
        if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
            return new Response(JSON.stringify({ error: 'Bookmarks array is required.' }), { status: 400, headers: { 'Content-Type': 'application/json' }});
        }

        const existingBookmarks = await env.KV_NAMESPACE.get(`bookmarks:${user.email}`, { type: 'json' }) || [];
        
        const newBookmarks = bookmarks.map(b => ({
            id: generateUUID(),
            title: b.title,
            url: b.url,
            createdAt: new Date().toISOString()
        }));

        const updatedBookmarks = [...existingBookmarks, ...newBookmarks];

        await env.KV_NAMESPACE.put(`bookmarks:${user.email}`, JSON.stringify(updatedBookmarks));

        return new Response(JSON.stringify({ success: true, added: newBookmarks.length }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('Error bulk adding bookmarks:', error);
        return new Response(JSON.stringify({ error: 'Failed to bulk add bookmarks' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

async function handleUpdateBookmark(request, env, user, bookmarkId) {
    console.log(`Updating bookmark ${bookmarkId} for user ${user.email}`);
    
    const { title, url } = await request.json();
    if (!title || !url) {
        return new Response(JSON.stringify({ error: 'Missing title or url' }), { status: 400 });
    }

    const userBookmarksKey = `bookmarks:${user.email}`;
    let bookmarks = await env.KV_NAMESPACE.get(userBookmarksKey, { type: 'json' }) || [];

    const bookmarkIndex = bookmarks.findIndex(b => b.id === bookmarkId);
    if (bookmarkIndex === -1) {
        return new Response(JSON.stringify({ error: 'Bookmark not found' }), { status: 404 });
    }

    const updatedBookmark = {
        ...bookmarks[bookmarkIndex],
        title,
        url,
        updatedAt: new Date().toISOString()
    };
    bookmarks[bookmarkIndex] = updatedBookmark;

    await env.KV_NAMESPACE.put(userBookmarksKey, JSON.stringify(bookmarks));

    return new Response(JSON.stringify({ message: 'Bookmark updated', bookmark: updatedBookmark }), { status: 200 });
}


async function handleDeleteBookmark(request, env, user, bookmarkId) {
    console.log(`Deleting bookmark ${bookmarkId} for user ${user.email}`);
    try {
        const userKey = `user:${user.email}`;
        let userData = await env.KV_NAMESPACE.get(userKey, { type: 'json' });

        if (userData && userData.bookmarks) {
            const initialCount = userData.bookmarks.length;
            userData.bookmarks = userData.bookmarks.filter(b => b.id !== bookmarkId);
            const finalCount = userData.bookmarks.length;

            if (initialCount > finalCount) {
                await env.KV_NAMESPACE.put(userKey, JSON.stringify(userData));
                console.log(`Bookmark ${bookmarkId} deleted successfully.`);
                return new Response(JSON.stringify({ message: 'Bookmark deleted' }), { status: 200 });
            } else {
                console.log(`Bookmark ${bookmarkId} not found for user ${user.email}`);
                return new Response(JSON.stringify({ error: 'Bookmark not found' }), { status: 404 });
            }
        } else {
            return new Response(JSON.stringify({ error: 'User data or bookmarks not found' }), { status: 404 });
        }
    } catch (error) {
        console.error('Error deleting bookmark:', error);
        return new Response(JSON.stringify({ error: 'Failed to delete bookmark' }), { status: 500 });
    }
}

async function handleDeleteAllBookmarks(request, env, user) {
    console.log(`Deleting all bookmarks for user ${user.email}`);
    try {
        const userKey = `user:${user.email}`;
        let userData = await env.KV_NAMESPACE.get(userKey, { type: 'json' });

        if (userData) {
            userData.bookmarks = [];
            await env.KV_NAMESPACE.put(userKey, JSON.stringify(userData));
            console.log(`All bookmarks for ${user.email} have been deleted.`);
            return new Response(JSON.stringify({ message: 'All bookmarks deleted' }), { status: 200 });
        } else {
            // 사용자는 있지만 북마크 데이터가 없는 경우도 성공으로 처리
            console.log(`No user data found for ${user.email}, nothing to delete.`);
            return new Response(JSON.stringify({ message: 'No bookmarks to delete' }), { status: 200 });
        }
    } catch (error) {
        console.error('Error deleting all bookmarks:', error);
        return new Response(JSON.stringify({ error: 'Failed to delete all bookmarks' }), { status: 500 });
    }
}


// 라우팅 및 요청 처리
export default {
    async fetch(request, env, ctx) {
        try {
            const url = new URL(request.url);
            const pathname = url.pathname;
            const method = request.method;
            console.log(`Request received: ${request.method} ${pathname}`);

            // --- API Routes ---
            if (pathname.startsWith('/api/')) {
                let response;

                // Handle OPTIONS for CORS preflight
                if (method === 'OPTIONS') {
                    response = new Response(null, { status: 204 });
                    return setCORSHeaders(response);
                }
                
                // Auth routes that don't need a user object yet
                if (pathname === '/api/auth/google') {
                    response = await handleGoogleAuth(request, env);
                    return setCORSHeaders(response);
                }
                if (pathname === '/api/auth/callback') {
                    return handleGoogleCallback(request, env);
                }
                if (pathname === '/api/auth/status') {
                    response = await handleAuthStatus(request, env);
                    return setCORSHeaders(response);
                }
                if (pathname === '/api/auth/logout') {
                    return handleLogout(request, env);
                }

                // --- Authenticated Routes ---
                const user = await getUser(request, env);
                if (!user) {
                    // Unauthenticated API routes
                    if (pathname === '/api/auth/google' && method === 'GET') {
                        response = await handleGoogleAuth(request, env);
                    } else if (pathname === '/api/auth/callback' && method === 'GET') {
                        response = await handleGoogleCallback(request, env);
                    } else if (pathname === '/api/auth/status' && method === 'GET') {
                        response = await handleAuthStatus(request, env);
                    } else {
                        response = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
                    }
                } else {
                    // Authenticated API routes
                    if (pathname === '/api/auth/logout' && method === 'POST') {
                        response = await handleLogout(request, env);
                    } else if (pathname === '/api/bookmarks' && method === 'GET') {
                        response = await handleGetBookmarks(request, env, user);
                    } else if (pathname === '/api/bookmarks' && method === 'POST') {
                        response = await handleAddBookmark(request, env, user);
                    } else if (pathname === '/api/bookmarks/bulk' && method === 'POST') {
                        response = await handleBulkAddBookmarks(request, env, user);
                    } else if (pathname.startsWith('/api/bookmarks/') && method === 'PUT') {
                        const bookmarkId = pathname.split('/')[3];
                        response = await handleUpdateBookmark(request, env, user, bookmarkId);
                    } else if (pathname.startsWith('/api/bookmarks/') && method === 'DELETE') {
                        const bookmarkId = pathname.split('/')[3];
                        if (bookmarkId === 'all') {
                            response = await handleDeleteAllBookmarks(request, env, user);
                        } else {
                            response = await handleDeleteBookmark(request, env, user, bookmarkId);
                        }
                    } else {
                        response = new Response(JSON.stringify({ error: 'API route not found' }), { status: 404 });
                    }
                }
                
                return setCORSHeaders(response);
            }
            
            // Fallback for asset serving
            try {
                return env.ASSETS.fetch(request);
            } catch (e) {
                console.error('Error fetching asset:', e);
                return new Response('Asset not found', { status: 404 });
            }

        } catch (e) {
            console.error('Unhandled error in fetch handler:', e);
            return new Response('Internal Server Error', { status: 500 });
        }
    }
}; 