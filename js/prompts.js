(function () {
    'use strict';

    App.init('prompts');

    const state = {
        items: [],
        category: 'all',
        access: 'all',
        query: '',
        sort: 'newest',
        editId: null,
        favorites: new Set(JSON.parse(localStorage.getItem('prompt_favorites') || '[]'))
    };

    const container = document.getElementById('promptContainer');
    const categoryNames = { teaching: 'Giảng dạy', admin: 'Hành chính', coding: 'Lập trình', media: 'Media', diy: 'DIY' };

    function readField(item, names, fallback = '') {
        for (const name of names) {
            if (item?.[name] !== undefined && item?.[name] !== null && item?.[name] !== '') return item[name];
        }
        return fallback;
    }

    function isVip(item) {
        const value = readField(item, ['access', 'Access', 'type', 'Type', 'level', 'Level', 'vip', 'VIP', 'isVip'], 'normal');
        if (value === true || Number(value) === 1) return true;
        return ['vip', 'premium', 'cao cấp', 'caocap'].includes(String(value).trim().toLocaleLowerCase('vi'));
    }

    function updateCounts() {
        const counts = state.items.reduce((acc, item) => {
            acc.all += 1;
            const category = readField(item, ['category', 'Category'], 'default');
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, { all: 0 });
        document.querySelectorAll('[data-count]').forEach(element => {
            element.textContent = counts[element.dataset.count] || 0;
        });
    }

    function filteredItems() {
        const query = state.query.toLocaleLowerCase('vi');
        const result = state.items.filter(item => {
            const category = readField(item, ['category', 'Category'], 'default');
            const access = isVip(item) ? 'vip' : 'normal';
            const inCategory = state.category === 'all' || category === state.category;
            const inAccess = state.access === 'all' || access === state.access;
            const haystack = `${readField(item, ['title', 'Title'])} ${readField(item, ['content', 'Content'])} ${readField(item, ['platform', 'Platform'])}`.toLocaleLowerCase('vi');
            return inCategory && inAccess && (!query || haystack.includes(query));
        });
        return result.sort((a, b) => {
            if (state.sort === 'oldest') return String(a.id).localeCompare(String(b.id), 'vi', { numeric: true });
            if (state.sort === 'title') return String(readField(a, ['title', 'Title'])).localeCompare(String(readField(b, ['title', 'Title'])), 'vi');
            if (state.sort === 'favorite') return Number(state.favorites.has(String(b.id))) - Number(state.favorites.has(String(a.id)));
            return String(b.id).localeCompare(String(a.id), 'vi', { numeric: true });
        });
    }

    function render() {
        const items = filteredItems();
        if (!items.length) {
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">📭</span>Không tìm thấy Prompt phù hợp.</div>';
            return;
        }
        container.innerHTML = items.map(item => {
            const id = App.escapeHTML(readField(item, ['id', 'ID']));
            const title = App.escapeHTML(readField(item, ['title', 'Title'], 'Chưa đặt tiêu đề'));
            const rawContent = readField(item, ['content', 'Content']);
            const content = App.escapeHTML(rawContent);
            const rawCategory = readField(item, ['category', 'Category'], 'default');
            const category = App.escapeHTML(rawCategory);
            const platform = App.escapeHTML(readField(item, ['platform', 'Platform'], 'Khác'));
            const favorite = state.favorites.has(String(readField(item, ['id', 'ID'])));
            const vip = isVip(item);
            const locked = vip && !App.isAuthenticated();
            const body = locked
                ? `<div class="vip-lock"><span class="vip-lock-icon">🔒</span><strong>Nội dung dành cho thành viên VIP</strong><span>Đăng nhập hoặc đăng ký miễn phí để xem Prompt này.</span><button class="btn btn-primary btn-sm" type="button" data-action="unlock">Đăng nhập để xem</button></div>`
                : `<div class="prompt-box" id="prompt-content-${id}">${content}</div>`;
            return `<article class="card prompt-card${vip ? ' prompt-vip' : ''}" data-id="${id}">
                <div class="card-header">
                    <div><h2 class="card-title">${title}</h2><div class="prompt-meta" style="margin-top:8px"><span class="tag tag-${category}">${App.escapeHTML(categoryNames[rawCategory] || rawCategory || 'Khác')}</span><span class="tag ${vip ? 'tag-vip' : 'tag-normal'}">${vip ? '👑 VIP' : 'Thường'}</span><span class="platform-label">${platform}</span></div></div>
                    <button class="btn btn-ghost btn-icon favorite-btn${favorite ? ' active' : ''}" type="button" data-action="favorite" aria-label="${favorite ? 'Bỏ ghim' : 'Ghim'} Prompt" title="Ghim Prompt">★</button>
                </div>
                ${body}
                <div class="card-footer">
                    <div>${locked ? '<span class="vip-note">Cần tài khoản thành viên</span>' : '<button class="btn btn-ghost btn-sm" type="button" data-action="expand">Xem đầy đủ ↓</button>'}</div>
                    <div style="display:flex;gap:7px;flex-wrap:wrap">
                        ${locked ? '' : '<button class="btn btn-secondary btn-sm" type="button" data-action="copy">📋 Sao chép</button>'}
                        <button class="btn btn-secondary btn-sm admin-only" type="button" data-action="edit">✏️ Sửa</button>
                        <button class="btn btn-danger btn-sm admin-only" type="button" data-action="delete">🗑️ Xóa</button>
                    </div>
                </div>
            </article>`;
        }).join('');
    }

    async function loadData() {
        container.setAttribute('aria-busy', 'true');
        try {
            const result = await App.apiGet('prompts', { includeAuth: true });
            state.items = Array.isArray(result.data) ? result.data : [];
            updateCounts();
            render();
        } catch (error) {
            container.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span>${App.escapeHTML(error.message)}</div>`;
            App.toast('Không thể cập nhật dữ liệu Prompt.', 'error');
        } finally {
            container.removeAttribute('aria-busy');
        }
    }

    function openForm(id = null) {
        state.editId = id;
        const item = id ? state.items.find(entry => String(readField(entry, ['id', 'ID'])) === String(id)) : null;
        document.getElementById('promptModalTitle').textContent = item ? 'Sửa Prompt' : 'Thêm Prompt';
        document.getElementById('pTitle').value = readField(item, ['title', 'Title']);
        document.getElementById('pCategory').value = readField(item, ['category', 'Category'], 'teaching');
        document.getElementById('pPlatform').value = readField(item, ['platform', 'Platform'], 'ChatGPT / Gemini');
        document.getElementById('pAccess').value = item && isVip(item) ? 'vip' : 'normal';
        document.getElementById('pContent').value = readField(item, ['content', 'Content']);
        App.openModal('promptModal');
    }

    async function savePrompt(event) {
        event.preventDefault();
        const button = document.getElementById('savePromptButton');
        const original = button.textContent;
        const data = {
            title: document.getElementById('pTitle').value.trim(),
            category: document.getElementById('pCategory').value,
            platform: document.getElementById('pPlatform').value,
            access: document.getElementById('pAccess').value,
            content: document.getElementById('pContent').value.trim()
        };
        if (!data.title || !data.content) return App.toast('Vui lòng nhập tiêu đề và nội dung.', 'error');
        if (state.editId) data.id = state.editId;
        button.disabled = true;
        button.textContent = 'Đang lưu…';
        try {
            await App.apiPost(state.editId ? 'update' : 'create', data, { auth: true, sheetType: 'prompts' });
            App.closeModal('promptModal');
            state.editId = null;
            App.toast('Đã lưu Prompt.', 'success');
            await loadData();
        } catch (error) {
            App.toast(error.message, 'error');
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    async function deletePrompt(id) {
        if (!confirm('Xóa Prompt này? Dữ liệu sẽ không thể khôi phục từ giao diện.')) return;
        try {
            await App.apiPost('delete', { id }, { auth: true, sheetType: 'prompts' });
            state.items = state.items.filter(item => String(readField(item, ['id', 'ID'])) !== String(id));
            updateCounts();
            render();
            App.toast('Đã xóa Prompt.', 'success');
        } catch (error) {
            App.toast(error.message, 'error');
        }
    }

    document.getElementById('addPromptButton').addEventListener('click', () => App.requireAdmin(() => openForm()));
    document.getElementById('promptForm').addEventListener('submit', savePrompt);
    document.getElementById('promptSearch').addEventListener('input', App.debounce(event => { state.query = event.target.value.trim(); render(); }));
    document.getElementById('promptAccessFilter').addEventListener('change', event => { state.access = event.target.value; render(); });
    document.getElementById('promptSort').addEventListener('change', event => { state.sort = event.target.value; render(); });
    document.getElementById('promptTabs').addEventListener('click', event => {
        const tab = event.target.closest('[data-category]');
        if (!tab) return;
        document.querySelectorAll('#promptTabs .tab').forEach(item => item.classList.remove('active'));
        tab.classList.add('active');
        state.category = tab.dataset.category;
        render();
    });
    container.addEventListener('click', async event => {
        const actionButton = event.target.closest('[data-action]');
        const card = event.target.closest('.prompt-card');
        if (!actionButton || !card) return;
        const id = card.dataset.id;
        const item = state.items.find(entry => String(readField(entry, ['id', 'ID'])) === String(id));
        if (!item) return;
        if (actionButton.dataset.action === 'unlock') App.requireUser(loadData);
        if (actionButton.dataset.action === 'copy') {
            try { await navigator.clipboard.writeText(readField(item, ['content', 'Content'])); App.toast('Đã sao chép Prompt.', 'success'); } catch (_) { App.toast('Không thể sao chép.', 'error'); }
        }
        if (actionButton.dataset.action === 'expand') {
            const box = card.querySelector('.prompt-box');
            const expanded = box.classList.toggle('expanded');
            actionButton.textContent = expanded ? 'Thu gọn ↑' : 'Xem đầy đủ ↓';
        }
        if (actionButton.dataset.action === 'favorite') {
            if (state.favorites.has(String(id))) state.favorites.delete(String(id)); else state.favorites.add(String(id));
            localStorage.setItem('prompt_favorites', JSON.stringify([...state.favorites]));
            render();
        }
        if (actionButton.dataset.action === 'edit') App.requireAdmin(() => openForm(id));
        if (actionButton.dataset.action === 'delete') App.requireAdmin(() => deletePrompt(id));
    });

    window.addEventListener('app:auth-change', loadData);
    loadData();
})();
