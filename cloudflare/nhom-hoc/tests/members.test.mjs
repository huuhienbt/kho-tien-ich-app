import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {JSDOM} from 'jsdom';
const config=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url)));

test('remove membership: admin confirmation, preservation, concurrency, history and UI',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:new URL('../dist/index.js',import.meta.url).pathname,
    compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:config.vars,d1Databases:['DB'],
    outboundService:async request=>{const p=await request.json();return Response.json(p.adminToken==='signed.admin'?{status:'success',data:{role:'admin',sub:'admin',exp:Math.floor(Date.now()/1000)+3600}}:{status:'error'});}}));
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');
  await db.exec(fs.readFileSync(new URL('../migrations/0001_groups.sql',import.meta.url),'utf8').replaceAll('\n',' '));await db.exec(fs.readFileSync(new URL('../migrations/0002_drive_backup.sql',import.meta.url),'utf8').replaceAll('\n',' '));await db.exec(fs.readFileSync(new URL('../migrations/0003_room_rent.sql',import.meta.url),'utf8').replaceAll('\n',' '));
  await db.batch([
    db.prepare("INSERT INTO NhomHoc(ma_nhom,ten_nhom,cach_tinh_hoc_phi,don_gia_vnd,trang_thai) VALUES('g1','Thứ 2–4','theo_buoi',62500,'dang_hoc'),('g2','Thứ 3–5','theo_buoi',62500,'dang_hoc')"),
    db.prepare("INSERT INTO HocSinh(ma_hoc_sinh,ho_ten,trang_thai) VALUES('fresh','Em mới','dang_hoc'),('history','Em có lịch sử','dang_hoc'),('empty','Em chưa học','dang_hoc'),('race','Em thử đồng thời','dang_hoc')"),
    db.prepare("INSERT INTO ThanhVienNhom(ma_thanh_vien,ma_nhom,ma_hoc_sinh,ngay_vao,trang_thai) VALUES('fresh1','g1','fresh','2026-09-01','dang_hoc'),('fresh2','g2','fresh','2026-09-01','dang_hoc'),('empty1','g1','empty','2026-09-01','dang_hoc'),('race1','g1','race','2026-09-01','dang_hoc')"),
    db.prepare("INSERT INTO ThanhVienNhom(ma_thanh_vien,ma_nhom,ma_hoc_sinh,ngay_vao,don_gia_rieng_vnd,trang_thai,ghi_chu) VALUES('history1','g1','history','2026-09-01',0,'dang_hoc','Giữ ghi chú')"),
    db.prepare("INSERT INTO BuoiHoc(ma_buoi,ma_nhom,ngay_hoc,trang_thai) VALUES('b1','g1','2026-09-07','da_hoc'),('b2','g2','2026-09-08','da_hoc')"),
    db.prepare("INSERT INTO DiemDanh(ma_buoi,ma_hoc_sinh,trang_thai,ghi_chu) VALUES('b1','history','co_mat','Có mặt'),('b2','fresh','co_mat','Nhóm khác')"),
    db.prepare("INSERT INTO ThuHocPhi(ma_thu,ma_nhom,ma_hoc_sinh,ky_thu,so_tien_vnd,ngay_dong,phuong_thuc,trang_thai,nguoi_thu_id,ghi_chu) VALUES('p1','g1','history','2026-09',100000,'2026-09-30','tien_mat','da_thu','admin','Giữ khoản thu')")
  ]);
  const request=async(action,data={},token='signed.admin')=>{
    const r=await mf.dispatchFetch('https://egv.example/api',{method:'POST',headers:{Origin:config.vars.APP_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({action,data,adminToken:token})});
    return {status:r.status,body:await r.json()};
  };
  const preview=async(groupId,memberId)=>(await request('nh_member_remove_preview',{groupId,memberId})).body.data;
  for(const action of ['nh_member_remove_preview','nh_member_remove'])assert.equal((await request(action,{groupId:'g1',memberId:'fresh1'},'signed.member')).status,401);
  assert.equal((await request('nh_member_remove_preview',{groupId:'g2',memberId:'fresh1'})).status,404);
  assert.equal((await request('nh_member_remove_preview',{groupId:'bad id',memberId:'fresh1'})).status,400);
  assert.equal((await request('nh_boot')).body.data.features.memberRemoval,true);

  const f=await preview('g1','fresh1');assert.equal(f.hasHistory,false,'history in another group does not prevent removing this membership');
  const otherHistory=await db.prepare("SELECT * FROM DiemDanh WHERE ma_hoc_sinh='fresh'").all();
  const removed=await request('nh_member_remove',{groupId:'g1',memberId:'fresh1',revision:f.revision,mode:'remove'});
  assert.equal(removed.status,200);assert.equal(removed.body.data.mode,'removed');
  assert.equal((await db.prepare("SELECT count(*) AS n FROM ThanhVienNhom WHERE ma_hoc_sinh='fresh'").first()).n,1);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM HocSinh WHERE ma_hoc_sinh='fresh'").first()).n,1);
  assert.deepEqual((await db.prepare("SELECT * FROM DiemDanh WHERE ma_hoc_sinh='fresh'").all()).results,otherHistory.results);

  const e=await preview('g1','empty1');
  assert.equal((await request('nh_member_remove',{groupId:'g1',memberId:'empty1',revision:e.revision-1,mode:'remove'})).status,409);
  assert.equal((await request('nh_member_remove',{groupId:'g1',memberId:'empty1',revision:e.revision,mode:'remove'})).status,200);
  assert((await request('nh_boot')).body.data.students.some(s=>s.ma_hoc_sinh==='empty'),'a detached profile remains available to re-add');
  assert.equal((await request('nh_students_save',{groupId:'g1',joinDate:'2026-10-12',students:[{id:'empty',memberId:'empty-again'}]})).status,200);

  await db.prepare("INSERT INTO HocPhiKy(ma_chot,ma_nhom,ma_hoc_sinh,ky_thu,so_buoi,cach_tinh,don_gia_vnd,phai_thu_vnd,trang_thai,nguoi_chot_id,chot_luc) VALUES('bill1','g1','history','2026-09',1,'theo_buoi',0,0,'da_chot','admin','2026-10-01T00:00:00Z')").run();
  const h=await preview('g1','history1');assert.equal(h.hasHistory,true);assert.equal(h.minLeaveDate,'2026-10-01');
  const ledgerQueries=()=>[db.prepare('SELECT * FROM DiemDanh ORDER BY ma_buoi,ma_hoc_sinh'),db.prepare('SELECT * FROM ThuHocPhi ORDER BY ma_thu'),db.prepare('SELECT * FROM HocPhiKy ORDER BY ma_chot')];
  const ledgerBefore=JSON.stringify(await db.batch(ledgerQueries()));
  assert.equal((await request('nh_member_remove',{groupId:'g1',memberId:'history1',revision:h.revision,mode:'remove'})).status,409);
  assert.equal((await request('nh_member_remove',{groupId:'g1',memberId:'history1',revision:h.revision,mode:'leave',leaveDate:'2026-09-06'})).status,400);
  assert.equal((await request('nh_member_remove',{groupId:'g1',memberId:'history1',revision:h.revision,mode:'leave',leaveDate:'2026-09-30'})).status,400,'a last day affecting a closed period is rejected');
  assert.equal((await request('nh_member_remove',{groupId:'g1',memberId:'history1',revision:h.revision,mode:'leave',leaveDate:''})).status,400);
  assert.equal((await request('nh_member_remove',{groupId:'g1',memberId:'history1',revision:h.revision,mode:'leave',leaveDate:'2026-10-12'})).status,200);
  const member=await db.prepare("SELECT * FROM ThanhVienNhom WHERE ma_thanh_vien='history1'").first();
  assert.equal(member.ngay_nghi,'2026-10-12');assert.equal(member.trang_thai,'nghi_hoc');assert.equal(member.don_gia_rieng_vnd,0);assert.equal(member.ghi_chu,'Giữ ghi chú');
  const ledgerAfter=await db.batch(ledgerQueries());
  const ledgerOriginal=JSON.parse(ledgerBefore);assert.deepEqual(ledgerAfter.map(r=>r.results),ledgerOriginal.map(r=>r.results));
  assert((await request('nh_view',{groupId:'g1',month:'2026-09'})).body.data.roster.some(s=>s.ma_hoc_sinh==='history'));
  assert(!(await request('nh_view',{groupId:'g1',month:'2026-11'})).body.data.roster.some(s=>s.ma_hoc_sinh==='history'));

  const concurrent=await preview('g1','race1'),beforeAudit=(await db.prepare('SELECT count(*) AS n FROM nh_audit').first()).n;
  const races=await Promise.all([1,2].map(()=>request('nh_member_remove',{groupId:'g1',memberId:'race1',revision:concurrent.revision,mode:'remove'})));
  assert.equal(races.filter(r=>r.status===200).length,1);assert(races.some(r=>[404,409].includes(r.status)));
  assert.equal((await db.prepare('SELECT count(*) AS n FROM nh_audit').first()).n,beforeAudit+1);

  // Exercise the actual modal and submit path through the Worker, including cancellation.
  const dom=new JSDOM(fs.readFileSync(new URL('../../../groups.html',import.meta.url),'utf8'),{url:config.vars.APP_ORIGIN+'/groups.html',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let role='admin';const calls=[];
  w.App={init(){},isAdmin:()=>role==='admin',escapeHTML:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),async apiPost(action,data){calls.push(action);const response=await request(action,data);if(response.body.status!=='success')throw new Error(response.body.message);return response.body;}};
  const waitFor=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('UI did not settle');};
  w.eval(fs.readFileSync(new URL('../../../js/groups.js',import.meta.url),'utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
  await waitFor(()=>d.querySelector('[data-member="empty-again"]')&&d.getElementById('nhBusy').hidden);
  d.getElementById('nhMonth').value='2026-10';d.getElementById('nhMonth').dispatchEvent(new w.Event('change'));
  await waitFor(()=>d.getElementById('nhBusy').hidden&&d.querySelector('[data-member="history1"]'));
  d.querySelector('[data-tab="students"]').click();assert.equal(d.querySelector('#nhStudents [data-remove-member]'),null);d.querySelector('[data-member="empty-again"]').click();assert.match(d.getElementById('nhForm').textContent,/Để trống: đang học/);d.querySelector('[data-remove-member="empty-again"]').click();
  await waitFor(()=>d.getElementById('nhDialog').open);assert.equal(d.getElementById('nhSubmit').textContent,'Xóa khỏi nhóm');
  d.getElementById('nhCancelDialog').click();assert.equal(calls.filter(a=>a==='nh_member_remove').length,0);
  d.querySelector('[data-member="empty-again"]').click();d.querySelector('[data-remove-member="empty-again"]').click();await waitFor(()=>d.getElementById('nhDialog').open);
  d.getElementById('nhForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await waitFor(()=>d.getElementById('nhBusy').hidden&&!d.querySelector('[data-member="empty-again"]'));
  assert.match(d.getElementById('nhFeedback').textContent,/Đã xóa học sinh khỏi nhóm/);
  d.querySelector('[data-member="history1"]').click();d.querySelector('[data-remove-member="history1"]').click();await waitFor(()=>d.getElementById('nhDialog').open);
  assert.equal(d.getElementById('nhSubmit').textContent,'Ghi nhận nghỉ nhóm');assert.equal(d.querySelector('[name="leaveDate"]').value,'2026-10-12');
  role='member';w.dispatchEvent(new w.Event('app:auth-change'));assert.equal(d.getElementById('nhDialog').open,false);assert.equal(d.getElementById('nhWorkspace').hidden,true);
});
