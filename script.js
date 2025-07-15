class SterreLink {
    constructor() {
        this.isLoggedIn = false;
        this.userEmail = null;
        this.bookmarks = [];
        this.zoomLevel = 1;
        this.planetElements = [];
        this.orbitElements = [];
        this.animationId = null;
        
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

        // 마우스 휠 줌
        document.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY > 0) {
                this.zoomLevel = Math.max(this.zoomLevel * 0.9, 0.3);
            } else {
                this.zoomLevel = Math.min(this.zoomLevel * 1.1, 3);
            }
            this.updateZoom();
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

    async deleteBookmark(bookmarkId) {
        try {
            const response = await fetch(`/api/bookmarks/${bookmarkId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.bookmarks = this.bookmarks.filter(b => b.id !== bookmarkId);
                this.renderPlanets();
            }
        } catch (error) {
            console.error('Failed to delete bookmark:', error);
        }
    }

    calculateOrbitRadius(index, total) {
        const baseRadius = 120; // Closest orbit radius
        const growthFactor = 1.1; // How much each orbit grows compared to the previous one
        let radius = baseRadius;
        for (let i = 0; i < index; i++) {
            radius = baseRadius + (radius - baseRadius) * growthFactor;
        }
        return radius;
    }

    calculateOrbitSpeed(title, url) {
        // 제목과 URL 길이에 따른 공전 속도 계산
        const titleLength = title.length;
        const urlLength = url.length;
        const totalLength = titleLength + urlLength;
        
        // 길이가 길수록 느리게 공전 (20초 ~ 60초)
        const minDuration = 20;
        const maxDuration = 60;
        const duration = minDuration + ((totalLength - 10) / 50) * (maxDuration - minDuration);
        
        return Math.max(minDuration, Math.min(maxDuration, duration));
    }

    getFavicon(url) {
        try {
            const domain = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        } catch (error) {
            return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjRkZGIi8+Cjwvc3ZnPgo=';
        }
    }

    renderPlanets() {
        this.clearPlanets();
        
        if (this.bookmarks.length === 0) return;

        const orbitsContainer = document.getElementById('orbits');
        const planetsContainer = document.getElementById('planets');

        this.bookmarks.forEach((bookmark, index) => {
            const radius = this.calculateOrbitRadius(index, this.bookmarks.length);
            const speed = this.calculateOrbitSpeed(bookmark.title, bookmark.url);
            const angle = (index * 360) / this.bookmarks.length;

            // 궤도 생성
            const orbit = document.createElement('div');
            orbit.className = 'orbit';
            orbit.style.width = `${radius * 2}px`;
            orbit.style.height = `${radius * 2}px`;
            orbitsContainer.appendChild(orbit);
            this.orbitElements.push(orbit);

            // 행성 생성
            const planet = document.createElement('div');
            planet.className = 'planet';
            planet.style.left = '50%';
            planet.style.top = '50%';
            planet.style.transformOrigin = `0 0`;
            
            planet.innerHTML = `
                <div class="planet-content">
                    <div class="planet-favicon">
                        <img src="${this.getFavicon(bookmark.url)}" alt="${bookmark.title}" onerror="this.style.display='none'; this.parentElement.innerHTML='🌐';">
                    </div>
                </div>
                <div class="planet-title">${bookmark.title}</div>
            `;

            // 행성 클릭 이벤트
            planet.addEventListener('click', () => {
                window.open(bookmark.url, '_blank');
            });

            // 행성 우클릭 이벤트 (삭제)
            planet.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (confirm(`"${bookmark.title}" 북마크를 삭제하시겠습니까?`)) {
                    this.deleteBookmark(bookmark.id);
                }
            });

            planetsContainer.appendChild(planet);
            this.planetElements.push({
                element: planet,
                radius: radius,
                speed: speed,
                angle: angle,
                currentAngle: angle
            });
        });

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
    }

    startAnimation() {
        const animate = () => {
            this.planetElements.forEach(planet => {
                planet.currentAngle += 360 / (planet.speed * 60); // 60fps 기준
                
                const radians = (planet.currentAngle * Math.PI) / 180;
                const x = planet.radius * Math.cos(radians);
                const y = planet.radius * Math.sin(radians);
                
                planet.element.style.transform = `translate(${x}px, ${y}px)`;
            });
            
            this.animationId = requestAnimationFrame(animate);
        };
        
        animate();
    }

    updateZoom() {
        const solarSystem = document.getElementById('solar-system');
        const body = document.body;
        solarSystem.style.transform = `scale(${this.zoomLevel})`;
        body.style.backgroundSize = `${400 / this.zoomLevel}% ${400 / this.zoomLevel}%`;
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