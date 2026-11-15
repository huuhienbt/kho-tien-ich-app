(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NHWorkflow = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // This module only derives navigation and reminders from the existing ledger.
  // Period keys remain YYYY-MM; no record, draft or API payload is changed here.
  const list = value => Array.isArray(value) ? value : [];
  const id = value => typeof value === 'string' && value.length > 0;
  const own = (object, key) => object && Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
  const validMonth = value => typeof value === 'string' && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);
  function validDate(value) {
    if (typeof value !== 'string' || !/^(20\d{2}|2100)-(0[1-9]|1[0-2])-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  const active = group => group && id(group.ma_nhom) && group.trang_thai === 'dang_hoc';
  const name = student => typeof student.ho_ten === 'string' ? student.ho_ten : student.ma_hoc_sinh;
  const groupName = group => typeof group.ten_nhom === 'string' ? group.ten_nhom : group.ma_nhom;
  const dateLabel = date => date.split('-').reverse().join('/');
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : '';
  const stableKey = (kind, values) => kind + ':' + JSON.stringify(values);
  function previousMonth(month) {
    const [year, number] = month.split('-').map(Number);
    const value = new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7);
    return validMonth(value) ? value : '';
  }

  function periods(groups, today) {
    if (!validDate(today)) return [];
    const result = [], seen = new Set();
    for (const group of list(groups)) {
      if (!active(group)) continue;
      const cycle = Number(group.so_buoi_moi_ky) === 8;
      const start = cycle ? group.ky_bat_dau : '';
      const current = cycle ? group.ky_hien_tai : today.slice(0, 7);
      if (!validMonth(current) || cycle && (!validMonth(start) || current < start)) continue;
      for (const month of [current, previousMonth(current)]) {
        if (!month || cycle && month < start) continue;
        const key = stableKey('period', [group.ma_nhom, month]);
        if (!seen.has(key)) { seen.add(key); result.push({groupId: group.ma_nhom, month}); }
      }
    }
    return result;
  }

  function attendanceSummary(view, drafts, sessionId) {
    const result = {total: 0, present: 0, absent: 0, missing: 0, absentNames: [], missingNames: []};
    const session = list(view && view.sessions).find(row => row && row.ma_buoi === sessionId);
    if (!session || session.trang_thai === 'da_huy' || !validDate(session.ngay_hoc)) return result;
    const marks = new Map(), students = new Set(), rows = own(drafts, sessionId);
    for (const mark of list(view.marks)) {
      if (mark && mark.ma_buoi === sessionId && id(mark.ma_hoc_sinh)) marks.set(mark.ma_hoc_sinh, mark.trang_thai);
    }
    for (const student of list(view.roster)) {
      if (!student || !id(student.ma_hoc_sinh) || students.has(student.ma_hoc_sinh)) continue;
      if (!validDate(student.ngay_vao) || student.ngay_vao > session.ngay_hoc) continue;
      if (student.ngay_nghi && (!validDate(student.ngay_nghi) || student.ngay_nghi < session.ngay_hoc)) continue;
      students.add(student.ma_hoc_sinh); result.total++;
      const draft = own(rows, student.ma_hoc_sinh);
      const status = draft && own(draft, 'status') !== undefined ? draft.status : marks.get(student.ma_hoc_sinh);
      if (status === 'co_mat') result.present++;
      else if (status === 'vang') { result.absent++; result.absentNames.push(name(student)); }
      else { result.missing++; result.missingNames.push(name(student)); }
    }
    return result;
  }

  function navigation(groupId = '', month = '', sessionId = '', tab = 'attendance') {
    return {groupId, month, sessionId, tab};
  }
  function task(kind, values, title, detail, nav, extra) {
    const key = stableKey(kind, values);
    return Object.assign({key, id: key, kind, title, detail}, nav, {navigation: Object.assign({}, nav)}, extra);
  }
  function summarize(views, options = {}) {
    options = options || {};
    const today = options.today;
    const result = {today: [], tasks: []};
    if (!validDate(today)) return result;
    const periodsByKey = new Map(), sessionsByKey = new Map();
    // If duplicate responses disagree about closure, stay conservative: a closed
    // period must never become an editable reminder because of a stale response.
    for (const view of list(views)) {
      if (!view || !active(view.group) || !validMonth(view.month)) continue;
      if (Number(view.group.so_buoi_moi_ky) === 8 && validMonth(view.group.ky_bat_dau) && view.month < view.group.ky_bat_dau) continue;
      const key = stableKey('period', [view.group.ma_nhom, view.month]), previous = periodsByKey.get(key);
      if (!previous || !previous.closed && view.closed) periodsByKey.set(key, view);
    }
    for (const view of periodsByKey.values()) {
      const group = view.group, closed = !!view.closed;
      for (const session of list(view.sessions)) {
        if (!session || !id(session.ma_buoi) || !validDate(session.ngay_hoc) || !['du_kien', 'da_hoc'].includes(session.trang_thai)) continue;
        if (session.ma_nhom && session.ma_nhom !== group.ma_nhom) continue;
        if (validMonth(session.ky_hoc) && session.ky_hoc !== view.month) continue;
        const key = stableKey('session', [group.ma_nhom, session.ma_buoi]), previous = sessionsByKey.get(key);
        if (!previous || !previous.closed && closed) sessionsByKey.set(key, {view, session, closed});
      }
      if (!closed && view.period && view.period.mode === 'eight_sessions' && Number(view.period.completed) >= 8) {
        result.tasks.push(task('close-period', [group.ma_nhom, view.month], 'Chốt học phí · ' + groupName(group),
          'Đã đủ 8 buổi. Kiểm tra điểm danh và học phí trước khi chốt.', navigation(group.ma_nhom, view.month, '', 'fees'),
          {groupName: groupName(group), date: '', completed: Number(view.period.completed)}));
      }
    }
    for (const entry of sessionsByKey.values()) {
      const {view, session, closed} = entry, group = view.group;
      const summary = attendanceSummary(view, null, session.ma_buoi), confirmed = session.trang_thai === 'da_hoc';
      const nav = navigation(group.ma_nhom, view.month, session.ma_buoi);
      const metadata = {groupName: groupName(group), date: session.ngay_hoc, total: summary.total, missing: summary.missing};
      if (session.ngay_hoc === today) {
        const key = stableKey('today', [group.ma_nhom, session.ma_buoi]);
        result.today.push(Object.assign({key, id: key}, nav, metadata, {navigation: Object.assign({}, nav),
          startTime: validTime(session.gio_bat_dau), endTime: validTime(session.gio_ket_thuc),
          closed, confirmed, completed: confirmed && summary.missing === 0}));
      }
      if (!closed && session.ngay_hoc <= today && (!confirmed || summary.missing > 0)) {
        const detail = (!confirmed ? 'Buổi học chưa xác nhận đã học.' : '') +
          (summary.missing ? (!confirmed ? ' ' : '') + summary.missing + '/' + summary.total + ' học sinh chưa điểm danh.' : '');
        result.tasks.push(task('attendance', [group.ma_nhom, session.ma_buoi], groupName(group) + ' · ' + dateLabel(session.ngay_hoc),
          detail, nav, Object.assign({}, metadata, {unconfirmed: !confirmed})));
      }
    }
    const rent = options.rent, backup = options.backup;
    if (rent && Number.isFinite(Number(rent.unpaid)) && Number(rent.unpaid) >= 16) {
      result.tasks.push(task('rent', [], 'Đến hạn tiền phòng', Number(rent.unpaid) + ' buổi đã dạy chưa thanh toán. Ghi nhận khi đã đóng tiền phòng.',
        navigation('', '', '', 'rent'), {groupName: '', date: '', unpaid: Number(rent.unpaid)}));
    }
    if (backup && ['error', 'unconfigured'].includes(backup.state)) {
      result.tasks.push(task('backup', [], backup.state === 'error' ? 'Kiểm tra bản sao lưu Drive' : 'Chưa bật bản sao lưu Drive',
        backup.state === 'error' ? 'Bản Drive chưa được xác nhận cập nhật. Mở mục sao lưu để kiểm tra.' : 'Kết nối sao lưu chưa sẵn sàng. Dữ liệu chính vẫn được lưu trên Cloudflare.',
        navigation('', '', '', 'backup'), {groupName: '', date: '', backupState: backup.state}));
    }
    result.today.sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99') || a.groupName.localeCompare(b.groupName, 'vi') || a.key.localeCompare(b.key));
    const rank = {'attendance': 0, 'close-period': 1, 'rent': 2, 'backup': 3};
    result.tasks.sort((a, b) => rank[a.kind] - rank[b.kind] || a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    return result;
  }

  return Object.freeze({periods, summarize, attendanceSummary});
});
