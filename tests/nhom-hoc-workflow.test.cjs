'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const workflow = require('../js/groups-workflow.js');

const group = (id, extra = {}) => ({ma_nhom: id, ten_nhom: 'Nhóm ' + id, trang_thai: 'dang_hoc', so_buoi_moi_ky: 8, ky_bat_dau: '2026-09', ky_hien_tai: '2026-11', ...extra});
const student = (id, extra = {}) => ({ma_hoc_sinh: id, ho_ten: 'Học sinh ' + id, ngay_vao: '2026-09-01', ngay_nghi: '', ...extra});
const session = (id, date, extra = {}) => ({ma_buoi: id, ngay_hoc: date, trang_thai: 'da_hoc', gio_bat_dau: '17:00', gio_ket_thuc: '18:30', ...extra});
const view = (id, extra = {}) => ({group: group(id), month: '2026-11', period: {mode: 'eight_sessions', size: 8, completed: 1}, closed: false,
  roster: [student('a'), student('b')], sessions: [], marks: [], ...extra});
const mark = (sessionId, studentId, status) => ({ma_buoi: sessionId, ma_hoc_sinh: studentId, trang_thai: status});
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('period reads use the raw current cycle and previous key, never before cycle start; calendar rolls back across years', () => {
  const input = freeze([group('cycle', {ky_hien_tai: '2027-01'}), group('first', {ky_hien_tai: '2026-09'}),
    group('calendar', {so_buoi_moi_ky: 0}), group('archived', {trang_thai: 'luu_tru'}), group('cycle', {ky_hien_tai: '2027-01'})]);
  assert.deepEqual(workflow.periods(input, '2027-01-02'), [
    {groupId: 'cycle', month: '2027-01'}, {groupId: 'cycle', month: '2026-12'}, {groupId: 'first', month: '2026-09'},
    {groupId: 'calendar', month: '2027-01'}, {groupId: 'calendar', month: '2026-12'}
  ]);
  assert.deepEqual(workflow.periods([group('lower', {so_buoi_moi_ky: 0})], '2000-01-01'), [{groupId: 'lower', month: '2000-01'}]);
});

test('invalid dates, cycle metadata and keys outside the supported years do not produce navigation', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-1-02', '1999-12-31', '2101-01-01', '', null]) {
    assert.deepEqual(workflow.periods([group('x')], date), []);
    assert.deepEqual(workflow.summarize([view('x')], {today: date}), {today: [], tasks: []});
  }
  assert.deepEqual(workflow.periods([group('bad', {ky_hien_tai: '2026-13'}), group('early', {ky_hien_tai: '2026-08'}),
    group('start', {ky_bat_dau: 'bad'}), group('upper', {ky_hien_tai: '2101-01'})], '2026-11-15'), []);
  assert.equal(workflow.periods([group('leap', {so_buoi_moi_ky: 0})], '2028-02-29').length, 2);
});

test('today uses actual lessons across groups, sorts by lesson time and exposes closed lessons as read-only', () => {
  const a = view('a', {sessions: [session('late', '2026-11-15'), session('old', '2026-11-14'), session('cancel', '2026-11-15', {trang_thai: 'da_huy'})], marks: [mark('late', 'a', 'co_mat'), mark('late', 'b', 'vang')]});
  const b = view('b', {closed: true, sessions: [session('early', '2026-11-15', {gio_bat_dau: '08:00'})]});
  const archived = view('gone', {group: group('gone', {trang_thai: 'luu_tru'}), sessions: [session('ignored', '2026-11-15')]});
  const result = workflow.summarize([a, b, archived], {today: '2026-11-15'});
  assert.deepEqual(result.today.map(row => [row.groupId, row.sessionId]), [['b', 'early'], ['a', 'late']]);
  assert.equal(result.today[0].closed, true); assert.equal(result.today[0].missing, 2); assert.equal(result.today[0].completed, false);
  assert.equal(result.today[1].completed, true); assert.equal(result.today[1].confirmed, true); assert.equal(result.today[1].missing, 0);
  assert.deepEqual(result.today[1].navigation, {groupId: 'a', month: '2026-11', sessionId: 'late', tab: 'attendance'});
  assert.equal(result.tasks.some(row => row.groupId === 'b'), false);
  assert.equal(result.today.some(row => row.sessionId === 'cancel'), false);
});

test('attendance includes members only on their joined/last dates, uses drafts, dedupes memberships and preserves plain names', () => {
  const input = freeze(view('a', {sessions: [session('s', '2026-11-15')], roster: [
    student('a', {ho_ten: '<b>An</b>'}), student('b', {ngay_vao: '2026-11-15'}), student('c', {ngay_nghi: '2026-11-15'}),
    student('later', {ngay_vao: '2026-11-16'}), student('left', {ngay_nghi: '2026-11-14'}),
    student('badJoin', {ngay_vao: '2026-02-30'}), student('badLeave', {ngay_nghi: '2026-02-30'}), student('a')
  ], marks: [mark('s', 'a', 'co_mat'), mark('s', 'b', 'vang'), mark('s', 'later', 'co_mat'), mark('other', 'c', 'co_mat')]}));
  const drafts = freeze({s: {a: {status: 'vang', note: 'Nghỉ'}, b: {status: 'chua_diem_danh'}, c: {status: 'co_mat'}}});
  assert.deepEqual(workflow.attendanceSummary(input, drafts, 's'), {total: 3, present: 1, absent: 1, missing: 1, absentNames: ['<b>An</b>'], missingNames: ['Học sinh b']});
  assert.deepEqual(workflow.attendanceSummary(input, null, 's'), {total: 3, present: 1, absent: 1, missing: 1, absentNames: ['Học sinh b'], missingNames: ['Học sinh c']});
  assert.equal(workflow.attendanceSummary(input, {s: {a: {note: 'Only a note'}}}, 's').present, 1);
  assert.deepEqual(workflow.attendanceSummary(input, drafts, 'unknown'), {total: 0, present: 0, absent: 0, missing: 0, absentNames: [], missingNames: []});
});

test('one attendance task per overdue lesson combines unconfirmed and missing marks; future and canceled lessons are ignored', () => {
  const input = view('a', {sessions: [session('past', '2026-11-13', {trang_thai: 'du_kien'}), session('missing', '2026-11-14'),
    session('future', '2026-11-16', {trang_thai: 'du_kien'}), session('canceled', '2026-11-14', {trang_thai: 'da_huy'}), session('bad', '2026-02-30')],
  marks: [mark('past', 'a', 'co_mat'), mark('missing', 'a', 'vang'), mark('missing', 'b', 'chua_diem_danh')]});
  const before = JSON.stringify(input), result = workflow.summarize([freeze(input), input], {today: '2026-11-15'});
  assert.deepEqual(result.tasks.map(row => row.sessionId), ['past', 'missing']);
  assert.equal(result.tasks[0].kind, 'attendance'); assert.equal(result.tasks[0].unconfirmed, true); assert.equal(result.tasks[0].missing, 1);
  assert.equal(result.tasks[1].unconfirmed, false); assert.equal(result.tasks[1].missing, 1);
  assert.equal(new Set(result.tasks.map(row => row.key)).size, 2); assert.equal(result.tasks.every(row => row.key === row.id), true);
  assert.equal(JSON.stringify(input), before);
});

test('period closing, rent and backup produce one actionable reminder without inviting edits to closed or archived history', () => {
  const open = view('open', {period: {mode: 'eight_sessions', completed: 8}});
  const closed = view('closed', {closed: true, period: {mode: 'eight_sessions', completed: 8}, sessions: [session('past', '2026-11-14')]});
  const archived = view('old', {group: group('old', {trang_thai: 'luu_tru'}), period: {mode: 'eight_sessions', completed: 8}});
  const calendar = view('calendar', {period: {mode: 'calendar', completed: 8}});
  const result = workflow.summarize([open, open, closed, archived, calendar], {today: '2026-11-15', rent: {unpaid: 32}, backup: {state: 'error'}});
  assert.deepEqual(result.tasks.map(row => row.kind), ['close-period', 'rent', 'backup']);
  assert.deepEqual(result.tasks[0].navigation, {groupId: 'open', month: '2026-11', sessionId: '', tab: 'fees'});
  assert.equal(result.tasks[1].unpaid, 32); assert.equal(result.tasks[2].backupState, 'error');
  assert.equal(workflow.summarize([], {today: '2026-11-15', rent: {unpaid: 15}, backup: {state: 'pending'}}).tasks.length, 0);
  assert.equal(workflow.summarize([], {today: '2026-11-15', backup: {state: 'unconfigured'}}).tasks[0].kind, 'backup');
});

test('duplicate closed responses win over stale open responses, and session navigation respects its original period', () => {
  const s = session('shared', '2026-11-15', {ky_hoc: '2026-10'});
  const current = view('a', {month: '2026-11', sessions: [s]});
  const previous = view('a', {month: '2026-10', sessions: [s]});
  const result = workflow.summarize([current, previous, {...previous, closed: true}], {today: '2026-11-15'});
  assert.equal(result.today.length, 1); assert.equal(result.today[0].month, '2026-10'); assert.equal(result.today[0].closed, true);
  assert.deepEqual(result.tasks, []);
});

test('helpers load as browser globals without DOM/network and do not mutate frozen ledger, rent, backup or drafts', () => {
  const browser = {}; vm.runInNewContext(fs.readFileSync(require.resolve('../js/groups-workflow.js'), 'utf8'), browser);
  assert.equal(typeof browser.NHWorkflow.periods, 'function'); assert.equal(typeof browser.NHWorkflow.summarize, 'function');
  const input = freeze([view('a', {sessions: [session('s', '2026-11-15')], marks: [mark('s', 'a', 'co_mat')]})]);
  const options = freeze({today: '2026-11-15', rent: {unpaid: 16}, backup: {state: 'error'}}), drafts = freeze({s: {b: {status: 'vang'}}});
  const before = JSON.stringify({input, options, drafts});
  const output = workflow.summarize(input, options); workflow.attendanceSummary(input[0], drafts, 's');
  output.today[0].navigation.month = '2020-01'; output.tasks[0].title = 'Changed output';
  assert.equal(JSON.stringify({input, options, drafts}), before);
});
