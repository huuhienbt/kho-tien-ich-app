import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('native admin token opens the group ledger without Google; forged, expired, wrong-role and wrong-audience tokens fail closed',async t=>{
 const cfg=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url)));
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 let googleCalls=0;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:new URL('../dist/index.js',import.meta.url).pathname,compatibilityDate:cfg.compatibility_date,compatibilityFlags:cfg.compatibility_flags,d1Databases:['DB'],bindings:{...cfg.vars,ADMIN_AUTH_PUBLIC_KEY:JSON.stringify(publicKey.export({format:'jwk'})),ADMIN_AUTH_KEY_ID:'test-native-key'},outboundService:async()=>{googleCalls++;throw Error('Google unavailable');}}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');await db.exec(fs.readFileSync(new URL('../migrations/0001_groups.sql',import.meta.url),'utf8').replace(/\n/g,' '));await db.exec(fs.readFileSync(new URL('../migrations/0002_drive_backup.sql',import.meta.url),'utf8').replaceAll('\n',' '));await db.exec(fs.readFileSync(new URL('../migrations/0003_room_rent.sql',import.meta.url),'utf8').replaceAll('\n',' '));
 const now=Math.floor(Date.now()/1000),claims={sub:'admin',role:'admin',iss:'egv-cloudflare-admin',aud:cfg.vars.APP_ORIGIN,kid:'test-native-key',iat:now,exp:now+3600,nonce:crypto.randomUUID()};
 const sign=p=>{const body=Buffer.from(JSON.stringify(p)).toString('base64url');return body+'.'+crypto.sign('sha256',Buffer.from(body),privateKey).toString('base64url');};
 async function call(token){return mf.dispatchFetch('https://groups.test/api',{method:'POST',headers:{Origin:cfg.vars.APP_ORIGIN,'Content-Type':'text/plain'},body:JSON.stringify({action:'nh_boot',adminToken:token,data:{period:'2026-10'}})});}
 const result=await call(sign(claims));assert.equal(result.status,200);assert.equal((await result.json()).status,'success');
 for(const change of [{role:'member'},{aud:'https://evil.test'},{kid:'evil'},{exp:now-1}])assert.equal((await call(sign({...claims,...change}))).status,401);
 const token=sign(claims),signature=Buffer.from(token.split('.')[1],'base64url');signature[0]^=1;assert.equal((await call(token.split('.')[0]+'.'+signature.toString('base64url'))).status,401);assert.equal(googleCalls,0);
});
