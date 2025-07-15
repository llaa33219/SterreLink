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
        // 항성 클릭 -> 북마크 추가 모달 열기
        document.getElementById('star').addEventListener('click', () => {
            if (this.isLoggedIn) {
                this.showAddBookmarkModal();
            } else {
                // 로그인하지 않은 경우, 로그인 페이지로 안내하거나
                // 간단한 알림을 표시할 수 있습니다. 여기서는 로그인 함수를 호출합니다.
                this.loginWithGoogle();
            }
        });

        // 사용자 프로필 메뉴 이벤트
        const userProfile = document.getElementById('user-profile');
        userProfile.addEventListener('click', (e) => {
            // 메뉴 자체를 클릭한게 아니면 (자식요소 제외) 메뉴를 토글
            if (e.target === userProfile || e.target === document.getElementById('user-avatar')) {
                e.currentTarget.classList.toggle('active');
            }
        });
        
        // 드롭다운 메뉴 항목 이벤트
        document.getElementById('logout-btn').addEventListener('click', (e) => {
            e.preventDefault();
            this.logout();
        });

        document.getElementById('import-bookmarks-btn').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('import-bookmarks-input').click();
        });

        document.getElementById('import-bookmarks-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importBookmarks(file);
            }
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

        // 마우스 휠 줌 (기존 로직 유지)
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
                this.updateUIForLogin(data);
                await this.loadBookmarks();
            } else {
                this.isLoggedIn = false;
                this.userEmail = null;
                this.updateUIForLogout();
            }
        } catch (error) {
            console.error('Login status check failed:', error);
            this.updateUIForLogout();
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

    updateUIForLogin(userData) {
        const userProfile = document.getElementById('user-profile');
        const userAvatar = document.getElementById('user-avatar');
        
        userAvatar.src = userData.picture || 'https://lh3.googleusercontent.com/a/default-user=s96-c';
        userProfile.classList.remove('hidden');
    }

    updateUIForLogout() {
        document.getElementById('user-profile').classList.add('hidden');
        document.getElementById('user-profile').classList.remove('active'); // 메뉴 닫기
    }

    async loadBookmarks() {
        if (!this.isLoggedIn) return; // 로그인 상태가 아닐 경우 북마크 로드 방지
        try {
            const response = await fetch('/api/bookmarks');
            const data = await response.json();
            
            this.bookmarks = data.bookmarks || [];
            this.renderPlanets();
        } catch (error) {
            console.error('Failed to load bookmarks:', error);
        }
    }

    async importBookmarks(file) {
        this.showLoading();
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const htmlContent = event.target.result;
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlContent, "text/html");
                const links = Array.from(doc.querySelectorAll('a'));
                
                if (links.length === 0) {
                    alert('북마크 파일에서 유효한 링크를 찾을 수 없습니다.');
                    this.hideLoading();
                    return;
                }

                const newBookmarks = links.map(link => ({
                    title: link.textContent.trim() || '제목 없음',
                    url: link.href
                })).filter(b => b.url.startsWith('http')); // 유효한 URL만 필터링

                if (newBookmarks.length === 0) {
                    alert('추가할 수 있는 유효한 북마크가 없습니다.');
                    this.hideLoading();
                    return;
                }
                
                const response = await fetch('/api/bookmarks/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookmarks: newBookmarks })
                });

                if (!response.ok) {
                    throw new Error('서버와 통신 중 오류가 발생했습니다.');
                }
                
                const result = await response.json();
                alert(`${result.importedCount}개의 새로운 북마크를 성공적으로 가져왔습니다!`);
                
                // 새로운 북마크를 반영하기 위해 페이지를 새로고침합니다.
                window.location.reload();

            } catch (error) {
                console.error('Failed to import bookmarks:', error);
                alert('북마크를 가져오는 중 오류가 발생했습니다.');
            } finally {
                // 입력 필드 초기화
                document.getElementById('import-bookmarks-input').value = '';
                this.hideLoading();
            }
        };
        reader.readAsText(file, 'UTF-8');
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
        // 북마크 개수에 따라 동적으로 확장되는 맵 로직
        const baseRadius = 120; // 가장 안쪽 궤도 반지름
        const layerMultiplier = 1.8; // 각 층의 북마크가 이전 층의 몇 배가 될지 결정
        
        let layer = 0;
        let maxPlanetsInLayer = 6;
        let cumulativePlanets = 0;
        let indexInLayer = 0;

        while (true) {
            cumulativePlanets += maxPlanetsInLayer;
            if (index < cumulativePlanets) {
                indexInLayer = index - (cumulativePlanets - maxPlanetsInLayer);
                break;
            }
            maxPlanetsInLayer = Math.floor(maxPlanetsInLayer * layerMultiplier);
            layer++;
        }
        
        const layerRadius = baseRadius + (layer * 100); // 각 층 사이의 간격

        // 같은 궤도 내에서 행성을 배치하기 위한 추가 로직
        // 이 예제에서는 모든 행성을 해당 층의 동일한 반지름에 위치시킵니다.
        // 더 복잡한 로직을 원한다면 여기를 수정할 수 있습니다.
        return layerRadius;
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