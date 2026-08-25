(function () {
    'use strict';

    App.init('repairs');

    const state = { items: [], query: '', status: 'all', editId: null };
    const container = document.getElementById('repairContainer');

    function parseDateObject(value) {
        if (!value) return null;
        if (value instanceof Date) return value;
        const raw = String(value).trim();
        const vi = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        const date = vi ? new Date(Number(vi[3]), Number(vi[2]) - 1, Number(vi[1])) : new Date(raw);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDate(value) {
        const date = parseDateObject(value);
        return date ? new Intl.DateTimeFormat('vi-VN').format(date) : (value || '—');
    }

    function toInputDate(value) {
        const date = parseDateObject(value);
        if (!date) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function numberValue(value) {
        const cleaned = String(value ?? '').replace(/[^0-9-]/g, '');
        const number = Number(cleaned);
        return Number.isFinite(number) ? number : 0;
    }

    function formatMoney(value) {
        return `${numberValue(value).toLocaleString('vi-VN')} đ`;
    }

    function warrantyInfo(dateValue, warrantyValue) {
        const warranty = String(warrantyValue || '').trim();
        const date = parseDateObject(dateValue);
        if (!date || !warranty || warranty.toLocaleLowerCase('vi') === 'không' || warranty === '0') return { text: 'Không có', className: '' };
        const match = warranty.match(/(\d+)/);
        if (!match) return { text: warranty, className: '' };
        let months = Number(match[1]);
        if (warranty.toLocaleLowerCase('vi').includes('năm')) months *= 12;
        const end = new Date(date);
        end.setMonth(end.getMonth() + months);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.ceil((end - today) / 86400000);
        const formatted = new Intl.DateTimeFormat('vi-VN').format(end);
        if (days < 0) return { text: `${formatted} · Đã hết hạn`, className: 'warranty-expired' };
        if (days <= 30) return { text: `${formatted} · Còn ${days} ngày`, className: 'warranty-warning' };
        return { text: formatted, className: 'warranty-good' };
    }

    function statusClass(status) {
        if (status === 'Đã hoàn thành') return 'status-done';
        if (status === 'Cần theo dõi') return 'status-watch';
        if (status === 'Đang chờ linh kiện') return 'status-waiting';
        return 'status-default';
    }

    function updateSummary() {
        document.getElementById('repairTotal').textContent = state.items.length;
        document.getElementById('repairPending').textContent = state.items.filter(item => item.status !== 'Đã hoàn thành').length;
        document.getElementById('repairWatch').textContent = state.items.filter(item => item.status === 'Cần theo dõi').length;
        document.getElementById('repairCost').textContent = formatMoney(state.items.reduce((total, item) => total + numberValue(item.cost), 0));
    }

    function filteredItems() {
        const query = state.query.toLocaleLowerCase('vi');
        return [...state.items].filter(item => {
            const haystack = `${item.task || ''} ${item.location || ''} ${item.vendor || ''} ${item.reporter || ''} ${item.note || ''}`.toLocaleLowerCase('vi');
            return (state.status === 'all' || item.status === state.status) && (!query || haystack.includes(query));
        }).sort((a, b) => {
            const aDate = parseDateObject(a.date)?.getTime() || 0;
            const bDate = parseDateObject(b.date)?.getTime() || 0;
            return bDate - aDate;
        });
    }

    function render() {
        const items = filteredItems();
        if (!items.length) {
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">🧰</span>Không tìm thấy hạng mục sửa chữa phù hợp.</div>';
            return;
        }
        container.innerHTML = items.map(item => {
            const id = App.escapeHTML(item.id);
            const warranty = warrantyInfo(item.date, item.warranty);
            const imageUrl = App.safeUrl(item.image_url);
            return `<article class="card repair-card" data-id="${id}">
                <div class="card-header">
                    <h2 class="card-title">${App.escapeHTML(item.task || 'Chưa nhập công việc')}</h2>
                    <span class="status-badge ${statusClass(item.status)}">${App.escapeHTML(item.status || 'Chưa rõ')}</span>
                </div>
                <div class="repair-grid">
                    <div class="repair-detail"><span class="repair-detail-label">Ngày ghi nhận</span><span class="repair-detail-value">${App.escapeHTML(formatDate(item.date))}</span></div>
                    <div class="repair-detail"><span class="repair-detail-label">Lớp/phòng</span><span class="repair-detail-value">${App.escapeHTML(item.location || '—')}</span></div>
                    <div class="repair-detail"><span class="repair-detail-label">Chi phí</span><span class="repair-detail-value">${App.escapeHTML(formatMoney(item.cost))}</span></div>
                    <div class="repair-detail"><span class="repair-detail-label">Đơn vị sửa/mua</span><span class="repair-detail-value">${App.escapeHTML(item.vendor || '—')}</span></div>
                    <div class="repair-detail"><span class="repair-detail-label">Bảo hành</span><span class="repair-detail-value">${App.escapeHTML(item.warranty || 'Không')}</span></div>
                    <div class="repair-detail"><span class="repair-detail-label">Thời hạn bảo hành</span><span class="repair-detail-value ${warranty.className}">${App.escapeHTML(warranty.text)}</span></div>
                </div>
                ${item.note ? `<p class="repair-note">📝 ${App.escapeHTML(item.note)}</p>` : ''}
                <div class="card-footer">
                    <div>${imageUrl ? `<a class="btn btn-secondary btn-sm" href="${App.escapeHTML(imageUrl)}" target="_blank" rel="noopener noreferrer">📎 Xem ảnh</a>` : `<span class="platform-label">Người báo: ${App.escapeHTML(item.reporter || '—')}</span>`}</div>
                    <div style="display:flex;gap:7px"><button class="btn btn-secondary btn-sm admin-only" type="button" data-action="edit">✏️ Sửa</button><button class="btn btn-danger btn-sm admin-only" type="button" data-action="delete">🗑️ Xóa</button></div>
                </div>
            </article>`;
        }).join('');
    }

    async function loadData() {
        const cache = localStorage.getItem('cache_repairs');
        if (cache) {
            try { state.items = JSON.parse(cache); updateSummary(); render(); } catch (_) { localStorage.removeItem('cache_repairs'); }
        }
        try {
            const result = await App.apiGet('repairs');
            state.items = Array.isArray(result.data) ? result.data : [];
            localStorage.setItem('cache_repairs', JSON.stringify(state.items));
            updateSummary();
            render();
        } catch (error) {
            if (!state.items.length) container.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span>${App.escapeHTML(error.message)}</div>`;
            App.toast('Không thể cập nhật nhật ký mới.', 'error');
        }
    }

    function openForm(id = null) {
        state.editId = id;
        const item = id ? state.items.find(entry => String(entry.id) === String(id)) : null;
        document.getElementById('repairModalTitle').textContent = item ? 'Sửa báo cáo sửa chữa' : 'Thêm báo cáo sửa chữa';
        document.getElementById('rTask').value = item?.task || '';
        document.getElementById('rDate').value = item ? toInputDate(item.date) : toInputDate(new Date());
        document.getElementById('rLocation').value = item?.location || '';
        document.getElementById('rCost').value = item ? numberValue(item.cost) : '';
        document.getElementById('rStatus').value = item?.status || 'Đang chờ linh kiện';
        document.getElementById('rWarranty').value = item?.warranty || 'Không';
        document.getElementById('rVendor').value = item?.vendor || '';
        document.getElementById('rReporter').value = item?.reporter || '';
        document.getElementById('rImageUrl').value = item?.image_url || '';
        document.getElementById('rNote').value = item?.note || '';
        App.openModal('repairModal');
    }

    async function saveRepair(event) {
        event.preventDefault();
        const button = document.getElementById('saveRepairButton');
        const original = button.textContent;
        const data = {
            date: document.getElementById('rDate').value,
            task: document.getElementById('rTask').value.trim(),
            location: document.getElementById('rLocation').value.trim(),
            cost: document.getElementById('rCost').value,
            status: document.getElementById('rStatus').value,
            warranty: document.getElementById('rWarranty').value,
            vendor: document.getElementById('rVendor').value.trim(),
            reporter: document.getElementById('rReporter').value.trim(),
            asset_id: '',
            image_url: document.getElementById('rImageUrl').value.trim(),
            note: document.getElementById('rNote').value.trim()
        };
        if (state.editId) data.id = state.editId;
        button.disabled = true;
        button.textContent = 'Đang lưu…';
        try {
            await App.apiPost(state.editId ? 'update' : 'create', data, { auth: true, sheetType: 'repairs' });
            App.closeModal('repairModal');
            state.editId = null;
            localStorage.removeItem('cache_repairs');
            App.toast('Đã lưu báo cáo.', 'success');
            await loadData();
        } catch (error) {
            App.toast(error.message, 'error');
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    async function deleteRepair(id) {
        if (!confirm('Xóa báo cáo sửa chữa này?')) return;
        try {
            await App.apiPost('delete', { id }, { auth: true, sheetType: 'repairs' });
            state.items = state.items.filter(item => String(item.id) !== String(id));
            localStorage.setItem('cache_repairs', JSON.stringify(state.items));
            updateSummary();
            render();
            App.toast('Đã xóa báo cáo.', 'success');
        } catch (error) {
            App.toast(error.message, 'error');
        }
    }

    document.getElementById('addRepairButton').addEventListener('click', () => App.requireAdmin(() => openForm()));
    document.getElementById('repairForm').addEventListener('submit', saveRepair);
    document.getElementById('repairSearch').addEventListener('input', App.debounce(event => { state.query = event.target.value.trim(); render(); }));
    document.getElementById('repairStatus').addEventListener('change', event => { state.status = event.target.value; render(); });
    container.addEventListener('click', event => {
        const action = event.target.closest('[data-action]');
        const card = event.target.closest('.repair-card');
        if (!action || !card) return;
        const id = card.dataset.id;
        if (action.dataset.action === 'edit') App.requireAdmin(() => openForm(id));
        if (action.dataset.action === 'delete') App.requireAdmin(() => deleteRepair(id));
    });

    loadData();
})();
