(function () {
    'use strict';
    App.init('home');
    const $ = id => document.getElementById(id);
    const hour = Number(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hourCycle: 'h23'
    }).format(new Date()));
    const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    function renderGreeting() {
        const user = App.getUser();
        const accountName = App.isAdmin() ? 'thầy Hiển' : App.isAuthenticated() ? String(user?.name || user?.email || 'Thành viên').trim() : '';
        $('heroTitle').textContent = accountName ? `${greeting}, ${accountName}!` : `${greeting}!`;
        $('homeDate').textContent = new Intl.DateTimeFormat('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric'
        }).format(new Date());
    }
    renderGreeting();
    window.addEventListener('app:auth-change', renderGreeting);
    async function loadOverview() {
        try {
            const counts = (await App.apiGet('overview')).data;
            for (const [id, key] of [['statPrompts', 'prompts'], ['statPending', 'pending'], ['statWatch', 'watch']]) {
                const value = counts?.[key];
                $(id).textContent = Number.isSafeInteger(value) && value >= 0 ? value : '—';
            }
        } catch (_) {
            ['statPrompts', 'statPending', 'statWatch'].forEach(id => { $(id).textContent = '—'; });
        }
    }
    loadOverview();
})();
