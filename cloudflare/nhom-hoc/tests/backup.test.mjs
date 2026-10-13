import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {NH_SCHEMA} from '../src/engine.js';
import {mirrorFixture} from '../../../tests/groups-backup-bridge.test.mjs';

test('Real D1 snapshot → private Service binding → signed GAS mirror: leases, retries, concurrent writes and verification',async t=>{
  const gas=mirrorFixture(),cfg=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url))),calls=[];
  let fail=false,badChecksum=false,block=false,release;
  const broker=await build({entryPoints:[new URL('../../kho-tien-ich/src/index.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'neutral',external:['cloudflare:workers']});
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[
    {name:'groups',modules:true,scriptPath:new URL('../dist/index.js',import.meta.url).pathname,compatibilityDate:cfg.compatibility_date,compatibilityFlags:cfg.compatibility_flags,d1Databases:['DB'],bindings:{...cfg.vars,ADMIN_AUTH_PUBLIC_KEY:JSON.stringify(gas.publicKey.export({format:'jwk'})),ADMIN_AUTH_KEY_ID:'test-key'},serviceBindings:{SHEETS_BRIDGE:{name:'sheets',entrypoint:'GroupsSheetsBridge'}},outboundService:()=>Response.json({status:'error'})},
    {name:'sheets',modules:true,script:broker.outputFiles[0].text,compatibilityDate:cfg.compatibility_date,compatibilityFlags:cfg.compatibility_flags,bindings:{GAS_URL:'https://gas.test/exec',SHEETS_KEY_ID:gas.keyId,SHEETS_SIGNING_KEY:gas.privateKey.export({format:'der',type:'pkcs8'}).toString('base64')},outboundService:async request=>{
      const envelope=await request.json();calls.push(JSON.parse(envelope.message));if(block)await new Promise(resolve=>release=resolve);
      if(fail)return Response.json({status:'error'},{status:503});
      const result=gas.run(envelope);if(badChecksum&&result.data)result.data.checksum='wrong-checksum';return Response.json(result);
    }}
  ]}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB','groups');
  for(const name of ['0001_groups.sql','0002_drive_backup.sql','0003_room_rent.sql'])await db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').replaceAll('\n',' '));
  const tables=gas.tables();await db.batch(Object.entries(tables).filter(([,rows])=>rows.length).map(([name,rows])=>{const columns=NH_SCHEMA[name];return db.prepare(`INSERT INTO ${name}(${columns.join(',')}) SELECT ${columns.map(column=>`json_extract(value,'$.${column}')`).join(',')} FROM json_each(?)`).bind(JSON.stringify(rows));}));
  await db.prepare('UPDATE nh_meta SET revision=38 WHERE id=1').run();
  const now=Math.floor(Date.now()/1000),claims={sub:'admin',role:'admin',iss:'egv-cloudflare-admin',aud:cfg.vars.APP_ORIGIN,kid:'test-key',iat:now,exp:now+3600,nonce:crypto.randomUUID()};
  const sign=data=>{const body=Buffer.from(JSON.stringify(data)).toString('base64url');return body+'.'+crypto.sign('sha256',Buffer.from(body),gas.privateKey).toString('base64url');},token=sign(claims);
  async function call(action,adminToken=token,data={}){const response=await mf.dispatchFetch('https://groups.test/api',{method:'POST',headers:{Origin:cfg.vars.APP_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({action,adminToken,data})});return {http:response.status,body:await response.json()};}
  async function settle(){for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,10));if(!(await db.prepare('SELECT lease_until FROM nh_backup').first()).lease_until)return;}throw Error('Background backup did not settle');}
  for(const unauthorized of ['',sign({...claims,role:'member'}),'forged.token'])assert.equal((await call('nh_backup_now',unauthorized)).http,401);
  assert.equal(calls.length,0);
  const publicBridge=await (await mf.getWorker('sheets')).fetch('https://collections.test/nh-backup',{method:'POST',body:JSON.stringify({op:'nh_backup'})});assert.equal(publicBridge.status,404);assert.equal(calls.length,0);
  assert.equal((await call('nh_backup_status')).body.data.state,'pending');
  block=true;assert.equal((await call('nh_backup_now')).body.data.state,'syncing');
  for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,10));assert(release);
  const count=calls.length;await call('nh_backup_now');assert.equal(calls.length,count,'concurrent requests share one lease');
  await db.batch([db.prepare("UPDATE HocSinh SET ho_ten='Updated while backing up' WHERE ma_hoc_sinh='s1'"),db.prepare('UPDATE nh_meta SET revision=39 WHERE id=1')]);
  block=false;release();await settle();let status=(await call('nh_backup_status')).body.data;assert.equal(status.backupRevision,38);assert.equal(status.revision,39);assert.equal(status.state,'pending');
  await call('nh_backup_now');await settle();status=(await call('nh_backup_status')).body.data;assert.equal(status.state,'synced');assert.equal(status.backupRevision,39);assert.equal(status.spreadsheetId,gas.sheetId);
  const lastAt=status.lastSuccessAt;await call('nh_backup_now');await settle();assert.equal((await call('nh_backup_status')).body.data.lastSuccessAt,lastAt,'verification does not pretend a new save happened');
  fail=true;await call('nh_backup_now');await settle();status=(await call('nh_backup_status')).body.data;assert.equal(status.state,'error');assert.equal(status.lastSuccessAt,lastAt);assert.equal(status.backupRevision,39);
  fail=false;await db.prepare('UPDATE nh_meta SET revision=40 WHERE id=1').run();badChecksum=true;await call('nh_backup_now');await settle();assert.equal((await call('nh_backup_status')).body.data.state,'error');assert.equal((await call('nh_backup_status')).body.data.backupRevision,39);
  badChecksum=false;await call('nh_backup_now');await settle();assert.equal((await call('nh_backup_status')).body.data.backupRevision,40);
  gas.sheets.get('HocSinh').values[1][1]='External Drive edit';await (await mf.getWorker('groups')).scheduled({cron:'*/10 * * * *'});await settle();assert.equal(gas.tables().HocSinh.find(row=>row.ma_hoc_sinh==='s1').ho_ten,'Updated while backing up');
  assert.equal((await call('nh_backup_status')).body.data.state,'synced');
  assert.equal((await db.prepare('SELECT revision FROM nh_meta').first()).revision,40,'backup never changes business records or revision');
  block=true;release=null;
  const receipt=await call('nh_receipt_save',token,{groupId:'g35',id:'automatic',studentId:'s1',month:'2026-09',date:'2026-10-11',amount:62500,method:'tien_mat'});
  assert.equal(receipt.http,200,'business write returns while Drive is still pending');
  for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,10));assert(release);
  assert.equal((await call('nh_backup_status')).body.data.state,'syncing');block=false;release();await settle();
  assert.equal((await call('nh_backup_status')).body.data.backupRevision,41);assert(gas.tables().ThuHocPhi.some(row=>row.ma_thu==='automatic'));
  // The additional rent ledger shares the signed, verified Drive mirror.
  const added=Array.from({length:6},(_,i)=>({ma_buoi:'rent-'+i,ma_nhom:'g35',ngay_hoc:'2026-09-'+(i===5?17:10+i),gio_bat_dau:'',gio_ket_thuc:'',trang_thai:'da_hoc',ghi_chu:''})),columns=NH_SCHEMA.BuoiHoc;
  await db.batch([db.prepare(`INSERT INTO BuoiHoc(${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?)`).bind(JSON.stringify(added)),db.prepare('UPDATE nh_meta SET revision=42 WHERE id=1')]);
  const rent=(await call('nh_boot')).body.data.roomRent;assert.equal(rent.unpaid,18);
  assert.equal((await call('nh_room_rent_save',token,{id:'room-paid',revision:rent.revision,date:rent.today,amount:1000000,note:'=literal room payment note'})).http,200);await settle();
  assert.equal((await call('nh_backup_status')).body.data.backupRevision,43);
  const mirror=gas.tables().TienThuePhong;assert.equal(mirror.length,1);assert.equal(mirror[0].ma_dong,'room-paid');assert.equal(mirror[0].so_buoi,16);assert.equal(mirror[0].so_tien_vnd,1000000);assert.equal(mirror[0].ghi_chu,'=literal room payment note');
});
