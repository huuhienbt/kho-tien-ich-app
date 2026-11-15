'use strict';
// Real UI + shared ledger; synthetic, in-memory Sheets only.
const test=require('node:test'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.EGV_QA_DEPENDENCIES||process.cwd()]}));
const {ledgerFixture}=require('./nhom-hoc-ledger.test.cjs');
const root=path.resolve(__dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value));
const settle=async()=>{for(let i=0;i<18;i++)await new Promise(resolve=>setImmediate(resolve));};
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const snapshot=h=>Object.fromEntries([...h.sheets].map(([name,sheet])=>[name,copy(sheet.values)]));
function completedFixture(h) {
  const view=h.api('nh_view',{groupId:'g35',month:'2026-09'});
  h.api('nh_sessions_plan',{groupId:'g35',month:'2026-09',revision:view.revision,sessions:[{id:'p12',date:'2026-10-12'},{id:'p13',date:'2026-10-13'},{id:'p15',date:'2026-10-15'}]});
  h.setToday('2026-10-15');
  const v=h.api('nh_view',{groupId:'g35',month:'2026-09'});
  h.api('nh_attendance_batch_save',{groupId:'g35',sessions:v.sessions.map((s,i)=>({sessionId:s.ma_buoi,revision:s.revision,marks:[{studentId:'s1',status:i<6?'co_mat':'vang'},{studentId:'s2',status:'co_mat'}]}))});
  h.api('nh_receipt_save',{groupId:'g35',id:'old-receipt',studentId:'s1',month:'2026-09',date:'2026-09-30',amount:200000,method:'chuyen_khoan',note:'Khoản đóng đã có'});
}
async function mount(t,options={}) {
  const h=ledgerFixture();if(options.prepare)options.prepare(h);
  const dom=new JSDOM(fs.readFileSync(path.join(root,'groups.html'),'utf8'),{url:'https://egv.test/groups.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
  await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  let role=options.role||'admin';const calls=[],blobs=[],downloads=[],errors=[];
  w.confirm=()=>true;w.Blob=Blob;w.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:local-test';};w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
  w.App={init(){},isAdmin:()=>role==='admin',escapeHTML,openLogin:type=>calls.push({login:type}),async apiPost(action,data){
    calls.push({action,data:copy(data)});if(options.beforeRequest)await options.beforeRequest(action,data,h);
    const result=h.ctx.handleNhomHoc({action,data,...(role==='admin'?{adminToken:'admin-test'}:{userToken:'member'})});
    if(result.status!=='success')throw new Error(result.message);
    if(action==='nh_boot'){
      const values=h.sheets.get('HocSinh').values,headers=values[0];
      result.data.students=values.slice(1).filter(r=>r[0]).map(row=>Object.fromEntries(headers.map((name,i)=>[name,row[i]??''])));
    }
    if(options.afterResponse)await options.afterResponse(action,data,result,h);
    return result;
  }};
  w.addEventListener('error',event=>errors.push(event.message));
  w.eval(fs.readFileSync(path.join(root,'js/groups.js'),'utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));await settle();
  t.after(()=>{try{assert.deepEqual(errors,[]);}finally{w.close();}});
  const q=selector=>{const el=d.querySelector(selector);assert(el,'Missing '+selector);return el;},click=selector=>q(selector).click();
  const change=(selector,value)=>{q(selector).value=value;q(selector).dispatchEvent(new w.Event('change',{bubbles:true}));};
  return {h,w,d,calls,blobs,downloads,q,click,change,
    selectGroup:async id=>{click('[data-group="'+id+'"]');await settle();},
    selectPeriod:async month=>{change('#nhMonth',month);await settle();},
    selectSession:async id=>{change('#nhSessionSelect',id);await settle();},
    mark:(id,status)=>click('#nhAttendance [data-mark="'+status+'"][data-student="'+id+'"]'),
    setRole:async next=>{role=next;w.dispatchEvent(new w.Event('app:auth-change'));await settle();}
  };
}
test('Classbook reads old records without writes; names, lessons, payments and period IDs are preserved',async t=>{
  const ui=await mount(t,{role:'guest',prepare:h=>h.api('nh_member_save',{groupId:'g35',memberId:'m1',name:'Đỗ Ánh <B>',className:'4/6',joinDate:'2026-09-01',leaveDate:'',rate:''})});
  const {h,q,calls,click}=ui,before=snapshot(h);
  for(const role of ['guest','member','google','vip']){await ui.setRole(role);assert.equal(q('#nhWorkspace').hidden,true);assert.equal(calls.filter(c=>c.action).length,0);}
  click('#nhLogin');assert.equal(calls.at(-1).login,'admin');
  await ui.setRole('admin');await ui.selectGroup('g35');
  assert.equal(q('#nhGroupTitle').textContent,'Thứ 3–5');assert.equal(q('#nhAttendance').hidden,false);assert.equal(q('#nhOverview').hidden,true);assert.equal(q('#nhStats').hidden,true);
  assert.match(q('#nhAttendance').textContent,/Đỗ Ánh <B>/);assert.equal(ui.d.querySelector('#nhAttendance b'),null);
  for(const tab of ['fees','students','attendance'])click('[data-tab="'+tab+'"]');
  await ui.selectPeriod('2026-10');await ui.selectPeriod('2026-09');
  assert.match(q('#nhPeriodInfo').textContent,/Kỳ 1/);assert.equal(q('#nhMonth').value,'2026-09');assert.equal(q('#nhMonth').hidden,true);assert.equal(q('#nhPeriodChoice').hidden,false);
  click('[data-attendance-mode="overview"]');assert.equal(ui.d.querySelectorAll('.nh-overview-table thead th').length,10);
  q('#nhOverview [data-cycle][data-student="s1"]').click();assert.equal(q('#nhAttendance').hidden,false);assert.equal(q('#nhSaveAttendance').disabled,true);
  q('#nhSearch').value='do anh';q('#nhSearch').dispatchEvent(new ui.w.Event('input',{bubbles:true}));
  assert.equal([...ui.d.querySelectorAll('.nh-mobile-student')].filter(r=>!r.hidden).length,1);
  q('#nhSearch').value='';q('#nhSearch').dispatchEvent(new ui.w.Event('input',{bubbles:true}));
  click('[data-profile="s1"]');assert.equal(q('#nhProfileName').textContent,'Đỗ Ánh <B>');click('#nhCloseProfile');
  click('#nhExport');assert.equal(ui.downloads[0],'Nhom_hoc_2026-09.csv');
  assert.deepEqual(snapshot(h),before,'opening, navigation, filters, profile and export never rewrite records');
  assert(calls.filter(c=>c.action).every(c=>['nh_boot','nh_view'].includes(c.action)));
  assert(calls.filter(c=>c.action==='nh_view').every(c=>/^\d{4}-\d{2}$/.test(c.data.month)));
});
test('Explicit marks are idempotent; the whole-period table only opens a lesson',async t=>{
  const ui=await mount(t,{prepare:completedFixture});await ui.selectGroup('g35');await ui.selectPeriod('2026-09');
  const before=snapshot(ui.h),s=ui.h.api('nh_view',{groupId:'g35',month:'2026-09'}).sessions[0];
  ui.click('[data-attendance-mode="overview"]');ui.click('#nhOverview [data-cycle="'+s.ma_buoi+'"][data-student="s1"]');
  assert.equal(ui.q('#nhSessionSelect').value,s.ma_buoi);assert.equal(ui.q('#nhSaveAttendance').disabled,true);
  ui.mark('s1','co_mat');ui.mark('s1','co_mat');assert.equal(ui.q('#nhSaveAttendance').disabled,true);
  ui.mark('s1','vang');assert.match(ui.q('#nhSaveHint').textContent,/1 ô điểm danh chưa lưu/);
  ui.mark('s1','co_mat');assert.equal(ui.q('#nhSaveAttendance').disabled,true);assert.deepEqual(snapshot(ui.h),before);
});
test('Stay/discard/save guard protects context; only an explicitly saved attendance mark changes',async t=>{
  const ui=await mount(t);await ui.selectGroup('g35');const before=snapshot(ui.h),old=ui.q('#nhSessionSelect').value;
  const view=ui.h.api('nh_view',{groupId:'g35',month:'2026-09'}),saved=view.marks.find(m=>m.ma_buoi===old&&m.ma_hoc_sinh==='s1')?.trang_thai||'chua_diem_danh',status=saved==='co_mat'?'vang':'co_mat';
  ui.mark('s1',status);ui.click('[data-group="g24"]');assert.equal(ui.q('#nhUnsavedDialog').open,true);assert.equal(ui.q('#nhGroupTitle').textContent,'Thứ 3–5');
  assert.match(ui.q('#nhUnsavedContext').textContent,/Thứ 3–5.*Kỳ 1/);ui.click('#nhStay');assert.equal(ui.q('#nhUnsavedDialog').open,false);assert.equal(ui.q('#nhSaveAttendance').disabled,false);
  ui.click('[data-group="g24"]');ui.click('#nhDiscardAndContinue');await settle();assert.equal(ui.q('#nhGroupTitle').textContent,'Thứ 2–4');assert.deepEqual(snapshot(ui.h),before);
  await ui.selectGroup('g35');ui.mark('s1',status);const target=view.sessions.find(s=>s.ma_buoi!==old).ma_buoi;
  ui.change('#nhSessionSelect',target);assert.equal(ui.q('#nhSessionSelect').value,old);assert.equal(ui.q('#nhUnsavedDialog').open,true);
  ui.click('#nhSaveAndContinue');await settle();assert.equal(ui.q('#nhUnsavedDialog').open,false);assert.equal(ui.q('#nhSessionSelect').value,target);
  const writes=ui.calls.filter(c=>c.action==='nh_attendance_batch_save');assert.equal(writes.length,1);assert.equal(writes[0].data.groupId,'g35');
  assert.equal(writes[0].data.sessions[0].sessionId,old);assert.equal(writes[0].data.sessions[0].marks[0].studentId,'s1');assert.equal(writes[0].data.sessions[0].marks[0].status,status);
  const after=snapshot(ui.h);for(const name of ['NhomHoc','HocSinh','ThanhVienNhom','BuoiHoc','ThuHocPhi','HocPhiKy','TienThuePhong'])assert.deepEqual(after[name],before[name],name+' stays unchanged');
});
test('Failed saving retains drafts and blocks navigation; logout clears pending private state',async t=>{
  const ui=await mount(t,{beforeRequest(action){if(action==='nh_attendance_batch_save')throw Error('Điểm danh vừa thay đổi ở phiên khác');}});
  await ui.selectGroup('g35');const before=snapshot(ui.h),saved=ui.q('#nhAttendance [data-mark="co_mat"][data-student="s1"]').getAttribute('aria-pressed')==='true';
  ui.mark('s1',saved?'vang':'co_mat');ui.click('[data-group="g24"]');ui.click('#nhSaveAndContinue');await settle();
  assert.equal(ui.q('#nhUnsavedDialog').open,true);assert.equal(ui.q('#nhUnsavedError').hidden,false);assert.equal(ui.q('#nhGroupTitle').textContent,'Thứ 3–5');assert.match(ui.q('#nhSaveHint').textContent,/1 ô/);assert.deepEqual(snapshot(ui.h),before);
  await ui.setRole('member');assert.equal(ui.q('#nhUnsavedDialog').open,false);assert.equal(ui.q('#nhWorkspace').hidden,true);assert.equal(ui.q('#nhAttendance').textContent,'');assert.equal(ui.q('#nhGroupTitle').textContent,'');
});
test('Cycle and calendar labels retain stored YYYY-MM keys across year boundaries',async t=>{
  const ui=await mount(t,{prepare:h=>h.api('nh_group_save',{id:'calendar',name:'Nhóm theo tháng cũ',teacher:'u1',days:'2,4',mode:'theo_thang',rate:500000,cycleSize:0})});
  const before=snapshot(ui.h);await ui.selectGroup('g35');assert.match(ui.q('#nhPeriodInfo').textContent,/Kỳ 1/);
  for(let i=0;i<4;i++){ui.click('#nhNextMonth');await settle();}
  assert.equal(ui.q('#nhMonth').value,'2027-01');assert.match(ui.q('#nhPeriodInfo').textContent,/Kỳ 5/);
  await ui.selectGroup('calendar');assert.equal(ui.q('#nhMonth').hidden,false);assert.equal(ui.q('#nhPeriodChoice').hidden,true);assert.match(ui.q('#nhPeriodInfo').textContent,/Tháng 10\/2026/);
  await ui.selectPeriod('2026-12');assert.match(ui.q('#nhPeriodInfo').textContent,/Tháng 12\/2026/);assert.deepEqual(snapshot(ui.h),before);
});
test('A lost add-student reply cannot leak a membership ID into a different group',async t=>{
  let lost=false;
  const ui=await mount(t,{prepare:h=>h.sheets.get('HocSinh').values.push(['detached','Học sinh đã có hồ sơ','5/1','dang_hoc','']),
    afterResponse(action){if(action==='nh_students_save'&&!lost){lost=true;throw Error('Mất phản hồi sau khi đã lưu');}}});
  const before=snapshot(ui.h);
  async function addTo(group){await ui.selectGroup(group);ui.click('[data-tab="students"]');ui.click('[data-action="add-students"]');ui.q('[name="existing"]').value='detached';ui.q('#nhForm').dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));await settle();}
  await addTo('g24');assert.match(ui.q('#nhFormError').textContent,/Mất phản hồi/);ui.click('#nhCancelDialog');await addTo('g35');assert.equal(ui.q('#nhDialog').open,false);
  const members=ui.h.sheets.get('ThanhVienNhom').values.slice(1).filter(r=>r[2]==='detached');assert.equal(members.length,2);assert.notEqual(members[0][0],members[1][0]);
  const after=snapshot(ui.h);for(const name of ['NhomHoc','HocSinh','BuoiHoc','DiemDanh','ThuHocPhi','HocPhiKy','TienThuePhong'])assert.deepEqual(after[name],before[name]);
});
test('Notes, profiles, fee filters and CSV preserve installment history and escape text',async t=>{
  const ui=await mount(t,{prepare:completedFixture});await ui.selectGroup('g35');await ui.selectPeriod('2026-09');const before=snapshot(ui.h);
  ui.click('#nhAttendance [data-mark-note][data-student="s1"]');ui.q('[name="note"]').value='<b>Ghi chú buổi học</b>';ui.q('#nhForm').dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  assert.equal(ui.calls.filter(c=>c.action==='nh_attendance_batch_save').length,0);assert.deepEqual(snapshot(ui.h),before);
  ui.click('[data-tab="fees"]');assert.equal(ui.q('#nhStats').hidden,false);assert.equal(ui.q('#nhPendingNotice').hidden,false);
  ui.change('#nhFeeFilter','free');assert.equal([...ui.d.querySelectorAll('.nh-fee-row')].filter(r=>!r.hidden).length,1);
  ui.click('[data-action="return-attendance"]');ui.click('#nhSaveAttendance');await settle();
  ui.click('[data-profile="s1"]');assert.match(ui.q('#nhProfileBody').textContent,/<b>Ghi chú buổi học/);assert.equal(ui.d.querySelector('#nhProfileBody b'),null);assert.match(ui.q('#nhProfileBody').textContent,/200.000đ/);ui.click('#nhCloseProfile');
  ui.click('#nhExport');const csv=await ui.blobs.at(-1).text();assert.match(csv,/LỊCH SỬ ĐÓNG TIỀN/);assert.match(csv,/200000/);assert.match(csv,/375000/);assert.match(csv,/2026-09/);assert.deepEqual(snapshot(ui.h).ThuHocPhi,before.ThuHocPhi);
});
test('Receipt forms append installments; closing and reopening a period preserve the previous ledger',async t=>{
  const ui=await mount(t,{prepare:completedFixture});await ui.selectGroup('g35');await ui.selectPeriod('2026-09');
  const before=snapshot(ui.h);ui.click('[data-profile="s1"]');ui.click('#nhProfileBody [data-receive="s1"]');
  assert.equal(ui.q('#nhProfile').open,false);assert.match(ui.q('.nh-receipt-context').textContent,/Thứ 3–5.*Kỳ 1.*Học sinh A/);
  assert.equal(ui.q('[name="amount"]').value,'175000');ui.q('[name="note"]').value='Đóng thêm lần 2';
  ui.q('#nhForm').dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  let view=ui.h.api('nh_view',{groupId:'g35',month:'2026-09'});assert.equal(view.fees.find(f=>f.studentId==='s1').paid,375000);assert.equal(view.receipts.length,2);
  const write=ui.calls.find(c=>c.action==='nh_receipt_save');assert.equal(write.data.month,'2026-09');assert.equal(write.data.studentId,'s1');assert.equal(write.data.amount,'175000');
  const after=snapshot(ui.h);assert.deepEqual(after.ThuHocPhi.slice(0,before.ThuHocPhi.length),before.ThuHocPhi);
  for(const name of ['NhomHoc','HocSinh','ThanhVienNhom','BuoiHoc','DiemDanh','HocPhiKy','TienThuePhong'])assert.deepEqual(after[name],before[name]);
  ui.click('[data-tab="fees"]');ui.click('[data-action="close"]');ui.q('#nhForm').dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  view=ui.h.api('nh_view',{groupId:'g35',month:'2026-09'});assert.equal(view.closed,true);assert.equal(ui.q('#nhAttendance [data-mark="co_mat"][data-student="s1"]').disabled,true);
  ui.click('[data-action="reopen"]');ui.q('#nhForm').dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  view=ui.h.api('nh_view',{groupId:'g35',month:'2026-09'});assert.equal(view.closed,false);assert.equal(view.fees.find(f=>f.studentId==='s1').paid,375000);
  const reopened=snapshot(ui.h);for(const name of ['NhomHoc','HocSinh','ThanhVienNhom','BuoiHoc','DiemDanh','ThuHocPhi','TienThuePhong'])assert.deepEqual(reopened[name],after[name]);
});
test('Future lessons stay read-only; scheduling only appends lessons and preserves the old ledger',async t=>{
  const ui=await mount(t,{prepare:h=>{const v=h.api('nh_view',{groupId:'g35',month:'2026-09'});h.api('nh_sessions_plan',{groupId:'g35',month:'2026-09',revision:v.revision,sessions:[{id:'future',date:'2026-10-13'}]});}});
  await ui.selectGroup('g35');await ui.selectSession('future');assert.equal(ui.q('#nhAttendance [data-mark="co_mat"][data-student="s1"]').disabled,true);assert.match(ui.q('#nhAttendance').textContent,/Chưa đến ngày học/);
  const before=snapshot(ui.h);ui.click('[data-attendance-mode="overview"]');assert.equal(ui.q('#nhOverview [data-cycle="future"][data-student="s1"]').disabled,true);
  ui.click('[data-action="plan-sessions"]');await settle();assert.equal(ui.q('#nhDialog').open,true);assert(ui.q('[name="date_0"]').value>='2026-10-11');
  ui.q('#nhForm').dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
  const after=snapshot(ui.h);for(const name of ['NhomHoc','HocSinh','ThanhVienNhom','DiemDanh','ThuHocPhi','HocPhiKy','TienThuePhong'])assert.deepEqual(after[name],before[name]);
  assert.deepEqual(after.BuoiHoc.slice(0,before.BuoiHoc.length),before.BuoiHoc);assert(after.BuoiHoc.length>before.BuoiHoc.length);
});
