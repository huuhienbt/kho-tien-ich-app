'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ledgerFixture}=require('./nhom-hoc-ledger.test.cjs');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.EGV_QA_DEPENDENCIES||process.cwd()]}));
const zip=require('../js/vendor/fflate-0.8.2.min.js'),excel=require('../js/groups-excel.js');
function gradeFixture(){const h=ledgerFixture();for(const [memberId,rate] of [['m1',''],['m2',0]])h.api('nh_member_save',{groupId:'g35',memberId,joinDate:'2026-09-01',leaveDate:'',className:'',rate});return h;}
const beforeLedger=h=>JSON.stringify(Object.fromEntries([...h.sheets].filter(([name])=>name!=='DiemKiemTra').map(([name,s])=>[name,s.values])));
const payload={schoolYear:'2026-2027',assessment:'gk1',sourceFile:'Bang diem.xlsx',sourceClass:'4/12',rows:[{row:6,name:'Học sinh A',vietnamese:0,math:9.5},{row:7,name:'Học sinh B',vietnamese:8,math:10},{row:8,name:'Ngoài nhóm',vietnamese:7,math:6}]};
const clone=v=>JSON.parse(JSON.stringify(v));
function input(overrides={}){return {...clone(payload),...overrides};}
function save(h,data,id){const preview=h.api('nh_grades_preview',data);return h.api('nh_grades_import',{...data,id,revision:preview.revision});}
const list=h=>h.api('nh_grades_list',{groupId:'g35',schoolYear:'2026-2027',assessment:'gk1'});

test('Academic imports preserve identity and the old ledger, accept zero and decimals, skip outside names and never duplicate a repeated request',()=>{
  const h=gradeFixture(),before=beforeLedger(h),p=input(),preview=h.api('nh_grades_preview',p);
  assert.equal(preview.matched,2);assert.equal(preview.outside,1);assert.equal(preview.changed,2);assert.equal(preview.rows[0].missingClass,true);assert.equal(beforeLedger(h),before);
  const result=h.api('nh_grades_import',{...p,id:'batch-one',revision:preview.revision});assert.equal(result.saved,2);
  let data=list(h);assert.equal(data.scores.find(r=>r.ma_hoc_sinh==='s1').tieng_viet,'0');assert.equal(data.scores.find(r=>r.ma_hoc_sinh==='s1').toan,'9.5');
  assert.equal(data.history.length,1);assert.equal(data.history[0].canUndo,true);assert.equal(h.api('nh_grades_import',{...p,id:'batch-one',revision:preview.revision}).repeated,true);
  assert.equal(h.sheets.get('DiemKiemTra').values.length,3);assert.equal(save(h,p,'unchanged').saved,0);assert.equal(h.sheets.get('DiemKiemTra').values.length,3);
  assert.equal(beforeLedger(h),before,'names, class, memberships, dates, exemptions, receipts and all fees are untouched');
  const other=h.api('nh_grades_list',{groupId:'g35',schoolYear:'2025-2026',assessment:'gk1'});assert.equal(other.scores.length,0);
  assert.equal(h.api('nh_grades_list',{groupId:'g35',schoolYear:'2026-2027',assessment:'ck1'}).scores.length,0);
  assert.throws(()=>h.api('nh_grades_import',{...p,rows:[{...p.rows[0],math:4}],id:'batch-one',revision:data.revision}),/khác/);
});
test('Updates keep blanks separate from zero; undo appends history and refuses to replace newer scores',()=>{
  const h=gradeFixture(),before=beforeLedger(h);save(h,input(),'first');
  const update=input({rows:[{row:6,name:'Học sinh A',vietnamese:null,math:7}]});save(h,update,'second');
  let data=list(h);assert.equal(data.scores.find(r=>r.ma_hoc_sinh==='s1').tieng_viet,'0');assert.equal(data.scores.find(r=>r.ma_hoc_sinh==='s1').toan,'7');
  assert.equal(data.history.find(b=>b.id==='first').canUndo,false);assert.throws(()=>h.api('nh_grades_undo',{id:'bad-undo',batchId:'first',revision:data.revision}),/cập nhật sau/);
  const undo=h.api('nh_grades_undo',{id:'undo-second',batchId:'second',revision:data.revision});assert.equal(undo.saved,1);assert.equal(h.api('nh_grades_undo',{id:'undo-second',batchId:'second',revision:data.revision}).repeated,true);
  data=list(h);assert.equal(data.scores.find(r=>r.ma_hoc_sinh==='s1').toan,'9.5');assert.equal(data.scores.find(r=>r.ma_hoc_sinh==='s2').toan,'10');
  save(h,input({rows:[{row:6,name:'Học sinh A',vietnamese:6,math:9}]}),'third');
  data=list(h);assert.equal(h.api('nh_grades_undo',{id:'undo-third',batchId:'third',revision:data.revision}).saved,1);
  assert.equal(beforeLedger(h),before);assert(h.sheets.get('DiemKiemTra').values.length>3);
});
test('Only unique exact names are automatic; duplicate names, changed classes, invalid scores and stale revisions cannot silently write',()=>{
  const h=gradeFixture();h.api('nh_students_save',{groupId:'g24',joinDate:'2026-09-01',students:[{id:'duplicate',memberId:'duplicate-member',name:'Học sinh A',className:'4/12'}]});
  let p=input(),preview=h.api('nh_grades_preview',p);assert.equal(preview.review,1);assert.equal(preview.matched,1);
  p.rows[0].studentId='s1';preview=h.api('nh_grades_preview',p);assert.equal(preview.matched,2);
  const before=JSON.stringify(h.sheets.get('DiemKiemTra').values);
  for(const value of [11,-1,'9',NaN,Infinity])assert.throws(()=>h.api('nh_grades_preview',input({rows:[{row:6,name:'Học sinh B',vietnamese:value,math:5}]})),/Điểm/);
  assert.throws(()=>h.api('nh_grades_preview',input({schoolYear:'2026-2028'})),/Năm học/);
  assert.throws(()=>h.api('nh_grades_preview',input({rows:[{row:6,name:'Học sinh A',studentId:'s2',vietnamese:6,math:7},{row:7,name:'Học sinh B',vietnamese:5,math:6}]})),/cùng một/);
  h.api('nh_member_save',{groupId:'g35',memberId:'m2',joinDate:'2026-09-01',leaveDate:'',name:'Học sinh B',className:'5/1',rate:0});
  assert.throws(()=>h.api('nh_grades_import',{...p,id:'stale',revision:preview.revision}),/vừa thay đổi/);assert.equal(JSON.stringify(h.sheets.get('DiemKiemTra').values),before);
  preview=h.api('nh_grades_preview',input());assert.equal(preview.rows.find(r=>r.name==='Học sinh B').state,'review');
});
const {workbook}=require('./fixtures/nh-grades-xlsx.cjs');
test('Excel reads exactly B/J/K, cached formula results, Vietnamese names and academic context; missing formula results are rejected',()=>{
  const w=new JSDOM('').window,options={zip,DOMParser:w.DOMParser};
  try{const result=excel.parse(workbook({zero:true}),options);assert.equal(result.rows.length,1);assert.equal(result.schoolYear,'2026-2027');assert.equal(result.sourceClass,'4/12');assert.equal(result.assessment,'gk1');assert.equal(result.rows[0].name,'Đỗ <B> & An');assert.equal(result.rows[0].vietnamese,0);assert.equal(result.rows[0].math,9.5);assert.throws(()=>excel.parse(workbook({missingCache:true}),options),/chưa có kết quả/);assert.throws(()=>excel.parse(new Uint8Array(5242881),options),/5 MB/);assert.throws(()=>excel.parse(new Uint8Array([1,2,3]),options),/không hợp lệ/);}finally{w.close();}
});
