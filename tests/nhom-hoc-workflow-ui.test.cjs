'use strict';
// Full classbook UI over the old, synthetic ledger. No production API or data.
const test=require('node:test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {TextEncoder,TextDecoder}=require('node:util');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.EGV_QA_DEPENDENCIES||process.cwd()]}));
const {ledgerFixture}=require('./nhom-hoc-ledger.test.cjs');
const root=path.resolve(__dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value));
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const snapshot=h=>Object.fromEntries([...h.sheets].map(([name,sheet])=>[name,copy(sheet.values)]));
const settle=async()=>{for(let i=0;i<45;i++)await new Promise(resolve=>setImmediate(resolve));};
async function waitForReady(document){
  await settle();
  for(let i=0;i<400;i++){
    if(document.getElementById('nhBusy')?.hidden)return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.fail('UI did not finish its requested operation');
}
const readActions=new Set(['nh_boot','nh_view','nh_backup_status']);
function memoryStorage(){
  const entries=new Map();
  return {get length(){return entries.size;},key:i=>[...entries.keys()][i]??null,getItem:key=>entries.get(String(key))??null,setItem:(key,value)=>entries.set(String(key),String(value)),removeItem:key=>entries.delete(String(key)),clear:()=>entries.clear(),text:()=>[...entries.values()].join('\n')};
}
function todayFixture({multiple=false,escapedName=false}={}){
  const h=ledgerFixture();
  if(escapedName)h.api('nh_member_save',{groupId:'g35',memberId:'m2',name:'Đỗ <B> & An',className:'4/6',joinDate:'2026-09-01',leaveDate:'',rate:0});
  function plan(groupId,id){const view=h.api('nh_view',{groupId,month:'2026-09'});h.api('nh_sessions_plan',{groupId,month:'2026-09',revision:view.revision,sessions:[{id,date:'2026-10-12'}]});}
  plan('g35','today35');
  if(multiple){h.api('nh_students_save',{groupId:'g24',joinDate:'2026-09-01',students:[{id:'s3',memberId:'m3',name:'Học sinh nhóm 2–4',className:'5/1'}]});plan('g24','today24');}
  h.setToday('2026-10-12');return h;
}
async function mount(t,options={}){
  const h=options.h||todayFixture(),storage=options.storage||memoryStorage();
  const dom=new JSDOM(fs.readFileSync(path.join(root,'groups.html'),'utf8'),{url:options.url||'https://egv.test/groups.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
  await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
  Object.defineProperty(w,'crypto',{value:webcrypto});Object.defineProperty(w,'localStorage',{value:storage});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  let role=options.role||'admin';const calls=[],errors=[];
  w.confirm=()=>true;w.URL.createObjectURL=()=> 'blob:qa';w.URL.revokeObjectURL=()=>{};
  w.App={init(){},isAdmin:()=>role==='admin',getAdminToken:()=>role==='admin'?'stable-admin-fixture':'',escapeHTML,openLogin(){},async apiPost(action,data){
    calls.push({action,data:copy(data)});if(options.beforeRequest)await options.beforeRequest(action,data,h);
    const result=h.ctx.handleNhomHoc({action,data,...(role==='admin'?{adminToken:'admin-test'}:{userToken:'member'})});
    if(result.status!=='success')throw new Error(result.message);
    if(action==='nh_boot'){
      const rows=h.sheets.get('HocSinh').values,headers=rows[0];
      result.data.students=rows.slice(1).filter(r=>r[0]).map(row=>Object.fromEntries(headers.map((name,i)=>[name,row[i]??''])));
    }
    if(options.afterResponse)await options.afterResponse(action,data,result,h);return w.JSON.parse(JSON.stringify(result));
  }};
  w.addEventListener('error',event=>errors.push(event.message));
  for(const file of ['js/groups-workflow.js','js/groups-drafts.js','js/groups.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));await waitForReady(d);
  t.after(()=>{try{assert.deepEqual(errors,[]);}finally{w.close();}});
  const q=selector=>{const el=d.querySelector(selector);assert(el,'Missing '+selector);return el;},click=selector=>q(selector).click();
  const change=(selector,value)=>{q(selector).value=value;q(selector).dispatchEvent(new w.Event('change',{bubbles:true}));};
  return {h,storage,w,d,q,click,change,calls,ready:()=>waitForReady(d),close:()=>w.close(),writes:()=>calls.filter(c=>!readActions.has(c.action)),
    mark:(student,status)=>click('#nhAttendance [data-mark="'+status+'"][data-student="'+student+'"]'),
    setRole:async value=>{role=value;w.dispatchEvent(new w.Event('app:auth-change'));await waitForReady(d);}};
}

test('Today opens the unique scheduled lesson across groups without modifying the old ledger',async t=>{
  const h=todayFixture(),before=snapshot(h),ui=await mount(t,{h});
  assert.equal(ui.q('#nhDashboard').hidden,false);assert.equal(ui.d.querySelectorAll('[data-open-work]').length,1);
  assert.equal(ui.q('#nhGroupTitle').textContent,'Thứ 3–5');assert.equal(ui.q('#nhSessionSelect').value,'today35');assert.equal(ui.q('#nhMonth').value,'2026-09');
  assert.match(ui.q('#nhGroupTable').textContent,/Thứ 3–5/);assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
  assert(ui.calls.some(c=>c.action==='nh_view'&&c.data.groupId==='g24'));
});
test('Multiple lessons require a choice, and an explicit deep link keeps its original group and lesson',async t=>{
  const h=todayFixture({multiple:true}),before=snapshot(h),ui=await mount(t,{h});
  assert.equal(ui.d.querySelectorAll('[data-open-work]').length,2);assert.equal(ui.d.querySelector('#nhSessionSelect'),null);
  const todayButton=[...ui.d.querySelectorAll('[data-open-work]')].find(button=>(button.getAttribute('aria-label')||button.closest('article')?.textContent||button.textContent).includes('Thứ 3–5'));assert(todayButton);todayButton.click();await ui.ready();
  assert.equal(ui.q('#nhSessionSelect').value,'today35');assert.deepEqual(snapshot(h),before);assert.deepEqual(ui.writes(),[]);
  const linked=await mount(t,{h,url:'https://egv.test/groups.html?group=g24&month=2026-09&session=g24b3'});
  assert.equal(linked.q('#nhGroupTitle').textContent,'Thứ 2–4');assert.equal(linked.q('#nhSessionSelect').value,'g24b3');assert.deepEqual(linked.writes(),[]);
});
test('Attendance completion blocks missing marks and writes only after reviewing the absent names',async t=>{
  const h=todayFixture({escapedName:true}),before=snapshot(h),ui=await mount(t,{h});
  ui.mark('s1','co_mat');ui.click('#nhCompleteAttendance');
  assert.equal(ui.q('#nhCompleteDialog').open,true);assert.equal(ui.q('#nhConfirmComplete').disabled,true);assert.match(ui.q('#nhCompleteMissing').textContent,/1/);
  ui.click('#nhCancelComplete');ui.click('[data-action="all-present"]');ui.mark('s2','vang');
  assert.deepEqual(snapshot(h),before);assert.deepEqual(ui.writes(),[]);ui.click('#nhCompleteAttendance');
  const completeContext=ui.q('#nhCompleteDialog').textContent;
  assert.match(completeContext,/Thứ 3–5/);assert.match(completeContext,/12\/10\/2026/);
  assert.match(ui.q('#nhCompleteAbsent').textContent,/Đỗ <B> & An/);assert.equal(ui.d.querySelector('#nhCompleteAbsent b'),null);assert.equal(ui.q('#nhConfirmComplete').disabled,false);
  ui.click('#nhConfirmComplete');ui.click('#nhConfirmComplete');await ui.ready();
  const writes=ui.writes();assert.equal(writes.length,1);assert.equal(writes[0].action,'nh_attendance_batch_save');assert.equal(writes[0].data.groupId,'g35');assert.equal(writes[0].data.sessions.length,1);assert.equal(writes[0].data.sessions[0].sessionId,'today35');
  const view=h.api('nh_view',{groupId:'g35',month:'2026-09'});assert.equal(view.sessions.find(s=>s.ma_buoi==='today35').trang_thai,'da_hoc');
  assert.equal(view.marks.find(m=>m.ma_buoi==='today35'&&m.ma_hoc_sinh==='s2').trang_thai,'vang');
  const after=snapshot(h);for(const name of ['NhomHoc','HocSinh','ThanhVienNhom','ThuHocPhi','HocPhiKy','TienThuePhong'])assert.deepEqual(after[name],before[name],name+' remains unchanged');
});
test('Completing a future lesson or a closed tuition period is unavailable and never writes',async t=>{
  const h=todayFixture(),view=h.api('nh_view',{groupId:'g35',month:'2026-09'});
  h.api('nh_sessions_plan',{groupId:'g35',month:'2026-09',revision:view.revision,sessions:[{id:'future13',date:'2026-10-13'},{id:'future15',date:'2026-10-15'}]});
  let before=snapshot(h);const future=await mount(t,{h,url:'https://egv.test/groups.html?group=g35&month=2026-09&session=future13'});
  assert.equal(future.q('#nhCompleteAttendance').disabled,true);future.click('#nhCompleteAttendance');assert.equal(future.q('#nhCompleteDialog').open,false);assert.deepEqual(future.writes(),[]);assert.deepEqual(snapshot(h),before);future.close();
  h.setToday('2026-10-15');let current=h.api('nh_view',{groupId:'g35',month:'2026-09'});
  h.api('nh_attendance_batch_save',{groupId:'g35',sessions:current.sessions.map(session=>({sessionId:session.ma_buoi,revision:session.revision,marks:[{studentId:'s1',status:'co_mat'},{studentId:'s2',status:'co_mat'}]}))});
  current=h.api('nh_view',{groupId:'g35',month:'2026-09'});h.api('nh_close_month',{groupId:'g35',month:'2026-09',revision:current.revision});before=snapshot(h);
  const closed=await mount(t,{h,url:'https://egv.test/groups.html?group=g35&month=2026-09&session=future15'});
  assert.equal(closed.q('#nhCompleteAttendance').disabled,true);closed.click('#nhCompleteAttendance');assert.equal(closed.q('#nhCompleteDialog').open,false);assert.deepEqual(closed.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('Automatic local drafts survive reload without becoming official attendance; logout clears them',async t=>{
  const h=todayFixture(),before=snapshot(h),storage=memoryStorage(),first=await mount(t,{h,storage});
  first.mark('s1','vang');assert(storage.length>0);assert(!storage.text().includes('stable-admin-fixture'));assert(!storage.text().includes('Học sinh A'));assert.deepEqual(snapshot(h),before);first.close();
  const reloaded=await mount(t,{h,storage});assert.equal(reloaded.q('#nhLocalDraftNotice').hidden,false);assert.equal(reloaded.q('#nhSaveAttendance').disabled,true);assert.equal(reloaded.q('#nhRestoreLocalDraft').disabled,false);
  reloaded.click('#nhRestoreLocalDraft');await reloaded.ready();assert.equal(reloaded.q('#nhAttendance [data-mark="vang"][data-student="s1"]').getAttribute('aria-pressed'),'true');
  assert.equal(reloaded.q('#nhSaveAttendance').disabled,false);assert.deepEqual(reloaded.writes(),[]);assert.deepEqual(snapshot(h),before);
  await reloaded.setRole('member');assert.equal(storage.length,0);assert.equal(reloaded.q('#nhDashboard').hidden,true);assert.equal(reloaded.q('#nhWorkspace').hidden,true);
  const nextLogin=await mount(t,{h,storage});assert.equal(nextLogin.q('#nhLocalDraftNotice').hidden,true);assert.deepEqual(nextLogin.writes(),[]);
});
test('An un-restored local draft survives bulk-present and disabled mark actions across another reload',async t=>{
  const h=todayFixture(),before=snapshot(h),storage=memoryStorage(),first=await mount(t,{h,storage});
  first.mark('s1','vang');first.mark('s2','co_mat');const originalDraft=storage.text();assert(originalDraft);first.close();
  const pending=await mount(t,{h,storage});assert.equal(pending.q('#nhLocalDraftNotice').hidden,false);
  assert.equal(pending.q('#nhAttendance [data-mark="co_mat"][data-student="s1"]').disabled,true);
  pending.click('[data-action="all-present"]');pending.mark('s1','co_mat');await pending.ready();
  assert.equal(storage.text(),originalDraft,'unreviewed draft must not be removed or replaced');assert.equal(pending.q('#nhSaveAttendance').disabled,true);
  assert.deepEqual(pending.writes(),[]);assert.deepEqual(snapshot(h),before);pending.close();
  const again=await mount(t,{h,storage});assert.equal(again.q('#nhLocalDraftNotice').hidden,false);again.click('#nhRestoreLocalDraft');await again.ready();
  assert.equal(again.q('#nhAttendance [data-mark="vang"][data-student="s1"]').getAttribute('aria-pressed'),'true');
  assert.equal(again.q('#nhAttendance [data-mark="co_mat"][data-student="s2"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(again.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('Selecting remaining students present keeps an existing absent mark and saves only the missing student',async t=>{
  const h=todayFixture(),v=h.api('nh_view',{groupId:'g35',month:'2026-09'}),session=v.sessions.find(s=>s.ma_buoi==='today35');
  h.api('nh_attendance_batch_save',{groupId:'g35',sessions:[{sessionId:session.ma_buoi,revision:session.revision,marks:[{studentId:'s1',status:'vang'}]}]});
  const before=snapshot(h),ui=await mount(t,{h});assert.equal(ui.q('#nhAttendance [data-mark="vang"][data-student="s1"]').getAttribute('aria-pressed'),'true');
  ui.click('[data-action="all-present"]');
  assert.equal(ui.q('#nhAttendance [data-mark="vang"][data-student="s1"]').getAttribute('aria-pressed'),'true');
  assert.equal(ui.q('#nhAttendance [data-mark="co_mat"][data-student="s2"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);ui.click('#nhCompleteAttendance');ui.click('#nhConfirmComplete');await ui.ready();
  const writes=ui.writes();assert.equal(writes.length,1);assert.deepEqual(writes[0].data.sessions[0].marks.map(mark=>[mark.studentId,mark.status]),[['s2','co_mat']]);
  assert.deepEqual(snapshot(h).DiemDanh.slice(0,before.DiemDanh.length),before.DiemDanh,'previously recorded absence remains unchanged');
});
test('A server revision conflict never restores stale local marks over newer attendance',async t=>{
  const h=todayFixture(),storage=memoryStorage(),first=await mount(t,{h,storage});first.mark('s1','vang');first.close();
  const v=h.api('nh_view',{groupId:'g35',month:'2026-09'}),session=v.sessions.find(s=>s.ma_buoi==='today35');
  h.api('nh_attendance_batch_save',{groupId:'g35',sessions:[{sessionId:session.ma_buoi,revision:session.revision,marks:[{studentId:'s2',status:'co_mat'}]}]});
  const before=snapshot(h),ui=await mount(t,{h,storage});assert.equal(ui.q('#nhLocalDraftNotice').hidden,false);
  assert(ui.q('#nhRestoreLocalDraft').disabled||ui.q('#nhRestoreLocalDraft').hidden);assert.match(ui.q('#nhLocalDraftNotice').textContent,/thay đổi|khác|xung đột|phiên/i);
  ui.click('#nhRestoreLocalDraft');await settle();assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
  ui.click('#nhDiscardLocalDraft');await settle();assert.equal(ui.q('#nhLocalDraftNotice').hidden,true);assert.equal(storage.length,0);assert.deepEqual(snapshot(h),before);
});
test('Work navigation respects unsaved attendance and partial dashboard failures never guess a lesson',async t=>{
  const h=todayFixture(),ui=await mount(t,{h}),before=snapshot(h);
  assert(ui.d.querySelectorAll('[data-work-task]').length>0);ui.mark('s1','co_mat');ui.click('[data-work-task]');await settle();
  assert.equal(ui.q('#nhUnsavedDialog').open,true);assert.equal(ui.q('#nhSessionSelect').value,'today35');ui.click('#nhStay');assert.deepEqual(snapshot(h),before);assert.deepEqual(ui.writes(),[]);
  const failed=await mount(t,{h,beforeRequest(action,data){if(action==='nh_view'&&data.groupId==='g24')throw Error('Nhóm 2–4 tạm mất kết nối');}});
  assert(!failed.d.querySelector('#nhSessionSelect')||failed.q('#nhSessionSelect').value!=='today35');
  assert.match(failed.q('#nhDashboard').textContent,/chưa|không|lỗi|thử lại|kết nối/i);assert.deepEqual(failed.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('Opening another lesson note from the overview guards drafts and completion stays on the reviewed lesson',async t=>{
  const h=todayFixture(),before=snapshot(h),ui=await mount(t,{h});ui.mark('s1','vang');ui.click('[data-attendance-mode="overview"]');
  const openOtherNote=()=>ui.q('#nhOverview [data-cycle="g35b0"][data-student="s1"]').dispatchEvent(new ui.w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
  openOtherNote();assert.equal(ui.q('#nhUnsavedDialog').open,true);assert.equal(ui.q('#nhDialog').open,false);assert.equal(ui.q('#nhSessionSelect').value,'today35');
  ui.click('#nhStay');assert.equal(ui.q('#nhUnsavedDialog').open,false);assert.equal(ui.q('#nhDialog').open,false);assert.equal(ui.q('#nhSessionSelect').value,'today35');assert.deepEqual(snapshot(h),before);assert.deepEqual(ui.writes(),[]);
  openOtherNote();ui.click('#nhDiscardAndContinue');await ui.ready();
  assert.equal(ui.q('#nhSessionSelect').value,'g35b0');assert.equal(ui.q('#nhDialog').open,true);assert.match(ui.q('#nhFormFields').textContent,/15\/09\/2026/);
  ui.q('[name="note"]').value='Ghi chú đúng buổi 15/09';ui.q('#nhForm').dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));await ui.ready();
  assert.deepEqual(snapshot(h),before);assert.deepEqual(ui.writes(),[]);ui.click('[data-action="all-present"]');ui.click('#nhCompleteAttendance');
  assert.match(ui.q('#nhCompleteDialog').textContent,/15\/09\/2026/);assert.doesNotMatch(ui.q('#nhCompleteContext').textContent,/12\/10\/2026/);assert.equal(ui.q('#nhConfirmComplete').disabled,false);
  ui.click('#nhConfirmComplete');await ui.ready();const writes=ui.writes();assert.equal(writes.length,1);assert.equal(writes[0].data.sessions.length,1);assert.equal(writes[0].data.sessions[0].sessionId,'g35b0');
  assert.equal(writes[0].data.sessions[0].marks.find(mark=>mark.studentId==='s1').note,'Ghi chú đúng buổi 15/09');
  const saved=h.api('nh_view',{groupId:'g35',month:'2026-09'});assert.equal(saved.marks.filter(mark=>mark.ma_buoi==='today35').length,0);assert.equal(saved.sessions.find(session=>session.ma_buoi==='today35').trang_thai,'du_kien');
});
