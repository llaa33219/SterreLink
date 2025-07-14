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

        // 줌 컨트롤
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.zoomLevel = Math.min(this.zoomLevel * 1.2, 3);
            this.updateZoom();
        });

        document.getElementById('zoom-out').addEventListener('click', () => {
            this.zoomLevel = Math.max(this.zoomLevel / 1.2, 0.3);
            this.updateZoom();
        });

        // 로그아웃
        document.getElementById('logout').addEventListener('click', () => {
            this.logout();
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
        const starContent = document.getElementById('star-content');
        const starIcon = document.getElementById('star-icon');
        const logoutButton = document.getElementById('logout');
        
        starContent.classList.add('logged-in');
        starIcon.src = 'https://lh3.googleusercontent.com/a/default-user=s96-c';
        logoutButton.style.display = 'block';
    }

    updateUIForLogout() {
        const starContent = document.getElementById('star-content');
        const starIcon = document.getElementById('star-icon');
        const logoutButton = document.getElementById('logout');
        
        starContent.classList.remove('logged-in');
        starIcon.src = 'https://developers.google.com/identity/images/g-logo.png';
        logoutButton.style.display = 'none';
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
        const baseRadius = 120;
        const maxRadius = Math.min(window.innerWidth, window.innerHeight) * 0.4;
        const step = Math.min(80, (maxRadius - baseRadius) / Math.max(total - 1, 1));
        return baseRadius + (index * step);
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
        const universe = document.getElementById('universe');
        universe.style.transform = `scale(${this.zoomLevel})`;
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