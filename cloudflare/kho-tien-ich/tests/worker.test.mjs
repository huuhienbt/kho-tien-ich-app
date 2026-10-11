import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const cfg=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url)));
test('D1 permissions, VIP revocation, favorites isolation, CRUD, signed backup failure/retry and CORS',async t=>{
 let authCalls=0,vip=true,backupFailure=true,received=[];
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:new URL('../dist/index.js',import.meta.url).pathname,compatibilityDate:cfg.compatibility_date,compatibilityFlags:cfg.compatibility_flags,d1Databases:['DB'],bindings:{APP_ORIGIN:cfg.vars.APP_ORIGIN,GAS_URL:'https://gas.test/exec',SHEETS_KEY_ID:'test',SHEETS_SIGNING_KEY:privateKey.export({type:'pkcs8',format:'der'}).toString('base64')},outboundService:async req=>{
  const p=await req.json();
  if(p.action==='collections_auth'){
   authCalls++;const token=p.adminToken||p.userToken;
   if(!['admin.sig','member.sig','vip.sig','other.sig'].includes(token))return Response.json({status:'error'});
   const role=token==='admin.sig'?'admin':'member',sub=token==='other.sig'?'other':token==='vip.sig'?'vip':'u1';
   return Response.json({status:'success',data:{role,sub,membership:role==='admin'?'admin':token==='vip.sig'&&vip?'vip':'regular',exp:Math.floor(Date.now()/1000)+3600}});
  }
  if(p.action==='admin_set_membership'){vip=false;return Response.json({status:'success',user:{id:'vip',membership:'regular'}});}
  if(p.action==='collections_bridge'){
   assert.equal(crypto.verify('sha256',Buffer.from(p.message),publicKey,Buffer.from(p.signature,'base64url')),true);
   const data=JSON.parse(p.message);received.push(data);if(backupFailure)return Response.json({status:'error'});
   return Response.json({status:'success',data:{revision:data.revision,checksum:crypto.createHash('sha256').update(JSON.stringify(data.tables)).digest('hex')}});
  }
  throw Error('Unexpected upstream');
 }}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');await db.exec(fs.readFileSync(new URL('../migrations/0001_collections.sql',import.meta.url),'utf8').replace(/\n/g,' '));
 async function settle(){for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,20));if((await db.prepare('SELECT lease_until FROM collection_meta').first()).lease_until===0)return;}throw Error('Background backup did not settle');}
 for(const [position,p] of [{id:'p1',title:'Normal',category:'teaching',content:'PUBLIC',platform:'ChatGPT',access:'normal',created_at:'2026-10-11'},{id:'p2',title:'VIP',category:'teaching',content:'VIP-PRIVATE',platform:'NotebookLM',access:' VIP ',created_at:'2026-10-11'}].entries())await db.prepare('INSERT INTO prompts(id,record,position) VALUES(?,?,?)').bind(p.id,JSON.stringify(p),position).run();
 const repair={id:'r1',date:'2026-10-11',task:'Task',location:'ROOM-PRIVATE',cost:450000,warranty:'12',status:'Cần theo dõi',vendor:'VENDOR-PRIVATE',reporter:'NAME-PRIVATE',asset_id:'A1',image_url:'SECRET-URL',note:'NOTE-PRIVATE'};
 await db.prepare('INSERT INTO repairs(id,record,position) VALUES(?,?,0)').bind('r1',JSON.stringify(repair)).run();await db.prepare('UPDATE collection_meta SET initialized=1,revision=1,backup_revision=1 WHERE id=1').run();
 async function call(action,token='member.sig',data={},sheetType){const r=await mf.dispatchFetch('https://worker.test/api',{method:'POST',headers:{Origin:cfg.vars.APP_ORIGIN,'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...(token==='admin.sig'?{adminToken:token}:{userToken:token}),data,sheetType})});return {http:r.status,data:await r.json()};}
 const guestPrompts=await (await mf.dispatchFetch('https://worker.test/api?type=prompts')).json();assert.equal(guestPrompts.data.find(i=>i.id==='p2').content,'');assert.equal(JSON.stringify(guestPrompts).includes('VIP-PRIVATE'),false);
 const guestRepair=await (await mf.dispatchFetch('https://worker.test/api?type=repairs')).json();assert.deepEqual(guestRepair.data,[]);assert.equal(guestRepair.summary.cost,undefined);assert.equal(JSON.stringify(guestRepair).includes('PRIVATE'),false);
 assert.equal((await call('get_prompts','forged.sig')).http,401);
 let member=await call('get_repairs');assert.deepEqual(member.data.data,[{id:'r1',task:'Task',status:'Cần theo dõi'}]);assert.equal(member.data.summary.cost,undefined);assert.equal(JSON.stringify(member).includes('PRIVATE'),false);
 assert.equal((await call('update','member.sig',{id:'r1',task:'forged'},'repairs')).http,403);
 const admin=await call('get_repairs','admin.sig');assert.equal(admin.data.data[0].note,'NOTE-PRIVATE');assert.equal(admin.data.summary.cost,450000);
 assert.equal((await call('get_prompts','vip.sig')).data.data.find(i=>i.id==='p2').content,'VIP-PRIVATE');
 const callsBefore=authCalls;await call('get_prompts','vip.sig');assert.equal(authCalls,callsBefore);
 await call('admin_set_membership','admin.sig',{userId:'vip',membership:'regular'});assert.equal((await call('get_prompts','vip.sig')).data.data.find(i=>i.id==='p2').content,'');
 let added=await call('toggle_favorite','member.sig',{promptId:'p1',favorite:true});assert.deepEqual(added.data.favorites,['p1']);assert.deepEqual((await call('get_prompts','other.sig')).data.favorites,[]);
 await call('sync_favorites','member.sig',{promptIds:['p1','p2','missing','p1']});assert.deepEqual((await call('get_prompts')).data.favorites,['p1','p2']);
 await settle();await call('collections_backup_now','admin.sig');await settle();let state=await db.prepare('SELECT revision,backup_revision,backup_error FROM collection_meta').first();assert(state.revision>state.backup_revision);assert.equal(state.backup_error,'SHEETS_PENDING');assert(received.length);
 backupFailure=false;await call('collections_backup_now','admin.sig');await settle();state=await db.prepare('SELECT revision,backup_revision,backup_error FROM collection_meta').first();assert.equal(state.revision,state.backup_revision);assert.equal(state.backup_error,'');
 const updated=await call('update','admin.sig',{...repair,task:'Updated'},'repairs');assert.equal(updated.http,200);assert.equal((await call('get_repairs','admin.sig')).data.data[0].task,'Updated');
 const created=await call('create','admin.sig',{title:'New',content:'Text',platform:'ChatGPT'},'prompts');assert.equal(created.http,200);assert.match(created.data.id,/^PR-/);
 assert.equal((await call('create','admin.sig',{title:'Bad',content:'x'},'evil')).http,400);
 await call('delete','admin.sig',{id:'p1'},'prompts');assert.deepEqual((await call('get_prompts')).data.favorites,['p2']);
 const forbidden=await mf.dispatchFetch('https://worker.test/api?type=repairs',{headers:{Origin:'https://evil.test'}});assert.equal(forbidden.status,403);assert.equal(forbidden.headers.get('Access-Control-Allow-Origin'),null);
 await settle();
});
