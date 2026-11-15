/* Local attendance drafts only. This module never sends requests or saves ledger data. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NHLocalDrafts = api;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';
  const TTL = 12 * 60 * 60 * 1000;
  const PREFIX = 'egv.nh.drafts.v1.';
  const STATUSES = new Set(['co_mat', 'vang', 'chua_diem_danh']);
  const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const plain = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    // Also accepts a JSON object from another window/realm, but not class instances.
    return prototype === null || Object.getPrototypeOf(prototype) === null;
  };
  const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value) && !BLOCKED_KEYS.has(value);
  const month = value => typeof value === 'string' && /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value);
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  const revision = value => typeof value === 'string' && value.length > 0 && value.length <= 200 ||
    Number.isSafeInteger(value) && value >= 0;
  const mark = value => plain(value) && STATUSES.has(value.status) && typeof value.note === 'string' && value.note.length <= 500;
  const onlyKeys = (value, keys) => plain(value) && Object.keys(value).every(key => keys.includes(key));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const globalValue = key => { try { return root[key]; } catch (_) { return null; } };

  function context(view) {
    if (!plain(view) || !plain(view.group) || !id(view.group.ma_nhom) || !month(view.month)) return null;
    return {groupId:view.group.ma_nhom, month:view.month};
  }
  function editable(view) {
    return !view.closed && view.group.trang_thai === 'dang_hoc' && date(view.today) &&
      Array.isArray(view.sessions) && Array.isArray(view.roster) && Array.isArray(view.marks);
  }
  function sessionFor(view, sessionId) {
    const session = view.sessions.find(row => row && row.ma_buoi === sessionId);
    return session && date(session.ngay_hoc) && session.ngay_hoc <= view.today &&
      ['da_hoc', 'du_kien'].includes(session.trang_thai) && revision(session.revision) ? session : null;
  }
  function memberFor(view, studentId, lessonDate) {
    return view.roster.some(row => row && row.ma_hoc_sinh === studentId &&
      (!row.ma_nhom || row.ma_nhom === view.group.ma_nhom) && date(row.ngay_vao) && row.ngay_vao <= lessonDate &&
      (!row.ngay_nghi || date(row.ngay_nghi) && row.ngay_nghi >= lessonDate));
  }
  function baselineFor(view, sessionId, studentId) {
    const saved = view.marks.find(row => row && row.ma_buoi === sessionId && row.ma_hoc_sinh === studentId);
    const baseline = saved ? {status:saved.trang_thai, note:saved.ghi_chu || ''} : {status:'chua_diem_danh', note:''};
    return mark(baseline) ? baseline : null;
  }

  async function create(token, options = {}) {
    options = plain(options) ? options : {};
    const cryptography = own(options, 'crypto') ? options.crypto : globalValue('crypto');
    const suppliedStorage = own(options, 'storage') ? options.storage : globalValue('localStorage');
    const clock = typeof options.now === 'function' ? options.now : Date.now;
    const time = () => { try { const value = clock(); return Number.isSafeInteger(value) && value >= 0 ? value : Date.now(); } catch (_) { return Date.now(); } };
    let scope = '';
    try {
      if (typeof token === 'string' && token.length && cryptography?.subtle?.digest) {
        const Encoder = globalValue('TextEncoder');
        const digest = await cryptography.subtle.digest('SHA-256', new Encoder().encode(token));
        scope = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      }
    } catch (_) { /* Browsers without crypto still keep the current in-memory draft. */ }
    token = '';
    let storage = null;
    try {
      if (scope.length === 64 && suppliedStorage && ['getItem', 'setItem', 'removeItem', 'key'].every(key => typeof suppliedStorage[key] === 'function') &&
        Number.isSafeInteger(suppliedStorage.length) && suppliedStorage.length >= 0) storage = suppliedStorage;
    } catch (_) { /* Private mode or a disabled storage policy. */ }
    let canPersist = !!storage;
    const prefix = PREFIX + (scope || 'memory') + '.';
    const memory = new Map(), observed = new Map(), conflicts = new Set();
    const keyFor = ctx => prefix + encodeURIComponent(ctx.groupId) + '.' + ctx.month;
    const readRaw = key => {
      if (memory.has(key)) return memory.get(key);
      if (!storage) return null;
      try { return storage.getItem(key); } catch (_) { canPersist = false; return null; }
    };
    function remove(groupId, period) {
      if (!id(groupId) || !month(period)) return false;
      const key = keyFor({groupId, month:period});
      try {
        if (storage) {
          // Discard/save in this tab must not delete a draft updated in another tab.
          const current = storage.getItem(key);
          if (current !== (observed.has(key) ? observed.get(key) : null)) return false;
          storage.removeItem(key);
        }
        memory.delete(key); observed.set(key, null); conflicts.delete(key);
        return true;
      } catch (_) { canPersist = false; return false; }
    }
    function clear() {
      memory.clear(); observed.clear(); conflicts.clear();
      if (!storage) return true;
      try {
        const keys = [];
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (typeof key === 'string' && key.startsWith(prefix)) keys.push(key);
        }
        keys.forEach(key => storage.removeItem(key));
        return true;
      } catch (_) { canPersist = false; return false; }
    }
    function read(view) {
      const ctx = context(view);
      if (!ctx) return null;
      const key = keyFor(ctx), raw = readRaw(key);
      // A memory fallback is not evidence that the persisted envelope was observed.
      if (!storage || !memory.has(key)) observed.set(key, raw);
      if (!raw) return null;
      if (!editable(view)) { remove(ctx.groupId, ctx.month); return null; }
      let saved;
      try { saved = JSON.parse(raw); } catch (_) { remove(ctx.groupId, ctx.month); return null; }
      const now = time();
      if (!onlyKeys(saved, ['version', 'groupId', 'month', 'savedAt', 'expiresAt', 'sessions']) || saved.version !== 1 ||
        saved.groupId !== ctx.groupId || saved.month !== ctx.month || !Number.isSafeInteger(saved.savedAt) || saved.savedAt < 0 ||
        saved.savedAt > now + 60000 || saved.expiresAt !== saved.savedAt + TTL || saved.expiresAt <= now ||
        !Array.isArray(saved.sessions) || saved.sessions.length > 1000) {
        remove(ctx.groupId, ctx.month); return null;
      }
      const drafts = {}, seen = new Set();
      let hasConflicts = false, count = 0;
      for (const row of saved.sessions) {
        if (!onlyKeys(row, ['id', 'revision', 'marks']) || !id(row.id) || !revision(row.revision) ||
          !Array.isArray(row.marks) || row.marks.length > 1000 || seen.has(row.id)) continue;
        seen.add(row.id);
        const session = sessionFor(view, row.id);
        if (!session) continue;
        const seenStudents = new Set();
        for (const entry of row.marks) {
          if (!onlyKeys(entry, ['studentId', 'status', 'note', 'baseline']) || !id(entry.studentId) ||
            !mark(entry) || !onlyKeys(entry.baseline, ['status', 'note']) || !mark(entry.baseline) || seenStudents.has(entry.studentId) ||
            !memberFor(view, entry.studentId, session.ngay_hoc)) continue;
          seenStudents.add(entry.studentId);
          const baseline = baselineFor(view, row.id, entry.studentId);
          if (!baseline) continue;
          if (row.revision !== session.revision || baseline.status !== entry.baseline.status || baseline.note !== entry.baseline.note) hasConflicts = true;
          if (entry.status === baseline.status && entry.note === baseline.note) continue;
          (drafts[row.id] ||= {})[entry.studentId] = {status:entry.status, note:entry.note};
          count++;
        }
      }
      if (hasConflicts) conflicts.add(key); else conflicts.delete(key);
      if (!count && !hasConflicts) { remove(ctx.groupId, ctx.month); return null; }
      return {drafts:hasConflicts ? {} : drafts, conflicts:hasConflicts, savedAt:saved.savedAt, expiresAt:saved.expiresAt,
        persisted:!!storage && !memory.has(key), count:hasConflicts ? 0 : count};
    }
    function write(view, drafts) {
      const ctx = context(view);
      if (!ctx || !editable(view) || !plain(drafts)) return {persisted:false, count:0, reason:'invalid-view'};
      const key = keyFor(ctx);
      if (conflicts.has(key)) return {persisted:false, count:0, reason:'server-conflict'};
      const sessions = []; let count = 0;
      for (const sessionId of Object.keys(drafts).slice(0, 1000)) {
        if (!id(sessionId) || !plain(drafts[sessionId])) continue;
        const session = sessionFor(view, sessionId);
        if (!session) continue;
        const marks = [];
        for (const studentId of Object.keys(drafts[sessionId]).slice(0, 1000)) {
          const entry = drafts[sessionId][studentId];
          if (!id(studentId) || !mark(entry) || !memberFor(view, studentId, session.ngay_hoc)) continue;
          const baseline = baselineFor(view, sessionId, studentId);
          if (!baseline || entry.status === baseline.status && entry.note === baseline.note) continue;
          marks.push({studentId, status:entry.status, note:entry.note, baseline}); count++;
        }
        if (marks.length) sessions.push({id:sessionId, revision:session.revision, marks});
      }
      // An empty write is not an explicit discard and must not delete another tab's draft.
      if (!count) return {persisted:false, count:0, reason:'empty'};
      const savedAt = time(), expiresAt = savedAt + TTL;
      const raw = JSON.stringify({version:1, ...ctx, savedAt, expiresAt, sessions});
      if (storage && canPersist) {
        try {
          const current = storage.getItem(key);
          if (current !== (observed.has(key) ? observed.get(key) : null)) return {persisted:false, count, reason:'changed-in-another-tab'};
          // localStorage has no atomic CAS; compare synchronously immediately before writing.
          storage.setItem(key, raw); observed.set(key, raw); memory.delete(key);
          return {persisted:true, count, savedAt, expiresAt};
        } catch (_) { canPersist = false; }
      }
      memory.set(key, raw);
      if (!storage) observed.set(key, raw);
      return {persisted:false, count, savedAt, expiresAt, reason:'storage-unavailable'};
    }
    return Object.freeze({write, read, remove, clear,
      get available() { return canPersist; }, get mode() { return canPersist ? 'persistent' : 'memory'; }});
  }
  return Object.freeze({create});
});
