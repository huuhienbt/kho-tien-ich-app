(function () {
    'use strict';

    App.init('home');

    const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
    const LUNAR_TIME_ZONE = 7;
    const now = new Date();
    const vietnamParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: VIETNAM_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const hour = vietnamParts.hour;
    const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    document.getElementById('heroTitle').innerHTML = `${greeting},<br>thầy Hiển!`;
    document.getElementById('calendarWeekday').textContent = new Intl.DateTimeFormat('vi-VN', {
        timeZone: VIETNAM_TIME_ZONE,
        weekday: 'long'
    }).format(now);
    document.getElementById('calendarDay').textContent = String(vietnamParts.day).padStart(2, '0');
    document.getElementById('calendarMonth').textContent = `Tháng ${String(vietnamParts.month).padStart(2, '0')}`;
    document.getElementById('calendarYear').textContent = vietnamParts.year;

    function jdFromDate(day, month, year) {
        const a = Math.floor((14 - month) / 12);
        const y = year + 4800 - a;
        const m = month + 12 * a - 3;
        let jd = day + Math.floor((153 * m + 2) / 5) + 365 * y
            + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
        if (jd < 2299161) {
            jd = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
        }
        return jd;
    }

    function newMoon(k) {
        const t = k / 1236.85;
        const t2 = t * t;
        const t3 = t2 * t;
        const radians = Math.PI / 180;
        let jd = 2415020.75933 + 29.53058868 * k + 0.0001178 * t2 - 0.000000155 * t3;
        jd += 0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * radians);
        const m = 359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3;
        const mPrime = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
        const f = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;
        let correction = (0.1734 - 0.000393 * t) * Math.sin(m * radians)
            + 0.0021 * Math.sin(2 * m * radians)
            - 0.4068 * Math.sin(mPrime * radians)
            + 0.0161 * Math.sin(2 * mPrime * radians)
            - 0.0004 * Math.sin(3 * mPrime * radians)
            + 0.0104 * Math.sin(2 * f * radians)
            - 0.0051 * Math.sin((m + mPrime) * radians)
            - 0.0074 * Math.sin((m - mPrime) * radians)
            + 0.0004 * Math.sin((2 * f + m) * radians)
            - 0.0004 * Math.sin((2 * f - m) * radians)
            - 0.0006 * Math.sin((2 * f + mPrime) * radians)
            + 0.0010 * Math.sin((2 * f - mPrime) * radians)
            + 0.0005 * Math.sin((2 * mPrime + m) * radians);
        const deltaT = t < -11
            ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
            : -0.000278 + 0.000265 * t + 0.000262 * t2;
        return jd + correction - deltaT;
    }

    function getNewMoonDay(k, timeZone) {
        return Math.floor(newMoon(k) + 0.5 + timeZone / 24);
    }

    function sunLongitude(jdn) {
        const t = (jdn - 2451545.0) / 36525;
        const t2 = t * t;
        const radians = Math.PI / 180;
        const m = 357.52910 + 35999.05030 * t - 0.0001559 * t2 - 0.00000048 * t * t2;
        const l0 = 280.46645 + 36000.76983 * t + 0.0003032 * t2;
        const delta = (1.914600 - 0.004817 * t - 0.000014 * t2) * Math.sin(radians * m)
            + (0.019993 - 0.000101 * t) * Math.sin(2 * radians * m)
            + 0.000290 * Math.sin(3 * radians * m);
        const longitude = (l0 + delta) * radians;
        return longitude - Math.PI * 2 * Math.floor(longitude / (Math.PI * 2));
    }

    function getSunLongitude(dayNumber, timeZone) {
        return Math.floor(sunLongitude(dayNumber - 0.5 - timeZone / 24) / Math.PI * 6);
    }

    function getLunarMonth11(year, timeZone) {
        const offset = jdFromDate(31, 12, year) - 2415021;
        const k = Math.floor(offset / 29.530588853);
        let newMoonDay = getNewMoonDay(k, timeZone);
        if (getSunLongitude(newMoonDay, timeZone) >= 9) newMoonDay = getNewMoonDay(k - 1, timeZone);
        return newMoonDay;
    }

    function getLeapMonthOffset(month11, timeZone) {
        const k = Math.floor((month11 - 2415021.076998695) / 29.530588853 + 0.5);
        let lastArc = 0;
        let i = 1;
        let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
        do {
            lastArc = arc;
            i += 1;
            arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
        } while (arc !== lastArc && i < 14);
        return i - 1;
    }

    function solarToLunar(day, month, year, timeZone) {
        const dayNumber = jdFromDate(day, month, year);
        const k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
        let monthStart = getNewMoonDay(k + 1, timeZone);
        if (monthStart > dayNumber) monthStart = getNewMoonDay(k, timeZone);
        let month11A = getLunarMonth11(year, timeZone);
        let month11B = month11A;
        let lunarYear;
        if (month11A >= monthStart) {
            lunarYear = year;
            month11A = getLunarMonth11(year - 1, timeZone);
        } else {
            lunarYear = year + 1;
            month11B = getLunarMonth11(year + 1, timeZone);
        }
        const lunarDay = dayNumber - monthStart + 1;
        const difference = Math.floor((monthStart - month11A) / 29);
        let lunarMonth = difference + 11;
        let isLeap = false;
        if (month11B - month11A > 365) {
            const leapDifference = getLeapMonthOffset(month11A, timeZone);
            if (difference >= leapDifference) {
                lunarMonth = difference + 10;
                if (difference === leapDifference) isLeap = true;
            }
        }
        if (lunarMonth > 12) lunarMonth -= 12;
        if (lunarMonth >= 11 && difference < 4) lunarYear -= 1;
        return { day: lunarDay, month: lunarMonth, year: lunarYear, isLeap };
    }

    const HEAVENLY_STEMS = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
    const EARTHLY_BRANCHES = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
    const LUNAR_MANSIONS = ['Giác', 'Cang', 'Đê', 'Phòng', 'Tâm', 'Vĩ', 'Cơ', 'Đẩu', 'Ngưu', 'Nữ', 'Hư', 'Nguy', 'Thất', 'Bích', 'Khuê', 'Lâu', 'Vị', 'Mão', 'Tất', 'Chủy', 'Sâm', 'Tỉnh', 'Quỷ', 'Liễu', 'Tinh', 'Trương', 'Dực', 'Chẩn'];
    const DAY_OFFICERS = ['Kiến', 'Trừ', 'Mãn', 'Bình', 'Định', 'Chấp', 'Phá', 'Nguy', 'Thành', 'Thu', 'Khai', 'Bế'];
    const NAP_AM_ELEMENTS = ['Kim', 'Hỏa', 'Mộc', 'Thổ', 'Kim', 'Hỏa', 'Thủy', 'Thổ', 'Kim', 'Mộc', 'Thủy', 'Thổ', 'Hỏa', 'Mộc', 'Thủy', 'Kim', 'Hỏa', 'Mộc', 'Thổ', 'Kim', 'Hỏa', 'Thủy', 'Thổ', 'Kim', 'Mộc', 'Thủy', 'Thổ', 'Hỏa', 'Mộc', 'Thủy'];

    function cycleName(stemIndex, branchIndex) {
        return `${HEAVENLY_STEMS[stemIndex]} ${EARTHLY_BRANCHES[branchIndex]}`;
    }

    function lunarYearName(year) {
        return cycleName((year + 6) % 10, (year + 8) % 12);
    }

    function lunarMonthName(month, year) {
        return cycleName((year * 12 + month + 3) % 10, (month + 1) % 12);
    }

    function lunarDayName(julianDay) {
        return cycleName((julianDay + 9) % 10, (julianDay + 1) % 12);
    }

    function dayElement(julianDay) {
        const sexagenaryIndex = (julianDay + 49) % 60;
        return NAP_AM_ELEMENTS[Math.floor(sexagenaryIndex / 2)];
    }

    function lunarMansion(julianDay) {
        return LUNAR_MANSIONS[(julianDay + 11) % 28];
    }

    function dayOfficer(julianDay, timeZone) {
        const longitudeDegrees = sunLongitude(julianDay - 0.5 - timeZone / 24) * 180 / Math.PI;
        const solarMonthBranch = (Math.floor(((longitudeDegrees - 315 + 360) % 360) / 30) + 2) % 12;
        const dayBranch = (julianDay + 1) % 12;
        return DAY_OFFICERS[(dayBranch - solarMonthBranch + 12) % 12];
    }

    const lunarDate = solarToLunar(vietnamParts.day, vietnamParts.month, vietnamParts.year, LUNAR_TIME_ZONE);
    const julianDay = jdFromDate(vietnamParts.day, vietnamParts.month, vietnamParts.year);
    const lunarDayText = String(lunarDate.day).padStart(2, '0');
    const lunarMonthText = String(lunarDate.month).padStart(2, '0');
    const lunarLeapText = lunarDate.isLeap ? ' (tháng nhuận)' : '';
    document.getElementById('currentLunarDate').textContent = `Âm lịch · ${lunarDayText}/${lunarMonthText}/${lunarDate.year}${lunarLeapText}`;
    document.getElementById('currentLunarCanChi').textContent = `Ngày ${lunarDayName(julianDay)} · ${lunarMonthName(lunarDate.month, lunarDate.year)} · ${lunarYearName(lunarDate.year)}`;
    document.getElementById('currentDayElement').textContent = dayElement(julianDay);
    document.getElementById('currentLunarMansion').textContent = lunarMansion(julianDay);
    document.getElementById('currentDayOfficer').textContent = dayOfficer(julianDay, LUNAR_TIME_ZONE);

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
