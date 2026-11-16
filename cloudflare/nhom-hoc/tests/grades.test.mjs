import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url),{workbook}=require('../../../tests/fixtures/nh-grades-xlsx.cjs');
const config=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url)));

test('Private academic API and the actual student UI: atomic imports, retries, exact matching, old-data preservation and logout',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:new URL('../dist/index.js',import.meta.url).pathname,
    compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:config.vars,d1Databases:['DB'],
    outboundService:async request=>{const p=await request.json();return Response.json(p.adminToken==='signed.admin'?{status:'success',data:{role:'admin',sub:'admin',exp:Math.floor(Date.now()/1000)+3600}}:{status:'error'});}}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');
  for(const name of ['0001_groups.sql','0002_drive_backup.sql','0003_room_rent.sql','0004_grades.sql'])await db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').replaceAll('\n',' '));
  const migrationRevision=(await db.prepare('SELECT revision FROM nh_meta').first()).revision;
  await db.exec(fs.readFileSync(new URL('../migrations/0004_grades.sql',import.meta.url),'utf8').replaceAll('\n',' '));assert.equal((await db.prepare('SELECT revision FROM nh_meta').first()).revision,migrationRevision);
  await db.batch([
    db.prepare("INSERT INTO NhomHoc(ma_nhom,ten_nhom,cach_tinh_hoc_phi,don_gia_vnd,trang_thai) VALUES('g1','Thứ 2–4','theo_buoi',62500,'dang_hoc'),('g2','Thứ 3–5','theo_buoi',62500,'dang_hoc')"),
    db.prepare("INSERT INTO HocSinh(ma_hoc_sinh,ho_ten,trang_thai) VALUES('s1','Đỗ <B> & An','dang_hoc'),('s2','Học sinh B','dang_hoc')"),
    db.prepare("INSERT INTO ThanhVienNhom(ma_thanh_vien,ma_nhom,ma_hoc_sinh,ngay_vao,trang_thai) VALUES('m1','g1','s1','2026-09-01','dang_hoc'),('m2','g2','s2','2026-09-01','dang_hoc'),('shared','g2','s1','2026-09-01','dang_hoc')"),
    db.prepare("INSERT INTO BuoiHoc(ma_buoi,ma_nhom,ngay_hoc,trang_thai) VALUES('b1','g1','2026-09-07','da_hoc')"),
    db.prepare("INSERT INTO DiemDanh(ma_buoi,ma_hoc_sinh,trang_thai,ghi_chu) VALUES('b1','s1','co_mat','Giữ ghi chú')"),
    db.prepare("INSERT INTO ThuHocPhi(ma_thu,ma_nhom,ma_hoc_sinh,ky_thu,so_tien_vnd,ngay_dong,phuong_thuc,trang_thai,nguoi_thu_id) VALUES('p1','g1','s1','2026-09',100000,'2026-09-30','tien_mat','da_thu','admin')")
  ]);
  const legacyNames=['NhomHoc','HocSinh','ThanhVienNhom','BuoiHoc','DiemDanh','ThuHocPhi','HocPhiKy','TienThuePhong'];
  const legacy=async()=>JSON.stringify((await db.batch(legacyNames.map(name=>db.prepare('SELECT * FROM '+name+' ORDER BY rowid')))).map(r=>r.results));
  const before=await legacy(),calls=[];
  const call=async(action,data={},token='signed.admin')=>{calls.push({action,data});const r=await mf.dispatchFetch('https://groups.test/api',{method:'POST',headers:{Origin:config.vars.APP_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({action,data,adminToken:token})});return {status:r.status,body:await r.json()};};
  const p={schoolYear:'2026-2027',assessment:'gk1',sourceFile:'Diem.xlsx',sourceClass:'4/12',rows:[{row:6,name:'Đỗ <B> & An',vietnamese:0,math:9.5},{row:7,name:'Học sinh B',vietnamese:7,math:8},{row:8,name:'Ngoài nhóm',vietnamese:8,math:9}]};
  for(const action of ['nh_grades_list','nh_grades_preview','nh_grades_import','nh_grades_undo'])assert.equal((await call(action,{},'signed.member')).status,401);
  assert.equal((await call('nh_boot')).body.data.features.grades,true);
  const preview=(await call('nh_grades_preview',p)).body.data;assert.equal(preview.matched,2);assert.equal(preview.outside,1);assert.equal((await db.prepare('SELECT count(*) n FROM DiemKiemTra').first()).n,0);
  const race=await Promise.all(['race-a','race-b'].map(id=>call('nh_grades_import',{...p,id,revision:preview.revision})));assert.equal(race.filter(r=>r.status===200).length,1);assert(race.some(r=>[400,409].includes(r.status)));
  const winner=race.find(r=>r.status===200).body.data.id;assert.equal((await call('nh_grades_import',{...p,id:winner,revision:preview.revision})).body.data.repeated,true);
  assert.equal((await db.prepare('SELECT count(*) n FROM DiemKiemTra').first()).n,2);assert.equal((await db.prepare("SELECT count(*) n FROM nh_audit WHERE action='nh_grades_import'").first()).n,1);
  let gradeList=(await call('nh_grades_list',{groupId:'g1',schoolYear:'2026-2027',assessment:'gk1'})).body.data;assert.equal(gradeList.scores[0].tieng_viet,'0');
  assert.equal((await call('nh_grades_list',{groupId:'g2',schoolYear:'2026-2027',assessment:'gk1'})).body.data.scores.find(r=>r.ma_hoc_sinh==='s1').tieng_viet,'0','a shared student has one academic result');
  assert.equal(await legacy(),before);

  const dom=new JSDOM(fs.readFileSync(new URL('../../../groups.html',import.meta.url),'utf8'),{url:config.vars.APP_ORIGIN+'/groups.html?group=g1&tab=students',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
  w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  let role='admin',blockList=false,release;
  const errors=[];w.addEventListener('error',e=>errors.push(e.message));
  w.App={init(){},isAdmin:()=>role==='admin',escapeHTML:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),async apiPost(action,data){if(blockList&&action==='nh_grades_list')await new Promise(resolve=>release=resolve);const response=await call(action,data);if(response.body.status!=='success')throw Error(response.body.message);return w.JSON.parse(JSON.stringify(response.body));}};
  const waitFor=async predicate=>{for(let i=0;i<300;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Academic UI did not settle');};
  for(const name of ['js/vendor/fflate-0.8.2.min.js','js/groups-excel.js','js/groups-grades.js','js/groups.js'])w.eval(fs.readFileSync(new URL('../../../'+name,import.meta.url),'utf8'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));await waitFor(()=>d.querySelector('[data-grade-tv="s1"]')?.textContent==='0');
  assert.equal(d.querySelector('#nhStudents b'),null);assert.equal(d.querySelector('[data-grade-math="s1"]').textContent,'9,5');
  d.querySelector('#nhStudents [data-profile="s1"]').click();assert.match(d.getElementById('nhProfileBody').textContent,/Giữa kỳ I/);assert.match(d.querySelector('.nh-profile-grades').textContent,/0/);d.getElementById('nhCloseProfile').click();
  d.getElementById('nhMonth').value='2027-01';d.getElementById('nhMonth').dispatchEvent(new w.Event('change',{bubbles:true}));await waitFor(()=>d.getElementById('nhBusy').hidden&&d.querySelector('[data-grade-tv="s1"]')?.textContent==='0');assert.match(d.getElementById('nhStudents').textContent,/2026–2027/);
  d.querySelector('[data-grade-import]').click();assert.equal(d.getElementById('nhGradeDialog').open,true);
  const file={name:'4.12 GK1.xlsx',size:1000,arrayBuffer:async()=>workbook({zero:false})};Object.defineProperty(d.getElementById('nhGradeExcelFile'),'files',{value:[file]});d.getElementById('nhGradeExcelFile').dispatchEvent(new w.Event('change',{bubbles:true}));
  await waitFor(()=>d.getElementById('nhGradePreview').textContent.includes('1 khớp'));assert.equal(d.querySelector('[data-grade-save]').disabled,false);assert.equal((await db.prepare('SELECT count(*) n FROM DiemKiemTra').first()).n,2,'Excel preview does not write');
  assert.equal(d.getElementById('nhGradeImportYear').value,'2026-2027');assert.equal(d.getElementById('nhGradeSourceClass').value,'4/12');
  d.querySelector('[data-grade-save]').click();d.querySelector('[data-grade-save]')?.click();await waitFor(()=>!d.getElementById('nhGradeDialog').open&&d.querySelector('[data-grade-tv="s1"]')?.textContent==='9');
  assert.equal((await db.prepare('SELECT count(*) n FROM DiemKiemTra').first()).n,3);assert.equal(await legacy(),before);
  d.querySelector('[data-grade-undo]').click();assert.equal(d.getElementById('nhGradeDialog').open,true);d.querySelector('[data-grade-confirm-undo]').click();await waitFor(()=>d.querySelector('[data-grade-tv="s1"]')?.textContent==='0');assert.equal((await db.prepare('SELECT count(*) n FROM DiemKiemTra').first()).n,4);
  blockList=true;d.querySelector('[data-grade-import]').click();d.querySelector('[data-grade-cancel]').click();d.getElementById('nhGradeAssessment').value='ck1';d.getElementById('nhGradeAssessment').dispatchEvent(new w.Event('change',{bubbles:true}));await waitFor(()=>!!release);
  role='guest';w.dispatchEvent(new w.Event('app:auth-change'));release();await new Promise(resolve=>setTimeout(resolve,50));assert.equal(d.getElementById('nhWorkspace').hidden,true);assert.equal(d.getElementById('nhStudents').textContent,'');assert.equal(d.getElementById('nhGradeDialog').textContent,'');assert.deepEqual(errors,[]);assert.equal(await legacy(),before);
});
