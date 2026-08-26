(function () {
    'use strict';

    const config = window.APP_CONFIG;

    function readStoredProfile() {
        try { return JSON.parse(localStorage.getItem(config.USER_PROFILE_KEY) || 'null'); } catch (_) { return null; }
    }

    function getOrCreateClientId() {
        let value = localStorage.getItem(config.CLIENT_ID_KEY) || '';
        if (!value) {
            value = window.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            localStorage.setItem(config.CLIENT_ID_KEY, value);
        }
        return value;
    }

    const state = {
        adminToken: sessionStorage.getItem(config.SESSION_KEY) || '',
        userToken: localStorage.getItem(config.USER_TOKEN_KEY) || '',
        user: readStoredProfile(),
        clientId: getOrCreateClientId(),
        pendingAction: null,
        authMode: 'login',
        googleInitialized: false
    };

    const iconPaths = {
        home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
        wrench: '<path d="M14.7 6.3a4 4 0 0 0-5-5l2.2 2.2-3.4 3.4-2.2-2.2a4 4 0 0 0 5 5l6.7 6.7a2.1 2.1 0 1 0 3-3Z"/><path d="m6.5 12.5-4.8 4.8a2.1 2.1 0 0 0 3 3l4.8-4.8"/>',
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
        sparkle: '<path d="m12 3-1.6 4.4L6 9l4.4 1.6L12 15l1.6-4.4L18 9l-4.4-1.6Z"/><path d="m5 16-.8 2.2L2 19l2.2.8L5 22l.8-2.2L8 19l-2.2-.8Z"/><path d="m19 14-.8 2.2L16 17l2.2.8L19 20l.8-2.2L22 17l-2.2-.8Z"/>',
        menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
        lock: '<rect width="16" height="12" x="4" y="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'
    };

    function icon(name, className = 'nav-icon') {
        return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || ''}</svg>`;
    }

    function navigation(activePage) {
        const items = [
            ['home', 'index.html', 'Trang chủ', 'home'],
            ['prompts', 'prompts.html', 'Kho Prompt', 'book'],
            ['upload', 'upload.html', 'Kho tệp Drive', 'upload'],
            ['ai', 'ai.html', 'Trợ giảng AI', 'sparkle'],
            ['repairs', 'repairs.html', 'Nhật ký sửa chữa', 'wrench']
        ];
        return items.map(([key, href, label, iconName]) =>
            `<a href="${href}" class="nav-link${activePage === key ? ' active' : ''}"${activePage === key ? ' aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></a>`
        ).join('');
    }

    function mobileNavigation(activePage) {
        const items = [
            ['home', 'index.html', 'Trang chủ', 'home'],
            ['prompts', 'prompts.html', 'Prompt', 'book'],
            ['ai', 'ai.html', 'Trợ giảng', 'sparkle'],
            ['upload', 'upload.html', 'Drive', 'upload'],
            ['repairs', 'repairs.html', 'Nhật ký', 'wrench']
        ];
        return items.map(([key, href, label, iconName]) =>
            `<a href="${href}" class="mobile-nav-link${key === 'ai' ? ' mobile-nav-primary' : ''}${activePage === key ? ' active' : ''}"${activePage === key ? ' aria-current="page"' : ''}>${icon(iconName, 'mobile-nav-icon')}<span>${label}</span></a>`
        ).join('');
    }

    function renderShell(activePage) {
        const shell = document.getElementById('appShell');
        if (!shell) return;
        shell.innerHTML = `
            <header class="app-header">
                <div class="container header-inner">
                    <a class="brand" href="index.html" aria-label="Về Trang chủ">
                        <span class="brand-mark">E</span>
                        <span class="brand-copy"><span class="brand-title">${config.APP_NAME}</span><span class="brand-subtitle">Tiện ích dành cho giáo viên</span></span>
                    </a>
                    <nav class="nav-list" id="mainNavigation" aria-label="Điều hướng chính">${navigation(activePage)}</nav>
                    <div class="nav-actions">
                        <button class="btn btn-secondary btn-icon menu-toggle" id="menuToggle" type="button" aria-label="Mở menu" aria-expanded="false">${icon('menu')}</button>
                        <button class="btn btn-primary btn-login" id="loginButton" type="button">${icon('lock')}<span class="btn-label">Đăng nhập</span></button>
                        <span class="user-chip authenticated-only"><span class="user-avatar" id="userAvatar">TV</span><span id="userDisplayName">Tài khoản</span></span>
                        <button class="btn btn-danger btn-sm authenticated-only" id="logoutButton" type="button" title="Đăng xuất">${icon('logout')}<span>Đăng xuất</span></button>
                    </div>
                </div>
            </header>
            <nav class="mobile-bottom-nav" aria-label="Điều hướng trên điện thoại">${mobileNavigation(activePage)}</nav>`;
    }

    function ensureGlobalUi() {
        if (!document.getElementById('loginModal')) {
            document.body.insertAdjacentHTML('beforeend', `
                <div class="modal" id="loginModal" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
                    <div class="modal-content modal-sm auth-modal">
                        <div class="modal-header"><h2 class="modal-title" id="loginTitle">Đăng nhập</h2><button class="modal-close" type="button" data-close-modal="loginModal" aria-label="Đóng">×</button></div>
                        <div class="auth-tabs" role="tablist" aria-label="Loại tài khoản">
                            <button class="auth-tab active" type="button" data-auth-tab="user">Khách thành viên</button>
                            <button class="auth-tab" type="button" data-auth-tab="admin">Quản trị viên</button>
                        </div>
                        <section id="userAuthPanel">
                            <p class="modal-help" id="guestAuthHelp">Đăng nhập để mở Prompt VIP và lưu các tiện ích cá nhân.</p>
                            <form id="guestAuthForm">
                                <div class="form-group" id="guestNameGroup" hidden><label class="form-label" for="guestName">Họ và tên</label><input class="form-control" id="guestName" autocomplete="name"></div>
                                <div class="form-group"><label class="form-label" for="guestEmail">Email</label><input class="form-control" type="email" id="guestEmail" autocomplete="email" required></div>
                                <div class="form-group"><label class="form-label" for="guestPassword">Mật khẩu</label><input class="form-control" type="password" id="guestPassword" minlength="6" autocomplete="current-password" required></div>
                                <button class="btn btn-primary auth-submit" id="guestAuthSubmit" type="submit">Đăng nhập</button>
                            </form>
                            <button class="auth-switch" id="toggleGuestAuth" type="button">Chưa có tài khoản? Đăng ký</button>
                            <div class="auth-divider"><span>hoặc</span></div>
                            <div class="google-button-wrap" id="googleSignInButton"></div>
                            <p class="auth-config-note" id="googleConfigNote" hidden>Chưa cấu hình Google Client ID.</p>
                        </section>
                        <section id="adminAuthPanel" hidden>
                            <p class="modal-help">Dành cho thầy quản trị nội dung Prompt, sửa chữa và Trợ giảng AI.</p>
                            <form id="adminLoginForm">
                                <div class="form-group"><label class="form-label" for="adminPass">Mật khẩu quản trị</label><input class="form-control" type="password" id="adminPass" autocomplete="current-password" required></div>
                                <div class="form-actions"><button class="btn btn-secondary" type="button" data-close-modal="loginModal">Hủy</button><button class="btn btn-primary" id="adminLoginSubmit" type="submit">Đăng nhập</button></div>
                            </form>
                        </section>
                    </div>
                </div>`);
        }
        if (!document.getElementById('toastRegion')) {
            document.body.insertAdjacentHTML('beforeend', '<div class="toast-region" id="toastRegion" role="status" aria-live="polite"></div>');
        }
    }

    function isAuthenticated() {
        return Boolean(state.adminToken || state.userToken);
    }

    function initials(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        return (parts.length ? `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ''}` : 'TV').toLocaleUpperCase('vi');
    }

    function syncAuthUi() {
        const admin = Boolean(state.adminToken);
        const user = Boolean(state.userToken);
        document.body.classList.toggle('admin-logged-in', admin);
        document.body.classList.toggle('user-logged-in', user);
        document.body.classList.toggle('authenticated', admin || user);
        const name = admin ? config.OWNER_NAME : (state.user?.name || state.user?.email || 'Thành viên');
        const display = document.getElementById('userDisplayName');
        const avatar = document.getElementById('userAvatar');
        if (display) {
            display.textContent = name;
            display.title = name;
        }
        if (avatar) avatar.textContent = initials(name);
        window.dispatchEvent(new CustomEvent('app:auth-change', { detail: { admin, user, authenticated: admin || user } }));
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.add('open');
        const focusable = modal.querySelector('input:not([hidden]), button:not([hidden]), select, textarea');
        setTimeout(() => focusable?.focus(), 50);
    }

    function closeModal(id) {
        document.getElementById(id)?.classList.remove('open');
    }

    function setAuthTab(tab) {
        const selected = tab === 'admin' ? 'admin' : 'user';
        document.querySelectorAll('[data-auth-tab]').forEach(button => button.classList.toggle('active', button.dataset.authTab === selected));
        document.getElementById('userAuthPanel').hidden = selected !== 'user';
        document.getElementById('adminAuthPanel').hidden = selected !== 'admin';
        document.getElementById('loginTitle').textContent = selected === 'admin' ? 'Đăng nhập quản trị' : 'Đăng nhập thành viên';
    }

    function openLogin(tab = 'user') {
        setAuthTab(tab);
        openModal('loginModal');
    }

    function toast(message, type = '') {
        const region = document.getElementById('toastRegion');
        if (!region) return;
        const item = document.createElement('div');
        item.className = `toast ${type}`.trim();
        item.textContent = message;
        region.appendChild(item);
        setTimeout(() => item.remove(), 3600);
    }

    async function adminLogin(event) {
        event.preventDefault();
        const input = document.getElementById('adminPass');
        const button = document.getElementById('adminLoginSubmit');
        const password = input.value.trim();
        if (!password) return;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Đang kiểm tra…';
        try {
            const response = await fetch(config.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'verify', adminPassword: password, clientId: state.clientId })
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message || 'Sai mật khẩu');
            if (!result.adminToken) throw new Error('Máy chủ chưa trả về token quản trị. Hãy triển khai Code.gs phiên bản mới.');
            state.adminToken = result.adminToken;
            sessionStorage.setItem(config.SESSION_KEY, result.adminToken);
            input.value = '';
            syncAuthUi();
            closeModal('loginModal');
            toast('Đăng nhập quản trị thành công.', 'success');
            runPendingAction();
        } catch (error) {
            input.value = '';
            toast(error.message || 'Không thể đăng nhập.', 'error');
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    function saveUserSession(result) {
        const token = result.userToken || result.token || result.sessionToken || '';
        const user = result.user || result.profile || null;
        if (!token) throw new Error('Máy chủ chưa trả về mã đăng nhập thành viên.');
        state.userToken = token;
        state.user = user || { name: result.name || '', email: result.email || '' };
        localStorage.setItem(config.USER_TOKEN_KEY, token);
        localStorage.setItem(config.USER_PROFILE_KEY, JSON.stringify(state.user));
        syncAuthUi();
        closeModal('loginModal');
        toast('Đăng nhập thành viên thành công.', 'success');
        runPendingAction();
    }

    async function apiPost(action, data = {}, options = {}) {
        if (options.auth && !state.adminToken) throw new Error('Vui lòng đăng nhập quản trị.');
        if (options.userAuth && !isAuthenticated()) throw new Error('Vui lòng đăng nhập thành viên.');
        const payload = { action, data, clientId: state.clientId };
        if (options.sheetType) payload.sheetType = options.sheetType;
        if (state.adminToken) payload.adminToken = state.adminToken;
        if (state.userToken) payload.userToken = state.userToken;
        const response = await fetch(config.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Máy chủ không phản hồi.');
        const result = await response.json();
        if (result.status !== 'success') {
            const message = result.message || 'Thao tác không thành công.';
            if (/mật khẩu quản trị/i.test(message)) logout();
            if (/phiên (đăng nhập|quản trị)|userToken|token.*hết hạn/i.test(message)) logout();
            throw new Error(message);
        }
        return result;
    }

    async function guestAuth(event) {
        event.preventDefault();
        const button = document.getElementById('guestAuthSubmit');
        const data = {
            name: document.getElementById('guestName').value.trim(),
            email: document.getElementById('guestEmail').value.trim(),
            password: document.getElementById('guestPassword').value
        };
        if (state.authMode === 'register' && !data.name) return toast('Vui lòng nhập họ và tên.', 'error');
        const original = button.textContent;
        button.disabled = true;
        button.textContent = state.authMode === 'register' ? 'Đang đăng ký…' : 'Đang đăng nhập…';
        try {
            const result = await apiPost(state.authMode === 'register' ? 'user_register' : 'user_login', data);
            saveUserSession(result);
            event.currentTarget.reset();
        } catch (error) {
            toast(error.message || 'Không thể xác thực tài khoản.', 'error');
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    function toggleGuestAuth() {
        state.authMode = state.authMode === 'login' ? 'register' : 'login';
        const registering = state.authMode === 'register';
        document.getElementById('guestNameGroup').hidden = !registering;
        document.getElementById('guestName').required = registering;
        document.getElementById('guestPassword').autocomplete = registering ? 'new-password' : 'current-password';
        document.getElementById('guestAuthSubmit').textContent = registering ? 'Đăng ký tài khoản' : 'Đăng nhập';
        document.getElementById('toggleGuestAuth').textContent = registering ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký';
        document.getElementById('guestAuthHelp').textContent = registering ? 'Tạo tài khoản để sử dụng Prompt VIP.' : 'Đăng nhập để mở Prompt VIP và lưu các tiện ích cá nhân.';
    }

    async function handleGoogleCredential(response) {
        if (!response?.credential) return toast('Google không trả về thông tin đăng nhập.', 'error');
        try {
            const result = await apiPost('google_login', { credential: response.credential, origin: window.location.origin });
            saveUserSession(result);
        } catch (error) {
            toast(error.message || 'Không thể đăng nhập bằng Google.', 'error');
        }
    }

    function initializeGoogleButton() {
        if (state.googleInitialized || !window.google?.accounts?.id || !config.GOOGLE_CLIENT_ID) return;
        window.google.accounts.id.initialize({ client_id: config.GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
        window.google.accounts.id.renderButton(document.getElementById('googleSignInButton'), {
            type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: 320, locale: 'vi'
        });
        state.googleInitialized = true;
    }

    function setupGoogleSignIn() {
        const note = document.getElementById('googleConfigNote');
        if (!config.GOOGLE_CLIENT_ID) {
            if (note) note.hidden = false;
            return;
        }
        if (window.google?.accounts?.id) return initializeGoogleButton();
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = initializeGoogleButton;
        script.onerror = () => { if (note) { note.hidden = false; note.textContent = 'Không tải được dịch vụ đăng nhập Google.'; } };
        document.head.appendChild(script);
    }

    function runPendingAction() {
        const action = state.pendingAction;
        state.pendingAction = null;
        if (typeof action === 'function') action();
    }

    function logout() {
        state.adminToken = '';
        state.userToken = '';
        state.user = null;
        state.pendingAction = null;
        sessionStorage.removeItem(config.SESSION_KEY);
        localStorage.removeItem(config.USER_TOKEN_KEY);
        localStorage.removeItem(config.USER_PROFILE_KEY);
        window.google?.accounts?.id?.disableAutoSelect?.();
        syncAuthUi();
        toast('Đã đăng xuất.');
    }

    function requireAdmin(action) {
        if (state.adminToken) {
            if (typeof action === 'function') action();
            return true;
        }
        state.pendingAction = typeof action === 'function' ? action : null;
        openLogin('admin');
        return false;
    }

    function requireUser(action) {
        if (isAuthenticated()) {
            if (typeof action === 'function') action();
            return true;
        }
        state.pendingAction = typeof action === 'function' ? action : null;
        openLogin('user');
        return false;
    }

    async function apiGet(type, options = {}) {
        const url = new URL(config.API_URL);
        url.searchParams.set('type', type);
        if (options.includeAuth && state.userToken) url.searchParams.set('userToken', state.userToken);
        const response = await fetch(url.href);
        if (!response.ok) throw new Error('Máy chủ không phản hồi.');
        const result = await response.json();
        if (result.status && result.status !== 'success') throw new Error(result.message || 'Không tải được dữ liệu.');
        return result;
    }

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }

    function safeUrl(value) {
        try {
            const url = new URL(String(value || ''), window.location.href);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch (_) {
            return '';
        }
    }

    function formatBytes(bytes) {
        const size = Number(bytes) || 0;
        if (size < 1024) return `${size} B`;
        if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
        if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
        return `${(size / 1024 ** 3).toFixed(1)} GB`;
    }

    function debounce(fn, wait = 220) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
    }

    function bindGlobalEvents() {
        document.getElementById('menuToggle')?.addEventListener('click', event => {
            const nav = document.getElementById('mainNavigation');
            const open = nav.classList.toggle('open');
            event.currentTarget.setAttribute('aria-expanded', String(open));
        });
        document.getElementById('loginButton')?.addEventListener('click', () => openLogin('user'));
        document.getElementById('logoutButton')?.addEventListener('click', logout);
        document.getElementById('adminLoginForm')?.addEventListener('submit', adminLogin);
        document.getElementById('guestAuthForm')?.addEventListener('submit', guestAuth);
        document.getElementById('toggleGuestAuth')?.addEventListener('click', toggleGuestAuth);
        document.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => setAuthTab(button.dataset.authTab)));
        document.addEventListener('click', event => {
            const closeButton = event.target.closest('[data-close-modal]');
            if (closeButton) closeModal(closeButton.dataset.closeModal);
            if (event.target.classList.contains('modal')) closeModal(event.target.id);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') document.querySelectorAll('.modal.open').forEach(modal => closeModal(modal.id));
        });
    }

    function init(activePage) {
        renderShell(activePage);
        ensureGlobalUi();
        bindGlobalEvents();
        setupGoogleSignIn();
        syncAuthUi();
    }

    window.App = Object.freeze({
        init, icon, openModal, closeModal, openLogin, toast, requireAdmin, requireUser, apiGet, apiPost,
        escapeHTML, safeUrl, formatBytes, debounce,
        isLoggedIn: isAuthenticated,
        isAuthenticated,
        isAdmin: () => Boolean(state.adminToken),
        isGuest: () => Boolean(state.userToken),
        getAdminToken: () => state.adminToken,
        getUserToken: () => state.userToken,
        getUser: () => state.user,
        config
    });
})();
