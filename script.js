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
            // 서버에서 Google Client ID 가져오기
            const response = await fetch('/api/config');
            const config = await response.json();
            this.googleClientId = config.googleClientId;

            // Google Identity Services 초기화
            window.google?.accounts.id.initialize({
                client_id: this.googleClientId,
                callback: this.handleGoogleResponse.bind(this),
                auto_select: false,
                cancel_on_tap_outside: false
            });
        } catch (error) {
            console.error('Google Auth 초기화 실패:', error);
        }
    }

    setupEventListeners() {
        // 중앙 항성 클릭 이벤트
        document.getElementById('centralStar').addEventListener('click', () => {
            if (!this.isLoggedIn) {
                this.initiateGoogleAuth();
            } else {
                this.showAddSiteModal();
            }
        });

        // 모달 관련 이벤트
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

        // 로그아웃 버튼
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // 모달 외부 클릭 시 닫기
        document.getElementById('addSiteModal').addEventListener('click', (e) => {
            if (e.target.id === 'addSiteModal') {
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
                
                // 여기서 카메라 이동 로직 구현 (옵션)
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
            starIcon.src = '⭐'; // 별 이모지 또는 사용자 정의 아이콘
            userName.textContent = this.user.name;
            userAvatar.style.backgroundImage = `url(${this.user.picture})`;
            
            document.getElementById('addSiteBtn').style.display = 'block';
            document.getElementById('logoutBtn').style.display = 'block';
        }
    }

    async initiateGoogleAuth() {
        try {
            if (window.google?.accounts.id) {
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
            // Google에서 받은 JWT 토큰을 서버로 전송
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
        
        // 궤도 크기 계산 (사이트 순서에 따라)
        const orbitRadius = 150 + (index * 80);
        
        // 공전 속도 계산 (사이트 제목과 URL 길이에 따라)
        const titleLength = site.title.length;
        const urlLength = site.url.length;
        const speedFactor = Math.max(10, Math.min(100, titleLength + urlLength));
        const duration = speedFactor * 2; // 초 단위
        
        // 궤도 생성
        const orbit = document.createElement('div');
        orbit.className = 'orbit';
        orbit.style.width = `${orbitRadius * 2}px`;
        orbit.style.height = `${orbitRadius * 2}px`;
        orbit.style.animationDuration = `${duration}s`;
        
        // 행성 생성
        const planet = document.createElement('div');
        planet.className = 'planet';
        planet.style.top = '0';
        planet.style.left = '50%';
        planet.style.transform = 'translateX(-50%)';
        planet.dataset.siteId = site.id;
        planet.dataset.title = site.title;
        planet.dataset.url = site.url;
        
        // 파비콘 로드
        const favicon = document.createElement('img');
        favicon.src = this.getFaviconUrl(site.url);
        favicon.alt = site.title;
        favicon.onerror = () => {
            favicon.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiBmaWxsPSIjNDQ0Ii8+CjxwYXRoIGQ9Ik04IDRWMTJNNCA4SDEyIiBzdHJva2U9IiNGRkYiIHN0cm9rZS13aWR0aD0iMSIvPgo8L3N2Zz4K';
        };
        
        planet.appendChild(favicon);
        
        // 행성 이벤트 리스너
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
        
        // 우클릭 메뉴 (삭제 기능)
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
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
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
        
        // 화면 경계 체크
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
        contextMenu.innerHTML = `
            <div class="context-menu-item" onclick="sterreLink.deleteSite('${site.id}')">
                삭제
            </div>
        `;
        
        contextMenu.style.position = 'fixed';
        contextMenu.style.left = event.clientX + 'px';
        contextMenu.style.top = event.clientY + 'px';
        contextMenu.style.background = 'rgba(0, 0, 0, 0.9)';
        contextMenu.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        contextMenu.style.borderRadius = '8px';
        contextMenu.style.padding = '8px';
        contextMenu.style.zIndex = '3000';
        
        document.body.appendChild(contextMenu);
        
        // 클릭 외부 영역 클릭 시 메뉴 닫기
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
        
        // URL 형식 검증
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
                this.loadSites(); // 사이트 목록 새로고침
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
            const response = await fetch(`/api/sites/${siteId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.loadSites(); // 사이트 목록 새로고침
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

    // 키보드 단축키
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAddSiteModal();
            }
            
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                if (this.isLoggedIn) {
                    this.showAddSiteModal();
                }
            }
        });
    }

    // 탭 전환 기능
    switchTab(tabName) {
        // 모든 탭 버튼 비활성화
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // 모든 탭 내용 숨기기
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // 선택된 탭 활성화
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        // 가져오기 관련 상태 리셋
        if (tabName === 'import') {
            this.resetImportState();
        }
    }

    // 북마크 가져오기 상태 리셋
    resetImportState() {
        document.getElementById('importProgress').style.display = 'none';
        document.getElementById('bookmarkPreview').style.display = 'none';
        document.getElementById('bookmarkFile').value = '';
        document.getElementById('progressFill').style.width = '0%';
        this.pendingBookmarks = [];
    }

    // 북마크 가져오기 처리
    async handleBookmarkImport() {
        const fileInput = document.getElementById('bookmarkFile');
        const file = fileInput.files[0];
        
        if (!file) {
            alert('HTML 파일을 선택해주세요.');
            return;
        }

        if (!file.name.toLowerCase().endsWith('.html') && !file.name.toLowerCase().endsWith('.htm')) {
            alert('HTML 파일만 업로드할 수 있습니다.');
            return;
        }

        try {
            // 진행 상태 표시
            document.getElementById('importProgress').style.display = 'block';
            this.updateProgress(0, '파일 읽는 중...');

            // 파일 읽기
            const fileContent = await this.readFile(file);
            this.updateProgress(30, '북마크 파싱 중...');

            // HTML 파싱
            const bookmarks = this.parseBookmarkHTML(fileContent);
            this.updateProgress(70, '북마크 정리 중...');

            if (bookmarks.length === 0) {
                alert('북마크를 찾을 수 없습니다. 올바른 북마크 HTML 파일인지 확인해주세요.');
                this.resetImportState();
                return;
            }

            // 미리보기 표시
            this.showBookmarkPreview(bookmarks);
            this.updateProgress(100, '완료!');

            // 잠깐 후 진행 상태 숨기기
            setTimeout(() => {
                document.getElementById('importProgress').style.display = 'none';
            }, 1000);

        } catch (error) {
            console.error('북마크 가져오기 실패:', error);
            alert('파일을 읽는 중 오류가 발생했습니다.');
            this.resetImportState();
        }
    }

    // 파일 읽기
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, 'UTF-8');
        });
    }

    // 북마크 HTML 파싱
    parseBookmarkHTML(htmlContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const bookmarks = [];

        // <A> 태그들을 찾아서 북마크 추출
        const linkElements = doc.querySelectorAll('a[href]');
        
        linkElements.forEach(link => {
            const href = link.getAttribute('href');
            const title = link.textContent.trim();
            
            // 유효한 URL인지 확인
            if (href && title && this.isValidURL(href)) {
                bookmarks.push({
                    title: title,
                    url: href,
                    favicon: this.getFaviconUrl(href)
                });
            }
        });

        // 중복 제거 (URL 기준)
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

    // URL 유효성 검사
    isValidURL(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }

    // 진행 상태 업데이트
    updateProgress(percent, text) {
        document.getElementById('progressFill').style.width = percent + '%';
        document.getElementById('progressText').textContent = text;
    }

    // 북마크 미리보기 표시
    showBookmarkPreview(bookmarks) {
        this.pendingBookmarks = bookmarks;
        const previewList = document.getElementById('previewList');
        previewList.innerHTML = '';

        bookmarks.forEach((bookmark, index) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <input type="checkbox" id="bookmark-${index}" checked>
                <img src="${bookmark.favicon}" alt="" class="preview-favicon" onerror="this.style.display='none'">
                <div class="preview-info">
                    <div class="preview-title">${this.escapeHTML(bookmark.title)}</div>
                    <div class="preview-url">${this.escapeHTML(bookmark.url)}</div>
                </div>
            `;
            previewList.appendChild(previewItem);
        });

        document.getElementById('bookmarkPreview').style.display = 'block';
    }

    // HTML 이스케이프
    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // 북마크 가져오기 확인
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
            // 로딩 표시
            this.showLoadingOverlay();

            // 배치로 북마크 추가
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
                alert(`${selectedBookmarks.length}개의 북마크가 성공적으로 추가되었습니다!`);
                this.hideAddSiteModal();
                this.loadSites(); // 사이트 목록 새로고침
            } else {
                alert('북마크 추가에 실패했습니다: ' + data.error);
            }

        } catch (error) {
            console.error('북마크 추가 실패:', error);
            alert('북마크 추가 중 오류가 발생했습니다.');
        } finally {
            this.hideLoadingOverlay();
        }
    }

    // 북마크 가져오기 취소
    cancelBookmarkImport() {
        this.resetImportState();
    }

    // 로딩 오버레이 표시
    showLoadingOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.id = 'loadingOverlay';
        overlay.innerHTML = '<div class="loading-spinner"></div>';
        document.body.appendChild(overlay);
    }

    // 로딩 오버레이 숨기기
    hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.remove();
        }
    }
}

// DOM이 로드된 후 전역 인스턴스 생성
document.addEventListener('DOMContentLoaded', () => {
    const sterreLink = new SterreLink();
});

// 페이지 로드 완료 후 키보드 단축키 설정
document.addEventListener('DOMContentLoaded', () => {
    sterreLink.setupKeyboardShortcuts();
});

// 컨텍스트 메뉴 스타일 추가
const contextMenuStyle = document.createElement('style');
contextMenuStyle.textContent = `
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
`;
document.head.appendChild(contextMenuStyle); 