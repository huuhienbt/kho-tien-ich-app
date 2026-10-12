import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
test('Apps Script accepts only signed native admin tokens; legacy admin/member tokens remain valid',()=>{
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const backend=fs.readFileSync(new URL('../Code.gs',import.meta.url),'utf8');
 const source=fs.readFileSync(new URL('../Collections.gs',import.meta.url),'utf8').replace(/const EGV_NATIVE_ADMIN_PUBLIC_KEY = [^;]+;/,'const EGV_NATIVE_ADMIN_PUBLIC_KEY = '+JSON.stringify(publicKey.export({format:'jwk'}))+';');
 const keyId=source.match(/EGV_NATIVE_ADMIN_KEY_ID = "([^"]+)"/)[1];let secretReads=0;
 const props=new Map([['TOKEN_SECRET','fixture-legacy-secret']]);
 const ctx=vm.createContext({console,Date,BigInt,PropertiesService:{getScriptProperties:()=>({getProperty:key=>{secretReads++;return props.get(key)||null;},setProperty:(key,value)=>props.set(key,value)})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},base64DecodeWebSafe:s=>[...Buffer.from(s,'base64url')],base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),newBlob:b=>({getDataAsString:()=>Buffer.from(b).toString('utf8'),getBytes:()=>[...Buffer.from(b)]}),computeDigest:(_a,s)=>[...crypto.createHash('sha256').update(s).digest()],computeHmacSha256Signature:(s,key)=>[...crypto.createHmac('sha256',key).update(s).digest()],getUuid:()=>crypto.randomUUID()}});
 vm.runInContext(backend+'\n'+source,ctx);
 const now=Math.floor(Date.now()/1000),claims={sub:'admin',role:'admin',iss:'egv-cloudflare-admin',aud:'https://e-gv.vercel.app',kid:keyId,iat:now,exp:now+3600,nonce:crypto.randomUUID()};
 const sign=p=>{const body=Buffer.from(JSON.stringify(p)).toString('base64url');return body+'.'+crypto.sign('sha256',Buffer.from(body),privateKey).toString('base64url');};
 const token=sign(claims);assert.equal(ctx.verifyToken(token,'admin').role,'admin');assert.equal(ctx.verifyToken(token,'member'),null);assert.equal(secretReads,0);
 for(const change of [{role:'member'},{sub:'other'},{aud:'https://evil.test'},{kid:'evil'},{exp:now-1},{iat:now+100},{exp:now+9*3600}])assert.equal(ctx.verifyToken(sign({...claims,...change}),'admin'),null);
 const badSignature=Buffer.from(token.split('.')[1],'base64url');badSignature[0]^=1;
 const bad=token.split('.')[0]+'.'+badSignature.toString('base64url');assert.equal(ctx.verifyToken(bad,'admin'),null);assert.equal(secretReads,0);
 for(const role of ['admin','member']){const old=ctx.issueToken({role,sub:role==='admin'?'admin':'u1'},3600);assert.equal(ctx.verifyToken(old,role).role,role);assert.equal(ctx.verifyToken(old,role==='admin'?'member':'admin'),null);}
 vm.runInContext('createResponse=value=>value;',ctx);
 assert.equal(ctx.egvCollectionsBridge_({action:'admin_auth_complete',adminToken:bad}).status,'error');assert.equal(props.has('EGV_NATIVE_ADMIN_AUTH_ACTIVE'),false);
 assert.equal(ctx.egvCollectionsBridge_({action:'admin_auth_complete',adminToken:token}).status,'success');assert.equal(props.get('EGV_NATIVE_ADMIN_AUTH_ACTIVE'),'1');
 assert.equal(ctx.egvCollectionsBridge_({action:'verify',data:{adminPassword:'old'}}).code,'ADMIN_AUTH_MIGRATED');
});
