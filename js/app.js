(function () {
    'use strict';

    const config = window.APP_CONFIG;
    const state = {
        adminPassword: sessionStorage.getItem(config.SESSION_KEY) || '',
        pendingAction: null
    };

    const iconPaths = {
        home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
        wrench: '<path d="M14.7 6.3a4 4 0 0 0-5-5l2.2 2.2-3.4 3.4-2.2-2.2a4 4 0 0 0 5 5l6.7 6.7a2.1 2.1 0 1 0 3-3Z"/><path d="m6.5 12.5-4.8 4.8a2.1 2.1 0 0 0 3 3l4.8-4.8"/>',
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
        sparkle: '<path d="m12 3-1.6 4.4L6 9l4.4 1.6L12 15l1.6-4.4L18 9l-4.4-1.6Z"/><path d="m5 16-.8 2.2L2 19l2.2.8L5 22l.8-2.2L8 19l-2.2-.8Z"/><path d="m19 14-.8 2.2L16 17l2.2.8L19 20l.8-2.2L22 17l-2.2-.8Z"/>',
        menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
        lock: '<rect width="16" height="12" x="4" y="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'
    };

    function icon(name, className = 'nav-icon') {
        return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || ''}</svg>`;
    }

    function navigation(activePage) {
        const items = [
            ['home', 'index.html', 'Trang chủ', 'home'],
            ['prompts', 'prompts.html', 'Kho Prompt', 'book'],
            ['repairs', 'repairs.html', 'Nhật ký sửa chữa', 'wrench'],
            ['upload', 'upload.html', 'Kho tệp Drive', 'upload'],
            ['ai', 'ai.html', 'Trợ giảng AI', 'sparkle']
        ];
        return items.map(([key, href, label, iconName]) =>
            `<a href="${href}" class="nav-link${activePage === key ? ' active' : ''}"${activePage === key ? ' aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></a>`
        ).join('');
    }

    function renderShell(activePage) {
        const shell = document.getElementById('appShell');
        if (!shell) return;
        shell.innerHTML = `
            <header class="app-header">
                <div class="container header-inner">
                    <a class="brand" href="index.html" aria-label="Về Trang chủ">
                        <span class="brand-mark">NH</span>
                        <span class="brand-copy"><span class="brand-title">${config.APP_NAME}</span><span class="brand-subtitle">Công cụ làm việc dành cho giáo viên</span></span>
                    </a>
                    <nav class="nav-list" id="mainNavigation" aria-label="Điều hướng chính">${navigation(activePage)}</nav>
                    <div class="nav-actions">
                        <button class="btn btn-secondary btn-icon menu-toggle" id="menuToggle" type="button" aria-label="Mở menu" aria-expanded="false">${icon('menu')}</button>
                        <button class="btn btn-primary btn-login" id="loginButton" type="button">${icon('lock')}<span class="btn-label">Đăng nhập</span></button>
                        <span class="user-chip"><span class="user-avatar">NH</span><span>${config.OWNER_NAME}</span></span>
                        <button class="btn btn-danger btn-sm admin-only" id="logoutButton" type="button" title="Đăng xuất">${icon('logout')}<span>Đăng xuất</span></button>
                    </div>
                </div>
            </header>`;
    }

    function ensureGlobalUi() {
        if (!document.getElementById('loginModal')) {
            document.body.insertAdjacentHTML('beforeend', `
                <div class="modal" id="loginModal" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
                    <div class="modal-content modal-sm">
                        <div class="modal-header"><h2 class="modal-title" id="loginTitle">Đăng nhập quản trị</h2><button class="modal-close" type="button" data-close-modal="loginModal" aria-label="Đóng">×</button></div>
                        <p class="modal-help">Nhập mật khẩu để sử dụng chức năng quản trị, tải tệp và trợ giảng AI.</p>
                        <form id="loginForm">
                            <div class="form-group"><label class="form-label" for="adminPass">Mật khẩu</label><input class="form-control" type="password" id="adminPass" autocomplete="current-password" required></div>
                            <div class="form-actions"><button class="btn btn-secondary" type="button" data-close-modal="loginModal">Hủy</button><button class="btn btn-primary" id="loginSubmit" type="submit">Đăng nhập</button></div>
                        </form>
                    </div>
                </div>`);
        }
        if (!document.getElementById('toastRegion')) {
            document.body.insertAdjacentHTML('beforeend', '<div class="toast-region" id="toastRegion" role="status" aria-live="polite"></div>');
        }
    }

    function syncAuthUi() {
        document.body.classList.toggle('logged-in', Boolean(state.adminPassword));
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.add('open');
        const focusable = modal.querySelector('input, button, select, textarea');
        setTimeout(() => focusable?.focus(), 50);
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        modal?.classList.remove('open');
    }

    function toast(message, type = '') {
        const region = document.getElementById('toastRegion');
        if (!region) return;
        const item = document.createElement('div');
        item.className = `toast ${type}`.trim();
        item.textContent = message;
        region.appendChild(item);
        setTimeout(() => item.remove(), 3200);
    }

    async function login(event) {
        event.preventDefault();
        const input = document.getElementById('adminPass');
        const button = document.getElementById('loginSubmit');
        const password = input.value.trim();
        if (!password) return;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Đang kiểm tra…';
        try {
            const response = await fetch(config.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'verify', adminPassword: password })
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message || 'Sai mật khẩu');
            state.adminPassword = password;
            sessionStorage.setItem(config.SESSION_KEY, password);
            input.value = '';
            syncAuthUi();
            closeModal('loginModal');
            toast('Đăng nhập thành công.', 'success');
            const action = state.pendingAction;
            state.pendingAction = null;
            if (typeof action === 'function') action();
        } catch (error) {
            input.value = '';
            toast(error.message || 'Không thể đăng nhập.', 'error');
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    function logout() {
        state.adminPassword = '';
        state.pendingAction = null;
        sessionStorage.removeItem(config.SESSION_KEY);
        syncAuthUi();
        toast('Đã đăng xuất.');
    }

    function requireAdmin(action) {
        if (state.adminPassword) {
            if (typeof action === 'function') action();
            return true;
        }
        state.pendingAction = typeof action === 'function' ? action : null;
        openModal('loginModal');
        return false;
    }

    async function apiGet(type) {
        const response = await fetch(`${config.API_URL}?type=${encodeURIComponent(type)}`);
        if (!response.ok) throw new Error('Máy chủ không phản hồi.');
        const result = await response.json();
        if (result.status && result.status !== 'success') throw new Error(result.message || 'Không tải được dữ liệu.');
        return result;
    }

    async function apiPost(action, data = {}, options = {}) {
        if (options.auth && !state.adminPassword) throw new Error('Vui lòng đăng nhập quản trị.');
        const payload = { action, data };
        if (options.sheetType) payload.sheetType = options.sheetType;
        if (state.adminPassword) payload.adminPassword = state.adminPassword;
        const response = await fetch(config.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Máy chủ không phản hồi.');
        const result = await response.json();
        if (result.status !== 'success') {
            if ((result.message || '').toLowerCase().includes('mật khẩu')) logout();
            throw new Error(result.message || 'Thao tác không thành công.');
        }
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
        document.getElementById('loginButton')?.addEventListener('click', () => openModal('loginModal'));
        document.getElementById('logoutButton')?.addEventListener('click', logout);
        document.getElementById('loginForm')?.addEventListener('submit', login);
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
        syncAuthUi();
        bindGlobalEvents();
    }

    window.App = Object.freeze({
        init, icon, openModal, closeModal, toast, requireAdmin, apiGet, apiPost,
        escapeHTML, safeUrl, formatBytes, debounce,
        isLoggedIn: () => Boolean(state.adminPassword),
        getAdminPassword: () => state.adminPassword,
        config
    });
})();
