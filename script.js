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
        
        // Context menu state
        this.contextMenuVisible = false;
        this.contextMenuTargetId = null;

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

        // List view button
        document.getElementById('list-view-btn').addEventListener('click', () => {
            this.showBookmarkListModal();
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

        // Close list modal
        document.querySelector('.close-list').addEventListener('click', () => {
            this.hideBookmarkListModal();
        });

        // Search functionality
        document.getElementById('bookmark-search-input').addEventListener('input', (e) => {
            this.filterBookmarks(e.target.value);
        });

        // 모달 바깥 클릭시 닫기
        document.getElementById('add-bookmark-modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.hideAddBookmarkModal();
            }
        });

        // Zoom to cursor
        document.addEventListener('wheel', (e) => {
            // 모달이 열려있을 때는 줌 기능을 막고 모달 내부의 스크롤은 허용합니다.
            if (e.target.closest('.modal')) {
                return;
            }
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
            
            const zoomRatio = newZoomLevel / oldZoomLevel;
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            // To keep the zoom centered on the screen's center, we need to adjust
            // the view's translation. The logic is to find the vector from the view's
            // origin to the screen center, scale it by the zoom ratio, and then
            // set the new view origin based on that scaled vector.
            this.viewX = centerX - (centerX - this.viewX) * zoomRatio;
            this.viewY = centerY - (centerY - this.viewY) * zoomRatio;
            
            this.zoomLevel = newZoomLevel;
            
            this.updateView();
        }, { passive: false });

        // Panning event listeners
        const solarSystem = document.getElementById('solar-system');
        
        document.body.addEventListener('mousedown', (e) => {
            // 모달, 링크, 버튼, 항성 자체를 클릭했을 때는 패닝을 시작하지 않습니다.
            if (e.target.closest('.modal, a, button, #star, .context-menu')) {
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

        document.body.addEventListener('click', (e) => {
            // Hide context menu if clicking anywhere else
            if (this.contextMenuVisible && !e.target.closest('.context-menu')) {
                this.hideContextMenu();
            }
        });

        // Context menu actions
        document.getElementById('context-menu-edit').addEventListener('click', () => {
            this.showEditBookmarkModal(this.contextMenuTargetId);
            this.hideContextMenu();
        });

        document.getElementById('context-menu-delete').addEventListener('click', () => {
            this.deleteBookmark(this.contextMenuTargetId);
            this.hideContextMenu();
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

        document.getElementById('list-view-button-container').style.display = 'block';
    }

    updateUIForLogout() {
        const starContent = document.getElementById('star');
        starContent.classList.remove('logged-in');

        // Hide user profile widget
        document.getElementById('user-profile-widget').style.display = 'none';
        document.getElementById('list-view-button-container').style.display = 'none';
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
        const form = document.getElementById('bookmark-form');
        form.reset();
        delete form.dataset.editingId; // Clear editing ID
        document.querySelector('#add-bookmark-modal h2').textContent = '새 북마크 추가';
        document.querySelector('#bookmark-form button[type="submit"]').textContent = '추가';
    }

    showBookmarkListModal() {
        this.renderBookmarkGrid();
        document.getElementById('bookmark-list-modal').style.display = 'block';
    }

    hideBookmarkListModal() {
        document.getElementById('bookmark-list-modal').style.display = 'none';
        document.getElementById('bookmark-search-input').value = '';
    }

    renderBookmarkGrid(filteredBookmarks = null) {
        const grid = document.getElementById('bookmark-grid');
        grid.innerHTML = '';
        const bookmarksToRender = filteredBookmarks || this.bookmarks;

        bookmarksToRender.forEach(bookmark => {
            // It's possible for a "bookmark" to be a folder, which has no URL.
            if (!bookmark.url) return;

            const orbitalProperties = this.calculateOrbitalProperties(bookmark.url);
            
            const card = document.createElement('div'); // Use div instead of <a>
            card.className = 'bookmark-card';
            card.dataset.id = bookmark.id; // Store bookmark ID
            
            card.addEventListener('click', () => {
                window.open(bookmark.url, '_blank');
            });

            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e.pageX, e.pageY, bookmark.id);
            });

            card.innerHTML = `
                <img src="${this.getFavicon(bookmark.url)}" class="bookmark-card-favicon" alt="">
                <div class="bookmark-card-title">${bookmark.title}</div>
                <div class="bookmark-card-url">${bookmark.url}</div>
                <div class="bookmark-card-info">
                    <span>자전 속도: ${orbitalProperties.rotationSpeed.toFixed(2)}</span> | 
                    <span>항성 거리: ${orbitalProperties.distanceFromStar.toFixed(0)}</span>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    filterBookmarks(searchTerm) {
        const lowerCaseTerm = searchTerm.toLowerCase();
        const filtered = this.bookmarks.filter(bookmark => {
            return bookmark.title.toLowerCase().includes(lowerCaseTerm) || 
                   bookmark.url.toLowerCase().includes(lowerCaseTerm);
        });
        this.renderBookmarkGrid(filtered);
    }

    async addBookmark() {
        const title = document.getElementById('bookmark-title').value;
        const url = document.getElementById('bookmark-url').value;
        const editingId = document.getElementById('bookmark-form').dataset.editingId;

        if (!title || !url) return;

        if (editingId) {
            this.updateBookmark(editingId, title, url);
        } else {
            this.createNewBookmark(title, url);
        }
    }

    async createNewBookmark(title, url) {
        try {
            const response = await fetch('/api/bookmarks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, url })
            });

            if (response.ok) {
                const data = await response.json();
                this.bookmarks.push(data.bookmark);
                this.renderPlanets();
                this.renderBookmarkGrid();
                this.hideAddBookmarkModal();
            }
        } catch (error) {
            console.error('Failed to add bookmark:', error);
        }
    }

    async updateBookmark(id, title, url) {
        try {
            const response = await fetch(`/api/bookmarks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, url }),
            });

            if (response.ok) {
                const updatedBookmark = await response.json();
                const index = this.bookmarks.findIndex(b => b.id === id);
                if (index !== -1) {
                    this.bookmarks[index] = updatedBookmark.bookmark;
                }
                this.renderPlanets();
                this.renderBookmarkGrid();
                this.hideAddBookmarkModal();
            } else {
                console.error('Failed to update bookmark');
            }
        } catch (error) {
            console.error('Error updating bookmark:', error);
        }
    }

    async deleteBookmark(id) {
        if (!confirm('정말로 이 북마크를 삭제하시겠습니까?')) {
            return;
        }

        try {
            const response = await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
            if (response.ok) {
                this.bookmarks = this.bookmarks.filter(b => b.id !== id);
                this.renderPlanets();
                this.renderBookmarkGrid();
            } else {
                console.error('Failed to delete bookmark');
            }
        } catch (error) {
            console.error('Error deleting bookmark:', error);
        }
    }

    showContextMenu(x, y, bookmarkId) {
        const menu = document.getElementById('bookmark-context-menu');
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = 'block';
        this.contextMenuVisible = true;
        this.contextMenuTargetId = bookmarkId;
    }

    hideContextMenu() {
        const menu = document.getElementById('bookmark-context-menu');
        menu.style.display = 'none';
        this.contextMenuVisible = false;
        this.contextMenuTargetId = null;
    }

    showEditBookmarkModal(id) {
        const bookmark = this.bookmarks.find(b => b.id === id);
        if (bookmark) {
            const form = document.getElementById('bookmark-form');
            document.querySelector('#add-bookmark-modal h2').textContent = '북마크 수정';
            document.getElementById('bookmark-title').value = bookmark.title;
            document.getElementById('bookmark-url').value = bookmark.url;
            form.dataset.editingId = id; // Store ID in form's dataset
            document.querySelector('#bookmark-form button[type="submit"]').textContent = '수정';
            this.showAddBookmarkModal();
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
        if (!url) {
            return { rotationSpeed: 0, distanceFromStar: 0, duration: 300, initialAngle: 0 };
        }
        const hash = this.stringToHash(url);
        
        // Duration between 300s (5min) and 1800s (30min) for a visible but slow orbit.
        const MIN_DURATION_S = 300;
        const MAX_DURATION_S = 1800;
        const duration = MIN_DURATION_S + (hash % (MAX_DURATION_S - MIN_DURATION_S));

        // Initial angle between 0 and 360 degrees
        const initialAngle = hash % 360;

        // Use the hash to generate deterministic but varied properties
        const rotationSpeed = 1 + (hash % 100) / 50; // Range: 1 to 3
        const distanceFromStar = 150 + (hash % 200); // Range: 150 to 350
        
        return { rotationSpeed, distanceFromStar, duration, initialAngle };
    }

    getFavicon(url) {
        if (!url) {
            return ''; // Should not happen due to the check in renderBookmarkGrid
        }
        try {
            const domain = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        } catch (e) {
            // If URL is invalid, use a generic fallback icon
            return 'https://www.google.com/s2/favicons?domain=example.com&sz=32';
        }
    }

    renderPlanets() {
        this.clearPlanets();
        
        if (this.bookmarks.length === 0) return;

        const planetsContainer = document.getElementById('planets');
        const orbitsContainer = document.getElementById('orbits');

        this.bookmarks.forEach((bookmark, index) => {
            if (!bookmark.url) return; // It's possible for a "bookmark" to be a folder.
            
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
            this.animationId = null;
        }
    }

    startAnimation() {
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
        
        solarSystem.style.transition = 'none';

        solarSystem.style.transform = `translate(${this.viewX}px, ${this.viewY}px) scale(${this.zoomLevel})`;
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