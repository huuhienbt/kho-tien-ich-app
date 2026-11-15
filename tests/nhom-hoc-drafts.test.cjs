'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), {webcrypto} = require('node:crypto');
const {create} = require('../js/groups-drafts.js');
const clone = value => JSON.parse(JSON.stringify(value));
const TTL = 12 * 60 * 60 * 1000;
function storageFixture() {
  const items = new Map();
  return {items, fail:false, get length() {return items.size;}, key(index) {return [...items.keys()][index] ?? null;},
    getItem(key) {return items.get(key) ?? null;}, setItem(key, value) {if (this.fail) throw Error('QuotaExceededError'); items.set(key, value);}, removeItem(key) {items.delete(key);}};
}
function viewFixture() {
  return {group:{ma_nhom:'g24', ten_nhom:'Tên nhóm riêng tư', trang_thai:'dang_hoc', don_gia_vnd:62500}, month:'2026-11', today:'2026-11-15', closed:false,
    sessions:[{ma_buoi:'lesson-1', ngay_hoc:'2026-11-11', trang_thai:'da_hoc', revision:'revision-1'}, {ma_buoi:'lesson-2', ngay_hoc:'2026-11-14', trang_thai:'du_kien', revision:'revision-2'}],
    roster:[{ma_hoc_sinh:'s1', ho_ten:'Tên học sinh riêng tư', ngay_vao:'2026-09-01', ngay_nghi:'', so_tien_vnd:999999}, {ma_hoc_sinh:'s2', ngay_vao:'2026-11-01', ngay_nghi:''}],
    marks:[{ma_buoi:'lesson-1', ma_hoc_sinh:'s1', trang_thai:'co_mat', ghi_chu:''}], receipts:[{so_tien_vnd:987654321}]};
}
const dirty = () => ({'lesson-1':{s1:{status:'vang', note:'Xin phép'}}});
async function storeFor(storage, token='private-admin-token', now=()=>100000) {return create(token, {storage, crypto:webcrypto, now});}
function savedEnvelope(storage) {const [key, raw] = [...storage.items][0]; return {key, value:JSON.parse(raw)};}

test('Reload restores only an attendance draft, scoped to token, group and period, without exposing names or money', async () => {
  const storage=storageFixture(), view=viewFixture(), before=clone(view), store=await storeFor(storage);
  assert.equal(store.available,true); assert.equal(store.mode,'persistent');
  assert.equal(store.write(view, dirty()).persisted,true);
  const raw=JSON.stringify([...storage.items]);
  for (const privateValue of ['private-admin-token','Tên nhóm riêng tư','Tên học sinh riêng tư','62500','999999','987654321']) assert(!raw.includes(privateValue));
  const reloaded=await storeFor(storage); const result=reloaded.read(view);
  assert.deepEqual(result.drafts,dirty()); assert.equal(result.conflicts,false); assert.equal(result.persisted,true); assert.equal(result.expiresAt-result.savedAt,TTL);
  assert.equal((await storeFor(storage,'another-session')).read(view),null);
  assert.equal(reloaded.read({...view, month:'2026-12'}),null);
  assert.equal(reloaded.read({...view, group:{...view.group, ma_nhom:'g35'}}),null);
  assert.deepEqual(view,before,'Draft reads and writes never mutate the server view');
});
test('Draft expires after 12 hours; malformed dates and clock-forged envelopes are discarded',async()=>{
  const storage=storageFixture(), view=viewFixture(); let now=100000;
  const store=await storeFor(storage,undefined,()=>now); store.write(view,dirty());
  now+=TTL-1; assert(store.read(view)); now++; assert.equal(store.read(view),null); assert.equal(storage.length,0);
  now=100000; store.write(view,dirty()); let {key,value}=savedEnvelope(storage); value.savedAt=now+60001;value.expiresAt=value.savedAt+TTL;storage.setItem(key,JSON.stringify(value));assert.equal(store.read(view),null);
  store.write(view,dirty()); ({key,value}=savedEnvelope(storage));value.expiresAt++;storage.setItem(key,JSON.stringify(value));assert.equal(store.read(view),null);
});
test('Closed or archived periods cannot restore; future, canceled and out-of-membership marks are filtered',async()=>{
  for (const changed of [{closed:true},{group:{ma_nhom:'g24',trang_thai:'luu_tru'}}]) {
    const storage=storageFixture(), view=viewFixture(), store=await storeFor(storage);store.write(view,dirty());
    assert.equal(store.read({...view,...changed}),null); assert.equal(storage.length,0);
  }
  const storage=storageFixture(), view=viewFixture(), store=await storeFor(storage);
  const draft={...dirty(),'lesson-2':{s1:{status:'co_mat',note:''},s2:{status:'vang',note:''}}};store.write(view,draft);
  const modified=clone(view);modified.sessions[1].ngay_hoc='2026-11-16';assert.deepEqual(store.read(modified).drafts,dirty());
  modified.sessions[1].ngay_hoc='2026-11-14';modified.sessions[1].trang_thai='da_huy';assert.deepEqual(store.read(modified).drafts,dirty());
  modified.sessions[1].trang_thai='du_kien';modified.roster[1].ngay_vao='2026-11-15';assert.equal(store.read(modified).drafts['lesson-2'].s2,undefined);
  modified.roster[0].ngay_nghi='2026-11-10';assert.equal(store.read(modified),null);
});
test('Corrupted or malicious storage does not pollute objects or restore invalid status, note or row shape',async()=>{
  const storage=storageFixture(), view=viewFixture(), store=await storeFor(storage);store.write(view,dirty());const initial=savedEnvelope(storage);
  for (const raw of ['{','[]','null','{"__proto__":{"polluted":true}}']) {storage.setItem(initial.key,raw);assert.equal(store.read(view),null);}
  for (const patch of [{status:'paid'}, {note:'x'.repeat(501)}, {studentId:'__proto__'}, {baseline:{status:'vang',note:'',token:'secret'}}, {extra:'unexpected'}]) {
    const value=clone(initial.value);Object.assign(value.sessions[0].marks[0],patch);storage.setItem(initial.key,JSON.stringify(value));assert.equal(store.read(view),null);
  }
  assert.equal({}.polluted,undefined);
  const malicious=JSON.parse('{"__proto__":{"s1":{"status":"co_mat","note":""}}}');assert.equal(store.write(view,malicious).count,0);
});
test('Revision or baseline conflicts keep the stored draft but block restoration and accidental replacement',async()=>{
  for (const change of ['revision','baseline']) {
    const storage=storageFixture(), view=viewFixture(), store=await storeFor(storage);store.write(view,dirty());const initial=[...storage.items];
    const changed=clone(view);if(change==='revision')changed.sessions[0].revision='new-revision';else changed.marks[0].ghi_chu='Được sửa ở thiết bị khác';
    const result=store.read(changed);assert.equal(result.conflicts,true);assert.deepEqual(result.drafts,{});assert.deepEqual([...storage.items],initial);
    assert.equal(store.write(changed,dirty()).reason,'server-conflict');assert.deepEqual([...storage.items],initial);
    store.remove(view.group.ma_nhom,view.month);assert.equal(store.read(changed),null);
    assert.equal(store.write(changed,dirty()).persisted,true);
  }
});
test('Two tabs detect a changed draft before writing; empty writes do not discard existing drafts',async()=>{
  const storage=storageFixture(),view=viewFixture(),first=await storeFor(storage),second=await storeFor(storage);
  assert.equal(first.read(view),null);assert.equal(second.read(view),null);assert.equal(first.write(view,dirty()).persisted,true);
  const changed=dirty();changed['lesson-1'].s1.note='Nháp tab khác';assert.equal(second.write(view,changed).reason,'changed-in-another-tab');
  const unseen=await storeFor(storage);assert.equal(unseen.write(view,changed).reason,'changed-in-another-tab');
  assert.equal(second.write(view,{}).reason,'empty');assert.deepEqual(first.read(view).drafts,dirty());
  second.read(view);assert.equal(second.write(view,changed).persisted,true);assert.equal(first.write(view,dirty()).reason,'changed-in-another-tab');
  assert.equal(first.read(view).drafts['lesson-1'].s1.note,'Nháp tab khác');
});
test('Removing after save or discard refuses a newer envelope from another tab',async()=>{
  const storage=storageFixture(),view=viewFixture(),first=await storeFor(storage),second=await storeFor(storage);
  first.write(view,dirty());second.read(view);const changed=dirty();changed['lesson-1'].s1.note='Bản mới tab thứ hai';second.write(view,changed);
  const newest=[...storage.items];assert.equal(first.remove(view.group.ma_nhom,view.month),false);assert.deepEqual([...storage.items],newest);
  assert.equal(second.read(view).drafts['lesson-1'].s1.note,'Bản mới tab thứ hai');
  first.read(view);assert.equal(first.remove(view.group.ma_nhom,view.month),true);assert.equal(second.read(view),null);
});
test('A memory fallback cannot authorize removal of an unseen persisted envelope',async()=>{
  const storage=storageFixture(),view=viewFixture(),first=await storeFor(storage),second=await storeFor(storage);first.write(view,dirty());
  storage.fail=true;const changed=dirty();changed['lesson-1'].s1.note='Chỉ có ở bộ nhớ';assert.equal(first.write(view,changed).persisted,false);
  storage.fail=false;second.read(view);const newer=dirty();newer['lesson-1'].s1.note='Được lưu ở tab khác';second.write(view,newer);
  assert.equal(first.read(view).drafts['lesson-1'].s1.note,'Chỉ có ở bộ nhớ');
  const newest=[...storage.items];assert.equal(first.remove(view.group.ma_nhom,view.month),false);assert.deepEqual([...storage.items],newest);
  assert.equal(first.clear(),true,'Logout intentionally clears every draft in the same scope');assert.equal(storage.length,0);
});
test('Storage failures fall back to memory without throwing or overwriting a previously persisted draft',async()=>{
  const storage=storageFixture(),view=viewFixture(),store=await storeFor(storage);store.write(view,dirty());const initial=[...storage.items];storage.fail=true;
  const changed=dirty();changed['lesson-1'].s1.note='Giữ trong trang';const result=store.write(view,changed);
  assert.equal(result.persisted,false);assert.equal(result.reason,'storage-unavailable');assert.equal(store.available,false);assert.equal(store.mode,'memory');
  assert.equal(store.read(view).drafts['lesson-1'].s1.note,'Giữ trong trang');assert.deepEqual([...storage.items],initial);
  assert.equal(store.clear(),true);assert.equal(storage.length,0);assert.equal(store.read(view),null);
});
test('Missing crypto, token, denied storage or storage itself remains memory-only; logout clears only the current scope',async()=>{
  const view=viewFixture(), shared=storageFixture();
  const denied={get length(){throw Error('SecurityError');}};
  for(const options of [{storage:null,crypto:webcrypto},{storage:shared,crypto:null},{storage:denied,crypto:webcrypto}]) {
    const store=await create('token',options);assert.equal(store.available,false);assert.equal(store.write(view,dirty()).persisted,false);assert.deepEqual(store.read(view).drafts,dirty());
  }
  const anonymous=await create('',{storage:shared,crypto:webcrypto});assert.equal(anonymous.available,false);anonymous.write(view,dirty());assert.equal(shared.length,0);
  const first=await storeFor(shared,'first'),second=await storeFor(shared,'second');first.write(view,dirty());first.write({...view,month:'2026-12'},dirty());second.write(view,dirty());shared.setItem('other-app','retained');
  assert.equal(first.clear(),true);assert.equal(first.read(view),null);assert.equal(first.read({...view,month:'2026-12'}),null);assert.deepEqual(second.read(view).drafts,dirty());assert.equal(shared.getItem('other-app'),'retained');
});
test('The browser global supports API objects across realms without requiring CommonJS',async()=>{
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const browser=vm.createContext({crypto:webcrypto,TextEncoder});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/groups-drafts.js'),'utf8'),browser);
  assert.equal(typeof browser.NHLocalDrafts.create,'function');
  const storage=storageFixture(),store=await browser.NHLocalDrafts.create('token',{storage,crypto:webcrypto});
  assert.equal(store.write(viewFixture(),dirty()).persisted,true);
  const read=store.read(viewFixture());assert.equal(read.drafts['lesson-1'].s1.note,'Xin phép');assert.equal(read.conflicts,false);
});
