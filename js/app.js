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

    function readTokenPayload(token) {
        try {
            const encoded = String(token || '').split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
            const padded = encoded + '='.repeat((4 - encoded.length % 4) % 4);
            const binary = window.atob(padded);
            const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
            const json = typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(bytes) : binary;
            return JSON.parse(json);
        } catch (_) {
            return null;
        }
    }

    function isLocallyValidToken(token, role) {
        const payload = readTokenPayload(token);
        return Boolean(payload && payload.role === role && Number(payload.exp || 0) > Math.floor(Date.now() / 1000));
    }

    const state = {
        adminToken: sessionStorage.getItem(config.SESSION_KEY) || '',
        userToken: localStorage.getItem(config.USER_TOKEN_KEY) || '',
        user: readStoredProfile(),
        clientId: getOrCreateClientId(),
        pendingAction: null,
        authMode: 'login',
        googleInitialized: false,
        googleSigningIn: false
    };

    if (state.adminToken && !isLocallyValidToken(state.adminToken, 'admin')) {
        state.adminToken = '';
        sessionStorage.removeItem(config.SESSION_KEY);
    }
    if (state.userToken && !isLocallyValidToken(state.userToken, 'member')) {
        state.userToken = '';
        state.user = null;
        localStorage.removeItem(config.USER_TOKEN_KEY);
        localStorage.removeItem(config.USER_PROFILE_KEY);
    }

    const iconPaths = {
        users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/>',
        home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
        wrench: '<path d="M14.7 6.3a4 4 0 0 0-5-5l2.2 2.2-3.4 3.4-2.2-2.2a4 4 0 0 0 5 5l6.7 6.7a2.1 2.1 0 1 0 3-3Z"/><path d="m6.5 12.5-4.8 4.8a2.1 2.1 0 0 0 3 3l4.8-4.8"/>',
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
        sparkle: '<path d="m12 3-1.6 4.4L6 9l4.4 1.6L12 15l1.6-4.4L18 9l-4.4-1.6Z"/><path d="m5 16-.8 2.2L2 19l2.2.8L5 22l.8-2.2L8 19l-2.2-.8Z"/><path d="m19 14-.8 2.2L16 17l2.2.8L19 20l.8-2.2L22 17l-2.2-.8Z"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
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
            ['calendar', 'calendar.html', 'Lịch Việt', 'calendar'],
            ['repairs', 'repairs.html', 'Nhật ký sửa chữa', 'wrench'],
            ['groups', 'groups.html', 'Nhóm học', 'users']
        ];
        return items.map(([key, href, label, iconName]) =>
            `<a href="${href}" class="nav-link${activePage === key ? ' active' : ''}"${activePage === key ? ' aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></a>`
        ).join('');
    }

    function mobileNavigation(activePage) {
        const items = [
            ['home', 'index.html', 'Trang chủ', 'home'],
            ['prompts', 'prompts.html', 'Prompt', 'book'],
            ['upload', 'upload.html', 'Drive', 'upload'],
            ['ai', 'ai.html', 'Trợ giảng', 'sparkle'],
            ['calendar', 'calendar.html', 'Lịch Việt', 'calendar']
        ];
        return items.map(([key, href, label, iconName]) =>
            `<a href="${href}" class="mobile-nav-link${key === 'ai' ? ' mobile-nav-primary' : ''}${activePage === key ? ' active' : ''}"${activePage === key ? ' aria-current="page"' : ''}>${icon(iconName, 'mobile-nav-icon')}<span>${label}</span></a>`
        ).join('') + `<details class="mobile-more"><summary class="mobile-nav-link${['groups','repairs'].includes(activePage) ? ' active' : ''}">${icon('menu', 'mobile-nav-icon')}<span>Thêm</span></summary><div class="mobile-more-menu"><a href="groups.html"${activePage === 'groups' ? ' aria-current="page"' : ''}>${icon('users')} Nhóm học</a><a href="repairs.html"${activePage === 'repairs' ? ' aria-current="page"' : ''}>${icon('wrench')} Nhật ký sửa chữa</a></div></details>`;
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
                <dialog class="modal" id="loginModal" aria-modal="true" aria-labelledby="loginTitle" tabindex="-1">
                    <div class="modal-content modal-sm auth-modal">
                        <div class="modal-header"><h2 class="modal-title" id="loginTitle">Đăng nhập</h2><button class="modal-close" type="button" data-close-modal="loginModal" aria-label="Đóng">×</button></div>
                        <div class="auth-tabs" role="tablist" aria-label="Loại tài khoản">
                            <button class="auth-tab active" id="userAuthTab" role="tab" aria-controls="userAuthPanel" aria-selected="true" type="button" data-auth-tab="user">Thành viên</button>
                            <button class="auth-tab" id="adminAuthTab" role="tab" aria-controls="adminAuthPanel" aria-selected="false" tabindex="-1" type="button" data-auth-tab="admin">Quản trị viên</button>
                        </div>
                        <section id="userAuthPanel" role="tabpanel" aria-labelledby="userAuthTab">
                            <p class="modal-help" id="guestAuthHelp">Đăng nhập để sử dụng Prompt và lưu các tiện ích cá nhân. Prompt VIP cần tài khoản VIP.</p>
                            <form id="guestAuthForm">
                                <div class="form-group" id="guestNameGroup" hidden><label class="form-label" for="guestName">Họ và tên</label><input class="form-control" id="guestName" autocomplete="name"></div>
                                <div class="form-group"><label class="form-label" for="guestEmail">Email</label><input class="form-control" type="email" id="guestEmail" autocomplete="email" required></div>
                                <div class="form-group"><label class="form-label" for="guestPassword">Mật khẩu</label><input class="form-control" type="password" id="guestPassword" minlength="6" autocomplete="current-password" required></div>
                                <button class="btn btn-primary auth-submit" id="guestAuthSubmit" type="submit">Đăng nhập</button>
                            </form>
                            <button class="auth-switch" id="toggleGuestAuth" type="button">Chưa có tài khoản? Đăng ký</button>
                            <div class="auth-divider"><span>hoặc</span></div>
                            <div class="google-button-wrap" id="googleSignInButton"></div>
                            <p class="auth-config-note" id="googleConfigNote" role="status" aria-live="polite" hidden>Chưa cấu hình Google Client ID.</p>
                            <button class="auth-switch" id="googleRetry" type="button" hidden>Thử tải lại đăng nhập Google</button>
                            <button class="btn btn-secondary auth-cancel" type="button" data-close-modal="loginModal">Hủy</button>
                        </section>
                        <section id="adminAuthPanel" role="tabpanel" aria-labelledby="adminAuthTab" hidden>
                            <p class="modal-help">Dành cho thầy quản trị nội dung Prompt, sửa chữa và Trợ giảng AI.</p>
                            <form id="adminLoginForm">
                                <div class="form-group"><label class="form-label" for="adminPass">Mật khẩu quản trị</label><input class="form-control" type="password" id="adminPass" autocomplete="current-password" required></div>
                                <div class="form-actions"><button class="btn btn-secondary" type="button" data-close-modal="loginModal">Hủy</button><button class="btn btn-primary" id="adminLoginSubmit" type="submit">Đăng nhập</button></div>
                            </form>
                        </section>
                    </div>
                </dialog>`);
        }
        if (!document.getElementById('toastRegion')) {
            document.body.insertAdjacentHTML('beforeend', '<div class="toast-region" id="toastRegion" role="status" aria-live="polite"></div>');
        }
        if (!document.getElementById('authProgress')) {
            document.body.insertAdjacentHTML('beforeend', `
                <div class="google-auth-progress auth-progress" id="authProgress" role="status" aria-live="assertive" aria-busy="true" hidden>
                    <div class="google-auth-progress-card">
                        <span class="google-auth-spinner" aria-hidden="true"></span>
                        <strong id="authProgressTitle">Đang đăng nhập</strong>
                        <span id="authProgressMessage">Vui lòng chờ trong giây lát…</span>
                    </div>
                </div>`);
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
        const membership = String(state.user?.membership || 'regular').toLowerCase() === 'vip' ? 'vip' : 'regular';
        document.body.classList.toggle('admin-logged-in', admin);
        document.body.classList.toggle('user-logged-in', user);
        document.body.classList.toggle('vip-member', user && membership === 'vip');
        document.body.classList.toggle('authenticated', admin || user);
        const name = admin ? config.OWNER_NAME : (state.user?.name || state.user?.email || 'Thành viên');
        const display = document.getElementById('userDisplayName');
        const avatar = document.getElementById('userAvatar');
        if (display) {
            display.textContent = name;
            display.title = name;
        }
        if (avatar) avatar.textContent = initials(name);
        window.dispatchEvent(new CustomEvent('app:auth-change', { detail: { admin, user, membership, authenticated: admin || user } }));
    }

    let loginDialogState = null;

    function canFocus(element) {
        if (!element?.isConnected || element.disabled || typeof element.focus !== 'function') return false;
        for (let node = element; node; node = node.parentElement) {
            const style = window.getComputedStyle(node);
            if (node.hidden || node.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
    }

    function loginFocusable() {
        return Array.from(document.getElementById('loginModal').querySelectorAll('a[href], button, input, select, textarea, iframe, [tabindex]'))
            .filter(element => element.tabIndex >= 0 && canFocus(element));
    }

    function finishLoginClose() {
        if (!loginDialogState) return;
        const previous = loginDialogState;
        loginDialogState = null;
        document.getElementById('loginModal').classList.remove('open');
        document.body.style.overflow = previous.overflow;
        document.body.style.paddingRight = previous.paddingRight;
        previous.background.forEach(([node, inert, hidden]) => {
            if (inert === null) node.removeAttribute('inert'); else node.setAttribute('inert', inert);
            if (hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', hidden);
        });
        previous.auxiliary.forEach(([node, parent, next]) => parent.insertBefore(node, next?.parentNode === parent ? next : null));
        const target = [previous.opener, document.getElementById('logoutButton'), document.getElementById('loginButton')].find(element => element?.matches('a[href], button, input, select, textarea, [tabindex]') && canFocus(element));
        target?.focus({ preventScroll: true });
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        if (id === 'loginModal') {
            if (loginDialogState) return;
            const native = typeof modal.showModal === 'function';
            modal.classList.toggle('login-dialog-fallback', !native);
            loginDialogState = { opener: document.activeElement, native, overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight, background: [], auxiliary: [] };
            // Status and errors must remain visible and announced inside the native dialog.
            ['toastRegion', 'authProgress'].forEach(key => {
                const node = document.getElementById(key);
                if (node) { loginDialogState.auxiliary.push([node, node.parentNode, node.nextSibling]); modal.append(node); }
            });
            const gutter = window.innerWidth - document.documentElement.clientWidth;
            if (gutter > 0) document.body.style.paddingRight = `${(parseFloat(window.getComputedStyle(document.body).paddingRight) || 0) + gutter}px`;
            document.body.style.overflow = 'hidden';
            modal.classList.add('open');
            if (native) modal.showModal();
            else {
                modal.setAttribute('open', '');
                Array.from(document.body.children).filter(node => node !== modal && !['SCRIPT', 'STYLE'].includes(node.tagName)).forEach(node => {
                    loginDialogState.background.push([node, node.getAttribute('inert'), node.getAttribute('aria-hidden')]);
                    node.setAttribute('inert', ''); node.setAttribute('aria-hidden', 'true');
                });
            }
            const field = modal.querySelector('#adminAuthPanel:not([hidden]) input, #userAuthPanel:not([hidden]) input[required]');
            (field || loginFocusable()[0] || modal).focus();
            if (!document.getElementById('userAuthPanel').hidden) setupGoogleSignIn();
            return;
        }
        modal.classList.add('open');
        const focusable = modal.querySelector('input:not([hidden]), button:not([hidden]), select, textarea');
        setTimeout(() => focusable?.focus(), 50);
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (id === 'loginModal') {
            if (modal?.open && typeof modal.close === 'function') modal.close();
            else modal?.removeAttribute('open');
            finishLoginClose();
        } else modal?.classList.remove('open');
    }

    function setAuthTab(tab) {
        const selected = tab === 'admin' ? 'admin' : 'user';
        document.querySelectorAll('[data-auth-tab]').forEach(button => {
            const active = button.dataset.authTab === selected;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
        });
        document.getElementById('userAuthPanel').hidden = selected !== 'user';
        document.getElementById('adminAuthPanel').hidden = selected !== 'admin';
        document.getElementById('loginTitle').textContent = selected === 'admin' ? 'Đăng nhập quản trị' : 'Đăng nhập thành viên';
        if (loginDialogState && selected === 'user') setupGoogleSignIn();
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
        setAuthProgress(true, 'Đang đăng nhập quản trị');
        try {
            await waitForInterfacePaint();
            const result = await apiPost('verify', { adminPassword: password }, {
                timeoutMs: 20000,
                timeoutMessage: 'Máy chủ đăng nhập phản hồi quá lâu. Vui lòng thử lại.'
            });
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
            setAuthProgress(false);
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
        const timeoutMs = Math.max(0, Number(options.timeoutMs) || 0);
        const controller = timeoutMs && typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const collectionAction = ['get_prompts', 'get_repairs', 'toggle_favorite', 'sync_favorites', 'admin_get_users', 'admin_set_membership', 'collections_backup_status', 'collections_backup_now'].includes(action)
                || (['create', 'update', 'delete'].includes(action) && ['prompts', 'repairs'].includes(options.sheetType));
            const endpoint = action === 'verify' && config.ADMIN_AUTH_API_URL ? config.ADMIN_AUTH_API_URL + '/api'
                : action.startsWith('nh_') && config.GROUPS_API_URL ? config.GROUPS_API_URL + '/api'
                : collectionAction && config.COLLECTIONS_API_URL ? config.COLLECTIONS_API_URL + '/api' : config.API_URL;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
                signal: controller?.signal
            });
            if (options.download && response.ok) {
                const disposition = response.headers.get('Content-Disposition') || '';
                let name = 'tep-nhom-hoc';
                try { name = decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1] || name); } catch {}
                return { blob: await response.blob(), name };
            }
            let result;
            try { result = await response.json(); } catch { throw new Error('Máy chủ không phản hồi đúng định dạng. Vui lòng thử lại.'); }
            if (!response.ok && result.status === 'success') throw new Error('Máy chủ không phản hồi.');
            if (result.status !== 'success') {
                const message = result.message || 'Thao tác không thành công.';
                if (action !== 'verify' && /mật khẩu quản trị/i.test(message)) logout();
                if (/phiên (đăng nhập|quản trị)|userToken|token.*hết hạn/i.test(message)) logout();
                throw new Error(message);
            }
            if (!state.adminToken && state.user && ['regular', 'vip'].includes(String(result.membership || '').toLowerCase())) {
                const membership = String(result.membership).toLowerCase();
                if (state.user.membership !== membership) {
                    state.user = Object.assign({}, state.user, { membership });
                    localStorage.setItem(config.USER_PROFILE_KEY, JSON.stringify(state.user));
                    syncAuthUi();
                }
            }
            return result;
        } catch (error) {
            if (error?.name === 'AbortError') throw new Error(options.timeoutMessage || 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.');
            throw error;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    async function uploadGroupFile(file, groupId, note = '') {
        if (!state.adminToken || !config.GROUPS_API_URL) throw new Error('Vui lòng đăng nhập quản trị.');
        if (!file || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error('Mỗi tệp tối đa 5 MB.');
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 60000);
        try {
            const response = await fetch(config.GROUPS_API_URL + '/files/upload?groupId=' + encodeURIComponent(groupId), {
                method: 'POST',
                headers: {'Authorization': 'Bearer ' + state.adminToken, 'Content-Type': file.type || 'application/octet-stream', 'X-File-Size': String(file.size), 'X-File-Name': encodeURIComponent(file.name), 'X-File-Note': encodeURIComponent(note)},
                body: file, signal: controller.signal
            });
            const result = await response.json();
            if (!response.ok || result.status !== 'success') throw new Error(result.message || 'Không tải lên được tệp.');
            return result.data;
        } catch (error) {
            if (error?.name === 'AbortError') throw new Error('Tải tệp quá lâu. Kiểm tra danh sách tệp trước khi tải lại.');
            throw error;
        } finally { clearTimeout(timeout); }
    }

    async function guestAuth(event) {
        event.preventDefault();
        const form = event.currentTarget;
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
        setAuthProgress(true, state.authMode === 'register' ? 'Đang tạo tài khoản' : 'Đang đăng nhập thành viên');
        try {
            await waitForInterfacePaint();
            const result = await apiPost(state.authMode === 'register' ? 'user_register' : 'user_login', data, {
                timeoutMs: 20000,
                timeoutMessage: 'Máy chủ đăng nhập phản hồi quá lâu. Vui lòng thử lại.'
            });
            saveUserSession(result);
            form.reset();
        } catch (error) {
            toast(error.message || 'Không thể xác thực tài khoản.', 'error');
        } finally {
            setAuthProgress(false);
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
        document.getElementById('guestAuthHelp').textContent = registering
            ? 'Tạo tài khoản thường để sử dụng Prompt; quản trị có thể cấp quyền VIP sau.'
            : 'Đăng nhập để sử dụng Prompt và lưu tiện ích. Prompt VIP cần tài khoản VIP.';
    }

    let authProgressSlowTimer = 0;

    function setAuthProgress(visible, title = 'Đang đăng nhập') {
        const overlay = document.getElementById('authProgress');
        const buttonWrap = document.getElementById('googleSignInButton');
        const titleElement = document.getElementById('authProgressTitle');
        const messageElement = document.getElementById('authProgressMessage');
        window.clearTimeout(authProgressSlowTimer);
        authProgressSlowTimer = 0;
        if (overlay) overlay.hidden = !visible;
        if (buttonWrap) buttonWrap.classList.toggle('is-busy', visible);
        document.body.classList.toggle('google-auth-busy', visible);
        document.body.classList.toggle('auth-busy', visible);
        if (!visible) return;
        if (titleElement) titleElement.textContent = title;
        if (messageElement) messageElement.textContent = 'Vui lòng chờ trong giây lát…';
        authProgressSlowTimer = window.setTimeout(() => {
            if (messageElement && overlay && !overlay.hidden) {
                messageElement.textContent = 'Máy chủ đang khởi động, thao tác có thể mất thêm vài giây…';
            }
        }, 1600);
    }

    function waitForInterfacePaint() {
        if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    async function handleGoogleCredential(response) {
        if (!response?.credential) return toast('Google không trả về thông tin đăng nhập.', 'error');
        if (state.googleSigningIn) return;
        state.googleSigningIn = true;
        setAuthProgress(true, 'Đang xác minh tài khoản Google');
        try {
            await waitForInterfacePaint();
            const result = await apiPost('google_login', {
                credential: response.credential,
                origin: window.location.origin
            }, { timeoutMs: 25000 });
            saveUserSession(result);
        } catch (error) {
            toast(error.message || 'Không thể đăng nhập bằng Google.', 'error');
        } finally {
            state.googleSigningIn = false;
            setAuthProgress(false);
        }
    }

    function initializeGoogleButton() {
        if (state.googleInitialized || !loginDialogState || document.getElementById('userAuthPanel').hidden || !window.google?.accounts?.id || !config.GOOGLE_CLIENT_ID) return;
        window.google.accounts.id.initialize({ client_id: config.GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
        window.google.accounts.id.renderButton(document.getElementById('googleSignInButton'), {
            type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: 320, locale: 'vi'
        });
        state.googleInitialized = true;
    }

    let googleScript = null;
    let googleLoadTimer = 0;

    function setupGoogleSignIn() {
        if (!loginDialogState || document.getElementById('userAuthPanel').hidden) return;
        const note = document.getElementById('googleConfigNote');
        const retry = document.getElementById('googleRetry');
        const button = document.getElementById('googleSignInButton');
        if (!config.GOOGLE_CLIENT_ID) {
            note.hidden = false;
            note.textContent = 'Chưa cấu hình Google Client ID.';
            return;
        }
        if (state.googleInitialized) return;
        if (window.google?.accounts?.id) {
            try { initializeGoogleButton(); note.hidden = true; retry.hidden = true; }
            catch (_) { note.hidden = false; note.textContent = 'Không tải được đăng nhập Google. Vui lòng thử lại.'; retry.hidden = false; }
            return;
        }
        if (googleScript) return;
        const script = document.createElement('script');
        googleScript = script;
        note.hidden = false;
        note.textContent = 'Đang tải đăng nhập Google…';
        retry.hidden = true;
        button.setAttribute('aria-busy', 'true');
        const fail = () => {
            if (googleScript !== script) return;
            window.clearTimeout(googleLoadTimer);
            googleScript = null;
            script.remove();
            button.removeAttribute('aria-busy');
            note.hidden = false;
            note.textContent = 'Không tải được đăng nhập Google. Vui lòng thử lại.';
            retry.hidden = false;
        };
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            if (googleScript !== script) return;
            window.clearTimeout(googleLoadTimer);
            button.removeAttribute('aria-busy');
            if (!window.google?.accounts?.id) return fail();
            try { initializeGoogleButton(); note.hidden = true; retry.hidden = true; }
            catch (_) { fail(); }
        };
        script.onerror = fail;
        googleLoadTimer = window.setTimeout(fail, 12000);
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
        const collectionType = ['prompts', 'repairs'].includes(type);
        if (type === 'overview' && !config.COLLECTIONS_API_URL) throw new Error('Chưa cấu hình máy chủ thống kê.');
        if (collectionType && config.COLLECTIONS_API_URL && options.includeAuth && isAuthenticated()) return apiPost(type === 'prompts' ? 'get_prompts' : 'get_repairs', {}, { userAuth: true });
        const url = new URL((collectionType || type === 'overview') && config.COLLECTIONS_API_URL ? config.COLLECTIONS_API_URL + '/api' : config.API_URL);
        url.searchParams.set('type', type);
        if (type !== 'overview' && options.includeAuth && state.userToken) url.searchParams.set('userToken', state.userToken);
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
        document.getElementById('googleRetry')?.addEventListener('click', setupGoogleSignIn);
        document.querySelectorAll('[data-auth-tab]').forEach(button => {
            button.addEventListener('click', () => setAuthTab(button.dataset.authTab));
            button.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const tab = event.key === 'Home' ? 'user' : event.key === 'End' ? 'admin' : button.dataset.authTab === 'user' ? 'admin' : 'user';
                setAuthTab(tab);
                document.querySelector(`[data-auth-tab="${tab}"]`).focus();
            });
        });
        document.getElementById('loginModal')?.addEventListener('cancel', event => { event.preventDefault(); closeModal('loginModal'); });
        document.getElementById('loginModal')?.addEventListener('close', () => { if (!document.getElementById('loginModal').open) finishLoginClose(); });
        document.addEventListener('click', event => {
            const closeButton = event.target.closest('[data-close-modal]');
            if (closeButton) closeModal(closeButton.dataset.closeModal);
            if (event.target.classList.contains('modal')) closeModal(event.target.id);
        });
        document.addEventListener('keydown', event => {
            if (loginDialogState) {
                if (event.key === 'Escape') { event.preventDefault(); closeModal('loginModal'); return; }
                // Wrap the outer controls before focus can move to browser chrome.
                // A cancel button after Google keeps its iframe in the normal Tab order.
                if (event.key === 'Tab') {
                    const controls = loginFocusable(), first = controls[0], last = controls.at(-1);
                    if (!controls.length) { event.preventDefault(); document.getElementById('loginModal').focus(); }
                    else if (!document.getElementById('loginModal').contains(document.activeElement) || document.activeElement === document.getElementById('loginModal')) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
                    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
                }
                return;
            }
            if (event.key === 'Escape') document.querySelectorAll('.modal.open').forEach(modal => closeModal(modal.id));
        });
        document.addEventListener('focusin', event => {
            if (loginDialogState && !loginDialogState.native && !document.getElementById('loginModal').contains(event.target)) (loginFocusable()[0] || document.getElementById('loginModal')).focus();
        });
    }

    function init(activePage) {
        renderShell(activePage);
        ensureGlobalUi();
        bindGlobalEvents();
        syncAuthUi();
    }

    window.App = Object.freeze({
        init, icon, openModal, closeModal, openLogin, toast, requireAdmin, requireUser, apiGet, apiPost, uploadGroupFile,
        escapeHTML, safeUrl, formatBytes, debounce,
        isLoggedIn: isAuthenticated,
        isAuthenticated,
        isAdmin: () => Boolean(state.adminToken),
        isGuest: () => Boolean(state.userToken),
        isVipMember: () => Boolean(state.adminToken || (state.userToken && String(state.user?.membership || '').toLowerCase() === 'vip')),
        getAdminToken: () => state.adminToken,
        getUserToken: () => state.userToken,
        getUser: () => state.user,
        config
    });
})();
