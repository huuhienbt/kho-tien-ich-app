import {createHash} from 'node:crypto';
import {boundedText,HttpError} from './util.js';
import {verifyNativeAdmin} from '../../shared/admin-token.js';
export type Principal = {role:'admin',sub:string,exp:number};
export async function authenticate(request:Request,env:Env,token:unknown):Promise<Principal> {
  const native=await verifyNativeAdmin(token,env);
  if(native!==undefined){if(!native)throw new HttpError(401,'Phiên đăng nhập quản trị không hợp lệ hoặc đã hết hạn.');return native;}
  if(typeof token!=='string'||token.length>4096||!token.includes('.')) throw new HttpError(401,'Vui lòng đăng nhập quản trị.');
  const hash=createHash('sha256').update(token).digest('hex'), now=Math.floor(Date.now()/1000);
  const cached=await env.DB.prepare('SELECT sub,expires_at FROM nh_sessions WHERE token_hash=? AND expires_at>?').bind(hash,now).first<{sub:string,expires_at:number}>();
  if(cached) return {role:'admin',sub:cached.sub,exp:cached.expires_at};
  if(env.AUTH_LIMITER && !(await env.AUTH_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success) throw new HttpError(429,'Đã kiểm tra đăng nhập nhiều lần. Vui lòng thử lại sau một phút.');
  // Legacy admin HMAC is verified by the existing trusted Apps Script. Never trust a decoded client role.
  let result:{status?:string,data?:{role?:string,sub?:string,exp?:number}};
  try {
    const response=await fetch(env.GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'nh_auth',adminToken:token}),signal:AbortSignal.timeout(45000)});
    if(!response.ok) throw new Error('Auth upstream HTTP');
    result=JSON.parse(await boundedText(response.body,32768));
  } catch {
    throw new HttpError(503,'Chưa xác thực được đăng nhập quản trị. Vui lòng thử lại.');
  }
  const proof=result.data;
  if(result.status!=='success'||proof?.role!=='admin'||typeof proof.sub!=='string'||!Number.isSafeInteger(proof.exp)||Number(proof.exp)<=now) throw new HttpError(401,'Phiên đăng nhập quản trị không hợp lệ hoặc đã hết hạn.');
  const exp=Math.min(Number(proof.exp),now+8*3600);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM nh_sessions WHERE expires_at<=?').bind(now),
    env.DB.prepare('INSERT INTO nh_sessions(token_hash,sub,expires_at) VALUES(?,?,?) ON CONFLICT(token_hash) DO UPDATE SET sub=excluded.sub,expires_at=excluded.expires_at').bind(hash,proof.sub,exp)
  ]);
  return {role:'admin',sub:proof.sub,exp};
}
