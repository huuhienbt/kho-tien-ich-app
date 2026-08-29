(function () {
    'use strict';

    App.init('calendar');

    const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
    const LUNAR_TIME_ZONE = 7;
    const now = new Date();
    const vietnamParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: VIETNAM_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const todayDate = {
        day: vietnamParts.day,
        month: vietnamParts.month,
        year: vietnamParts.year
    };
    let selectedDate = { ...todayDate };

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
    const STEM_ELEMENT_KEYS = ['moc', 'moc', 'hoa', 'hoa', 'tho', 'tho', 'kim', 'kim', 'thuy', 'thuy'];
    const BRANCH_ELEMENT_KEYS = ['thuy', 'tho', 'moc', 'moc', 'tho', 'hoa', 'hoa', 'tho', 'kim', 'kim', 'tho', 'thuy'];
    const ELEMENT_NAME_KEYS = { 'Mộc': 'moc', 'Hỏa': 'hoa', 'Thổ': 'tho', 'Kim': 'kim', 'Thủy': 'thuy' };
    const LUNAR_MANSIONS = ['Giác', 'Cang', 'Đê', 'Phòng', 'Tâm', 'Vĩ', 'Cơ', 'Đẩu', 'Ngưu', 'Nữ', 'Hư', 'Nguy', 'Thất', 'Bích', 'Khuê', 'Lâu', 'Vị', 'Mão', 'Tất', 'Chủy', 'Sâm', 'Tỉnh', 'Quỷ', 'Liễu', 'Tinh', 'Trương', 'Dực', 'Chẩn'];
    const DAY_OFFICERS = ['Kiến', 'Trừ', 'Mãn', 'Bình', 'Định', 'Chấp', 'Phá', 'Nguy', 'Thành', 'Thu', 'Khai', 'Bế'];
    const NAP_AM_ELEMENTS = ['Kim', 'Hỏa', 'Mộc', 'Thổ', 'Kim', 'Hỏa', 'Thủy', 'Thổ', 'Kim', 'Mộc', 'Thủy', 'Thổ', 'Hỏa', 'Mộc', 'Thủy', 'Kim', 'Hỏa', 'Mộc', 'Thổ', 'Kim', 'Hỏa', 'Thủy', 'Thổ', 'Kim', 'Mộc', 'Thủy', 'Thổ', 'Hỏa', 'Mộc', 'Thủy'];
    const NAP_AM_NAMES = [
        'Hải Trung Kim', 'Lư Trung Hỏa', 'Đại Lâm Mộc', 'Lộ Bàng Thổ', 'Kiếm Phong Kim',
        'Sơn Đầu Hỏa', 'Giản Hạ Thủy', 'Thành Đầu Thổ', 'Bạch Lạp Kim', 'Dương Liễu Mộc',
        'Tuyền Trung Thủy', 'Ốc Thượng Thổ', 'Tích Lịch Hỏa', 'Tùng Bách Mộc', 'Trường Lưu Thủy',
        'Sa Trung Kim', 'Sơn Hạ Hỏa', 'Bình Địa Mộc', 'Bích Thượng Thổ', 'Kim Bạch Kim',
        'Phú Đăng Hỏa', 'Thiên Hà Thủy', 'Đại Trạch Thổ', 'Thoa Xuyến Kim', 'Tang Đố Mộc',
        'Đại Khê Thủy', 'Sa Trung Thổ', 'Thiên Thượng Hỏa', 'Thạch Lựu Mộc', 'Đại Hải Thủy'
    ];
    const ELEMENT_LABELS = { moc: 'Mộc', hoa: 'Hỏa', tho: 'Thổ', kim: 'Kim', thuy: 'Thủy' };
    const ELEMENT_GENERATES = { moc: 'hoa', hoa: 'tho', tho: 'kim', kim: 'thuy', thuy: 'moc' };
    const ELEMENT_CONTROLS = { moc: 'tho', tho: 'thuy', thuy: 'hoa', hoa: 'kim', kim: 'moc' };
    const STEM_HARMONY_PAIRS = new Set(['0-5', '1-6', '2-7', '3-8', '4-9']);
    const BRANCH_RELATIONS = {
        harmony: new Set(['0-1', '2-11', '3-10', '4-9', '5-8', '6-7']),
        clash: new Set(['0-6', '1-7', '2-8', '3-9', '4-10', '5-11']),
        harm: new Set(['0-7', '1-6', '2-5', '3-4', '8-11', '9-10']),
        punishment: new Set(['0-3', '1-7', '1-10', '2-5', '2-8', '5-8', '7-10']),
        break: new Set(['0-9', '1-4', '2-11', '3-6', '5-8', '7-10'])
    };
    const SELF_PUNISHMENT_BRANCHES = new Set([4, 6, 9, 11]);
    const BIRTH_YEAR_STORAGE_KEY = 'egv-calendar-birth-year';
    const AGE_READING_WEIGHTS = {
        day: { element: 0.20, stem: 0.12, branch: 0.18, total: 0.50 },
        month: { element: 0.10, stem: 0.07, branch: 0.13, total: 0.30 },
        year: { element: 0.07, stem: 0.05, branch: 0.08, total: 0.20 }
    };
    let currentAgeReading = null;
    let currentAgeReadingKey = '';
    let ageGeminiBusy = false;

    function modulo(value, divisor) {
        return ((value % divisor) + divisor) % divisor;
    }

    function pairKey(first, second) {
        return first < second ? `${first}-${second}` : `${second}-${first}`;
    }

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

    function cycleNameHtml(stemIndex, branchIndex) {
        const stem = ((stemIndex % 10) + 10) % 10;
        const branch = ((branchIndex % 12) + 12) % 12;
        return `<span class="calendar-element element-${STEM_ELEMENT_KEYS[stem]}">${HEAVENLY_STEMS[stem]}</span> <span class="calendar-element element-${BRANCH_ELEMENT_KEYS[branch]}">${EARTHLY_BRANCHES[branch]}</span>`;
    }

    function lunarYearNameHtml(year) {
        return cycleNameHtml((year + 6) % 10, (year + 8) % 12);
    }

    function lunarMonthNameHtml(month, year) {
        return cycleNameHtml((year * 12 + month + 3) % 10, (month + 1) % 12);
    }

    function lunarDayNameHtml(julianDay) {
        return cycleNameHtml((julianDay + 9) % 10, (julianDay + 1) % 12);
    }

    function dayElement(julianDay) {
        const sexagenaryIndex = (julianDay + 49) % 60;
        return NAP_AM_ELEMENTS[Math.floor(sexagenaryIndex / 2)];
    }

    function cycleProfile(stemIndex, branchIndex) {
        let cycleIndex = 0;
        for (let index = 0; index < 60; index += 1) {
            if (index % 10 === stemIndex && index % 12 === branchIndex) {
                cycleIndex = index;
                break;
            }
        }
        const napAmIndex = Math.floor(cycleIndex / 2);
        return {
            cycleIndex,
            stemIndex,
            branchIndex,
            stem: HEAVENLY_STEMS[stemIndex],
            branch: EARTHLY_BRANCHES[branchIndex],
            name: cycleName(stemIndex, branchIndex),
            elementKey: ELEMENT_NAME_KEYS[NAP_AM_ELEMENTS[napAmIndex]],
            element: NAP_AM_ELEMENTS[napAmIndex],
            napAm: NAP_AM_NAMES[napAmIndex]
        };
    }

    function yearProfile(year) {
        const cycleIndex = modulo(year - 1984, 60);
        return Object.assign({ year }, cycleProfile(cycleIndex % 10, cycleIndex % 12));
    }

    function dayProfile(date) {
        const julianDay = jdFromDate(date.day, date.month, date.year);
        const cycleIndex = modulo(julianDay + 49, 60);
        return Object.assign({ julianDay }, cycleProfile(cycleIndex % 10, cycleIndex % 12));
    }

    function monthProfile(lunarDate) {
        const stemIndex = modulo(lunarDate.year * 12 + lunarDate.month + 3, 10);
        const branchIndex = modulo(lunarDate.month + 1, 12);
        return Object.assign({ lunarMonth: lunarDate.month, lunarYear: lunarDate.year }, cycleProfile(stemIndex, branchIndex));
    }

    function makeRelation(label, tone, value, description) {
        return { label, tone, value, description };
    }

    function compareElements(contextKey, ageKey, contextLabel) {
        const contextElement = ELEMENT_LABELS[contextKey];
        const ageElement = ELEMENT_LABELS[ageKey];
        if (contextKey === ageKey) {
            return makeRelation('Tỷ hòa', 'positive', 65, `${contextLabel} và mệnh tuổi cùng hành ${ageElement}, ở trạng thái tương hòa.`);
        }
        if (ELEMENT_GENERATES[contextKey] === ageKey) {
            return makeRelation('Tương sinh', 'positive', 80, `${contextLabel} hành ${contextElement} sinh mệnh ${ageElement}, tạo một phần hỗ trợ.`);
        }
        if (ELEMENT_GENERATES[ageKey] === contextKey) {
            return makeRelation('Sinh xuất', 'caution', 35, `Mệnh ${ageElement} sinh hành ${contextElement} của ${contextLabel.toLowerCase()}, dễ hao tâm và tốn sức.`);
        }
        if (ELEMENT_CONTROLS[contextKey] === ageKey) {
            return makeRelation('Tương khắc', 'negative', 10, `${contextLabel} hành ${contextElement} khắc mệnh ${ageElement}, tạo áp lực cho bản mệnh.`);
        }
        return makeRelation('Khắc xuất', 'caution', 35, `Mệnh ${ageElement} khắc hành ${contextElement} của ${contextLabel.toLowerCase()}, có thể chế ngự nhưng dễ tiêu hao sức lực.`);
    }

    function compareStems(context, age, contextLabel) {
        const key = pairKey(context.stemIndex, age.stemIndex);
        if (context.stemIndex === age.stemIndex) {
            return makeRelation('Tương hòa', 'positive', 65, `Can ${age.stem} của tuổi gặp can ${context.stem} của ${contextLabel.toLowerCase()}, hai can đồng hành.`);
        }
        if (STEM_HARMONY_PAIRS.has(key)) {
            return makeRelation('Tương hợp', 'positive', 95, `Can ${age.stem} gặp can ${context.stem} thuộc Ngũ hợp, thuận cho sự phối hợp.`);
        }
        const relation = compareElements(STEM_ELEMENT_KEYS[context.stemIndex], STEM_ELEMENT_KEYS[age.stemIndex], contextLabel);
        if (relation.label === 'Tương sinh') relation.label = 'Sinh nhập';
        if (relation.label === 'Tương khắc') relation.label = 'Khắc nhập';
        relation.description = `Can ${age.stem} của tuổi gặp can ${context.stem} của ${contextLabel.toLowerCase()}: ${relation.label.toLowerCase()}.`;
        return relation;
    }

    function compareBranches(context, age, contextLabel) {
        if (context.branchIndex === age.branchIndex) {
            if (SELF_PUNISHMENT_BRANCHES.has(context.branchIndex)) {
                return makeRelation('Tự hình', 'caution', 25, `Chi ${age.branch} trùng chi ${context.branch}, tạo thế tự hình theo cách luận phổ biến.`);
            }
            return makeRelation('Đồng chi', 'neutral', 50, `Chi ${age.branch} của tuổi trùng chi ${context.branch} của ${contextLabel.toLowerCase()}; không phải Lục hợp và tạm xét trung tính.`);
        }

        const key = pairKey(context.branchIndex, age.branchIndex);
        const specialRelations = [
            ['harmony', 'Lục hợp', 'positive', 95, 'tạo thế Lục hợp, là một điểm hỗ trợ'],
            ['clash', 'Tương xung', 'negative', 10, 'phạm tương xung, dễ phát sinh thay đổi hoặc bất đồng'],
            ['harm', 'Tương hại', 'negative', 20, 'phạm tương hại, nên đề phòng hiểu lầm và việc phát sinh'],
            ['punishment', 'Tương hình', 'caution', 25, 'phạm tương hình, dễ có va chạm hoặc áp lực'],
            ['break', 'Tương phá', 'caution', 25, 'phạm tương phá, nên thận trọng với kế hoạch chưa chắc chắn']
        ];
        const matched = specialRelations.find(([type]) => BRANCH_RELATIONS[type].has(key));
        if (matched) {
            return makeRelation(matched[1], matched[2], matched[3], `Chi ${age.branch} gặp chi ${context.branch} của ${contextLabel.toLowerCase()} ${matched[4]}.`);
        }

        const relation = compareElements(BRANCH_ELEMENT_KEYS[context.branchIndex], BRANCH_ELEMENT_KEYS[age.branchIndex], contextLabel);
        relation.description = `Chi ${age.branch} gặp chi ${context.branch} của ${contextLabel.toLowerCase()}: ${relation.label.toLowerCase()} theo ngũ hành của Địa chi.`;
        return relation;
    }

    function calculatePeriodReading(key, label, profile, age) {
        const relations = {
            element: compareElements(profile.elementKey, age.elementKey, label),
            stem: compareStems(profile, age, label),
            branch: compareBranches(profile, age, label)
        };
        const weights = AGE_READING_WEIGHTS[key];
        const contribution = relations.element.value * weights.element
            + relations.stem.value * weights.stem
            + relations.branch.value * weights.branch;
        return {
            key,
            label,
            profile,
            relations,
            contribution,
            score: Math.round(contribution / weights.total)
        };
    }

    function scoreLevel(score) {
        if (score < 30) return { label: 'Không thuận', className: 'score-low' };
        if (score < 45) return { label: 'Cần thận trọng', className: 'score-caution' };
        if (score < 60) return { label: 'Trung bình', className: 'score-medium' };
        if (score < 75) return { label: 'Khá thuận', className: 'score-good' };
        if (score < 90) return { label: 'Tốt', className: 'score-good' };
        return { label: 'Rất tốt', className: 'score-good' };
    }

    function readingSummary(score) {
        if (score >= 75) {
            return {
                impact: 'Ngày, tháng và năm tạo được nhiều điểm hỗ trợ cho tuổi đã chọn.',
                note: 'Có thể ưu tiên công việc quan trọng nhưng vẫn cần chuẩn bị đầy đủ và kiểm tra chi tiết.'
            };
        }
        if (score >= 60) {
            return {
                impact: 'Tổng thể khá thuận, dù vẫn còn một vài yếu tố cần cân nhắc.',
                note: 'Nên tận dụng các điểm hỗ trợ và chủ động xử lý phần chưa tương hợp.'
            };
        }
        if (score >= 45) {
            return {
                impact: 'Ngày có cả yếu tố thuận và nghịch, kết quả phụ thuộc nhiều vào sự chuẩn bị.',
                note: 'Phù hợp với công việc thường ngày; nên thận trọng hơn nếu thực hiện việc quan trọng.'
            };
        }
        if (score >= 30) {
            return {
                impact: 'Các yếu tố bất lợi chiếm ưu thế, dễ hao tâm, tốn sức hoặc công việc tiến triển chậm.',
                note: 'Nên chuẩn bị kỹ, kiểm tra giấy tờ và tránh quyết định việc lớn quá vội.'
            };
        }
        return {
            impact: 'Nhiều quan hệ chưa thuận với tuổi đã chọn và có thể tạo áp lực rõ rệt.',
            note: 'Nếu có thể nên cân nhắc ngày khác; trường hợp vẫn tiến hành cần giữ bình tĩnh và dự phòng rủi ro.'
        };
    }

    function setCompactRelation(id, relation) {
        const badge = document.getElementById(id);
        badge.textContent = relation.label;
        badge.className = `age-relation-badge tone-${relation.tone}`;
        badge.title = relation.description;
    }

    function renderPeriodReading(prefix, reading) {
        document.getElementById(`age${prefix}Title`).textContent = `${reading.label} ${reading.profile.name}`;
        document.getElementById(`age${prefix}Score`).textContent = `${reading.score}/100`;
        setCompactRelation(`age${prefix}Element`, reading.relations.element);
        setCompactRelation(`age${prefix}Stem`, reading.relations.stem);
        setCompactRelation(`age${prefix}Branch`, reading.relations.branch);
    }

    function clearGeminiReading() {
        const status = document.getElementById('ageGeminiStatus');
        const result = document.getElementById('ageGeminiResult');
        if (status) {
            status.hidden = true;
            status.className = 'age-gemini-status';
            status.textContent = '';
        }
        if (result) result.hidden = true;
    }

    function renderAgeReading() {
        const selector = document.getElementById('birthYearSelect');
        if (!selector) return;
        document.getElementById('ageReadingSelectedDate').textContent = `${String(selectedDate.day).padStart(2, '0')}/${String(selectedDate.month).padStart(2, '0')}/${selectedDate.year}`;
        if (!App.isAuthenticated()) {
            currentAgeReading = null;
            document.getElementById('ageReadingEmpty').hidden = true;
            document.getElementById('ageReadingResult').hidden = true;
            clearGeminiReading();
            return;
        }

        const year = Number(selector.value);
        const empty = document.getElementById('ageReadingEmpty');
        const result = document.getElementById('ageReadingResult');
        if (!Number.isInteger(year) || year < 1900 || year > vietnamParts.year) {
            currentAgeReading = null;
            currentAgeReadingKey = '';
            empty.hidden = false;
            result.hidden = true;
            clearGeminiReading();
            return;
        }

        const lunarDate = solarToLunar(selectedDate.day, selectedDate.month, selectedDate.year, LUNAR_TIME_ZONE);
        const age = yearProfile(year);
        const readings = {
            day: calculatePeriodReading('day', 'Ngày', dayProfile(selectedDate), age),
            month: calculatePeriodReading('month', 'Tháng', monthProfile(lunarDate), age),
            year: calculatePeriodReading('year', 'Năm', yearProfile(lunarDate.year), age)
        };
        const score = Math.round(readings.day.contribution + readings.month.contribution + readings.year.contribution);
        const level = scoreLevel(score);
        const summary = readingSummary(score);
        const readingKey = `${toDateValue(selectedDate)}:${year}`;
        if (readingKey !== currentAgeReadingKey) {
            currentAgeReadingKey = readingKey;
            clearGeminiReading();
        }

        currentAgeReading = { key: readingKey, selectedDate: { ...selectedDate }, lunarDate, age, readings, score, level, summary };
        document.getElementById('ageReadingDayLabel').textContent = `Đánh giá theo ngày ${readings.day.profile.name}, tháng ${readings.month.profile.name}, năm ${readings.year.profile.name}`;
        document.getElementById('ageReadingTitle').textContent = `Tuổi ${age.name}`;
        document.getElementById('ageReadingSubtitle').textContent = `Sinh năm ${year} – Mệnh ${age.napAm}`;
        document.getElementById('ageReadingScore').textContent = `${score}%`;
        document.getElementById('ageReadingLevel').textContent = level.label;
        document.getElementById('ageReadingScoreBox').className = `age-score ${level.className}`;
        renderPeriodReading('Day', readings.day);
        renderPeriodReading('Month', readings.month);
        renderPeriodReading('Year', readings.year);
        document.getElementById('ageReadingImpact').textContent = summary.impact;
        document.getElementById('ageReadingNote').textContent = summary.note;
        document.getElementById('ageGeminiButton').disabled = ageGeminiBusy;
        empty.hidden = true;
        result.hidden = false;
    }

    function ageReadingPayload(reading) {
        function relationData(relation) {
            return { label: relation.label, description: relation.description, value: relation.value };
        }
        function periodData(period) {
            return {
                name: period.profile.name,
                napAm: period.profile.napAm,
                element: period.profile.element,
                score: period.score,
                relations: {
                    element: relationData(period.relations.element),
                    stem: relationData(period.relations.stem),
                    branch: relationData(period.relations.branch)
                }
            };
        }
        const julianDay = jdFromDate(reading.selectedDate.day, reading.selectedDate.month, reading.selectedDate.year);
        return {
            birthYear: reading.age.year,
            age: { name: reading.age.name, napAm: reading.age.napAm, element: reading.age.element },
            solarDate: toDateValue(reading.selectedDate),
            lunarDate: `${reading.lunarDate.day}/${reading.lunarDate.month}/${reading.lunarDate.year}`,
            score: reading.score,
            level: reading.level.label,
            day: periodData(reading.readings.day),
            month: periodData(reading.readings.month),
            year: periodData(reading.readings.year),
            lunarMansion: lunarMansion(julianDay),
            dayOfficer: dayOfficer(julianDay, LUNAR_TIME_ZONE)
        };
    }

    async function requestAgeGeminiAnalysis() {
        if (ageGeminiBusy) return;
        if (!App.isAuthenticated()) {
            App.requireUser(requestAgeGeminiAnalysis);
            return;
        }
        if (!currentAgeReading) {
            App.toast('Vui lòng chọn năm sinh trước.', 'error');
            return;
        }

        const requestedKey = currentAgeReading.key;
        const button = document.getElementById('ageGeminiButton');
        const buttonLabel = button.querySelector('span');
        const status = document.getElementById('ageGeminiStatus');
        const resultBox = document.getElementById('ageGeminiResult');
        ageGeminiBusy = true;
        button.disabled = true;
        buttonLabel.textContent = 'Gemini đang phân tích…';
        status.hidden = false;
        status.className = 'age-gemini-status';
        status.textContent = 'Đang tổng hợp quan hệ ngày, tháng và năm. Vui lòng chờ trong giây lát…';
        resultBox.hidden = true;

        try {
            const response = await App.apiPost('age_reading', ageReadingPayload(currentAgeReading), {
                userAuth: true,
                timeoutMs: 60000,
                timeoutMessage: 'Gemini phản hồi quá lâu. Vui lòng thử lại.'
            });
            if (requestedKey !== currentAgeReadingKey) return;
            const analysis = response.analysis || {};
            document.getElementById('ageGeminiOverview').textContent = analysis.overview || 'Gemini chưa trả về phần tổng quan.';
            document.getElementById('ageGeminiInfluence').textContent = analysis.influence || 'Chưa có nội dung.';
            document.getElementById('ageGeminiCaution').textContent = analysis.caution || 'Chưa có nội dung.';
            resultBox.hidden = false;
            status.hidden = true;
        } catch (error) {
            if (requestedKey !== currentAgeReadingKey) return;
            status.hidden = false;
            status.className = 'age-gemini-status is-error';
            status.textContent = error.message || 'Không thể nhận luận giải từ Gemini.';
        } finally {
            ageGeminiBusy = false;
            button.disabled = !currentAgeReading;
            buttonLabel.textContent = 'Phân tích bằng Gemini';
        }
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

    function toDateValue(date) {
        return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
    }

    function fromDateValue(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) return null;
        const date = {
            year: Number(match[1]),
            month: Number(match[2]),
            day: Number(match[3])
        };
        const check = new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
        if (check.getUTCFullYear() !== date.year
            || check.getUTCMonth() + 1 !== date.month
            || check.getUTCDate() !== date.day) return null;
        return date;
    }

    function shiftDate(date, days) {
        const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days, 12));
        return {
            day: shifted.getUTCDate(),
            month: shifted.getUTCMonth() + 1,
            year: shifted.getUTCFullYear()
        };
    }

    function renderCalendar(date) {
        const dateValue = toDateValue(date);
        const dateAtNoonUtc = new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
        const lunarDate = solarToLunar(date.day, date.month, date.year, LUNAR_TIME_ZONE);
        const julianDay = jdFromDate(date.day, date.month, date.year);
        const lunarDayText = String(lunarDate.day).padStart(2, '0');
        const lunarMonthText = String(lunarDate.month).padStart(2, '0');
        const lunarLeapText = lunarDate.isLeap ? ' (tháng nhuận)' : '';
        const isToday = dateValue === toDateValue(todayDate);
        const todayButton = document.getElementById('calendarTodayButton');
        const weekdayElement = document.getElementById('calendarWeekday');
        const dayOfWeek = dateAtNoonUtc.getUTCDay();
        const weekdayClass = dayOfWeek === 0
            ? 'weekday-sunday'
            : dayOfWeek === 6 ? 'weekday-saturday' : 'weekday-regular';
        const currentElement = dayElement(julianDay);
        const currentElementNode = document.getElementById('currentDayElement');

        weekdayElement.textContent = new Intl.DateTimeFormat('vi-VN', {
            timeZone: 'UTC',
            weekday: 'long'
        }).format(dateAtNoonUtc);
        weekdayElement.className = `calendar-editorial-weekday ${weekdayClass}`;
        document.getElementById('calendarDay').textContent = String(date.day).padStart(2, '0');
        document.getElementById('calendarMonth').textContent = `Tháng ${String(date.month).padStart(2, '0')}`;
        document.getElementById('calendarYear').textContent = date.year;
        document.getElementById('currentLunarDate').textContent = `Âm lịch · ${lunarDayText}/${lunarMonthText}/${lunarDate.year}${lunarLeapText}`;
        document.getElementById('currentLunarCanChi').innerHTML = `Ngày ${lunarDayNameHtml(julianDay)}<br>Tháng ${lunarMonthNameHtml(lunarDate.month, lunarDate.year)} · Năm ${lunarYearNameHtml(lunarDate.year)}`;
        currentElementNode.textContent = currentElement;
        currentElementNode.className = `calendar-element element-${ELEMENT_NAME_KEYS[currentElement]}`;
        document.getElementById('currentLunarMansion').textContent = lunarMansion(julianDay);
        document.getElementById('currentDayOfficer').textContent = dayOfficer(julianDay, LUNAR_TIME_ZONE);
        document.getElementById('calendarDatePicker').value = dateValue;
        todayButton.textContent = isToday ? 'Hôm nay' : 'Về hôm nay';
        todayButton.disabled = isToday;
        renderAgeReading();
    }

    function selectCalendarDate(date) {
        selectedDate = date;
        renderCalendar(selectedDate);
    }

    document.getElementById('calendarPreviousButton').addEventListener('click', function () {
        selectCalendarDate(shiftDate(selectedDate, -1));
    });

    document.getElementById('calendarNextButton').addEventListener('click', function () {
        selectCalendarDate(shiftDate(selectedDate, 1));
    });

    document.getElementById('calendarTodayButton').addEventListener('click', function () {
        selectCalendarDate({ ...todayDate });
    });

    const calendarDatePicker = document.getElementById('calendarDatePicker');

    document.getElementById('calendarDateButton').addEventListener('click', function () {
        try {
            calendarDatePicker.focus({ preventScroll: true });
        } catch (_) {
            calendarDatePicker.focus();
        }

        if (typeof calendarDatePicker.showPicker === 'function') {
            try {
                calendarDatePicker.showPicker();
                return;
            } catch (_) {
                // Một số trình duyệt chưa cho phép showPicker; dùng click làm phương án dự phòng.
            }
        }

        calendarDatePicker.click();
    });

    calendarDatePicker.addEventListener('change', function (event) {
        const date = fromDateValue(event.target.value);
        if (date) selectCalendarDate(date);
    });

    renderCalendar(selectedDate);

    const birthYearSelect = document.getElementById('birthYearSelect');
    const birthYearOptions = ['<option value="">Chọn năm sinh</option>'];
    for (let year = vietnamParts.year; year >= 1900; year -= 1) {
        birthYearOptions.push(`<option value="${year}">${year} – ${lunarYearName(year)}</option>`);
    }
    birthYearSelect.innerHTML = birthYearOptions.join('');

    try {
        const savedBirthYear = Number(window.localStorage.getItem(BIRTH_YEAR_STORAGE_KEY));
        if (Number.isInteger(savedBirthYear) && savedBirthYear >= 1900 && savedBirthYear <= vietnamParts.year) {
            birthYearSelect.value = String(savedBirthYear);
        }
    } catch (_) {
        // Trình duyệt có thể chặn localStorage; tính năng xem tuổi vẫn hoạt động bình thường.
    }

    birthYearSelect.addEventListener('change', function () {
        try {
            if (birthYearSelect.value) {
                window.localStorage.setItem(BIRTH_YEAR_STORAGE_KEY, birthYearSelect.value);
            } else {
                window.localStorage.removeItem(BIRTH_YEAR_STORAGE_KEY);
            }
        } catch (_) {
            // Không chặn việc xem kết quả khi trình duyệt không cho phép lưu lựa chọn.
        }
        renderAgeReading();
    });

    function updateAgeReadingAuthUi() {
        const authenticated = App.isAuthenticated();
        document.getElementById('ageReadingAuthGate').hidden = authenticated;
        document.getElementById('ageReadingMemberContent').hidden = !authenticated;
        if (!authenticated) {
            currentAgeReading = null;
            currentAgeReadingKey = '';
            clearGeminiReading();
        }
        renderAgeReading();
    }

    document.getElementById('ageReadingLoginButton').addEventListener('click', function () {
        App.requireUser(updateAgeReadingAuthUi);
    });
    document.getElementById('ageGeminiButton').addEventListener('click', requestAgeGeminiAnalysis);
    window.addEventListener('app:auth-change', updateAgeReadingAuthUi);
    updateAgeReadingAuthUi();

})();
