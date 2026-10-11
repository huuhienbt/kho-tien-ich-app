'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
class Sheet {
  constructor(name,values=[],cols=26){this.name=name;this.values=values;this.cols=cols;this.max=1000;}
  getLastRow(){let n=this.values.length;while(n&&!this.values[n-1].some(v=>v!==''&&v!=null))n--;return n;}
  getMaxRows(){return this.max;}getMaxColumns(){return this.cols;}
  insertColumnsAfter(_,n){this.cols+=n;}insertRowsAfter(_,n){this.max+=n;}setFrozenRows(){return this;}
  getRange(r,c,n=1,m=1){
    assert(c+m-1<=this.cols,'Range outside existing grid');const sheet=this;
    return {getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.values[r-1+i]?.[c-1+j]??''));},setValues(rows){assert.equal(rows.length,n);rows.forEach((row,i)=>{assert.equal(row.length,m);const target=sheet.values[r-1+i]??(sheet.values[r-1+i]=[]);row.forEach((v,j)=>target[c-1+j]=v);});return this;},setFontWeight(){return this;}};
  }
}
function harness(seed={}){
  const sheets=new Map(Object.entries(seed).map(([name,table])=>[name,new Sheet(name,[table.headers,...table.rows],table.headers.length)]));
  const book={getSheetByName:n=>sheets.get(n),insertSheet:n=>{const s=new Sheet(n);sheets.set(n,s);return s;}};
  let today='2026-10-10',locks=0;
  const ctx={Date,JSON,Math,Number,String,Array,Object,Set,Map,isFinite,Error,
    SpreadsheetApp:{openById:()=>book,flush(){}},LockService:{getScriptLock:()=>({waitLock(){locks++;},releaseLock(){locks--;}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],formatDate:d=>d.toISOString().slice(0,10)},
    base64WebSafe:b=>Buffer.from(b).toString('base64url'),cleanText:(x,max)=>String(x??'').trim().slice(0,max),getSetting:(name,_,fallback)=>name==='EGV_NH_DATA_ID'?'configured-test-sheet':fallback,
    getSheetObjects:()=>[{id:'u1',name:'Giáo viên',status:'active'}],resolvePrincipal:p=>p.adminToken==='admin-test'?{sub:'u1',role:'admin'}:p.userToken?{sub:'u1',role:'member'}:null,createResponse:r=>r};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'NhomHoc.gs'),'utf8'),ctx);ctx.nhToday_=()=>today;
  // Exercise the shared ledger with fake Sheets even after production switches to D1.
  ctx.nhCloudflareActive_=()=>false;
  function api(action,data={}){const r=ctx.handleNhomHoc({action,data,adminToken:'admin-test'});assert.equal(r.status,'success');assert.equal(locks,0);return r.data;}
  return {ctx,sheets,api,setToday:d=>today=d};
}
function cycleTests(){
  const legacyHeaders=['ma_nhom','ten_nhom','nam_hoc','thu_trong_tuan','gio_bat_dau','gio_ket_thuc','giao_vien_id','cach_tinh_hoc_phi','don_gia_vnd','trang_thai','ghi_chu'];
  const legacyRow=['legacy','Nhóm theo lịch','','2,4','','','u1','theo_buoi',62500,'dang_hoc','Giữ nguyên'];
  const h=harness({NhomHoc:{headers:legacyHeaders,rows:[legacyRow]}}),{api}=h;
  const configured=h.ctx.getSetting;
  h.ctx.getSetting=(name,required)=>{assert.equal(name,'EGV_NH_DATA_ID');assert.equal(required,true);throw new Error('Chưa cấu hình Script Property: EGV_NH_DATA_ID');};
  assert.throws(()=>h.ctx.nhBook_(),/Chưa cấu hình/);h.ctx.getSetting=configured;
  // Read an 11-column v9.3 grid before migration; extend it without changing A:K.
  assert.equal(h.ctx.nhRows_({book:h.ctx.nhBook_(),tables:{}},'NhomHoc')[0].so_buoi_moi_ky,'');
  h.ctx.setupNhomHoc();h.ctx.setupNhomHoc();assert.deepEqual(h.sheets.get('NhomHoc').values[1].slice(0,11),legacyRow);
  assert.equal(h.sheets.get('NhomHoc').getMaxColumns(),13);
  for(const action of ['nh_boot','nh_view','nh_group_save','nh_students_save','nh_member_save','nh_session_save','nh_attendance_save','nh_attendance_batch_save','nh_schedule_preview','nh_sessions_plan','nh_receipt_save','nh_receipt_void','nh_close_month','nh_reopen_month']){
    const denied=h.ctx.handleNhomHoc({action,data:{groupId:'legacy'},userToken:'member'});
    assert.equal(denied.status,'error');assert.match(denied.message,/Chỉ tài khoản quản trị/);assert(!denied.data);
  }
  assert.equal(h.ctx.handleNhomHoc({action:'nh_boot',data:{}}).status,'error');
  const group={id:'cycle',name:'Nhóm 8 buổi',days:'3,5',teacher:'u1',mode:'theo_buoi',rate:62500,cycleSize:8,cycleStart:'2026-09'};
  api('nh_group_save',group);
  api('nh_students_save',{groupId:'cycle',joinDate:'2026-09-01',students:[{id:'s1',memberId:'m1',name:'Học sinh A'},{id:'s2',memberId:'m2',name:'Học sinh miễn phí'}]});
  api('nh_member_save',{groupId:'cycle',memberId:'m2',joinDate:'2026-09-01',leaveDate:'',rate:0});
  api('nh_students_save',{groupId:'cycle',joinDate:'2026-10-05',students:[{id:'s3',memberId:'m3',name:'Học sinh mới tháng 10'}]});
  const dates=['2026-09-15','2026-09-24','2026-09-29','2026-10-01','2026-10-08'];
  for(let i=0;i<dates.length;i++)assert.equal(api('nh_session_save',{groupId:'cycle',id:'b'+(i+1),date:dates[i]}).month,'2026-09');
  const view=month=>api('nh_view',{groupId:'cycle',month});
  function markAll(month){const v=view(month);for(const b of v.sessions.filter(b=>b.trang_thai!=='da_huy'&&b.ngay_hoc<=view(month).today)){
    const fresh=view(month),s=fresh.sessions.find(s=>s.ma_buoi===b.ma_buoi);
    api('nh_attendance_save',{groupId:'cycle',sessionId:s.ma_buoi,revision:s.revision,marks:fresh.roster.filter(m=>m.ngay_vao<=s.ngay_hoc&&(!m.ngay_nghi||m.ngay_nghi>=s.ngay_hoc)).map(m=>({studentId:m.ma_hoc_sinh,status:'co_mat'}))});
  }}
  markAll('2026-09');
  api('nh_receipt_save',{groupId:'cycle',id:'r1',studentId:'s1',month:'2026-09',amount:500000,date:'2026-09-29',method:'khac'});
  let v=view('2026-09');assert.equal(v.period.completed,5);assert.equal(view('2026-10').sessions.length,0);
  assert.equal(v.fees.find(f=>f.studentId==='s1').attended,5);assert.equal(v.fees.find(f=>f.studentId==='s1').due,312500);assert.equal(v.fees.find(f=>f.studentId==='s1').paid,500000);
  assert.equal(v.fees.find(f=>f.studentId==='s2').due,0);assert.equal(v.fees.find(f=>f.studentId==='s3').attended,1);
  assert.equal(api('nh_boot').groups.find(g=>g.ma_nhom==='cycle').ky_hien_tai,'2026-09');
  assert.throws(()=>api('nh_close_month',{groupId:'cycle',month:'2026-09',revision:v.revision}),/5\/8/);
  for(const [id,date] of [['b6','2026-10-12'],['b7','2026-10-13'],['b8','2026-10-15'],['b9','2026-10-16']]){
    assert.equal(api('nh_session_save',{groupId:'cycle',id,date}).month,id==='b9'?'2026-10':'2026-09');
  }
  v=view('2026-09');assert.equal(v.sessions.filter(b=>b.trang_thai!=='da_huy').length,8);assert.equal(v.period.completed,5);
  assert.equal(v.sessions.filter(b=>b.trang_thai==='du_kien').length,3);
  assert.equal(api('nh_boot').groups.find(g=>g.ma_nhom==='cycle').ky_hien_tai,'2026-09');
  assert.throws(()=>api('nh_attendance_save',{groupId:'cycle',sessionId:'b8',revision:v.sessions.find(b=>b.ma_buoi==='b8').revision,marks:[]}),/đến ngày/);
  h.setToday('2026-10-15');assert.equal(view('2026-09').period.completed,5);markAll('2026-09');v=view('2026-09');assert.equal(v.period.completed,8);assert.equal(v.fees.find(f=>f.studentId==='s1').due,500000);
  assert.equal(api('nh_boot').groups.find(g=>g.ma_nhom==='cycle').ky_hien_tai,'2026-10');assert.equal(view('2026-10').sessions[0].thu_tu_ky,1);
  api('nh_close_month',{groupId:'cycle',month:'2026-09',revision:v.revision});v=view('2026-09');assert(v.closed);
  const before=JSON.stringify(h.sheets.get('BuoiHoc').values);
  assert.throws(()=>api('nh_session_save',{groupId:'cycle',id:'backdated',date:'2026-09-10'}),/đã chốt/);assert.equal(JSON.stringify(h.sheets.get('BuoiHoc').values),before);
  assert.throws(()=>api('nh_attendance_save',{groupId:'cycle',sessionId:'b4',revision:v.sessions.find(b=>b.ma_buoi==='b4').revision,marks:[]}),/đã chốt/);
  assert.throws(()=>api('nh_group_save',{...group,cycleStart:'2026-10'}),/Mở lại/);
  api('nh_reopen_month',{groupId:'cycle',month:'2026-09',revision:v.revision});v=view('2026-09');
  api('nh_session_save',{groupId:'cycle',id:'b3',date:'2026-09-29',update:true,cancelled:true,revision:v.sessions.find(b=>b.ma_buoi==='b3').revision});
  v=view('2026-09');assert.equal(v.period.completed,7);assert.equal(v.sessions.find(b=>b.ma_buoi==='b9').thu_tu_ky,8);assert.equal(v.fees.find(f=>f.studentId==='s1').paid,500000);
  assert.equal(api('nh_boot').groups.find(g=>g.ma_nhom==='cycle').ky_hien_tai,'2026-09');assert.equal(v.fees.find(f=>f.studentId==='s2').due,0);
  for(let d=17;d<=24;d++)api('nh_session_save',{groupId:'cycle',id:'later'+d,date:'2026-10-'+d});
  h.setToday('2026-10-16');markAll('2026-09');
  h.setToday('2026-10-30');markAll('2026-10');v=view('2026-10');assert.equal(v.period.completed,8);
  api('nh_close_month',{groupId:'cycle',month:'2026-10',revision:v.revision});
  const september=view('2026-09'),first=september.sessions.find(b=>b.ma_buoi==='b1');
  assert.throws(()=>api('nh_session_save',{groupId:'cycle',id:'b1',date:first.ngay_hoc,update:true,cancelled:true,revision:first.revision}),/dịch buổi.*đã chốt/);
  assert.throws(()=>api('nh_member_save',{groupId:'cycle',memberId:'m1',joinDate:'2026-09-01',leaveDate:'2026-10-20',rate:''}),/ảnh hưởng kỳ đã chốt/);
  assert.equal(view('2026-09').sessions.find(b=>b.ma_buoi==='b1').trang_thai,'da_hoc');
  api('nh_session_save',{groupId:'legacy',id:'cal1',date:'2026-09-29'});api('nh_session_save',{groupId:'legacy',id:'cal2',date:'2026-10-01'});
  assert.equal(api('nh_view',{groupId:'legacy',month:'2026-09'}).sessions.length,1);assert.equal(api('nh_view',{groupId:'legacy',month:'2026-10'}).period.mode,'calendar');
  assert.equal(h.ctx.nhShiftMonth_('2026-12',1),'2027-01');
  console.log('PASS: admin-only access for every group action; legacy migration; 8-session periods across actual calendar months; 8th/9th boundary; future sessions; free override; joining in October; September receipts; close/reopen; cancelled and backdated sessions; protection of closed later periods; calendar fallback; year rollover.');
}
function verifyNative(file){
  const seed=JSON.parse(fs.readFileSync(file,'utf8'));if(seed.NhomHoc.headers.length===11){seed.NhomHoc.headers.push('so_buoi_moi_ky','ky_bat_dau');seed.NhomHoc.rows.forEach(r=>r.push(8,'2026-09'));}
  const h=harness(seed);h.ctx.setupNhomHoc();const results=[];
  for(const row of seed.NhomHoc.rows){
    const v=h.api('nh_view',{groupId:row[0],month:'2026-09'}),oct=h.api('nh_view',{groupId:row[0],month:'2026-10'});
    assert.equal(v.period.completed,row[0].includes('T2T4')?7:5);assert.equal(oct.sessions.length,0);
    assert.equal(v.fees.reduce((n,f)=>n+f.due,0),row[0].includes('T2T4')?4375000:3187500);
    assert.equal(v.fees.reduce((n,f)=>n+f.paid,0),row[0].includes('T2T4')?3000000:1500000);
    for(const m of v.roster.filter(m=>m.don_gia_rieng_vnd===0))assert.equal(v.fees.find(f=>f.studentId===m.ma_hoc_sinh).due,0);
    results.push({group:row[1],period:v.month,completed:v.period.completed,attendances:v.fees.reduce((n,f)=>n+f.attended,0),paid:v.fees.reduce((n,f)=>n+f.paid,0)});
  }
  console.log('PASS: current native data',JSON.stringify(results));
}
if(require.main===module){cycleTests();if(process.argv[2])verifyNative(process.argv[2]);}
module.exports={harness,cycleTests};
