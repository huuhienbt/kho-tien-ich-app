(function () {
    'use strict';

    App.init('home');

    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    document.getElementById('heroTitle').innerHTML = `${greeting},<br>thầy Hiển!`;
    document.getElementById('currentDate').textContent = new Intl.DateTimeFormat('vi-VN', {
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(now);

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
            ['statPrompts', 'statPending', 'statWatch'].forEach(id => document.getElementById(id).textContent = '—');
        }
    }

    loadOverview();
})();
