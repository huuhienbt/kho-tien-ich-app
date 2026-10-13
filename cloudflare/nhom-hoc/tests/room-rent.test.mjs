import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {NH_SCHEMA,runAction} from '../src/engine.js';
const require=createRequire(import.meta.url),{ledgerFixture}=require('../../../tests/nhom-hoc-ledger.test.cjs');
const cfg=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url)));
function seed(h=ledgerFixture()) {
  return Object.fromEntries(Object.entries(NH_SCHEMA).map(([name,cols])=>[name,h.sheets.get(name).values.slice(1).filter(r=>r[0]).map(row=>Object.fromEntries(cols.map((c,i)=>[c,row[i]??''])))]));
}
function added(id,date,group='g35',status='da_hoc') {return {ma_buoi:id,ma_nhom:group,ngay_hoc:date,gio_bat_dau:'',gio_ket_thuc:'',trang_thai:status,ghi_chu:''};}
const principal={role:'admin',sub:'u1'},today='2026-10-20';
test('Rent combines uneven groups across months, ignores future/canceled/unconfirmed classes, predicts only from scheduled classes',()=>{
  const tables=seed(),run=(action,data={})=>runAction(tables,principal,action,data,today).result;
  tables.BuoiHoc.push(added('future','2026-10-21'),added('canceled','2026-10-12','g24','da_huy'),added('unconfirmed','2026-10-09','g35','du_kien'));
  let rent=run('nh_boot').roomRent;assert.equal(rent.unpaid,12);assert.equal(rent.forecastDate,'');
  for(let i=0;i<4;i++)tables.BuoiHoc.push(added('plan'+i,'2026-10-'+(22+i),'g35','du_kien'));
  rent=run('nh_boot').roomRent;assert.equal(rent.unpaid,12);assert.equal(rent.forecastDate,'2026-10-24');assert.equal(rent.state,'collecting');
  assert.throws(()=>run('nh_room_rent_save',{id:'early',revision:rent.revision,date:today,amount:1000000}),/Chưa đủ/);
  tables.BuoiHoc.push(added('c13','2026-10-12'),added('c14','2026-10-13'));
  rent=run('nh_boot').roomRent;assert.equal(rent.state,'soon');assert.equal(rent.remaining,2);
  tables.BuoiHoc.push(added('c15','2026-10-14'),added('c16','2026-10-15'),added('c17','2026-10-16'),added('c18','2026-10-17'));
  rent=run('nh_boot').roomRent;assert.equal(rent.unpaid,18);assert.equal(rent.state,'due');assert.equal(rent.dueDate,'2026-10-15');
  assert.equal(rent.groups.find(g=>g.id==='g24').completed,7);assert.equal(rent.groups.find(g=>g.id==='g35').completed,11);
  const first=rent.sessions.slice(0,16);assert.equal(first.filter(s=>s.groupId==='g24').length,7);assert.equal(first.filter(s=>s.groupId==='g35').length,9);
  assert.equal(rent.pendingCycles,1);assert.equal(rent.carryAfterPayment,2);assert.equal(rent.dueAmount,1000000);
  assert.equal(run('nh_view',{groupId:'g24',month:'2026-09'}).roomRent.unpaid,18,'choosing one group must not hide the other group’s rent');
  for(const role of ['member','google','vip','guest'])assert.throws(()=>runAction(tables,{role},'nh_room_rent_save',{},today),/quản trị/);
});
test('Rent records exact class IDs, carries excess, retries safely, rejects stale or invalid payments and keeps void history',()=>{
  const tables=seed(),run=(action,data={})=>runAction(tables,principal,action,data,today,[],'2026-10-20T04:00:00Z');
  for(let i=0;i<6;i++)tables.BuoiHoc.push(added('c'+i,'2026-10-'+(12+i)));
  const initial=run('nh_boot').result.roomRent,payload={id:'paid1',revision:initial.revision,date:today,amount:1000000,note:'Chuyển khoản'};
  for(const patch of [{amount:500000},{amount:'bad'},{date:'2026-10-21'},{date:'2026-10-01'},{date:'2026-02-30'},{revision:'stale'}])assert.throws(()=>run('nh_room_rent_save',{...payload,...patch}));
  const paid=run('nh_room_rent_save',payload);assert.equal(paid.dirty.TienThuePhong.length,1);assert.equal(paid.result.roomRent.unpaid,2);assert.equal(paid.result.roomRent.state,'paid');
  assert.deepEqual(JSON.parse(tables.TienThuePhong[0].buoi_da_tinh),initial.sessions.slice(0,16).map(s=>s.id));
  const again=run('nh_room_rent_save',payload);assert.equal(again.result.repeated,true);assert.deepEqual(again.dirty,{});assert.equal(tables.TienThuePhong.length,1);
  assert.throws(()=>run('nh_room_rent_save',{...payload,note:'Khác'}),/thông tin khác/);
  assert.throws(()=>run('nh_room_rent_save',{...payload,id:'double'}),/vừa thay đổi/);
  const s=run('nh_view',{groupId:'g24',month:'2026-09'}).result.sessions[0];
  assert.throws(()=>run('nh_session_save',{groupId:'g24',id:s.ma_buoi,date:s.ngay_hoc,update:true,revision:s.revision,cancelled:true}),/đã tính/);
  assert.throws(()=>run('nh_session_save',{groupId:'g24',id:s.ma_buoi,date:s.ngay_hoc,update:true,revision:s.revision,planned:true}),/đã tính/);
  tables.BuoiHoc.push(added('backdated','2026-10-02','g24'));
  let rent=run('nh_boot').result.roomRent;assert.equal(rent.unpaid,3);assert(!rent.payments[0].sessions.some(s=>s.id==='backdated'));
  assert.throws(()=>run('nh_room_rent_void',{id:'paid1',revision:rent.revision,reason:''}),/lý do/);
  assert.throws(()=>run('nh_room_rent_void',{id:'paid1',revision:initial.revision,reason:'Nhập nhầm'}),/vừa thay đổi/);
  rent=run('nh_room_rent_void',{id:'paid1',revision:rent.revision,reason:'Nhập nhầm'}).result.roomRent;
  assert.equal(rent.unpaid,19);assert.equal(rent.payments.length,1);assert.equal(rent.payments[0].trang_thai,'da_huy');assert.match(rent.payments[0].ghi_chu,/Chuyển khoản.*Nhập nhầm/);
  assert.equal(run('nh_room_rent_void',{id:'paid1',reason:'Nhập nhầm'}).result.repeated,true);
});
test('D1 rent migration is additive and idempotent; two simultaneous payments reserve each class only once',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:new URL('../dist/index.js',import.meta.url).pathname,compatibilityDate:cfg.compatibility_date,compatibilityFlags:cfg.compatibility_flags,bindings:cfg.vars,d1Databases:['DB'],outboundService:async request=>{
    const p=await request.json();return Response.json(p.adminToken==='signed.rent-test-admin'?{status:'success',data:{role:'admin',sub:'u1',exp:Math.floor(Date.now()/1000)+3600}}:{status:'error'});
  }}));t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
  for(const name of ['0001_groups.sql','0002_drive_backup.sql','0003_room_rent.sql'])await db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').replaceAll('\n',' '));
  assert.equal((await db.prepare('SELECT revision FROM nh_meta').first()).revision,1);
  await db.exec(fs.readFileSync(new URL('../migrations/0003_room_rent.sql',import.meta.url),'utf8').replaceAll('\n',' '));
  assert.equal((await db.prepare('SELECT revision FROM nh_meta').first()).revision,1);
  const tables=seed();for(let i=0;i<6;i++)tables.BuoiHoc.push(added('new'+i,'2026-09-'+(10+i)));
  // Original g35 has Sep 15. Keep unique (group, date).
  tables.BuoiHoc.find(s=>s.ma_buoi==='new5').ngay_hoc='2026-09-17';
  await db.batch(Object.entries(tables).filter(([,rows])=>rows.length).map(([name,rows])=>db.prepare(`INSERT INTO ${name}(${NH_SCHEMA[name].join(',')}) SELECT ${NH_SCHEMA[name].map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?)`).bind(JSON.stringify(rows))));
  const call=async(action,data={},adminToken='signed.rent-test-admin')=>{const response=await mf.dispatchFetch('https://rent.test/api',{method:'POST',headers:{Origin:cfg.vars.APP_ORIGIN},body:JSON.stringify({action,data,adminToken})});return {http:response.status,body:await response.json()};};
  assert.equal((await call('nh_room_rent_save',{},'')).http,401);assert.equal((await call('nh_room_rent_void',{},'member-token')).http,401);
  const boot=await call('nh_boot');assert.equal(boot.http,200,JSON.stringify(boot.body));const rent=boot.body.data.roomRent;assert.equal(rent.unpaid,18);
  assert.equal((await call('nh_view',{groupId:'g24',month:'2026-09'})).body.data.roomRent.unpaid,18);
  const payload={revision:rent.revision,date:rent.today,amount:1000000,note:'Test'};
  const race=await Promise.all(['pay-a','pay-b'].map(id=>call('nh_room_rent_save',{...payload,id,groupId:'g24'})));
  assert.equal(race.filter(r=>r.http===200).length,1);assert(race.some(r=>[400,409].includes(r.http)));
  const row=await db.prepare('SELECT * FROM TienThuePhong').first();assert.equal(JSON.parse(row.buoi_da_tinh).length,16);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM nh_audit').first()).n,1);
  const revision=(await db.prepare('SELECT revision FROM nh_meta').first()).revision;
  assert.equal((await call('nh_room_rent_save',{...payload,id:row.ma_dong})).body.data.repeated,true);
  assert.equal((await db.prepare('SELECT revision FROM nh_meta').first()).revision,revision);
  assert.equal((await call('nh_boot')).body.data.roomRent.unpaid,2);
});
