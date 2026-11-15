'use strict';
// Overview/detail navigation over the unchanged synthetic ledger. No live data.
const test=require('node:test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {TextEncoder,TextDecoder}=require('node:util');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.EGV_QA_DEPENDENCIES||process.cwd()]}));
const {ledgerFixture}=require('./nhom-hoc-ledger.test.cjs');
const root=path.resolve(__dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value));
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const readActions=new Set(['nh_boot','nh_view','nh_backup_status','nh_schedule_preview']);
const snapshot=h=>Object.fromEntries([...h.sheets].map(([name,sheet])=>[name,copy(sheet.values)]));
const settle=async()=>{for(let i=0;i<45;i++)await new Promise(resolve=>setImmediate(resolve));};
async function ready(document){
  await settle();
  for(let i=0;i<400;i++){
    if(document.getElementById('nhBusy')?.hidden)return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.fail('UI did not finish loading');
}
function storage(){
  const entries=new Map();
  return {get length(){return entries.size;},key:i=>[...entries.keys()][i]??null,getItem:key=>entries.get(String(key))??null,setItem:(key,value)=>entries.set(String(key),String(value)),removeItem:key=>entries.delete(String(key))};
}
function fixture(){
  const h=ledgerFixture(),view=h.api('nh_view',{groupId:'g35',month:'2026-09'});
  h.api('nh_sessions_plan',{groupId:'g35',month:'2026-09',revision:view.revision,sessions:[{id:'today35',date:'2026-10-12'}]});
  h.setToday('2026-10-12');return h;
}
function feeFixture(){
  const h=ledgerFixture();
  let view=h.api('nh_view',{groupId:'g35',month:'2026-09'});
  h.api('nh_sessions_plan',{groupId:'g35',month:'2026-09',revision:view.revision,sessions:[{id:'b12',date:'2026-10-12'},{id:'b13',date:'2026-10-13'},{id:'b15',date:'2026-10-15'}]});
  h.setToday('2026-10-21');view=h.api('nh_view',{groupId:'g35',month:'2026-09'});
  h.api('nh_attendance_batch_save',{groupId:'g35',sessions:view.sessions.map(s=>({sessionId:s.ma_buoi,revision:s.revision,marks:[{studentId:'s1',status:'co_mat'},{studentId:'s2',status:'co_mat'}]}))});
  h.api('nh_receipt_save',{groupId:'g35',id:'old-period-payment',studentId:'s1',month:'2026-09',date:'2026-10-15',amount:200000,method:'chuyen_khoan'});
  h.api('nh_students_save',{groupId:'g35',joinDate:'2026-10-16',students:[{id:'s3',memberId:'m3',name:'Học sinh chưa đóng đủ',className:'4/6'}]});
  h.api('nh_session_save',{groupId:'g35',id:'current-period-lesson',date:'2026-10-20'});
  view=h.api('nh_view',{groupId:'g35',month:'2026-10'});
  const session=view.sessions.find(s=>s.ma_buoi==='current-period-lesson');
  h.api('nh_attendance_batch_save',{groupId:'g35',sessions:[{sessionId:session.ma_buoi,revision:session.revision,marks:['s1','s2','s3'].map(studentId=>({studentId,status:'co_mat'}))}]});
  h.api('nh_receipt_save',{groupId:'g35',id:'current-credit',studentId:'s1',month:'2026-10',date:'2026-10-20',amount:100000,method:'tien_mat'});
  h.api('nh_receipt_save',{groupId:'g35',id:'current-partial',studentId:'s3',month:'2026-10',date:'2026-10-20',amount:10000,method:'chuyen_khoan'});
  return h;
}
async function mount(t,options={}){
  const h=options.h||fixture();
  const dom=new JSDOM(fs.readFileSync(path.join(root,'groups.html'),'utf8'),{url:options.url||'https://egv.test/groups.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
  await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
  Object.defineProperty(w,'crypto',{value:webcrypto});Object.defineProperty(w,'localStorage',{value:storage()});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  let role=options.role||'admin';const calls=[],errors=[];
  w.confirm=()=>true;w.URL.createObjectURL=()=> 'blob:compact-qa';w.URL.revokeObjectURL=()=>{};
  w.App={init(){},isAdmin:()=>role==='admin',getAdminToken:()=>role==='admin'?'compact-admin-fixture':'',escapeHTML,openLogin(){},async apiPost(action,data={}){
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
  d.dispatchEvent(new w.Event('DOMContentLoaded'));await ready(d);
  t.after(()=>{try{assert.deepEqual(errors,[]);}finally{w.close();}});
  const q=selector=>{const el=d.querySelector(selector);assert(el,'Missing '+selector);return el;},click=selector=>q(selector).click();
  const change=(selector,value)=>{q(selector).value=value;q(selector).dispatchEvent(new w.Event('change',{bubbles:true}));};
  return {h,w,d,q,click,change,calls,ready:()=>ready(d),writes:()=>calls.filter(c=>!readActions.has(c.action)),
    row:groupId=>q('[data-open-book="'+groupId+'"]').closest('tr'),
    mark:(student,status)=>click('#nhAttendance [data-mark="'+status+'"][data-student="'+student+'"]'),
    setRole:async next=>{role=next;w.dispatchEvent(new w.Event('app:auth-change'));await ready(d);}};
}

test('The compact home shows all groups in one overview and keeps the working book hidden until opened',async t=>{
  const h=fixture(),before=snapshot(h),ui=await mount(t,{h});
  assert.equal(ui.q('#nhDashboard').hidden,false);assert.equal(ui.q('#nhWorkspace').hidden,true);
  assert.equal(ui.q('#nhBackOverview').hidden,true);assert.equal(ui.q('#nhGroupTable').querySelectorAll('tbody tr').length,2);
  assert.match(ui.row('g24').textContent,/Thứ 2–4/);assert.match(ui.row('g35').textContent,/Thứ 3–5/);
  assert(ui.q('#nhSummaryLine').textContent.trim());assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
  ui.click('[data-open-book="g35"]');await ui.ready();
  assert.equal(ui.q('#nhWorkspace').hidden,false);assert.equal(ui.q('#nhDashboard').hidden,true);assert.equal(ui.q('#nhOperations').hidden,true);
  assert.equal(ui.q('#nhOverview').hidden,false);assert.equal(ui.q('#nhAttendance').hidden,true);
  assert.equal(ui.q('#nhBackOverview').hidden,false);assert.equal(ui.q('#nhGroupTitle').textContent,'Thứ 3–5');assert.deepEqual(snapshot(h),before);
  ui.click('#nhBackOverview');await ui.ready();
  assert.equal(ui.q('#nhDashboard').hidden,false);assert.equal(ui.q('#nhWorkspace').hidden,true);assert.equal(ui.q('#nhOperations').hidden,false);
  assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('Group amounts use only the current period and keep one student credit separate from another student debt',async t=>{
  const h=feeFixture(),before=snapshot(h),ui=await mount(t,{h}),row=ui.row('g35');
  assert.match(row.textContent,/Kỳ 2/);assert.match(row.textContent,/1\s*\/\s*8/);
  assert.match(row.textContent,/110[.,]000/);assert.match(row.textContent,/52[.,]500/);
  assert.doesNotMatch(row.textContent,/310[.,]000/);assert.doesNotMatch(row.textContent,/15[.,]000/);
  assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('Leaving a dirty book for the overview guards the exact group and never silently records or loses the draft',async t=>{
  const h=fixture(),before=snapshot(h),ui=await mount(t,{h});ui.click('[data-open-book="g35"]');await ui.ready();ui.change('#nhAttendanceDisplay','day');
  ui.mark('s1','vang');ui.click('#nhBackOverview');await settle();
  assert.equal(ui.q('#nhUnsavedDialog').open,true);assert.match(ui.q('#nhUnsavedContext').textContent,/Thứ 3–5/);
  assert.equal(ui.q('#nhWorkspace').hidden,false);assert.equal(ui.q('#nhDashboard').hidden,true);
  ui.click('#nhStay');assert.equal(ui.q('#nhAttendance [data-mark="vang"][data-student="s1"]').getAttribute('aria-pressed'),'true');
  ui.click('#nhBackOverview');ui.click('#nhDiscardAndContinue');await ui.ready();
  assert.equal(ui.q('#nhDashboard').hidden,false);assert.equal(ui.q('#nhWorkspace').hidden,true);
  ui.click('[data-open-book="g35"]');await ui.ready();assert.equal(ui.q('#nhSaveAttendance').disabled,true);
  assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('Deep links open the requested book directly and its single display selector preserves the selected lesson',async t=>{
  const h=fixture(),before=snapshot(h),ui=await mount(t,{h,url:'https://egv.test/groups.html?group=g35&month=2026-09&session=g35b0'});
  assert.equal(ui.q('#nhWorkspace').hidden,false);assert.equal(ui.q('#nhDashboard').hidden,true);assert.equal(ui.q('#nhSessionSelect').value,'g35b0');
  ui.change('#nhAttendanceDisplay','overview');assert.equal(ui.q('#nhOverview').hidden,false);assert.equal(ui.q('#nhAttendance').hidden,true);
  ui.change('#nhAttendanceDisplay','day');assert.equal(ui.q('#nhOverview').hidden,true);assert.equal(ui.q('#nhAttendance').hidden,false);assert.equal(ui.q('#nhSessionSelect').value,'g35b0');
  assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('Overview work items open the correct tuition period or room-rent section without exposing both work screens',async t=>{
  const h=feeFixture(),before=snapshot(h),ui=await mount(t,{h});
  const workButton=text=>[...ui.d.querySelectorAll('[data-work-task]')].find(button=>(button.closest('article')||button.parentElement).textContent.includes(text));
  const closePeriod=workButton('Chốt học phí');assert(closePeriod);closePeriod.click();await ui.ready();
  assert.equal(ui.q('#nhDashboard').hidden,true);assert.equal(ui.q('#nhWorkspace').hidden,false);assert.equal(ui.q('#nhFees').hidden,false);
  assert.equal(ui.q('#nhMonth').value,'2026-09');assert.equal(ui.q('#nhGroupTitle').textContent,'Thứ 3–5');
  ui.click('#nhBackOverview');await ui.ready();
  const rent=workButton('tiền phòng');assert(rent);rent.click();await ui.ready();
  assert.equal(ui.q('#nhDashboard').hidden,false);assert.equal(ui.q('#nhWorkspace').hidden,true);assert.equal(ui.q('#nhOperations').hidden,false);
  assert.equal(ui.q('#nhOperations').open,true);assert.equal(ui.q('#nhRentDetails').open,true);
  assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('Partial overview reads show unavailable amounts instead of reporting zero money',async t=>{
  const h=fixture(),before=snapshot(h),ui=await mount(t,{h,beforeRequest(action,data){if(action==='nh_view'&&data.groupId==='g24')throw Error('Nhóm này tạm mất kết nối');}}),row=ui.row('g24');
  assert.match(row.textContent,/—|Chưa tải|Đang tải|không tải|chưa có/i);assert.doesNotMatch(row.textContent,/\b0đ\b/);
  assert.match(ui.q('#nhDashboard').textContent,/chưa|không|thiếu|thử lại|kết nối/i);assert.equal(ui.q('#nhWorkspace').hidden,true);
  assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('A failed initial boot leaves an accessible retry and recovers the overview without recording data',async t=>{
  const h=fixture(),before=snapshot(h);let fail=true;
  const ui=await mount(t,{h,beforeRequest(action){if(action==='nh_boot'&&fail)throw Error('Mất kết nối, thử lại');}});
  assert.equal(ui.q('#nhDashboard').hidden,false);assert.equal(ui.q('#nhWorkspace').hidden,true);assert.equal(ui.q('#nhWorkRefresh').disabled,false);
  assert.match(ui.d.body.textContent,/Mất kết nối|thử lại|không tải/i);assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
  fail=false;ui.click('#nhWorkRefresh');await ui.ready();
  assert.equal(ui.q('#nhDashboard').hidden,false);assert.equal(ui.q('#nhWorkspace').hidden,true);assert.equal(ui.q('#nhGroupTable').querySelectorAll('tbody tr').length,2);
  assert.match(ui.row('g35').textContent,/Thứ 3–5/);assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('Schedule and add-lesson actions remain reachable after moving them into the compact book menu',async t=>{
  const h=fixture(),before=snapshot(h),ui=await mount(t,{h});ui.click('[data-open-book="g35"]');await ui.ready();
  ui.q('#nhBookTools').open=true;ui.click('#nhAttendanceToolbar [data-action="plan-sessions"]');await ui.ready();
  assert.equal(ui.q('#nhDialog').open,true);assert.match(ui.q('#nhDialogTitle').textContent,/Xếp lịch/);assert(ui.q('#nhFormFields').querySelector('[name="date_0"]'));
  ui.click('#nhCancelDialog');ui.q('#nhBookTools').open=true;ui.click('#nhAttendanceToolbar [data-action="new-session"]');await ui.ready();
  assert.equal(ui.q('#nhDialog').open,true);assert.match(ui.q('#nhDialogTitle').textContent,/buổi/i);assert(ui.q('#nhFormFields').querySelector('[name="date"]'));
  assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('Archived groups stay identifiable, labels remain plain text and guest sessions never receive the overview',async t=>{
  const h=fixture();h.api('nh_group_save',{id:'g24',name:'Nhóm <B> & lưu trữ',days:'2,4',teacher:'u1',mode:'theo_buoi',rate:62500,cycleSize:8,cycleStart:'2026-09',archived:true});
  const before=snapshot(h),ui=await mount(t,{h});
  assert.match(ui.row('g24').textContent,/Nhóm <B> & lưu trữ/);assert.equal(ui.row('g24').querySelector('b'),null);assert.match(ui.row('g24').textContent,/lưu trữ/i);
  assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
  await ui.setRole('member');assert.equal(ui.q('#nhDashboard').hidden,true);assert.equal(ui.q('#nhWorkspace').hidden,true);
  assert.equal(ui.q('#nhGroupTable').querySelectorAll('tbody tr').length,0);assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before);
});
test('Attendance puts tuition after the presence total and distinguishes paid, unpaid, partial, credit, free and not-yet-due',async t=>{
  const h=ledgerFixture();
  h.api('nh_students_save',{groupId:'g35',joinDate:'2026-09-01',students:[3,4,5,6].map(i=>({id:'s'+i,memberId:'m'+i,name:'Học sinh '+i,className:'4/6'}))});
  h.api('nh_member_save',{groupId:'g35',memberId:'m1',name:'Đỗ <B> & An',joinDate:'2026-09-01',leaveDate:'',rate:''});
  const view=h.api('nh_view',{groupId:'g35',month:'2026-09'}),session=view.sessions[0];
  h.api('nh_attendance_batch_save',{groupId:'g35',sessions:[{sessionId:session.ma_buoi,revision:session.revision,marks:[1,2,3,4,5,6].map(i=>({studentId:'s'+i,status:i===6?'vang':'co_mat'}))}]});
  for(const [id,studentId,month,amount] of [['paid','s1','2026-09',62500],['credit','s3','2026-09',70000],['partial','s4','2026-09',25000],['other-period','s5','2026-10',62500],['voided','s5','2026-09',62500]]){
    h.api('nh_receipt_save',{groupId:'g35',id,studentId,month,date:'2026-10-10',amount,method:'chuyen_khoan'});
  }
  h.api('nh_receipt_void',{groupId:'g35',id:'voided',reason:'Phiếu thu đã hủy'});
  const before=snapshot(h),ui=await mount(t,{h,url:'https://egv.test/groups.html?group=g35&month=2026-09'});ui.change('#nhAttendanceDisplay','overview');
  const headers=[...ui.d.querySelectorAll('.nh-overview-table thead th')];
  assert.equal(headers.length,11);assert.equal(headers.at(-2).textContent,'Có mặt');assert.equal(headers.at(-1).textContent,'Học phí');
  const expected={s1:['paid','Đã đủ'],s2:['free','Miễn'],s3:['credit','Đóng dư'],s4:['partial','Một phần'],s5:['unpaid','Chưa đóng'],s6:['none','Chưa phát sinh']};
  for(const [id,[status,label]] of Object.entries(expected)){
    const cell=ui.q('[data-attendance-fee="'+id+'"]'),button=cell.querySelector('button');
    assert.equal(button.dataset.feeState,status);assert.equal(button.textContent,label);
    assert(cell.previousElementSibling.classList.contains('nh-overview-count'));assert.equal(cell.parentElement.querySelectorAll('[data-cell-session]').length,8);
    assert.equal(button.getAttribute('aria-label'),button.title);assert.match(button.title,/Kỳ 1/);
  }
  assert.equal(ui.d.querySelector('.nh-overview-table b'),null);assert.match(ui.q('[data-attendance-fee="s1"] button').title,/Đỗ <B> & An/);
  ui.click('[data-attendance-fee="s4"] button');assert.equal(ui.q('#nhProfile').open,true);assert.match(ui.q('#nhProfileBody').textContent,/25[.,]000/);assert.match(ui.q('#nhProfileBody').textContent,/37[.,]500/);ui.click('#nhCloseProfile');
  ui.change('#nhMonth','2026-10');await ui.ready();assert.equal(ui.q('[data-attendance-fee="s1"] button').dataset.feeState,'none');
  ui.change('#nhMonth','2026-09');await ui.ready();assert.equal(ui.q('[data-attendance-fee="s1"] button').dataset.feeState,'paid');assert.equal(ui.q('[data-attendance-fee="s5"] button').dataset.feeState,'unpaid');
  assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before,'reading tuition and changing periods never rewrites the ledger');
});
test('Attendance tuition follows unsaved marks and reverting a draft restores the saved status without touching receipts',async t=>{
  const h=ledgerFixture(),session=h.api('nh_view',{groupId:'g35',month:'2026-09'}).sessions[0];
  h.api('nh_attendance_batch_save',{groupId:'g35',sessions:[{sessionId:session.ma_buoi,revision:session.revision,marks:[{studentId:'s1',status:'co_mat'}]}]});
  h.api('nh_receipt_save',{groupId:'g35',id:'saved-payment',studentId:'s1',month:'2026-09',date:'2026-10-10',amount:62500,method:'tien_mat'});
  const before=snapshot(h),ui=await mount(t,{h,url:'https://egv.test/groups.html?group=g35&month=2026-09&session='+session.ma_buoi});
  const status=()=>ui.q('[data-attendance-fee="s1"] button').dataset.feeState;
  assert.equal(status(),'paid');assert.equal(ui.q('#nhAttendanceFeeHint').hidden,true);
  ui.mark('s1','vang');assert.equal(status(),'credit');assert.equal(ui.q('#nhAttendanceFeeHint').hidden,false);assert.match(ui.q('[data-attendance-fee="s1"] button').title,/điểm danh chưa lưu/);
  ui.mark('s1','co_mat');assert.equal(status(),'paid');assert.equal(ui.q('#nhAttendanceFeeHint').hidden,true);assert.doesNotMatch(ui.q('[data-attendance-fee="s1"] button').title,/điểm danh chưa lưu/);
  ui.change('#nhSessionSelect','g35b1');ui.mark('s1','co_mat');assert.equal(status(),'partial');ui.click('[data-action="all-present"]');assert.equal(status(),'partial');
  assert.equal(ui.q('[data-attendance-fee="s2"] button').dataset.feeState,'free');ui.change('#nhAttendanceDisplay','overview');assert.equal(ui.q('#nhOverview').hidden,false);assert.equal(status(),'partial');
  assert.deepEqual(ui.writes(),[]);assert.deepEqual(snapshot(h),before,'local marks do not change receipts, names or saved sessions');
});
