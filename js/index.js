(function () {
    'use strict';

    App.init('home');

    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const greeting = parts.hour < 11 ? 'Chào buổi sáng' : parts.hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

    const $ = id => document.getElementById(id);
    let overviewEpoch = 0;

    function renderGreeting() {
        const user = App.getUser();
        const accountName = App.isAdmin()
            ? 'thầy Hiển'
            : (App.isAuthenticated() ? String(user?.name || user?.email || 'Thành viên').trim() : '');
        $('heroTitle').textContent = accountName ? `${greeting}, ${accountName}!` : `${greeting}!`;
        $('homeDate').textContent = new Intl.DateTimeFormat('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric'
        }).format(new Date());
        const admin = App.isAdmin();
        $('homeGroupsShortcut').hidden = !admin;
        $('homePromptsShortcut').hidden = admin;
        $('homeLessonShortcut').classList.toggle('btn-light', !admin);
        $('homeLessonShortcut').classList.toggle('btn-glass', admin);
    }

    renderGreeting();
    window.addEventListener('app:auth-change', () => { renderGreeting(); loadAdminOverview(); });

    async function loadOverview() {
        try {
            const [promptResult, repairResult] = await Promise.all([
                App.apiGet('prompts'),
                App.apiGet('repairs')
            ]);
            const prompts = Array.isArray(promptResult.data) ? promptResult.data : [];
            const repairSummary = repairResult && repairResult.summary ? repairResult.summary : {};
            document.getElementById('statPrompts').textContent = prompts.length;
            document.getElementById('statPending').textContent = Number.isFinite(Number(repairSummary.pending)) ? Number(repairSummary.pending) : '—';
            document.getElementById('statWatch').textContent = Number.isFinite(Number(repairSummary.watch)) ? Number(repairSummary.watch) : '—';
        } catch (_) {
            ['statPrompts', 'statPending', 'statWatch'].forEach(id => {
                const node = document.getElementById(id);
                if (node) node.textContent = '—';
            });
        }
    }

    loadOverview();

    const escape = App.escapeHTML;
    const money = amount => `${Number(amount).toLocaleString('vi-VN')}đ`;
    const dateLabel = date => date.split('-').reverse().join('/');
    const periodLabel = month => month.split('-').reverse().join('/');
    const within = (member, date) => member.ngay_vao <= date && (!member.ngay_nghi || member.ngay_nghi >= date);
    function groupLink(group, month, tab, session = '') {
        const params = new URLSearchParams({ group: group.ma_nhom, month, tab });
        if (session) params.set('session', session);
        return `groups.html?${params}`;
    }

    function groupCard(group, month, view) {
        const name = escape(group.ten_nhom);
        if (!view) return `<article class="home-group-card"><div class="home-group-top"><h3>${name}</h3></div><p class="home-group-period">Kỳ ${escape(periodLabel(month))}</p><p class="home-group-unavailable">Chưa tải được số liệu nhóm này.</p><a class="btn btn-secondary btn-sm" href="${escape(groupLink(group, month, 'attendance'))}">Mở nhóm học →</a></article>`;
        const marks = new Map(view.marks.map(mark => [`${mark.ma_buoi}|${mark.ma_hoc_sinh}`, mark.trang_thai]));
        const sessions = view.sessions.filter(session => session.trang_thai !== 'da_huy').sort((a, b) => a.ngay_hoc.localeCompare(b.ngay_hoc));
        const unmarked = session => view.roster.filter(member => within(member, session.ngay_hoc)).filter(member => !['co_mat', 'vang'].includes(marks.get(`${session.ma_buoi}|${member.ma_hoc_sinh}`))).length;
        const pending = view.closed ? [] : sessions.filter(session => session.ngay_hoc <= view.today && view.roster.some(member => within(member, session.ngay_hoc)) && (session.trang_thai === 'du_kien' || unmarked(session) > 0));
        const today = sessions.find(session => session.ngay_hoc === view.today);
        const next = sessions.find(session => session.ngay_hoc > view.today);
        const balance = view.fees.reduce((total, fee) => total + Math.max(0, Number(fee.balance) || 0), 0);
        const target = today || pending[0];
        const todayHint = today ? (view.closed ? 'Đã chốt kỳ' : unmarked(today) ? `Còn ${unmarked(today)} học sinh chưa điểm danh` : today.trang_thai === 'du_kien' ? 'Cần xác nhận buổi học' : 'Đã điểm danh đầy đủ') : '';
        const sessionHint = today ? `Hôm nay · ${todayHint}` : next ? `Buổi tiếp theo · ${dateLabel(next.ngay_hoc)}` : 'Chưa xếp buổi tiếp theo trong kỳ';
        return `<article class="home-group-card">
            <div class="home-group-top"><div><h3>${name}</h3><p class="home-group-period">Kỳ ${escape(periodLabel(month))}</p></div><span class="home-group-progress">${Number(view.period.completed)}${view.period.size ? '/' + Number(view.period.size) : ''} buổi</span></div>
            <p class="home-group-next${today ? ' today' : ''}">${escape(sessionHint)}</p>
            <dl class="home-group-metrics"><div><dt>Buổi cần điểm danh</dt><dd class="${pending.length ? 'has-pending' : ''}">${pending.length}</dd></div><div><dt>Còn thu của kỳ</dt><dd class="${balance ? 'has-balance' : ''}">${escape(money(balance))}</dd></div></dl>
            <div class="home-group-actions"><a class="btn btn-primary btn-sm" href="${escape(groupLink(group, month, 'attendance', target?.ma_buoi))}">Điểm danh</a><a class="btn btn-secondary btn-sm" href="${escape(groupLink(group, month, 'fees'))}">Học phí</a></div>
        </article>`;
    }

    async function loadAdminOverview() {
        const epoch = ++overviewEpoch;
        const token = App.getAdminToken();
        const current = () => epoch === overviewEpoch && App.isAdmin() && token === App.getAdminToken();
        const panel = $('homeAdminOverview');
        panel.hidden = !App.isAdmin();
        panel.setAttribute('aria-busy', 'false');
        $('homeGroupCards').replaceChildren();
        $('homeGroupsStatus').textContent = '';
        $('homeGroupsStatus').classList.remove('error');
        $('homeGroupsReload').disabled = false;
        if (panel.hidden) return;
        panel.setAttribute('aria-busy', 'true');
        $('homeGroupsReload').disabled = true;
        $('homeGroupsStatus').textContent = 'Đang tải nhóm học…';
        try {
            const boot = (await App.apiPost('nh_boot', {}, { auth: true, timeoutMs: 15000 })).data;
            if (!current()) return;
            if (!Array.isArray(boot?.groups)) throw new Error('Chưa tải được danh sách nhóm học.');
            const groups = boot.groups.filter(group => group.trang_thai === 'dang_hoc');
            const results = await Promise.allSettled(groups.map(async group => {
                const month = group.ky_hien_tai || boot.today.slice(0, 7);
                const view = (await App.apiPost('nh_view', { groupId: group.ma_nhom, month }, { auth: true, timeoutMs: 15000 })).data;
                if (!view?.period || !['marks', 'sessions', 'roster', 'fees'].every(key => Array.isArray(view[key]))) throw new Error('Chưa tải được số liệu nhóm.');
                return view;
            }));
            if (!current()) return;
            $('homeGroupCards').innerHTML = groups.map((group, index) => groupCard(group, group.ky_hien_tai || boot.today.slice(0, 7), results[index].status === 'fulfilled' ? results[index].value : null)).join('');
            $('homeGroupsStatus').textContent = groups.length ? (results.some(result => result.status === 'rejected') ? 'Một số nhóm chưa tải được. Bấm Tải lại để thử lại.' : '') : 'Chưa có nhóm đang học. Mở Nhóm học để tạo nhóm đầu tiên.';
        } catch (_) {
            if (!current()) return;
            $('homeGroupsStatus').textContent = 'Chưa tải được nhóm học. Bấm Tải lại để thử lại.';
            $('homeGroupsStatus').classList.add('error');
        } finally {
            if (current()) { panel.setAttribute('aria-busy', 'false'); $('homeGroupsReload').disabled = false; }
        }
    }
    $('homeGroupsReload').addEventListener('click', loadAdminOverview);
    loadAdminOverview();
})();
