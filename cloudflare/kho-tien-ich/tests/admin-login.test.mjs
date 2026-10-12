import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const config=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url)));
test('one-time migration preserves the password; subsequent admin login and D1 access work while Google is unavailable',async t=>{
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const pub=publicKey.export({format:'jwk'}),password='test-only-Strong-Pass#731',kid='fixture-admin-key';
 let googleCalls=0,googleAvailable=true;
 const bindings={APP_ORIGIN:config.vars.APP_ORIGIN,GAS_URL:'https://gas.test/exec',ADMIN_AUTH_PUBLIC_KEY:JSON.stringify(pub),ADMIN_AUTH_KEY_ID:kid,ADMIN_AUTH_SIGNING_KEY:privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),ADMIN_PASSWORD_PEPPER:crypto.randomBytes(32).toString('base64')};
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:new URL('../dist/index.js',import.meta.url).pathname,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,d1Databases:['DB'],bindings,outboundService:async req=>{
  googleCalls++;if(!googleAvailable)throw Error('Google offline');
  const p=await req.json();if(p.action==='admin_auth_complete')return Response.json({status:'success'});assert.equal(p.action,'verify');
  if(p.data.adminPassword!==password)return Response.json({status:'error'});
  const claims={role:'admin',sub:'admin',exp:Math.floor(Date.now()/1000)+3600};
  return Response.json({status:'success',adminToken:Buffer.from(JSON.stringify(claims)).toString('base64url')+'.legacy-google-signature'});
 }}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 for(const path of ['0001_collections.sql','0002_native_admin.sql'])await db.exec(fs.readFileSync(new URL('../migrations/'+path,import.meta.url),'utf8').replace(/\n/g,' '));
 await db.prepare('UPDATE collection_meta SET initialized=1,revision=1,backup_revision=1').run();
 const repair={id:'r1',date:'2026-10-12',task:'Repair',location:'PRIVATE',cost:100000,warranty:'',status:'',vendor:'',reporter:'',asset_id:'',image_url:'',note:'PRIVATE-NOTE'};
 await db.prepare('INSERT INTO repairs(id,record,position) VALUES(?,?,0)').bind('r1',JSON.stringify(repair)).run();
 async function call(action,data={},adminToken){const r=await mf.dispatchFetch('https://worker.test/api',{method:'POST',headers:{Origin:bindings.APP_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({action,data,adminToken,clientId:'test-browser'})});return {http:r.status,result:await r.json()};}
 const rejected=await call('verify',{adminPassword:'wrong'});assert.equal(rejected.http,401);assert.equal((await db.prepare('SELECT count(*) AS n FROM admin_credentials').first()).n,0);
 const first=await call('verify',{adminPassword:password});assert.equal(first.http,200);assert.equal(first.result.migrated,true);
 for(let i=0;i<100;i++){if((await db.prepare('SELECT legacy_login_disabled FROM admin_credentials').first())?.legacy_login_disabled)break;await new Promise(resolve=>setTimeout(resolve,20));}
 assert.equal((await db.prepare('SELECT legacy_login_disabled FROM admin_credentials').first()).legacy_login_disabled,1);
 const credential=await db.prepare('SELECT * FROM admin_credentials').first();assert.equal(credential.iterations,100000);assert(!JSON.stringify(credential).includes(password));assert(!JSON.stringify(credential).includes(bindings.ADMIN_PASSWORD_PEPPER));
 let token=first.result.adminToken;const [body,signature]=token.split('.');assert(crypto.verify('sha256',Buffer.from(body),publicKey,Buffer.from(signature,'base64url')));
 googleAvailable=false;const prior=googleCalls;
 const second=await call('verify',{adminPassword:password});assert.equal(second.http,200);assert.equal(second.result.migrated,false);assert.equal(googleCalls,prior);token=second.result.adminToken;
 assert.equal((await call('verify',{adminPassword:'wrong'})).http,401);assert.equal(googleCalls,prior);
 const full=await call('get_repairs',{},token);assert.equal(full.http,200);assert.equal(full.result.data[0].note,'PRIVATE-NOTE');assert.equal(googleCalls,prior);
 const claims=JSON.parse(Buffer.from(token.split('.')[0],'base64url'));
 const sign=p=>{const body=Buffer.from(JSON.stringify(p)).toString('base64url');return body+'.'+crypto.sign('sha256',Buffer.from(body),privateKey).toString('base64url');};
 for(const change of [{role:'member'},{aud:'https://evil.test'},{kid:'other-key'},{exp:Math.floor(Date.now()/1000)-1},{iat:Math.floor(Date.now()/1000)+100},{exp:claims.iat+9*3600}])assert.equal((await call('get_repairs',{},sign({...claims,...change}))).http,401);
 const badSignature=Buffer.from(token.split('.')[1],'base64url');badSignature[0]^=1;
 assert.equal((await call('get_repairs',{},token.split('.')[0]+'.'+badSignature.toString('base64url'))).http,401);assert.equal(googleCalls,prior);
 await db.prepare('UPDATE admin_login_attempts SET attempts=20').run();assert.equal((await call('verify',{adminPassword:password})).http,429);
});
