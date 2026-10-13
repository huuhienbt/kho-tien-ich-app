import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createRequire} from 'node:module';
import {NH_SCHEMA,runAction} from '../src/engine.js';
const require=createRequire(import.meta.url);
const {ledgerFixture}=require('../../../tests/nhom-hoc-ledger.test.cjs');
const config=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url)));
function seed(h) {
  return Object.fromEntries(Object.entries(NH_SCHEMA).map(([name,columns])=>[name,(h.sheets.get(name)?.values.slice(1)||[]).filter(r=>r[0]).map((row,i)=>({_row:i+2,...Object.fromEntries(columns.map((c,j)=>[c,row[j]??'']))}))]));
}
function insertSQL(name) {
  const cols=NH_SCHEMA[name];
  return `INSERT INTO ${name}(${cols.join(',')}) SELECT ${cols.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?)`;
}
test('ported engine preserves 8-session tuition, exemptions, installment history, closed-period guards and validation',()=>{
  const h=ledgerFixture();
  for(const groupId of ['g24','g35']) {
    const got=runAction(seed(h),{role:'admin',sub:'u1'},'nh_view',{groupId,month:'2026-09'},'2026-10-11',[{id:'u1',status:'active'}]).result;
    assert.deepEqual(JSON.parse(JSON.stringify(got)),JSON.parse(JSON.stringify(h.api('nh_view',{groupId,month:'2026-09'}))));
  }
  const tables=seed(h),principal={role:'admin',sub:'u1'},teachers=[{id:'u1',status:'active'}];
  const run=(action,data={},today='2026-10-20')=>runAction(tables,principal,action,data,today,teachers,'2026-10-20T02:00:00Z').result;
  const preview=run('nh_schedule_preview',{groupId:'g35',month:'2026-09'},'2026-10-11');
  assert.deepEqual(preview.dates,['2026-10-13','2026-10-15','2026-10-20']);
  run('nh_sessions_plan',{groupId:'g35',month:'2026-09',revision:preview.revision,sessions:preview.dates.map((date,i)=>({id:'p'+i,date}))},'2026-10-11');
  let view=run('nh_view',{groupId:'g35',month:'2026-09'});
  assert.throws(()=>run('nh_close_month',{groupId:'g35',month:'2026-09',revision:view.revision}),/5\/8/);
  const marks=view.sessions.map((s,i)=>({sessionId:s.ma_buoi,revision:s.revision,marks:[{studentId:'s1',status:i<6?'co_mat':'vang'},{studentId:'s2',status:'co_mat'}]}));
  const original=JSON.stringify(tables);
  const bad=structuredClone(marks);bad[1].marks[0].studentId='outsider';
  assert.throws(()=>run('nh_attendance_batch_save',{groupId:'g35',sessions:bad}),/không thuộc/);
  assert.equal(JSON.stringify(tables),original);
  run('nh_attendance_batch_save',{groupId:'g35',sessions:marks});
  view=run('nh_view',{groupId:'g35',month:'2026-09'});
  assert.equal(view.fees.find(f=>f.studentId==='s1').due,375000);
  assert.equal(view.fees.find(f=>f.studentId==='s2').due,0);
  run('nh_receipt_save',{groupId:'g35',id:'r1',studentId:'s1',month:'2026-09',date:'2026-10-20',amount:200000,method:'tien_mat'});
  run('nh_receipt_save',{groupId:'g35',id:'r1',studentId:'s1',month:'2026-09',date:'2026-10-20',amount:200000,method:'tien_mat'});
  assert.equal(tables.ThuHocPhi.length,1);
  view=run('nh_view',{groupId:'g35',month:'2026-09'});
  run('nh_close_month',{groupId:'g35',month:'2026-09',revision:view.revision});
  view=run('nh_view',{groupId:'g35',month:'2026-09'});
  assert.equal(view.closed,true);
  assert.throws(()=>run('nh_attendance_batch_save',{groupId:'g35',sessions:marks}),/đã chốt/);
  run('nh_reopen_month',{groupId:'g35',month:'2026-09',revision:view.revision});
  run('nh_receipt_void',{groupId:'g35',id:'r1',reason:'Nhập nhầm'});
  assert.equal(run('nh_view',{groupId:'g35',month:'2026-09'}).fees.find(f=>f.studentId==='s1').paid,0);
});
test('real Worker + D1 + R2: admin verification, transactions, concurrent writes, private streamed files, quotas and logout',async t=>{
  let authCalls=0;
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:new URL('../dist/index.js',import.meta.url).pathname,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:{...config.vars,FILE_TOTAL_BYTES:'20'},d1Databases:['DB'],r2Buckets:['FILES'],ratelimits:{AUTH_LIMITER:{namespace_id:'1001',simple:{limit:100,period:60}}},outboundService:async request=>{
    authCalls++;
    const p=await request.json();
    assert.equal(p.action,'nh_auth');
    return Response.json(p.adminToken==='signed.valid-admin' ? {status:'success',data:{role:'admin',sub:'u1',exp:Math.floor(Date.now()/1000)+3600}}:{status:'error'});
  }}));
  t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');
  const migration=fs.readFileSync(new URL('../migrations/0001_groups.sql',import.meta.url),'utf8');
  await db.exec(migration.replaceAll('\n',' '));await db.exec(fs.readFileSync(new URL('../migrations/0002_drive_backup.sql',import.meta.url),'utf8').replaceAll('\n',' '));await db.exec(fs.readFileSync(new URL('../migrations/0003_room_rent.sql',import.meta.url),'utf8').replaceAll('\n',' '));
  const h=ledgerFixture(),tables=seed(h);
  await db.batch(Object.entries(tables).filter(([,rows])=>rows.length).map(([name,rows])=>db.prepare(insertSQL(name)).bind(JSON.stringify(rows))));
  await db.prepare("INSERT INTO nh_teachers(id,name,status) VALUES('u1','Giáo viên','active')").run();
  const origin=config.vars.APP_ORIGIN,token='signed.valid-admin';
  const request=async(action,data={},adminToken=token,otherOrigin=origin)=>{
    const response=await mf.dispatchFetch('https://egv.example/api',{method:'POST',headers:{'Content-Type':'text/plain',Origin:otherOrigin},body:JSON.stringify({action,data,adminToken})});
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  const noToken=await mf.dispatchFetch('https://egv.example/api',{method:'POST',body:JSON.stringify({action:'nh_boot'})});
  assert.equal(noToken.status,401);
  const forged=await request('nh_boot',{},'eyJyb2xlIjoiYWRtaW4ifQ.fake');assert.equal(forged.status,401);
  assert.equal((await request('nh_boot',{},token,'https://evil.example')).status,403);
  const boot=await request('nh_boot');assert.equal(boot.status,200);assert.equal(boot.body.data.groups.length,2);assert.equal(boot.body.data.features.files,true);
  const calls=authCalls;
  await request('nh_view',{groupId:'g35',month:'2026-09'});
  assert.equal(authCalls,calls,'subsequent requests authenticate through indexed D1 token hash');
  const sessions=await db.prepare('SELECT * FROM nh_sessions').all();assert.equal(sessions.results.length,1);assert.equal(sessions.results[0].token_hash,crypto.createHash('sha256').update(token).digest('hex'));assert(!JSON.stringify(sessions.results).includes(token));
  const v=(await request('nh_view',{groupId:'g35',month:'2026-09'})).body.data,session=v.sessions[0];
  const race=await Promise.all(['co_mat','vang'].map(status=>request('nh_attendance_save',{groupId:'g35',sessionId:session.ma_buoi,revision:session.revision,marks:[{studentId:'s1',status}]})));
  assert.equal(race.filter(r=>r.status===200).length,1);assert(race.some(r=>[400,409].includes(r.status)));
  assert.equal((await db.prepare('SELECT * FROM DiemDanh WHERE ma_hoc_sinh=? AND ma_buoi=?').bind('s1',session.ma_buoi).all()).results.length,1);
  assert.equal((await db.prepare('SELECT * FROM nh_audit').all()).results.length,1,'losing CAS transaction makes no writes or audit entries');
  const receipt={groupId:'g35',id:'one-receipt',studentId:'s1',month:'2026-09',date:'2026-10-01',amount:100000,method:'tien_mat'};
  assert.equal((await request('nh_receipt_save',receipt)).status,200);assert.equal((await request('nh_receipt_save',receipt)).status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ThuHocPhi').first()).n,1);
  const upload=async(name,body,size=body.length,mime='text/plain')=>mf.dispatchFetch('https://egv.example/files/upload?groupId=g35',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':mime,'X-File-Name':encodeURIComponent(name),'X-File-Size':String(size)},body});
  const uploaded=await upload('Điểm danh.txt','hello');assert.equal(uploaded.status,200);const file=(await uploaded.json()).data;
  assert.equal((await request('nh_files_list',{groupId:'g35'})).body.data.files.length,1);
  const download=await mf.dispatchFetch('https://egv.example/api',{method:'POST',headers:{Origin:origin},body:JSON.stringify({action:'nh_file_download',data:{id:file.id},adminToken:token})});
  assert.equal(await download.text(),'hello');assert.match(download.headers.get('Content-Disposition'),/^attachment;/);assert.match(download.headers.get('Cache-Control'),/no-store/);
  assert.equal((await upload('overflow.txt','12345678901234567890')).status,413);
  assert.equal((await upload('unsafe.html','bad',3,'text/html')).status,400);
  assert.equal((await upload('mismatch.txt','abcd',2)).status,400);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM nh_files').first()).n,1,'failed stream rolls back file reservation');
  assert.equal((await request('nh_file_delete',{id:file.id})).status,200);
  assert.equal((await (await mf.getR2Bucket('FILES')).list()).objects.length,0);
  await db.prepare('UPDATE nh_sessions SET expires_at=0').run();
  assert.equal((await request('nh_boot',{},'member.signed')).status,401);
  assert.equal(boot.headers.get('Access-Control-Allow-Origin'),origin);
});
