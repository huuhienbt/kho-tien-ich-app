(function () {
    'use strict';

    App.init('prompts');

    const state = {
        items: [],
        category: 'all',
        query: '',
        sort: 'newest',
        editId: null,
        favorites: new Set(JSON.parse(localStorage.getItem('prompt_favorites') || '[]'))
    };

    const container = document.getElementById('promptContainer');
    const categoryNames = { teaching: 'Giảng dạy', admin: 'Hành chính', coding: 'Lập trình', media: 'Media', diy: 'DIY' };

    function cacheItems(items) {
        localStorage.setItem('cache_prompts', JSON.stringify(items));
    }

    function updateCounts() {
        const counts = state.items.reduce((acc, item) => {
            acc.all += 1;
            acc[item.category] = (acc[item.category] || 0) + 1;
            return acc;
        }, { all: 0 });
        document.querySelectorAll('[data-count]').forEach(element => {
            element.textContent = counts[element.dataset.count] || 0;
        });
    }

    function filteredItems() {
        const query = state.query.toLocaleLowerCase('vi');
        const result = state.items.filter(item => {
            const inCategory = state.category === 'all' || item.category === state.category;
            const haystack = `${item.title || ''} ${item.content || ''} ${item.platform || ''}`.toLocaleLowerCase('vi');
            return inCategory && (!query || haystack.includes(query));
        });
        return result.sort((a, b) => {
            if (state.sort === 'oldest') return String(a.id).localeCompare(String(b.id), 'vi', { numeric: true });
            if (state.sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'vi');
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
            const id = App.escapeHTML(item.id);
            const title = App.escapeHTML(item.title || 'Chưa đặt tiêu đề');
            const content = App.escapeHTML(item.content || '');
            const category = App.escapeHTML(item.category || 'default');
            const platform = App.escapeHTML(item.platform || 'Khác');
            const favorite = state.favorites.has(String(item.id));
            return `<article class="card prompt-card" data-id="${id}">
                <div class="card-header">
                    <div><h2 class="card-title">${title}</h2><div class="prompt-meta" style="margin-top:8px"><span class="tag tag-${category}">${App.escapeHTML(categoryNames[item.category] || item.category || 'Khác')}</span><span class="platform-label">${platform}</span></div></div>
                    <button class="btn btn-ghost btn-icon favorite-btn${favorite ? ' active' : ''}" type="button" data-action="favorite" aria-label="${favorite ? 'Bỏ ghim' : 'Ghim'} Prompt" title="Ghim Prompt">★</button>
                </div>
                <div class="prompt-box" id="prompt-content-${id}">${content}</div>
                <div class="card-footer">
                    <button class="btn btn-ghost btn-sm" type="button" data-action="expand">Xem đầy đủ ↓</button>
                    <div style="display:flex;gap:7px;flex-wrap:wrap">
                        <button class="btn btn-secondary btn-sm" type="button" data-action="copy">📋 Sao chép</button>
                        <button class="btn btn-secondary btn-sm admin-only" type="button" data-action="edit">✏️ Sửa</button>
                        <button class="btn btn-danger btn-sm admin-only" type="button" data-action="delete">🗑️ Xóa</button>
                    </div>
                </div>
            </article>`;
        }).join('');
    }

    async function loadData() {
        const cache = localStorage.getItem('cache_prompts');
        if (cache) {
            try { state.items = JSON.parse(cache); updateCounts(); render(); } catch (_) { localStorage.removeItem('cache_prompts'); }
        }
        try {
            const result = await App.apiGet('prompts');
            state.items = Array.isArray(result.data) ? result.data : [];
            cacheItems(state.items);
            updateCounts();
            render();
        } catch (error) {
            if (!state.items.length) container.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span>${App.escapeHTML(error.message)}</div>`;
            App.toast('Không thể cập nhật dữ liệu mới.', 'error');
        }
    }

    function openForm(id = null) {
        state.editId = id;
        const item = id ? state.items.find(entry => String(entry.id) === String(id)) : null;
        document.getElementById('promptModalTitle').textContent = item ? 'Sửa Prompt' : 'Thêm Prompt';
        document.getElementById('pTitle').value = item?.title || '';
        document.getElementById('pCategory').value = item?.category || 'teaching';
        document.getElementById('pPlatform').value = item?.platform || 'ChatGPT / Gemini';
        document.getElementById('pContent').value = item?.content || '';
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
            localStorage.removeItem('cache_prompts');
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
            state.items = state.items.filter(item => String(item.id) !== String(id));
            cacheItems(state.items);
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
        const item = state.items.find(entry => String(entry.id) === String(id));
        if (!item) return;
        if (actionButton.dataset.action === 'copy') {
            try { await navigator.clipboard.writeText(item.content || ''); App.toast('Đã sao chép Prompt.', 'success'); } catch (_) { App.toast('Không thể sao chép.', 'error'); }
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

    loadData();
})();
