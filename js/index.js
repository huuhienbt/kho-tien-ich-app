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

    function yearProfile(year) {
        const cycleIndex = modulo(year - 1984, 60);
        const stemIndex = cycleIndex % 10;
        const branchIndex = cycleIndex % 12;
        const napAmIndex = Math.floor(cycleIndex / 2);
        return {
            year,
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

    function dayProfile(date) {
        const julianDay = jdFromDate(date.day, date.month, date.year);
        const cycleIndex = modulo(julianDay + 49, 60);
        const stemIndex = cycleIndex % 10;
        const branchIndex = cycleIndex % 12;
        const napAmIndex = Math.floor(cycleIndex / 2);
        return {
            julianDay,
            stemIndex,
            branchIndex,
            stem: HEAVENLY_STEMS[stemIndex],
            branch: EARTHLY_BRANCHES[branchIndex],
            name: cycleName(stemIndex, branchIndex),
            elementKey: ELEMENT_NAME_KEYS[NAP_AM_ELEMENTS[napAmIndex]],
            element: NAP_AM_ELEMENTS[napAmIndex]
        };
    }

    function compareElements(dayKey, ageKey, subjectLabel) {
        const dayElementLabel = ELEMENT_LABELS[dayKey];
        const ageElementLabel = ELEMENT_LABELS[ageKey];
        if (dayKey === ageKey) {
            return {
                label: 'Tương hòa', tone: 'positive', score: 1,
                description: `Ngày và ${subjectLabel} cùng hành ${ageElementLabel}, năng lượng tương hòa và tương đối ổn định.`
            };
        }
        if (ELEMENT_GENERATES[dayKey] === ageKey) {
            return {
                label: 'Tương sinh', tone: 'positive', score: 1,
                description: `Ngày hành ${dayElementLabel} sinh mệnh ${ageElementLabel}, tạo một phần hỗ trợ và thuận lợi.`
            };
        }
        if (ELEMENT_GENERATES[ageKey] === dayKey) {
            return {
                label: 'Sinh xuất', tone: 'caution', score: -1,
                description: `Mệnh ${ageElementLabel} sinh hành ${dayElementLabel} của ngày, dễ phải hao tâm và bỏ nhiều công sức.`
            };
        }
        if (ELEMENT_CONTROLS[dayKey] === ageKey) {
            return {
                label: 'Tương khắc', tone: 'negative', score: -2,
                description: `Ngày hành ${dayElementLabel} khắc mệnh ${ageElementLabel}, dễ tạo áp lực và khiến công việc kém thuận.`
            };
        }
        return {
            label: 'Khắc xuất', tone: 'caution', score: -1,
            description: `Mệnh ${ageElementLabel} khắc hành ${dayElementLabel} của ngày; có thể chế ngự nhưng dễ tốn sức.`
        };
    }

    function compareStems(day, age) {
        const key = pairKey(day.stemIndex, age.stemIndex);
        if (day.stemIndex === age.stemIndex) {
            return {
                label: 'Tương hòa', tone: 'positive', score: 1,
                description: `Can ${age.stem} gặp can ${day.stem} đồng khí, cách xử lý công việc dễ có sự đồng thuận.`
            };
        }
        if (STEM_HARMONY_PAIRS.has(key)) {
            return {
                label: 'Tương hợp', tone: 'positive', score: 2,
                description: `Can ${age.stem} gặp can ${day.stem} thuộc Ngũ hợp, có lợi cho phối hợp và kết nối.`
            };
        }
        const relation = compareElements(STEM_ELEMENT_KEYS[day.stemIndex], STEM_ELEMENT_KEYS[age.stemIndex], `can ${age.stem}`);
        if (relation.label === 'Tương sinh') relation.label = 'Sinh nhập';
        if (relation.label === 'Tương khắc') relation.label = 'Khắc nhập';
        relation.description = relation.description
            .replace(/^Ngày hành/, `Can ${day.stem}`)
            .replace(/mệnh /, `can ${age.stem} `)
            .replace(/^Mệnh [^ ]+/, `Can ${age.stem}`)
            .replace(/hành [^ ]+ của ngày/, `can ${day.stem}`);
        return relation;
    }

    function compareBranches(day, age) {
        if (day.branchIndex === age.branchIndex) {
            if (SELF_PUNISHMENT_BRANCHES.has(day.branchIndex)) {
                return {
                    label: 'Tự hình', tone: 'caution', score: -1,
                    description: `Chi ${age.branch} gặp ngày ${day.branch} tạo thế tự hình, dễ tự gây áp lực hoặc suy nghĩ nhiều.`
                };
            }
            return {
                label: 'Đồng chi', tone: 'positive', score: 1,
                description: `Chi ${age.branch} gặp ngày cùng chi ${day.branch}, nền khí tương đồng và khá ổn định.`
            };
        }

        const key = pairKey(day.branchIndex, age.branchIndex);
        const specialRelations = [
            ['harmony', 'Lục hợp', 'positive', 2, 'tạo thế Lục hợp, thuận cho phối hợp và nhận sự hỗ trợ'],
            ['clash', 'Tương xung', 'negative', -2, 'phạm tương xung, dễ phát sinh thay đổi, bất đồng hoặc trở ngại'],
            ['harm', 'Tương hại', 'negative', -1, 'phạm tương hại, nên đề phòng hiểu lầm và việc phát sinh ngoài dự kiến'],
            ['punishment', 'Tương hình', 'caution', -1, 'phạm tương hình, dễ có va chạm, thị phi hoặc áp lực trong công việc'],
            ['break', 'Tương phá', 'caution', -1, 'phạm tương phá, nên thận trọng với kế hoạch và cam kết chưa chắc chắn']
        ];
        const matched = specialRelations.find(([type]) => BRANCH_RELATIONS[type].has(key));
        if (matched) {
            return {
                label: matched[1], tone: matched[2], score: matched[3],
                description: `Chi ${age.branch} gặp chi ${day.branch} ${matched[4]}.`
            };
        }

        const relation = compareElements(BRANCH_ELEMENT_KEYS[day.branchIndex], BRANCH_ELEMENT_KEYS[age.branchIndex], `chi ${age.branch}`);
        relation.description = relation.description
            .replace(/^Ngày hành/, `Chi ${day.branch}`)
            .replace(/mệnh /, `chi ${age.branch} `)
            .replace(/^Mệnh [^ ]+/, `Chi ${age.branch}`)
            .replace(/hành [^ ]+ của ngày/, `chi ${day.branch}`);
        return relation;
    }

    function readingSummary(relations) {
        const score = relations.reduce((total, relation) => total + relation.score, 0);
        const hasStrongConflict = relations.some(relation => relation.score <= -2);
        if (score >= 4) {
            return {
                impact: 'Ngày có nhiều yếu tố hỗ trợ, công việc nhìn chung dễ tiến triển thuận lợi.',
                note: 'Có thể ưu tiên việc quan trọng, nhưng vẫn nên chuẩn bị đầy đủ và chủ động kiểm tra chi tiết.'
            };
        }
        if (score >= 1) {
            return {
                impact: 'Ngày có điểm thuận và tạo được một phần hỗ trợ cho công việc.',
                note: 'Nên tận dụng yếu tố thuận lợi, đồng thời xử lý thận trọng những điểm chưa tương hợp.'
            };
        }
        if (score >= -1 && !hasStrongConflict) {
            return {
                impact: 'Ngày có cả thuận lẫn nghịch, kết quả phụ thuộc nhiều vào sự chuẩn bị và cách xử lý.',
                note: 'Nên kiểm tra giấy tờ, giữ bình tĩnh khi trao đổi và tránh quyết định quá vội.'
            };
        }
        return {
            impact: 'Dễ chịu áp lực, hao tâm tổn sức hoặc công việc chậm thuận.',
            note: 'Nên chuẩn bị kỹ, tránh quyết định vội vàng và hạn chế thực hiện việc lớn.'
        };
    }

    function setRelationResult(prefix, relation) {
        const badge = document.getElementById(`${prefix}Relation`);
        badge.textContent = relation.label;
        badge.className = `age-relation-badge tone-${relation.tone}`;
        document.getElementById(`${prefix}Description`).textContent = relation.description;
    }

    function renderAgeReading() {
        const selector = document.getElementById('birthYearSelect');
        if (!selector) return;
        const year = Number(selector.value);
        const empty = document.getElementById('ageReadingEmpty');
        const result = document.getElementById('ageReadingResult');
        if (!Number.isInteger(year) || year < 1900 || year > vietnamParts.year) {
            empty.hidden = false;
            result.hidden = true;
            return;
        }

        const age = yearProfile(year);
        const day = dayProfile(selectedDate);
        const relations = [
            compareElements(day.elementKey, age.elementKey, `tuổi ${age.name}`),
            compareStems(day, age),
            compareBranches(day, age)
        ];
        const summary = readingSummary(relations);

        document.getElementById('ageReadingDayLabel').textContent = `Đánh giá theo ngày ${day.name}`;
        document.getElementById('ageReadingTitle').textContent = `Tuổi ${age.name}`;
        document.getElementById('ageReadingSubtitle').textContent = `Sinh năm ${year} – Mệnh ${age.napAm}`;
        setRelationResult('ageElement', relations[0]);
        setRelationResult('ageStem', relations[1]);
        setRelationResult('ageBranch', relations[2]);
        document.getElementById('ageReadingImpact').textContent = summary.impact;
        document.getElementById('ageReadingNote').textContent = summary.note;
        empty.hidden = true;
        result.hidden = false;
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
    renderAgeReading();

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
