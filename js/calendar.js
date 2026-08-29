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
    const AGE_SCORE_MODEL_VERSION = 'egv-age-score-v2';
    const AGE_ANALYSIS_VERSION = 'egv-age-analysis-v5';
    const AGE_READING_WEIGHTS = {
        day: { element: 0.20, stem: 0.12, branch: 0.18, total: 0.50 },
        month: { element: 0.10, stem: 0.07, branch: 0.13, total: 0.30 },
        year: { element: 0.07, stem: 0.05, branch: 0.08, total: 0.20 }
    };
    const RELATION_SCORES = {
        harmony: 88,
        support: 78,
        same: 68,
        neutral: 60,
        effort: 52,
        friction: 42,
        harm: 38,
        conflict: 32
    };
    let currentAgeReading = null;
    let currentAgeReadingKey = '';
    let activeAgeRelationKey = '';
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
            return makeRelation('Tỷ hòa', 'positive', RELATION_SCORES.same, `${contextLabel} và mệnh tuổi cùng hành ${ageElement}, ở trạng thái tương hòa.`);
        }
        if (ELEMENT_GENERATES[contextKey] === ageKey) {
            return makeRelation('Tương sinh', 'positive', RELATION_SCORES.support, `${contextLabel} hành ${contextElement} sinh mệnh ${ageElement}, tạo một phần hỗ trợ.`);
        }
        if (ELEMENT_GENERATES[ageKey] === contextKey) {
            return makeRelation('Sinh xuất', 'caution', RELATION_SCORES.effort, `Mệnh ${ageElement} sinh hành ${contextElement} của ${contextLabel.toLowerCase()}, có thể phải bỏ thêm công sức nhưng không đồng nghĩa là xấu.`);
        }
        if (ELEMENT_CONTROLS[contextKey] === ageKey) {
            return makeRelation('Tương khắc', 'negative', RELATION_SCORES.conflict, `${contextLabel} hành ${contextElement} khắc mệnh ${ageElement}, là yếu tố cần lưu ý nhưng không quyết định toàn bộ kết quả.`);
        }
        return makeRelation('Khắc xuất', 'caution', RELATION_SCORES.effort, `Mệnh ${ageElement} khắc hành ${contextElement} của ${contextLabel.toLowerCase()}, chủ động được tình thế nhưng có thể tốn thêm công sức.`);
    }

    function compareStems(context, age, contextLabel) {
        const key = pairKey(context.stemIndex, age.stemIndex);
        if (context.stemIndex === age.stemIndex) {
            return makeRelation('Tương hòa', 'positive', RELATION_SCORES.same, `Can ${age.stem} của tuổi gặp can ${context.stem} của ${contextLabel.toLowerCase()}, hai can đồng hành.`);
        }
        if (STEM_HARMONY_PAIRS.has(key)) {
            return makeRelation('Tương hợp', 'positive', RELATION_SCORES.harmony, `Can ${age.stem} gặp can ${context.stem} thuộc Ngũ hợp, thuận cho sự phối hợp.`);
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
                return makeRelation('Tự hình', 'caution', RELATION_SCORES.friction, `Chi ${age.branch} trùng chi ${context.branch}, tạo thế tự hình theo cách luận phổ biến; chỉ nên xem là một điểm nhắc thận trọng.`);
            }
            return makeRelation('Đồng chi', 'neutral', RELATION_SCORES.neutral, `Chi ${age.branch} của tuổi trùng chi ${context.branch} của ${contextLabel.toLowerCase()}; không phải Lục hợp và được xét ở mức cân bằng.`);
        }

        const key = pairKey(context.branchIndex, age.branchIndex);
        const specialRelations = [
            ['harmony', 'Lục hợp', 'positive', RELATION_SCORES.harmony, 'tạo thế Lục hợp, là một điểm hỗ trợ'],
            ['clash', 'Tương xung', 'negative', RELATION_SCORES.conflict, 'phạm tương xung, có thể phát sinh thay đổi hoặc bất đồng'],
            ['harm', 'Tương hại', 'negative', RELATION_SCORES.harm, 'phạm tương hại, nên đề phòng hiểu lầm và việc phát sinh'],
            ['punishment', 'Tương hình', 'caution', RELATION_SCORES.friction, 'phạm tương hình, có thể tạo va chạm hoặc áp lực'],
            ['break', 'Tương phá', 'caution', RELATION_SCORES.friction, 'phạm tương phá, nên thận trọng với kế hoạch chưa chắc chắn']
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
        if (score < 40) return { label: 'Nên thận trọng', className: 'score-low' };
        if (score < 50) return { label: 'Cần cân nhắc', className: 'score-caution' };
        if (score < 65) return { label: 'Cân bằng', className: 'score-medium' };
        if (score < 78) return { label: 'Khá thuận', className: 'score-good' };
        if (score < 90) return { label: 'Thuận', className: 'score-good' };
        return { label: 'Rất thuận', className: 'score-good' };
    }

    function readingSummary(score) {
        if (score >= 78) {
            return {
                impact: 'Ngày, tháng và năm tạo được nhiều điểm hỗ trợ cho tuổi đã chọn.',
                note: 'Có thể ưu tiên công việc quan trọng nhưng vẫn cần chuẩn bị đầy đủ và kiểm tra chi tiết.'
            };
        }
        if (score >= 65) {
            return {
                impact: 'Tổng thể khá thuận, dù vẫn còn một vài yếu tố cần cân nhắc.',
                note: 'Nên tận dụng các điểm hỗ trợ và chủ động xử lý phần chưa tương hợp.'
            };
        }
        if (score >= 50) {
            return {
                impact: 'Các yếu tố hỗ trợ và cần lưu ý tương đối cân bằng; đây không phải dấu hiệu xấu.',
                note: 'Có thể thực hiện công việc thường ngày; với việc quan trọng nên chuẩn bị kỹ và cân nhắc thêm điều kiện thực tế.'
            };
        }
        if (score >= 40) {
            return {
                impact: 'Một số quan hệ cho thấy công việc có thể cần thêm thời gian hoặc công sức để xử lý.',
                note: 'Không cần lo lắng; nên kiểm tra kỹ thông tin, giữ phương án dự phòng và tránh quyết định vội.'
            };
        }
        return {
            impact: 'Nhiều quan hệ đang nghiêng về phía cần thận trọng, nhưng không dự báo chắc chắn kết quả tốt hay xấu.',
            note: 'Nếu là việc hệ trọng, có thể tham khảo thêm ngày khác; nếu vẫn tiến hành hãy ưu tiên chuẩn bị và phương án dự phòng.'
        };
    }

    function setCompactRelation(id, relation) {
        const badge = document.getElementById(id);
        badge.textContent = relation.label;
        badge.className = `age-relation-badge age-relation-trigger tone-${relation.tone}`;
        badge.title = `${relation.description} Bấm để xem giải thích cụ thể.`;
    }

    function elementMechanism(contextKey, ageKey) {
        const contextElement = ELEMENT_LABELS[contextKey];
        const ageElement = ELEMENT_LABELS[ageKey];
        if (contextKey === ageKey) return `${contextElement} và ${ageElement} cùng hành`;
        if (ELEMENT_GENERATES[contextKey] === ageKey) return `${contextElement} sinh ${ageElement}`;
        if (ELEMENT_GENERATES[ageKey] === contextKey) return `${ageElement} sinh ${contextElement}`;
        if (ELEMENT_CONTROLS[contextKey] === ageKey) return `${contextElement} khắc ${ageElement}`;
        return `${ageElement} khắc ${contextElement}`;
    }

    function relationImpactText(relation) {
        const impacts = {
            'Tương hợp': 'Tạo điều kiện thuận lợi cho phối hợp, trao đổi và thống nhất cách làm.',
            'Lục hợp': 'Là điểm hỗ trợ về Địa chi, thường thuận hơn cho phối hợp và nhận sự hậu thuẫn.',
            'Tương sinh': 'Bản mệnh nhận được sự hỗ trợ về ngũ hành; công việc có thể nhẹ nhàng hơn nếu điều kiện thực tế phù hợp.',
            'Sinh nhập': 'Năng lượng của thời điểm sinh cho bản mệnh, tạo thêm sự hỗ trợ và thuận lợi.',
            'Tỷ hòa': 'Hai bên cùng hành nên tương đối cân bằng, không tự động trở thành rất tốt hoặc rất xấu.',
            'Tương hòa': 'Hai Thiên can đồng nhau, giúp duy trì trạng thái ổn định nhưng không bảo đảm kết quả.',
            'Đồng chi': 'Hai Địa chi đồng nhau, làm tính chất của tuổi biểu hiện rõ hơn nhưng không tự nghiêng về tốt hay xấu.',
            'Sinh xuất': 'Bản mệnh phải sinh năng lượng ra ngoài nên có thể hao thêm thời gian, công sức hoặc nguồn lực.',
            'Khắc xuất': 'Bản mệnh có thể chủ động kiểm soát tình thế nhưng thường phải bỏ thêm công sức để xử lý.',
            'Tự hình': 'Dễ tự tạo áp lực, lặp lại cách xử lý chưa hiệu quả hoặc phải sửa việc nhiều lần.',
            'Tương hình': 'Có thể phát sinh va chạm, áp lực hoặc thủ tục cần điều chỉnh; nên trao đổi rõ ràng.',
            'Tương phá': 'Kế hoạch có thể bị thay đổi hoặc xuất hiện chi tiết ngoài dự kiến; nên có phương án dự phòng.',
            'Tương hại': 'Dễ xảy ra hiểu lầm, phối hợp không trọn ý hoặc phát sinh việc ngoài dự kiến.',
            'Tương xung': 'Dễ có thay đổi, bất đồng hoặc tình huống buộc phải điều chỉnh kế hoạch.',
            'Tương khắc': 'Yếu tố của thời điểm tạo áp lực lên bản mệnh; nên chuẩn bị kỹ nhưng không dùng riêng quan hệ này để kết luận cả ngày xấu.',
            'Khắc nhập': 'Bản mệnh chịu lực cản từ yếu tố bên ngoài; tiến độ có thể chậm hoặc cần xử lý thận trọng hơn.'
        };
        return impacts[relation.label] || relation.description;
    }

    function branchMechanism(context, age, relation) {
        const pair = `${age.branch}–${context.branch}`;
        const mechanisms = {
            'Lục hợp': `${pair} thuộc cặp Lục hợp`,
            'Tương xung': `${pair} thuộc cặp Tương xung`,
            'Tương hại': `${pair} thuộc cặp Lục hại`,
            'Tương hình': `${pair} thuộc quan hệ Tương hình`,
            'Tương phá': `${pair} thuộc cặp Tương phá`,
            'Tự hình': `${age.branch} gặp chính ${context.branch}, tạo thế Tự hình`,
            'Đồng chi': `${age.branch} gặp ${context.branch}, hai chi đồng nhau`
        };
        return mechanisms[relation.label]
            || elementMechanism(BRANCH_ELEMENT_KEYS[context.branchIndex], BRANCH_ELEMENT_KEYS[age.branchIndex]);
    }

    function buildAgeRelationExplanation(period, factor, age) {
        const relation = period.relations[factor];
        const periodName = period.label.toLowerCase();
        const factorLabels = { element: 'Ngũ hành', stem: 'Thiên can', branch: 'Địa chi' };
        let comparison;
        let mechanism;
        let impact = relationImpactText(relation);

        if (factor === 'element') {
            comparison = `${period.profile.napAm} (${period.profile.element}) của ${periodName} ↔ ${age.napAm} (${age.element}) của tuổi ${age.name}.`;
            mechanism = `${elementMechanism(period.profile.elementKey, age.elementKey)}, nên được xếp là ${relation.label}.`;
            if (relation.label === 'Tương khắc' && period.profile.elementKey === 'hoa' && age.napAm === 'Kiếm Phong Kim') {
                impact += ' Theo cách luận nạp âm phổ biến, Kiếm Phong Kim có thể dùng Hỏa để tôi luyện, vì vậy không nên hiểu đây là hoàn toàn bất lợi.';
            }
        } else if (factor === 'stem') {
            const contextElement = ELEMENT_LABELS[STEM_ELEMENT_KEYS[period.profile.stemIndex]];
            const ageElement = ELEMENT_LABELS[STEM_ELEMENT_KEYS[age.stemIndex]];
            comparison = `Can ${period.profile.stem} (${contextElement}) của ${periodName} ↔ can ${age.stem} (${ageElement}) của tuổi ${age.name}.`;
            if (relation.label === 'Tương hợp') {
                mechanism = `${age.stem} hợp ${period.profile.stem} theo Ngũ hợp Thiên can, nên được xếp là Tương hợp.`;
            } else if (relation.label === 'Tương hòa') {
                mechanism = `Can ${age.stem} gặp cùng can ${period.profile.stem}, nên được xếp là Tương hòa.`;
            } else {
                mechanism = `${elementMechanism(STEM_ELEMENT_KEYS[period.profile.stemIndex], STEM_ELEMENT_KEYS[age.stemIndex])}, nên được xếp là ${relation.label}.`;
            }
        } else {
            const contextElement = ELEMENT_LABELS[BRANCH_ELEMENT_KEYS[period.profile.branchIndex]];
            const ageElement = ELEMENT_LABELS[BRANCH_ELEMENT_KEYS[age.branchIndex]];
            comparison = `Chi ${period.profile.branch} (${contextElement}) của ${periodName} ↔ chi ${age.branch} (${ageElement}) của tuổi ${age.name}.`;
            mechanism = `${branchMechanism(period.profile, age, relation)}, nên được xếp là ${relation.label}.`;
        }

        return {
            title: `${factorLabels[factor]} · ${period.label} ${period.profile.name}`,
            comparison,
            mechanism,
            impact,
            tone: relation.tone
        };
    }

    function hideAgeRelationExplanation() {
        activeAgeRelationKey = '';
        const panel = document.getElementById('ageRelationExplainer');
        if (panel) panel.hidden = true;
        document.querySelectorAll('[data-age-relation]').forEach(function (button) {
            button.setAttribute('aria-expanded', 'false');
        });
    }

    function showAgeRelationExplanation(periodKey, factor, trigger) {
        if (!currentAgeReading || !currentAgeReading.readings[periodKey]) return;
        const relationKey = `${periodKey}:${factor}`;
        if (activeAgeRelationKey === relationKey && !document.getElementById('ageRelationExplainer').hidden) {
            hideAgeRelationExplanation();
            return;
        }
        const detail = buildAgeRelationExplanation(currentAgeReading.readings[periodKey], factor, currentAgeReading.age);
        hideAgeRelationExplanation();
        activeAgeRelationKey = relationKey;
        document.getElementById('ageRelationExplainerTitle').textContent = detail.title;
        document.getElementById('ageRelationComparison').textContent = detail.comparison;
        document.getElementById('ageRelationMechanism').textContent = detail.mechanism;
        document.getElementById('ageRelationImpact').textContent = detail.impact;
        const panel = document.getElementById('ageRelationExplainer');
        panel.className = `age-relation-explainer tone-${detail.tone}`;
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
    }

    function napAmPolarityClass(profile) {
        return profile.stemIndex % 2 === 0 ? 'polarity-duong' : 'polarity-am';
    }

    function napAmPolarityLabel(profile) {
        return profile.stemIndex % 2 === 0 ? 'Dương' : 'Âm';
    }

    function napAmValueClass(profile, baseClass) {
        return `${baseClass} element-${profile.elementKey} ${napAmPolarityClass(profile)}`;
    }

    function setNapAmAccessibility(element, profile) {
        const polarity = napAmPolarityLabel(profile);
        element.title = `Nạp âm ${polarity}`;
        element.setAttribute('aria-label', `${profile.napAm}, nạp âm ${polarity}`);
    }

    function renderPeriodReading(prefix, reading) {
        document.getElementById(`age${prefix}Title`).textContent = `${reading.label} ${reading.profile.name}`;
        document.getElementById(`age${prefix}Score`).textContent = `${reading.score}/100`;
        const elementValue = document.getElementById(`age${prefix}ElementValue`);
        const stemValue = document.getElementById(`age${prefix}StemValue`);
        const branchValue = document.getElementById(`age${prefix}BranchValue`);
        elementValue.textContent = reading.profile.napAm;
        elementValue.className = napAmValueClass(reading.profile, 'age-period-value');
        setNapAmAccessibility(elementValue, reading.profile);
        stemValue.textContent = reading.profile.stem;
        stemValue.className = `age-period-value element-${STEM_ELEMENT_KEYS[reading.profile.stemIndex]}`;
        branchValue.textContent = reading.profile.branch;
        branchValue.className = `age-period-value element-${BRANCH_ELEMENT_KEYS[reading.profile.branchIndex]}`;
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

    function calculateAgeReadingForDate(date, birthYear) {
        const lunarDate = solarToLunar(date.day, date.month, date.year, LUNAR_TIME_ZONE);
        const age = yearProfile(birthYear);
        const readings = {
            day: calculatePeriodReading('day', 'Ngày', dayProfile(date), age),
            month: calculatePeriodReading('month', 'Tháng', monthProfile(lunarDate), age),
            year: calculatePeriodReading('year', 'Năm', yearProfile(lunarDate.year), age)
        };
        const score = Math.round(readings.day.contribution + readings.month.contribution + readings.year.contribution);
        return {
            selectedDate: { ...date },
            lunarDate,
            age,
            readings,
            score,
            level: scoreLevel(score),
            summary: readingSummary(score)
        };
    }

    function daysInSolarMonth(year, month) {
        return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
    }

    function shiftMonthDate(date, months) {
        const monthIndex = date.year * 12 + date.month - 1 + months;
        const year = Math.floor(monthIndex / 12);
        const month = modulo(monthIndex, 12) + 1;
        return { day: Math.min(date.day, daysInSolarMonth(year, month)), month, year };
    }

    function monthScoreTone(score) {
        if (score < 40) return 'low';
        if (score < 50) return 'caution';
        if (score < 65) return 'medium';
        if (score < 78) return 'good';
        return 'high';
    }

    function renderAgeMonthChart(birthYear) {
        const totalDays = daysInSolarMonth(selectedDate.year, selectedDate.month);
        const monthDays = Array.from({ length: totalDays }, function (_, index) {
            const date = { day: index + 1, month: selectedDate.month, year: selectedDate.year };
            return { date, reading: calculateAgeReadingForDate(date, birthYear) };
        });
        const weekdayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        const weekdayNames = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        const selectedValue = toDateValue(selectedDate);
        const best = monthDays.reduce((current, item) => item.reading.score > current.reading.score ? item : current);
        const caution = monthDays.reduce((current, item) => item.reading.score < current.reading.score ? item : current);
        const monthText = String(selectedDate.month).padStart(2, '0');

        document.getElementById('ageMonthRange').textContent = `Tháng ${monthText}/${selectedDate.year} · ${totalDays} ngày`;
        document.getElementById('ageMonthSummary').textContent = `Thuận nhất: ${String(best.date.day).padStart(2, '0')}/${monthText} · ${best.reading.score}/100  |  Cần lưu ý: ${String(caution.date.day).padStart(2, '0')}/${monthText} · ${caution.reading.score}/100`;
        const bars = document.getElementById('ageMonthBars');
        bars.style.gridTemplateColumns = `repeat(${totalDays}, minmax(24px, 1fr))`;
        bars.style.minWidth = `${Math.max(totalDays * 30, 820)}px`;
        bars.innerHTML = monthDays.map(function (item) {
            const dateValue = toDateValue(item.date);
            const score = item.reading.score;
            const tone = monthScoreTone(score);
            const selected = dateValue === selectedValue;
            const dateAtNoonUtc = new Date(Date.UTC(item.date.year, item.date.month - 1, item.date.day, 12));
            const dayOfWeek = dateAtNoonUtc.getUTCDay();
            const weekdayClass = dayOfWeek === 6 ? ' weekday-saturday' : dayOfWeek === 0 ? ' weekday-sunday' : '';
            const dayText = String(item.date.day).padStart(2, '0');
            return `<button class="age-month-bar${weekdayClass}${selected ? ' is-selected' : ''}" type="button" data-month-date="${dateValue}" aria-label="${weekdayNames[dayOfWeek]} ${dayText}/${monthText}: ${score} trên 100, ${item.reading.level.label}"${selected ? ' aria-current="date"' : ''}><span class="age-month-score">${score}</span><span class="age-month-track"><i class="tone-${tone}" style="height:${Math.max(score, 6)}%"></i></span><strong>${dayText}</strong><small>${weekdayLabels[dayOfWeek]}</small></button>`;
        }).join('');

        const scrollBox = document.getElementById('ageMonthChartScroll');
        const updateScroll = function () {
            scrollBox.scrollLeft = Math.max(0, (selectedDate.day - 4) * 30);
        };
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(updateScroll);
        else updateScroll();
    }

    function renderAgeReading() {
        const selector = document.getElementById('birthYearSelect');
        if (!selector) return;
        document.getElementById('ageReadingSelectedDate').textContent = `${String(selectedDate.day).padStart(2, '0')}/${String(selectedDate.month).padStart(2, '0')}/${selectedDate.year}`;
        if (!App.isAuthenticated()) {
            currentAgeReading = null;
            hideAgeRelationExplanation();
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
            hideAgeRelationExplanation();
            empty.hidden = false;
            result.hidden = true;
            clearGeminiReading();
            return;
        }

        const calculated = calculateAgeReadingForDate(selectedDate, year);
        const { lunarDate, age, readings, score, level, summary } = calculated;
        const readingKey = `${toDateValue(selectedDate)}:${year}`;
        if (readingKey !== currentAgeReadingKey) {
            currentAgeReadingKey = readingKey;
            clearGeminiReading();
            hideAgeRelationExplanation();
        }

        currentAgeReading = Object.assign({ key: readingKey }, calculated);
        document.getElementById('ageReadingDayLabel').textContent = `Đánh giá theo ngày ${readings.day.profile.name}, tháng ${readings.month.profile.name}, năm ${readings.year.profile.name}`;
        document.getElementById('ageReadingTitle').textContent = `Tuổi ${age.name}`;
        const agePolarity = napAmPolarityLabel(age);
        document.getElementById('ageReadingSubtitle').innerHTML = `Sinh năm ${year} – Mệnh <span class="${napAmValueClass(age, 'age-nap-am-value')}" title="Nạp âm ${agePolarity}" aria-label="${age.napAm}, nạp âm ${agePolarity}">${age.napAm}</span>`;
        document.getElementById('ageReadingScore').textContent = `${score}/100`;
        document.getElementById('ageReadingLevel').textContent = level.label;
        document.getElementById('ageReadingScoreBox').className = `age-score ${level.className}`;
        renderAgeMonthChart(year);
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
            scoreModelVersion: AGE_SCORE_MODEL_VERSION,
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

    function extractLooseAnalysisField(source, names) {
        const text = String(source || '');
        for (const name of names) {
            const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const match = new RegExp(`["']?${safeName}["']?\\s*:\\s*["']`, 'i').exec(text);
            if (!match) continue;
            const quote = match[0].slice(-1);
            let value = '';
            let escaped = false;
            for (let index = match.index + match[0].length; index < text.length; index += 1) {
                const character = text[index];
                if (escaped) {
                    value += character === 'n' ? '\n' : character;
                    escaped = false;
                } else if (character === '\\') {
                    escaped = true;
                } else if (character === quote) {
                    break;
                } else {
                    value += character;
                }
            }
            if (value.trim()) return value.trim();
        }
        return '';
    }

    function buildLocalAgeAnalysis(reading) {
        const periods = [reading.readings.day, reading.readings.month, reading.readings.year];
        const weights = { day: 50, month: 30, year: 20 };
        const relationEffects = {
            'Tương hợp': 'thuận cho phối hợp và thống nhất cách làm',
            'Lục hợp': 'tạo thêm sự hỗ trợ khi phối hợp hoặc trao đổi',
            'Tương sinh': 'được tiếp sức, xử lý công việc thường thuận hơn',
            'Sinh nhập': 'dễ nhận được hỗ trợ hoặc nguồn lực từ bên ngoài',
            'Tỷ hòa': 'giữ nhịp ổn định, không nghiêng rõ về thuận hay nghịch',
            'Tương hòa': 'giữ trạng thái cân bằng và dễ duy trì tiến độ',
            'Đồng chi': 'làm tính chất vốn có biểu hiện rõ hơn nhưng không tự thành tốt hoặc xấu',
            'Sinh xuất': 'cần chủ động nhiều hơn và có thể hao thêm thời gian, công sức',
            'Khắc xuất': 'vẫn có thể kiểm soát tình thế nhưng dễ mệt vì phải tự xử lý nhiều',
            'Tự hình': 'dễ tự tạo áp lực hoặc lặp lại cách xử lý chưa hiệu quả',
            'Tương hình': 'dễ nảy sinh va chạm, áp lực hoặc thủ tục phải sửa lại',
            'Tương phá': 'kế hoạch có thể bị thay đổi hoặc phát sinh chi tiết ngoài dự kiến',
            'Tương hại': 'dễ có hiểu lầm, việc phát sinh hoặc phối hợp không trọn ý',
            'Tương xung': 'dễ có thay đổi, bất đồng hoặc tình huống buộc phải điều chỉnh',
            'Tương khắc': 'tạo áp lực rõ, nên tránh quyết định vội và cần kiểm tra kỹ',
            'Khắc nhập': 'chịu lực cản từ hoàn cảnh, tiến độ có thể chậm hơn dự kiến'
        };
        const relationEffect = relation => relationEffects[relation.label] || relation.description;
        const factorText = function (key) {
            return periods.map(function (period) {
                const relation = period.relations[key];
                return `${period.label} ${period.profile.name}: ${relation.description} Ý nghĩa thực tế là ${relationEffect(relation)}.`;
            }).join(' ');
        };
        const scoreTrend = function (score) {
            if (score < 40) return 'nghiêng rõ về phía cần thận trọng';
            if (score < 50) return 'có nhiều điểm cần cân nhắc';
            if (score < 65) return 'ở quanh mức cân bằng';
            if (score < 78) return 'có xu hướng khá thuận';
            return 'có nhiều yếu tố hỗ trợ';
        };
        const cautious = [];
        periods.forEach(function (period) {
            Object.values(period.relations).forEach(function (relation) {
                if (relation.tone === 'negative' || relation.tone === 'caution') {
                    cautious.push(`${period.label.toLowerCase()} ${relation.label}: ${relationEffect(relation)}`);
                }
            });
        });
        const dateText = `${String(reading.selectedDate.day).padStart(2, '0')}/${String(reading.selectedDate.month).padStart(2, '0')}/${reading.selectedDate.year}`;
        const day = reading.readings.day;
        const month = reading.readings.month;
        const year = reading.readings.year;
        let recommendation = 'Có thể làm: công việc thường ngày, trao đổi và xử lý các việc đã có kế hoạch. Cần thận trọng: với ký kết, mua bán hoặc xây sửa, nên kiểm tra giấy tờ, thời điểm, nguồn lực và người phối hợp trước khi chốt. Nếu vẫn tiến hành: hãy giữ một phương án dự phòng.';
        if (reading.score < 40) {
            recommendation = 'Có thể làm: công việc thường ngày, hoàn thiện việc cũ và chuẩn bị hồ sơ. Cần thận trọng: nên cân nhắc dời việc khó đảo ngược như đặt cọc, ký hợp đồng lớn hoặc khởi công nếu thời gian cho phép. Nếu vẫn tiến hành: xác nhận lại thông tin, chia nhỏ bước thực hiện và chuẩn bị phương án dự phòng.';
        } else if (reading.score < 50) {
            recommendation = 'Có thể làm: công việc thường ngày và những việc đã chuẩn bị chắc chắn. Cần thận trọng: với ký kết, mua bán, đặt cọc hoặc xây sửa, chưa nên chốt vội; hãy rà soát giấy tờ, chi phí, thời hạn và ý kiến các bên. Nếu vẫn tiến hành: chọn giờ thuận tiện, làm từng bước và giữ phương án dự phòng.';
        } else if (reading.score >= 78) {
            recommendation = 'Có thể làm: ưu tiên công việc quan trọng khi hồ sơ và nguồn lực đã sẵn sàng. Cần thận trọng: vẫn kiểm tra điều khoản, chi phí và tiến độ, không xem điểm cao là bảo đảm kết quả. Nếu vẫn tiến hành khi còn điểm chưa thuận: chốt rõ từng bước và người chịu trách nhiệm.';
        }
        return {
            overview: `Kết luận: ngày ${dateText} đối với tuổi ${reading.age.name} đạt ${reading.score}/100, thuộc mức ${reading.level.label}. Ảnh hưởng chính đến từ ngày ${day.profile.name} đạt ${day.score}/100 và ${scoreTrend(day.score)}. Công việc thường ngày vẫn có thể xử lý, còn việc quan trọng nên căn cứ thêm các điểm cần lưu ý và phương án thực hiện bên dưới.`,
            nguHanh: factorText('element'),
            thienCan: factorText('stem'),
            diaChi: factorText('branch'),
            context: `Ngày ${day.profile.name} đạt ${day.score}/100 và giữ trọng số 50%, nên là yếu tố tác động mạnh nhất. Tháng ${month.profile.name} đạt ${month.score}/100 với trọng số 30%, còn năm ${year.profile.name} đạt ${year.score}/100 với trọng số 20%. Ba phần kết hợp tạo thành ${reading.score}/100; vì vậy mức ${reading.level.label.toLowerCase()} phản ánh xu hướng chung chứ không phải xác suất may mắn.`,
            caution: cautious.length
                ? `Điểm dễ ảnh hưởng đến tiến độ gồm ${cautious.slice(0, 4).join('; ')}. Tác động có thể gặp là phải trao đổi lại, xử lý thêm chi tiết hoặc tốn nhiều công sức hơn dự kiến; nên kiểm tra trước những phần khó sửa sau khi đã quyết định.`
                : 'Dữ kiện không có quan hệ xung khắc nổi bật. Dù vậy, việc quan trọng vẫn cần kiểm tra giấy tờ, nguồn lực và trách nhiệm của các bên vì điểm lịch không thay thế điều kiện thực tế.',
            recommendation
        };
    }

    function normalizeAgeGeminiAnalysis(input, fallbackAnalysis, forceFallback) {
        let analysis = input;
        let raw = typeof input === 'string' ? input : '';
        if (analysis && typeof analysis === 'object' && typeof analysis.overview === 'string'
            && /["']?overview["']?\s*:/i.test(analysis.overview)) {
            raw = analysis.overview;
        }
        if (raw) {
            const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            try {
                const parsed = JSON.parse(cleaned);
                if (parsed && typeof parsed === 'object') analysis = parsed.analysis || parsed;
            } catch (_) {
                analysis = {
                    overview: extractLooseAnalysisField(cleaned, ['overview', 'tongQuan', 'tổngQuan']),
                    nguHanh: extractLooseAnalysisField(cleaned, ['nguHanh', 'nguhanh', 'ngu_hanh', 'element']),
                    thienCan: extractLooseAnalysisField(cleaned, ['thienCan', 'thiencan', 'thien_can', 'stem']),
                    diaChi: extractLooseAnalysisField(cleaned, ['diaChi', 'diachi', 'dia_chi', 'branch']),
                    context: extractLooseAnalysisField(cleaned, ['context', 'influence', 'impact', 'boiCanh', 'bốiCảnh', 'anhHuong', 'ảnhHưởng']),
                    caution: extractLooseAnalysisField(cleaned, ['caution', 'note', 'luuY', 'lưuÝ']),
                    recommendation: extractLooseAnalysisField(cleaned, ['recommendation', 'advice', 'goiY', 'gợiÝ'])
                };
            }
        }
        if (!analysis || typeof analysis !== 'object') analysis = {};
        const fallbackFields = [];
        const safeText = function (key, value, minimumLength) {
            const text = String(value || '').trim();
            if (forceFallback || !text || /^(?:[-–—]+|n\/?a|không có|chưa có)$/i.test(text) || text.length < minimumLength) {
                fallbackFields.push(key);
                return fallbackAnalysis[key];
            }
            return text;
        };
        return {
            overview: safeText('overview', analysis.overview, 80),
            nguHanh: safeText('nguHanh', analysis.nguHanh || analysis.nguhanh || analysis.ngu_hanh || analysis.element, 70),
            thienCan: safeText('thienCan', analysis.thienCan || analysis.thiencan || analysis.thien_can || analysis.stem, 70),
            diaChi: safeText('diaChi', analysis.diaChi || analysis.diachi || analysis.dia_chi || analysis.branch, 70),
            context: safeText('context', analysis.context || analysis.influence || analysis.impact || analysis.boiCanh || analysis['bốiCảnh'] || analysis.anhHuong || analysis['ảnhHưởng'], 70),
            caution: safeText('caution', analysis.caution, 60),
            recommendation: safeText('recommendation', analysis.recommendation, 80),
            _fallbackFields: fallbackFields
        };
    }

    function applyAuthoritativeAgeCalculation(calculation) {
        if (!currentAgeReading || !calculation || typeof calculation !== 'object') return;
        const score = Number(calculation.score);
        const periods = calculation.periods || {};
        if (!Number.isInteger(score) || score < 0 || score > 100) return;

        const level = scoreLevel(score);
        if (typeof calculation.level === 'string' && calculation.level.trim()) level.label = calculation.level.trim();
        currentAgeReading.score = score;
        currentAgeReading.level = level;
        currentAgeReading.summary = readingSummary(score);

        document.getElementById('ageReadingScore').textContent = `${score}/100`;
        document.getElementById('ageReadingLevel').textContent = level.label;
        document.getElementById('ageReadingScoreBox').className = `age-score ${level.className}`;

        [['day', 'Day'], ['month', 'Month'], ['year', 'Year']].forEach(function ([key, prefix]) {
            const periodScore = Number(periods[key]);
            if (!Number.isInteger(periodScore) || periodScore < 0 || periodScore > 100) return;
            currentAgeReading.readings[key].score = periodScore;
            document.getElementById(`age${prefix}Score`).textContent = `${periodScore}/100`;
        });
        document.getElementById('ageReadingImpact').textContent = currentAgeReading.summary.impact;
        document.getElementById('ageReadingNote').textContent = currentAgeReading.summary.note;
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
            applyAuthoritativeAgeCalculation(response.calculation);
            const localAnalysis = buildLocalAgeAnalysis(currentAgeReading);
            const versionMatches = response.analysisVersion === AGE_ANALYSIS_VERSION;
            const analysis = normalizeAgeGeminiAnalysis(response.analysis || {}, localAnalysis, !versionMatches);
            document.getElementById('ageGeminiOverview').textContent = analysis.overview;
            document.getElementById('ageGeminiNguHanh').textContent = analysis.nguHanh;
            document.getElementById('ageGeminiThienCan').textContent = analysis.thienCan;
            document.getElementById('ageGeminiDiaChi').textContent = analysis.diaChi;
            document.getElementById('ageGeminiContext').textContent = analysis.context;
            document.getElementById('ageGeminiCaution').textContent = analysis.caution;
            document.getElementById('ageGeminiRecommendation').textContent = analysis.recommendation;
            resultBox.hidden = false;
            if (!versionMatches) {
                status.hidden = false;
                status.className = 'age-gemini-status is-warning';
                status.textContent = 'Web App Apps Script đang dùng phiên bản luận giải cũ. E-GV đã hiển thị phần phân tích cụ thể từ dữ kiện đang xem; hãy cập nhật và triển khai Code.gs mới để nhận nội dung Gemini đầy đủ.';
            } else {
                status.hidden = true;
            }
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
    document.getElementById('ageMonthPrevious').addEventListener('click', function () {
        selectCalendarDate(shiftMonthDate(selectedDate, -1));
    });
    document.getElementById('ageMonthCurrent').addEventListener('click', function () {
        selectCalendarDate({ ...todayDate });
    });
    document.getElementById('ageMonthNext').addEventListener('click', function () {
        selectCalendarDate(shiftMonthDate(selectedDate, 1));
    });
    document.getElementById('ageMonthBars').addEventListener('click', function (event) {
        const button = event.target.closest('[data-month-date]');
        if (!button) return;
        const date = fromDateValue(button.dataset.monthDate);
        if (date) selectCalendarDate(date);
    });
    document.querySelectorAll('[data-age-relation]').forEach(function (button) {
        button.addEventListener('click', function () {
            showAgeRelationExplanation(button.dataset.period, button.dataset.factor, button);
        });
    });
    document.getElementById('ageRelationExplainerClose').addEventListener('click', hideAgeRelationExplanation);
    document.getElementById('ageGeminiButton').addEventListener('click', requestAgeGeminiAnalysis);
    window.addEventListener('app:auth-change', updateAgeReadingAuthUi);
    updateAgeReadingAuthUi();

})();
