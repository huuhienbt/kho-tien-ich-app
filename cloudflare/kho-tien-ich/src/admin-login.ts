import {base64url,decode64} from '../../shared/admin-token.js';
import {gas} from './auth.js';
import {HttpError} from './util.js';
const ITERATIONS=100000;
type Credential={password_hash:string;salt:string;iterations:number;key_id:string;legacy_login_disabled:number};
async function passwordHash(password:string,salt:string,env:Env):Promise<Uint8Array> {
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const stretched=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:decode64(salt),iterations:ITERATIONS},key,256);
 const pepper=await crypto.subtle.importKey('raw',decode64(env.ADMIN_PASSWORD_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',pepper,stretched));
}
async function nativeToken(env:Env):Promise<string> {
 const now=Math.floor(Date.now()/1000);
 const claims={sub:'admin',role:'admin',name:'Thầy Hiển',iss:'egv-cloudflare-admin',aud:env.APP_ORIGIN,kid:env.ADMIN_AUTH_KEY_ID,iat:now,exp:now+8*3600,nonce:crypto.randomUUID()};
 const body=base64url(new TextEncoder().encode(JSON.stringify(claims)));
 const key=await crypto.subtle.importKey('pkcs8',decode64(env.ADMIN_AUTH_SIGNING_KEY),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 return body+'.'+base64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(body))));
}
export async function adminLogin(request:Request,env:Env,ctx:ExecutionContext,password:unknown,clientId:unknown):Promise<Record<string,unknown>> {
 if(!env.ADMIN_AUTH_SIGNING_KEY||!env.ADMIN_PASSWORD_PEPPER||!env.ADMIN_AUTH_KEY_ID)throw new HttpError(503,'Chưa cấu hình đăng nhập quản trị. Vui lòng thử lại.');
 if(typeof password!=='string'||!password||password.length>256)throw new HttpError(400,'Vui lòng nhập mật khẩu quản trị.');
 if(env.ADMIN_LOGIN_LIMITER&&!(await env.ADMIN_LOGIN_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)throw new HttpError(429,'Vui lòng thử lại sau một phút.');
 const bucket=Math.floor(Date.now()/60000);
 const attempts=await env.DB.batch([
  env.DB.prepare('DELETE FROM admin_login_attempts WHERE bucket<?').bind(bucket-10),
  env.DB.prepare('INSERT INTO admin_login_attempts(bucket,attempts) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket)
 ]);
 if(Number((attempts[1].results[0] as {attempts:number}).attempts)>20)throw new HttpError(429,'Vui lòng thử lại sau một phút.');
 let stored=await env.DB.prepare('SELECT password_hash,salt,iterations,key_id,legacy_login_disabled FROM admin_credentials WHERE id=1').first<Credential>();
 if(stored&&stored.key_id!==env.ADMIN_AUTH_KEY_ID)throw new HttpError(503,'Cấu hình đăng nhập vừa thay đổi. Vui lòng liên hệ quản trị.');
 let migrated=false;
 let computed:{salt:string;digest:Uint8Array}|undefined;
 if(!stored) {
  // The existing Google endpoint verifies the password once. Never read/export its secrets.
  const proof=await gas(env,{action:'verify',data:{adminPassword:password},clientId:typeof clientId==='string'?clientId.slice(0,120):''});
  if(proof.status!=='success'||typeof proof.adminToken!=='string')throw new HttpError(401,'Sai mật khẩu quản trị.');
  let claims;try{claims=JSON.parse(new TextDecoder().decode(decode64(proof.adminToken.split('.')[0])));}catch{throw new HttpError(503,'Google chưa xác nhận phiên quản trị.');}
  if(claims.role!=='admin'||claims.sub!=='admin'||!Number.isSafeInteger(claims.exp)||claims.exp<=Math.floor(Date.now()/1000))throw new HttpError(503,'Google chưa xác nhận phiên quản trị.');
  const salt=base64url(crypto.getRandomValues(new Uint8Array(16)));computed={salt,digest:await passwordHash(password,salt,env)};
  const digest=base64url(computed.digest);
  await env.DB.prepare('INSERT INTO admin_credentials(id,password_hash,salt,iterations,key_id,created_at) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(digest,salt,ITERATIONS,env.ADMIN_AUTH_KEY_ID,new Date().toISOString()).run();
  stored=await env.DB.prepare('SELECT password_hash,salt,iterations,key_id,legacy_login_disabled FROM admin_credentials WHERE id=1').first<Credential>();
  migrated=true;
 }
 if(!stored||stored.key_id!==env.ADMIN_AUTH_KEY_ID||stored.iterations!==ITERATIONS)throw new HttpError(503,'Chưa hoàn tất chuyển đổi đăng nhập. Vui lòng thử lại.');
 const actual=computed?.salt===stored.salt?computed.digest:await passwordHash(password,stored.salt,env),expected=decode64(stored.password_hash);
 if(expected.length!==actual.length||!crypto.subtle.timingSafeEqual(actual,expected))throw new HttpError(401,'Sai mật khẩu quản trị.');
 const token=await nativeToken(env);
 if(!stored.legacy_login_disabled)ctx.waitUntil((async()=>{
  const result=await gas(env,{action:'admin_auth_complete',adminToken:token});
  if(result.status!=='success')throw Error('LEGACY_AUTH_NOTICE');
  await env.DB.prepare('UPDATE admin_credentials SET legacy_login_disabled=1 WHERE id=1 AND key_id=?').bind(env.ADMIN_AUTH_KEY_ID).run();
 })().catch(()=>{console.warn(JSON.stringify({event:'native_admin_notice_pending'}));}));
 return {status:'success',adminToken:token,authBackend:'cloudflare',migrated,message:'Đăng nhập thành công.'};
}
