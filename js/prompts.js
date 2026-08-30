(function () {
    'use strict';

    App.init('prompts');

    const LOCAL_FAVORITES_KEY = 'prompt_favorites';

    function readLocalFavorites() {
        try {
            const values = JSON.parse(localStorage.getItem(LOCAL_FAVORITES_KEY) || '[]');
            return new Set(Array.isArray(values) ? values.map(String) : []);
        } catch (_) {
            return new Set();
        }
    }

    function saveLocalFavorites(favorites) {
        localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify([...favorites]));
    }

    const state = {
        items: [],
        category: 'all',
        access: 'all',
        query: '',
        sort: 'newest',
        editId: null,
        favorites: readLocalFavorites(),
        favoriteBusy: new Set()
    };

    const container = document.getElementById('promptContainer');
    const usePromptHelp = document.getElementById('usePromptHelp');
    const usePromptOptions = document.getElementById('usePromptOptions');
    const useOtherPromptOptions = document.getElementById('useOtherPromptOptions');
    const useOtherPlatformsButton = document.getElementById('useOtherPlatformsButton');
    const useOtherPlatformsCount = document.getElementById('useOtherPlatformsCount');
    const categoryNames = { teaching: 'Giảng dạy', admin: 'Hành chính', coding: 'Lập trình', media: 'Media', diy: 'DIY' };
    const promptDestinations = Object.freeze({
        chatgpt: { label: 'ChatGPT', icon: '◉', url: 'https://chatgpt.com/', aliases: ['chatgpt', 'gpt'] },
        gemini: { label: 'Gemini', icon: '✦', url: 'https://gemini.google.com/app', aliases: ['gemini'] },
        claude: { label: 'Claude', icon: '✺', url: 'https://claude.ai/new', aliases: ['claude'] },
        notebooklm: { label: 'NotebookLM', icon: 'N', url: 'https://notebooklm.google.com/', aliases: ['notebooklm', 'notebook lm'] },
        grok: { label: 'Grok', icon: '𝕏', url: 'https://grok.com/', aliases: ['grok'] },
        copilot: { label: 'Microsoft Copilot', icon: '◆', url: 'https://copilot.microsoft.com/', aliases: ['microsoft copilot', 'copilot'] },
        deepseek: { label: 'DeepSeek', icon: '◌', url: 'https://chat.deepseek.com/', aliases: ['deepseek', 'deep seek'] },
        canva: { label: 'Canva', icon: 'C', url: 'https://www.canva.com/ai-assistant/', aliases: ['canva'] },
        perplexity: { label: 'Perplexity', icon: 'P', url: 'https://www.perplexity.ai/', aliases: ['perplexity'] },
        gamma: { label: 'Gamma', icon: 'Γ', url: 'https://gamma.app/', aliases: ['gamma'] },
        suno: { label: 'Suno AI', icon: '♫', url: 'https://suno.com/create', aliases: ['suno'] },
        midjourney: { label: 'Midjourney', icon: '◇', url: 'https://www.midjourney.com/', aliases: ['midjourney'] }
    });
    let pendingUseItem = null;

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

    function destinationKeys(item) {
        const platform = String(readField(item, ['platform', 'Platform'], '')).trim().toLocaleLowerCase('vi');
        const matches = Object.entries(promptDestinations)
            .filter(([, destination]) => destination.aliases.some(alias => platform.includes(alias)))
            .map(([key]) => key);
        return matches.length ? matches : ['chatgpt', 'gemini'];
    }

    async function copyText(text) {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Trình duyệt không cho phép sao chép.');
    }

    function renderPromptDestinations(keys) {
        return keys.map(key => {
            const destination = promptDestinations[key];
            return `<button class="prompt-use-option" type="button" data-prompt-destination="${key}"><span class="prompt-use-icon" aria-hidden="true">${destination.icon}</span><span><strong>Mở ${destination.label}</strong><small>Sao chép Prompt và mở nền tảng</small></span><span aria-hidden="true">→</span></button>`;
        }).join('');
    }

    function showUsePromptChooser(item) {
        pendingUseItem = item;
        const title = readField(item, ['title', 'Title'], 'Prompt');
        const recommendedKeys = destinationKeys(item);
        const otherKeys = Object.keys(promptDestinations).filter(key => !recommendedKeys.includes(key));
        usePromptHelp.textContent = `Chọn nơi sử dụng “${title}”.`;
        usePromptOptions.innerHTML = renderPromptDestinations(recommendedKeys);
        useOtherPromptOptions.innerHTML = renderPromptDestinations(otherKeys);
        useOtherPromptOptions.hidden = true;
        useOtherPlatformsButton.classList.remove('open');
        useOtherPlatformsButton.setAttribute('aria-expanded', 'false');
        useOtherPlatformsCount.textContent = `${otherKeys.length} lựa chọn`;
        App.openModal('usePromptModal');
    }

    async function launchPrompt(item, destinationKey) {
        const destination = promptDestinations[destinationKey];
        if (!destination) return;
        const prompt = String(readField(item, ['content', 'Content']));
        const targetWindow = window.open('', '_blank');
        if (targetWindow) targetWindow.opener = null;
        let copied = true;
        try {
            await copyText(prompt);
        } catch (_) {
            copied = false;
        }
        App.closeModal('usePromptModal');
        if (targetWindow) targetWindow.location.replace(destination.url);
        else window.location.assign(destination.url);
        App.toast(copied
            ? `Đã sao chép Prompt và mở ${destination.label}. Hãy dán vào ô chat.`
            : `Đã mở ${destination.label}, nhưng trình duyệt chưa cho phép sao chép.`, copied ? 'success' : 'error');
    }

    async function usePrompt(item) {
        const prompt = String(readField(item, ['content', 'Content']));
        if (!prompt) return App.toast('Prompt này chưa có nội dung.', 'error');
        showUsePromptChooser(item);
    }

    function updateCounts() {
        const counts = state.items.reduce((acc, item) => {
            acc.all += 1;
            const id = String(readField(item, ['id', 'ID']));
            if (state.favorites.has(id)) acc.favorites += 1;
            const category = readField(item, ['category', 'Category'], 'default');
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, { all: 0, favorites: 0 });
        document.querySelectorAll('[data-count]').forEach(element => {
            element.textContent = counts[element.dataset.count] || 0;
        });
    }

    function filteredItems() {
        const query = state.query.toLocaleLowerCase('vi');
        const result = state.items.filter(item => {
            const id = String(readField(item, ['id', 'ID']));
            const category = readField(item, ['category', 'Category'], 'default');
            const access = isVip(item) ? 'vip' : 'normal';
            const inCategory = state.category === 'all'
                || (state.category === 'favorites' ? state.favorites.has(id) : category === state.category);
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
            container.innerHTML = state.category === 'favorites'
                ? '<div class="empty-state"><span class="empty-icon">☆</span>Chưa có Prompt yêu thích. Nhấn ngôi sao trên Prompt để thêm vào mục này.</div>'
                : '<div class="empty-state"><span class="empty-icon">📭</span>Không tìm thấy Prompt phù hợp.</div>';
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
            const favoriteBusy = state.favoriteBusy.has(String(readField(item, ['id', 'ID'])));
            const vip = isVip(item);
            const locked = vip && !App.isAuthenticated();
            const body = locked
                ? `<div class="vip-lock"><span class="vip-lock-icon">🔒</span><strong>Nội dung dành cho thành viên VIP</strong><span>Đăng nhập hoặc đăng ký miễn phí để xem Prompt này.</span><button class="btn btn-primary btn-sm" type="button" data-action="unlock">Đăng nhập để xem</button></div>`
                : `<div class="prompt-box" id="prompt-content-${id}">${content}</div>`;
            return `<article class="card prompt-card${vip ? ' prompt-vip' : ''}" data-id="${id}">
                <div class="card-header">
                    <div><h2 class="card-title">${title}</h2><div class="prompt-meta" style="margin-top:8px"><span class="tag tag-${category}">${App.escapeHTML(categoryNames[rawCategory] || rawCategory || 'Khác')}</span><span class="tag ${vip ? 'tag-vip' : 'tag-normal'}">${vip ? '👑 VIP' : 'Thường'}</span><span class="platform-label">${platform}</span></div></div>
                    <button class="btn btn-ghost btn-icon favorite-btn${favorite ? ' active' : ''}" type="button" data-action="favorite" aria-label="${favorite ? 'Bỏ khỏi' : 'Thêm vào'} Prompt yêu thích" title="${favorite ? 'Bỏ khỏi' : 'Thêm vào'} Prompt yêu thích"${favoriteBusy ? ' disabled' : ''}>★</button>
                </div>
                ${body}
                <div class="card-footer">
                    <div>${locked ? '<span class="vip-note">Cần tài khoản thành viên</span>' : '<button class="btn btn-ghost btn-sm" type="button" data-action="expand">Xem đầy đủ ↓</button>'}</div>
                    <div class="prompt-action-group">
                        ${locked ? '' : '<button class="btn btn-secondary btn-sm" type="button" data-action="copy">📋 Sao chép</button>'}
                        ${locked ? '' : '<button class="btn btn-use btn-sm" type="button" data-action="use">↗ Sử dụng</button>'}
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
            const authenticated = App.isAuthenticated();
            const result = authenticated ? await App.apiPost('get_prompts') : await App.apiGet('prompts');
            state.items = Array.isArray(result.data) ? result.data : [];
            if (authenticated) {
                state.favorites = new Set(Array.isArray(result.favorites) ? result.favorites.map(String) : []);
                const localFavorites = readLocalFavorites();
                if (localFavorites.size) {
                    try {
                        const synced = await App.apiPost('sync_favorites', { promptIds: [...localFavorites] }, { userAuth: true });
                        state.favorites = new Set(Array.isArray(synced.favorites) ? synced.favorites.map(String) : [...state.favorites, ...localFavorites]);
                        localStorage.removeItem(LOCAL_FAVORITES_KEY);
                        App.toast('Đã nhập các Prompt đã ghim vào tài khoản.', 'success');
                    } catch (_) {
                        localFavorites.forEach(id => state.favorites.add(id));
                        App.toast('Chưa đồng bộ được Prompt yêu thích. Vui lòng triển khai Code.gs mới.', 'error');
                    }
                }
            } else {
                state.favorites = readLocalFavorites();
            }
            updateCounts();
            render();
        } catch (error) {
            container.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span>${App.escapeHTML(error.message)}</div>`;
            App.toast('Không thể cập nhật dữ liệu Prompt.', 'error');
        } finally {
            container.removeAttribute('aria-busy');
        }
    }

    async function toggleFavorite(id) {
        const promptId = String(id);
        const wasFavorite = state.favorites.has(promptId);
        const nextFavorite = !wasFavorite;

        if (!App.isAuthenticated()) {
            if (nextFavorite) state.favorites.add(promptId); else state.favorites.delete(promptId);
            saveLocalFavorites(state.favorites);
            updateCounts();
            render();
            App.toast(nextFavorite
                ? 'Đã lưu yêu thích trên thiết bị. Đăng nhập để đồng bộ.'
                : 'Đã bỏ khỏi Prompt yêu thích.', 'success');
            return;
        }

        state.favoriteBusy.add(promptId);
        if (nextFavorite) state.favorites.add(promptId); else state.favorites.delete(promptId);
        updateCounts();
        render();
        try {
            const result = await App.apiPost('toggle_favorite', { promptId, favorite: nextFavorite }, { userAuth: true });
            if (Array.isArray(result.favorites)) state.favorites = new Set(result.favorites.map(String));
            App.toast(nextFavorite ? 'Đã thêm vào Prompt yêu thích.' : 'Đã bỏ khỏi Prompt yêu thích.', 'success');
        } catch (error) {
            if (wasFavorite) state.favorites.add(promptId); else state.favorites.delete(promptId);
            App.toast(error.message, 'error');
        } finally {
            state.favoriteBusy.delete(promptId);
            updateCounts();
            render();
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
            try { await copyText(String(readField(item, ['content', 'Content']))); App.toast('Đã sao chép Prompt.', 'success'); } catch (_) { App.toast('Không thể sao chép.', 'error'); }
        }
        if (actionButton.dataset.action === 'use') await usePrompt(item);
        if (actionButton.dataset.action === 'expand') {
            const box = card.querySelector('.prompt-box');
            const expanded = box.classList.toggle('expanded');
            actionButton.textContent = expanded ? 'Thu gọn ↑' : 'Xem đầy đủ ↓';
        }
        if (actionButton.dataset.action === 'favorite') {
            await toggleFavorite(id);
        }
        if (actionButton.dataset.action === 'edit') App.requireAdmin(() => openForm(id));
        if (actionButton.dataset.action === 'delete') App.requireAdmin(() => deletePrompt(id));
    });
    usePromptOptions.addEventListener('click', event => {
        const button = event.target.closest('[data-prompt-destination]');
        if (!button || !pendingUseItem) return;
        launchPrompt(pendingUseItem, button.dataset.promptDestination);
    });
    useOtherPlatformsButton.addEventListener('click', () => {
        const expanded = useOtherPromptOptions.hidden;
        useOtherPromptOptions.hidden = !expanded;
        useOtherPlatformsButton.classList.toggle('open', expanded);
        useOtherPlatformsButton.setAttribute('aria-expanded', String(expanded));
    });
    useOtherPromptOptions.addEventListener('click', event => {
        const button = event.target.closest('[data-prompt-destination]');
        if (!button || !pendingUseItem) return;
        launchPrompt(pendingUseItem, button.dataset.promptDestination);
    });

    window.addEventListener('app:auth-change', loadData);
    loadData();
})();
