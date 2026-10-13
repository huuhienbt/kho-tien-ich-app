import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {JSDOM} from 'jsdom';
const config=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url)));

test('group transfers preserve payments, attendance, exemptions and identity; atomic writes and edit-dialog flow',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:new URL('../dist/index.js',import.meta.url).pathname,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:config.vars,d1Databases:['DB'],outboundService:async request=>{const p=await request.json();return Response.json(p.adminToken==='signed.admin'?{status:'success',data:{role:'admin',sub:'admin',exp:Math.floor(Date.now()/1000)+3600}}:{status:'error'});}}));
  t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
  await db.exec(fs.readFileSync(new URL('../migrations/0001_groups.sql',import.meta.url),'utf8').replaceAll('\n',' '));await db.exec(fs.readFileSync(new URL('../migrations/0002_drive_backup.sql',import.meta.url),'utf8').replaceAll('\n',' '));
  await db.batch([
    db.prepare("INSERT INTO NhomHoc(ma_nhom,ten_nhom,cach_tinh_hoc_phi,don_gia_vnd,trang_thai) VALUES('g1','Thứ 2–4','theo_buoi',62500,'dang_hoc'),('g2','Thứ 3–5','theo_buoi',70000,'dang_hoc'),('g3','Nhóm đã lưu','theo_buoi',62500,'luu_tru')"),
    db.prepare("INSERT INTO HocSinh(ma_hoc_sinh,ho_ten,trang_thai) VALUES('paid','Em đã đóng tiền','dang_hoc'),('free','Em miễn học phí','dang_hoc'),('empty','Em chưa học','dang_hoc'),('duplicate','Em đã có ở nhóm mới','dang_hoc'),('race','Em thử đồng thời','dang_hoc')"),
    db.prepare("INSERT INTO ThanhVienNhom(ma_thanh_vien,ma_nhom,ma_hoc_sinh,ngay_vao,trang_thai) VALUES('paid1','g1','paid','2026-09-01','dang_hoc'),('empty1','g1','empty','2026-09-01','dang_hoc'),('duplicate1','g1','duplicate','2026-09-01','dang_hoc'),('duplicate2','g2','duplicate','2026-09-01','dang_hoc'),('race1','g1','race','2026-09-01','dang_hoc')"),
    db.prepare("INSERT INTO ThanhVienNhom(ma_thanh_vien,ma_nhom,ma_hoc_sinh,ngay_vao,don_gia_rieng_vnd,trang_thai,ghi_chu) VALUES('free1','g1','free','2026-09-01',0,'dang_hoc','Miễn thu')"),
    db.prepare("INSERT INTO BuoiHoc(ma_buoi,ma_nhom,ngay_hoc,trang_thai) VALUES('b1','g1','2026-10-12','da_hoc'),('b2','g2','2026-09-08','da_hoc'),('future','g2','2026-10-13','du_kien')"),
    db.prepare("INSERT INTO DiemDanh(ma_buoi,ma_hoc_sinh,trang_thai,ghi_chu) VALUES('b1','paid','co_mat','Giữ điểm danh'),('b1','free','co_mat','Miễn thu'),('b2','duplicate','co_mat','Giữ nhóm đích')"),
    db.prepare("INSERT INTO ThuHocPhi(ma_thu,ma_nhom,ma_hoc_sinh,ky_thu,so_tien_vnd,ngay_dong,phuong_thuc,trang_thai,nguoi_thu_id) VALUES('p1','g1','paid','2026-10',25000,'2026-10-12','tien_mat','da_thu','admin')"),
    db.prepare("INSERT INTO HocPhiKy(ma_chot,ma_nhom,ma_hoc_sinh,ky_thu,so_buoi,cach_tinh,don_gia_vnd,phai_thu_vnd,trang_thai,nguoi_chot_id,chot_luc) VALUES('bill1','g1','paid','2026-09',0,'theo_buoi',62500,0,'da_chot','admin','2026-10-01T00:00:00Z')")
  ]);
  const request=async(action,data={},token='signed.admin')=>{const r=await mf.dispatchFetch('https://egv.example/api',{method:'POST',headers:{Origin:config.vars.APP_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({action,data,adminToken:token})});return {status:r.status,body:await r.json()};};
  const preview=async memberId=>(await request('nh_member_transfer_preview',{groupId:'g1',memberId,targetGroupId:'g2'})).body.data;
  const move=(memberId,p,date='2026-10-13',transferId='new-'+memberId)=>request('nh_member_transfer',{groupId:'g1',memberId,targetGroupId:'g2',date,transferId,rateMode:p.rateMode,revision:p.revision});
  for(const action of ['nh_member_transfer_preview','nh_member_transfer'])assert.equal((await request(action,{groupId:'g1',memberId:'paid1',targetGroupId:'g2'},'member.signed')).status,401);
  assert.equal((await request('nh_member_transfer_preview',{groupId:'g1',memberId:'paid1',targetGroupId:'g1'})).status,400);
  assert.equal((await request('nh_member_transfer_preview',{groupId:'g1',memberId:'paid1',targetGroupId:'g3'})).status,400);
  const p=await preview('paid1');assert.equal(p.minDate,'2026-10-13');assert.equal(p.hasHistory,true);
  const histQueries=()=>[db.prepare('SELECT * FROM DiemDanh ORDER BY ma_buoi,ma_hoc_sinh'),db.prepare('SELECT * FROM ThuHocPhi ORDER BY ma_thu'),db.prepare('SELECT * FROM HocPhiKy ORDER BY ma_chot')];
  const before=(await db.batch(histQueries())).map(r=>r.results);
  assert.equal((await move('paid1',p,'2026-10-12')).status,400);
  assert.equal((await move('paid1',p,'2026-10-13','duplicate2')).status,400);
  assert.equal((await db.prepare("SELECT ngay_nghi FROM ThanhVienNhom WHERE ma_thanh_vien='paid1'").first()).ngay_nghi,'','a rejected destination leaves the source intact');
  assert.equal((await move('paid1',p)).status,200);
  assert.deepEqual((await db.batch(histQueries())).map(r=>r.results),before);
  assert.equal((await db.prepare("SELECT ngay_nghi FROM ThanhVienNhom WHERE ma_thanh_vien='paid1'").first()).ngay_nghi,'2026-10-12');
  const old=(await request('nh_view',{groupId:'g1',month:'2026-10'})).body.data.fees.find(f=>f.studentId==='paid');
  assert.equal(old.due,62500);assert.equal(old.paid,25000);
  const destination=(await request('nh_view',{groupId:'g2',month:'2026-10'})).body.data.fees.find(f=>f.studentId==='paid');assert.equal(destination.due,0);assert.equal(destination.paid,0);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM HocSinh WHERE ma_hoc_sinh='paid'").first()).n,1);
  const empty=await preview('empty1');assert.equal(empty.hasHistory,false);
  assert.equal((await move('empty1',empty,'2026-10-12')).status,200);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM ThanhVienNhom WHERE ma_hoc_sinh='empty'").first()).n,1);
  const existing=await db.prepare("SELECT * FROM ThanhVienNhom WHERE ma_thanh_vien='duplicate2'").first(),dupe=await preview('duplicate1');assert.equal(dupe.reusesMembership,true);
  assert.equal((await move('duplicate1',dupe,'2026-10-12')).status,200);
  assert.deepEqual(await db.prepare("SELECT * FROM ThanhVienNhom WHERE ma_thanh_vien='duplicate2'").first(),existing);
  const race=await preview('race1');
  const results=await Promise.all(['a','b'].map(id=>move('race1',race,'2026-10-12','race-'+id)));
  assert.equal(results.filter(r=>r.status===200).length,1);assert(results.some(r=>[404,409].includes(r.status)));
  assert.equal((await db.prepare("SELECT count(*) AS n FROM ThanhVienNhom WHERE ma_hoc_sinh='race'").first()).n,1);

  // Dialog actions live inside Sửa; edits require a deliberate discard before switching forms.
  const dom=new JSDOM(fs.readFileSync(new URL('../../../groups.html',import.meta.url),'utf8'),{url:config.vars.APP_ORIGIN+'/groups.html',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const calls=[];w.confirm=()=>false;
  w.App={init(){},isAdmin:()=>true,escapeHTML:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),async apiPost(action,data){calls.push(action);const r=await request(action,data);if(r.body.status!=='success')throw new Error(r.body.message);return r.body;}};
  const waitFor=async fn=>{for(let i=0;i<180;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('UI did not settle');};
  w.eval(fs.readFileSync(new URL('../../../js/groups.js',import.meta.url),'utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
  await waitFor(()=>d.querySelector('[data-member="free1"]')&&d.getElementById('nhBusy').hidden);
  assert.equal(d.querySelector('#nhStudents [data-transfer-member]'),null);assert.equal(d.querySelector('#nhStudents [data-remove-member]'),null);
  d.querySelector('[data-tab="students"]').click();d.querySelector('[data-member="free1"]').click();
  d.querySelector('[name="name"]').value='Tên chưa lưu';d.querySelector('[data-transfer-member="free1"]').click();
  assert.equal(calls.filter(a=>a==='nh_member_transfer_preview').length,0);assert.equal(d.querySelector('[name="name"]').value,'Tên chưa lưu');
  w.confirm=()=>true;d.querySelector('[data-transfer-member="free1"]').click();await waitFor(()=>d.querySelector('[name="targetGroupId"]')&&d.getElementById('nhDialog').open);
  const expectedDate=(await preview('free1')).defaultDate;
  assert.equal(d.querySelector('[name="date"]').value,expectedDate);assert.equal(d.querySelector('[name="rateMode"]').value,'keep');
  assert.match(d.getElementById('nhForm').textContent,/miễn học phí/);
  d.getElementById('nhForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await waitFor(()=>d.getElementById('nhBusy').hidden&&!d.getElementById('nhDialog').open&&d.getElementById('nhGroup').value==='g2');
  const free=await db.prepare("SELECT don_gia_rieng_vnd,ngay_vao FROM ThanhVienNhom WHERE ma_nhom='g2' AND ma_hoc_sinh='free'").first();assert.equal(free.don_gia_rieng_vnd,0);assert.equal(free.ngay_vao,expectedDate);
  assert.match((await db.prepare("SELECT ghi_chu FROM ThanhVienNhom WHERE ma_nhom='g2' AND ma_hoc_sinh='free'").first()).ghi_chu,/Miễn thu/);
  assert.equal((await db.prepare("SELECT ho_ten FROM HocSinh WHERE ma_hoc_sinh='free'").first()).ho_ten,'Em miễn học phí');
  assert.match(d.getElementById('nhFeedback').textContent,/Đã chuyển/);
});
