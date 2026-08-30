(function () {
    'use strict';

    App.init('home');

    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const greeting = parts.hour < 11 ? 'Chào buổi sáng' : parts.hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

    function renderGreeting() {
        const user = App.getUser();
        const accountName = App.isAdmin()
            ? 'thầy Hiển'
            : (App.isAuthenticated() ? String(user?.name || user?.email || 'Thành viên').trim() : '');
        document.getElementById('heroTitle').innerHTML = accountName
            ? `${App.escapeHTML(greeting)},<br>${App.escapeHTML(accountName)}!`
            : `${App.escapeHTML(greeting)}!`;
    }

    renderGreeting();
    window.addEventListener('app:auth-change', renderGreeting);

    async function loadOverview() {
        try {
            const [promptResult, repairResult] = await Promise.all([
                App.apiGet('prompts'),
                App.apiGet('repairs')
            ]);
            const prompts = Array.isArray(promptResult.data) ? promptResult.data : [];
            const repairs = Array.isArray(repairResult.data) ? repairResult.data : [];
            document.getElementById('statPrompts').textContent = prompts.length;
            document.getElementById('statPending').textContent = repairs.filter(item => item.status !== 'Đã hoàn thành').length;
            document.getElementById('statWatch').textContent = repairs.filter(item => item.status === 'Cần theo dõi').length;
        } catch (_) {
            ['statPrompts', 'statPending', 'statWatch'].forEach(id => {
                const node = document.getElementById(id);
                if (node) node.textContent = '—';
            });
        }
    }

    loadOverview();
})();
