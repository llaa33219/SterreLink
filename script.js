class SterreLink {
    constructor() {
        this.isLoggedIn = false;
        this.userEmail = null;
        this.userPicture = null;
        this.bookmarks = [];
        this.zoomLevel = 1;
        this.planetElements = [];
        this.orbitElements = [];
        this.animationId = null;

        // Panning state
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.viewX = 0;
        this.viewY = 0;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkLoginStatus();
        this.hideLoading();
    }

    setupEventListeners() {
        // 항성 클릭 (로그인 또는 북마크 추가)
        document.getElementById('star').addEventListener('click', () => {
            if (!this.isLoggedIn) {
                this.loginWithGoogle();
            } else {
                this.showAddBookmarkModal();
            }
        });

        // Logout from new dropdown
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });
        
        // Import bookmarks
        document.getElementById('import-bookmarks-btn').addEventListener('click', () => {
            this.showImportBookmarksModal();
        });

        // Modal-related for import
        document.querySelector('.close-import').addEventListener('click', () => {
            this.hideImportBookmarksModal();
        });
        document.getElementById('cancel-import-bookmark').addEventListener('click', () => {
            this.hideImportBookmarksModal();
        });
        document.getElementById('start-import-btn').addEventListener('click', () => {
            this.handleBookmarkFile();
        });

        // 모달 관련
        document.querySelector('.close').addEventListener('click', () => {
            this.hideAddBookmarkModal();
        });

        document.getElementById('cancel-bookmark').addEventListener('click', () => {
            this.hideAddBookmarkModal();
        });

        document.getElementById('bookmark-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addBookmark();
        });

        // 모달 바깥 클릭시 닫기
        document.getElementById('add-bookmark-modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.hideAddBookmarkModal();
            }
        });

        // Zoom to cursor
        document.addEventListener('wheel', (e) => {
            e.preventDefault();

            const oldZoomLevel = this.zoomLevel;
            let newZoomLevel;

            if (e.deltaY > 0) {
                newZoomLevel = Math.max(oldZoomLevel * 0.9, 0.05);
            } else {
                newZoomLevel = Math.min(oldZoomLevel * 1.1, 5);
            }

            if (newZoomLevel === oldZoomLevel) {
                return; // No change
            }
            
            // Zoom to the center of the screen
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            // The position of the screen center in world coordinates (pre-zoom)
            const worldMouseX = (centerX - this.viewX) / oldZoomLevel;
            const worldMouseY = (centerY - this.viewY) / oldZoomLevel;
            
            // The new view offset that keeps the world point under the screen center
            this.viewX = centerX - worldMouseX * newZoomLevel;
            this.viewY = centerY - worldMouseY * newZoomLevel;
            
            this.zoomLevel = newZoomLevel;
            
            this.updateView();
        }, { passive: false });

        // Panning event listeners
        const solarSystem = document.getElementById('solar-system');
        
        document.body.addEventListener('mousedown', (e) => {
            // Allow clicking on links and buttons
            if (e.target.closest('a, button')) {
                return;
            }
            e.preventDefault();
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            document.body.style.cursor = 'grabbing';
        });

        document.body.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            e.preventDefault();
            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            
            this.viewX += dx;
            this.viewY += dy;
            
            this.updateView();
        });
        
        document.body.addEventListener('mouseup', () => {
            this.isDragging = false;
            document.body.style.cursor = 'default';
        });
        
        document.body.addEventListener('mouseleave', () => {
            this.isDragging = false;
            document.body.style.cursor = 'default';
        });
    }

    showLoading() {
        document.getElementById('loading').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }

    async checkLoginStatus() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            
            if (data.isLoggedIn) {
                this.isLoggedIn = true;
                this.userEmail = data.email;
                this.userPicture = data.picture; // Store user picture
                this.updateUIForLogin();
                await this.loadBookmarks();
            }
        } catch (error) {
            console.error('Login status check failed:', error);
        }
    }

    async loginWithGoogle() {
        try {
            const response = await fetch('/api/auth/google');
            const data = await response.json();
            
            if (data.authUrl) {
                window.location.href = data.authUrl;
            }
        } catch (error) {
            console.error('Google login failed:', error);
        }
    }

    async logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            this.isLoggedIn = false;
            this.userEmail = null;
            this.bookmarks = [];
            this.updateUIForLogout();
            this.clearPlanets();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }

    updateUIForLogin() {
        const starContent = document.getElementById('star');
        starContent.classList.add('logged-in');
        
        // Update new user profile widget
        const profileWidget = document.getElementById('user-profile-widget');
        const profilePic = document.getElementById('user-profile-pic');
        
        profileWidget.style.display = 'block';
        profilePic.src = this.userPicture || 'https://lh3.googleusercontent.com/a/default-user=s96-c';
        
        // Hide old logout button if it exists
        const oldLogoutButton = document.getElementById('logout');
        if(oldLogoutButton) oldLogoutButton.style.display = 'none';
    }

    updateUIForLogout() {
        const starContent = document.getElementById('star');
        starContent.classList.remove('logged-in');

        // Hide user profile widget
        document.getElementById('user-profile-widget').style.display = 'none';
    }

    async loadBookmarks() {
        try {
            const response = await fetch('/api/bookmarks');
            const data = await response.json();
            
            this.bookmarks = data.bookmarks || [];
            this.renderPlanets();
        } catch (error) {
            console.error('Failed to load bookmarks:', error);
        }
    }

    showAddBookmarkModal() {
        document.getElementById('add-bookmark-modal').style.display = 'block';
        document.getElementById('bookmark-title').focus();
    }

    hideAddBookmarkModal() {
        document.getElementById('add-bookmark-modal').style.display = 'none';
        document.getElementById('bookmark-form').reset();
    }

    async addBookmark() {
        const title = document.getElementById('bookmark-title').value;
        const url = document.getElementById('bookmark-url').value;

        if (!title || !url) return;

        try {
            const response = await fetch('/api/bookmarks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title, url })
            });

            if (response.ok) {
                const data = await response.json();
                this.bookmarks.push(data.bookmark);
                this.renderPlanets();
                this.hideAddBookmarkModal();
            }
        } catch (error) {
            console.error('Failed to add bookmark:', error);
        }
    }

    /**
     * Calculates a deterministic and unique orbit radius for each bookmark.
     * This ensures each planet has its own distinct orbit.
     */
    calculateOrbitRadius(index) {
        const BASE_RADIUS = 150; // Radius of the first orbit
        const RADIUS_STEP = 80;  // Distance between orbits
        return BASE_RADIUS + (index * RADIUS_STEP);
    }

    /**
     * Creates a simple hash from a string.
     * Used to generate deterministic values from bookmark URLs.
     */
    stringToHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash |= 0; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Calculates deterministic orbital properties (duration, initial angle)
     * based on the bookmark's URL.
     */
    calculateOrbitalProperties(url) {
        const hash = this.stringToHash(url);
        
        // Duration between 300s (5min) and 1800s (30min) for a visible but slow orbit.
        const MIN_DURATION_S = 300;
        const MAX_DURATION_S = 1800;
        const duration = MIN_DURATION_S + (hash % (MAX_DURATION_S - MIN_DURATION_S));

        // Initial angle between 0 and 360 degrees
        const initialAngle = hash % 360;

        return { duration, initialAngle };
    }


    getFavicon(url) {
        try {
            // Use a more modern and reliable favicon service
            return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(url)}&size=32`;
        } catch (error) {
            // Fallback for invalid URLs
            return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjRkZGIi8+Cjwvc3ZnPgo=';
        }
    }

    renderPlanets() {
        this.clearPlanets();
        
        if (this.bookmarks.length === 0) return;

        const planetsContainer = document.getElementById('planets');
        const orbitsContainer = document.getElementById('orbits');

        this.bookmarks.forEach((bookmark, index) => {
            const orbitRadius = this.calculateOrbitRadius(index);
            const { duration, initialAngle } = this.calculateOrbitalProperties(bookmark.url);

            // 1. Create Orbit Path
            const orbitPath = document.createElement('div');
            orbitPath.className = 'orbit';
            orbitPath.style.width = `${orbitRadius * 2}px`;
            orbitPath.style.height = `${orbitRadius * 2}px`;
            orbitsContainer.appendChild(orbitPath);

            // 2. Create a rotation container for the planet
            const rotationContainer = document.createElement('div');
            rotationContainer.className = 'planet-rotation';
            rotationContainer.style.width = `${orbitRadius * 2}px`;
            rotationContainer.style.height = `${orbitRadius * 2}px`;
            
            // We will now control rotation with JavaScript, not CSS animation.
            // Store properties needed for animation on the element itself.
            rotationContainer.dataset.duration = duration;
            rotationContainer.dataset.initialAngle = initialAngle;
            rotationContainer.dataset.direction = index % 2 === 0 ? 1 : -1;

            // Set initial position (JS will override this in the first frame)
            rotationContainer.style.transform = `translate(-50%, -50%) rotate(${initialAngle}deg)`;

            // 3. Create Planet Element
            const planet = document.createElement('a');
            planet.className = 'planet';
            planet.href = bookmark.url;
            planet.target = '_blank';
            planet.style.backgroundImage = `url(${this.getFavicon(bookmark.url)})`;
            
            // Tooltip for the planet name
            const tooltip = document.createElement('div');
            tooltip.className = 'planet-tooltip';
            tooltip.textContent = bookmark.title;
            planet.appendChild(tooltip);

            // Add planet to its rotation container
            rotationContainer.appendChild(planet);
            planetsContainer.appendChild(rotationContainer);

            // Store elements for cleanup
            this.orbitElements.push(orbitPath);
            this.planetElements.push(rotationContainer);
        });

        // Start the JS animation loop
        this.startAnimation();
    }

    clearPlanets() {
        const orbitsContainer = document.getElementById('orbits');
        const planetsContainer = document.getElementById('planets');
        
        orbitsContainer.innerHTML = '';
        planetsContainer.innerHTML = '';
        
        this.orbitElements = [];
        this.planetElements = [];
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        const animate = () => {
            const now = Date.now();

            this.planetElements.forEach(rotationContainer => {
                const durationMs = parseFloat(rotationContainer.dataset.duration) * 1000;
                const initialAngle = parseFloat(rotationContainer.dataset.initialAngle);
                const direction = parseInt(rotationContainer.dataset.direction, 10);

                // Calculate the progress of the orbit based on current time
                const progress = (now % durationMs) / durationMs;
                const currentAngle = (initialAngle + progress * 360 * direction) % 360;
                
                rotationContainer.style.transform = `translate(-50%, -50%) rotate(${currentAngle}deg)`;
            });

            this.animationId = requestAnimationFrame(animate);
        };

        this.animationId = requestAnimationFrame(animate);
    }

    updateZoom() {
        this.updateView(); // Zooming now just calls the main view update function
    }

    updateView() {
        const solarSystem = document.getElementById('solar-system');
        const body = document.body;
        
        // Apply both panning and zooming
        solarSystem.style.transform = `translate(${this.viewX}px, ${this.viewY}px) scale(${this.zoomLevel})`;
        
        // Adjust background for a parallax effect (optional but cool)
        const bgPosX = -this.viewX * 0.1;
        const bgPosY = -this.viewY * 0.1;
        body.style.backgroundPosition = `${bgPosX}px ${bgPosY}px`;
        body.style.backgroundSize = `${400 / this.zoomLevel}% ${400 / this.zoomLevel}%`;

        // Add/remove class for showing tooltips when zoomed in
        if (this.zoomLevel > 1.5) {
            body.classList.add('zoomed-in');
        } else {
            body.classList.remove('zoomed-in');
        }
    }

    showImportBookmarksModal() {
        document.getElementById('import-bookmarks-modal').style.display = 'block';
    }

    hideImportBookmarksModal() {
        document.getElementById('import-bookmarks-modal').style.display = 'none';
        document.getElementById('bookmark-file-input').value = '';
        document.getElementById('import-status').textContent = '';
    }

    handleBookmarkFile() {
        const fileInput = document.getElementById('bookmark-file-input');
        const statusEl = document.getElementById('import-status');
        
        if (!fileInput.files.length) {
            statusEl.textContent = 'Please select a file first.';
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const htmlContent = event.target.result;
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlContent, 'text/html');
                const links = Array.from(doc.querySelectorAll('a'));
                
                const bookmarksToImport = links.map(link => ({
                    title: link.textContent.trim(),
                    url: link.href
                })).filter(b => b.url && (b.url.startsWith('http://') || b.url.startsWith('https://')));

                if (bookmarksToImport.length === 0) {
                    statusEl.textContent = 'No valid bookmarks found in the file.';
                    return;
                }

                statusEl.textContent = `Found ${bookmarksToImport.length} bookmarks. Importing...`;
                await this.importBookmarks(bookmarksToImport);

            } catch (error) {
                console.error('Error parsing bookmark file:', error);
                statusEl.textContent = 'Error parsing file. Make sure it is a valid HTML file.';
            }
        };
        
        reader.onerror = () => {
            statusEl.textContent = 'Failed to read the file.';
        };

        reader.readAsText(file);
    }

    async importBookmarks(bookmarks) {
        try {
            const response = await fetch('/api/bookmarks/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookmarks })
            });

            if (response.ok) {
                const result = await response.json();
                alert(`${result.added} bookmarks have been successfully imported! The page will now reload.`);
                window.location.reload();
            } else {
                const errorData = await response.json();
                document.getElementById('import-status').textContent = `Import failed: ${errorData.error}`;
            }
        } catch (error) {
            console.error('Failed to import bookmarks:', error);
            document.getElementById('import-status').textContent = 'An unexpected error occurred during import.';
        }
    }
}

// URL 파라미터에서 인증 결과 처리
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('auth') === 'success') {
    // 성공적으로 로그인되었을 때
    window.history.replaceState({}, document.title, '/');
    window.location.reload();
} else if (urlParams.get('auth') === 'error') {
    // 로그인 실패했을 때
    alert('로그인에 실패했습니다. 다시 시도해주세요.');
    window.history.replaceState({}, document.title, '/');
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    new SterreLink();
}); 