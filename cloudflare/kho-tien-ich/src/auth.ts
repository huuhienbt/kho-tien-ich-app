import {boundedText,hash,HttpError,type Principal} from './util.js';
type Payload={adminToken?:unknown,userToken?:unknown};
export async function gas(env:Env,payload:unknown):Promise<Record<string,unknown>>{
  try{const r=await fetch(env.GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error();return JSON.parse(await boundedText(r.body,1048576));}
  catch{throw new HttpError(503,'Google chưa phản hồi. Vui lòng thử lại.');}
}
export async function authenticate(request:Request,env:Env,payload:Payload):Promise<Principal>{
  const token=payload.adminToken||payload.userToken;
  if(typeof token!=='string'||token.length>4096||token.split('.').length!==2)throw new HttpError(401,'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  const key=await hash(token),now=Math.floor(Date.now()/1000);
  const cached=await env.DB.prepare('SELECT s.sub,s.role,s.membership,s.expires_at FROM collection_sessions s LEFT JOIN user_epochs u ON s.sub=u.sub WHERE s.token_hash=? AND s.expires_at>? AND s.epoch=COALESCE(u.epoch,0)').bind(key,now).first<{sub:string,role:Principal['role'],membership:Principal['membership'],expires_at:number}>();
  if(cached)return {sub:cached.sub,role:cached.role,membership:cached.membership,exp:cached.expires_at};
  if(env.AUTH_LIMITER&&!(await env.AUTH_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)throw new HttpError(429,'Vui lòng thử lại sau một phút.');
  // Record epochs before upstream verification: an in-flight VIP proof cannot undo revocation.
  const epochs=(await env.DB.prepare('SELECT sub,epoch FROM user_epochs').all<{sub:string,epoch:number}>()).results;
  const result=await gas(env,{action:'collections_auth',adminToken:payload.adminToken,userToken:payload.userToken});
  const p=result.data as Partial<Principal>|undefined;
  if(result.status!=='success'||!p||!['admin','member'].includes(String(p.role))||typeof p.sub!=='string'||!p.sub||!Number.isSafeInteger(p.exp)||Number(p.exp)<=now)throw new HttpError(401,'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  const principal:Principal={sub:p.sub,role:p.role as Principal['role'],membership:p.role==='admin'?'admin':p.membership==='vip'?'vip':'regular',exp:Math.min(Number(p.exp),now+(p.role==='admin'?8*3600:300))};
  const epoch=epochs.find(u=>u.sub===principal.sub)?.epoch||0;
  const saved=await env.DB.batch([
    env.DB.prepare('DELETE FROM collection_sessions WHERE expires_at<=?').bind(now),
    env.DB.prepare('INSERT INTO collection_sessions(token_hash,sub,role,membership,expires_at,epoch) SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT epoch FROM user_epochs WHERE sub=?),0)=? ON CONFLICT(token_hash) DO UPDATE SET sub=excluded.sub,role=excluded.role,membership=excluded.membership,expires_at=excluded.expires_at,epoch=excluded.epoch').bind(key,principal.sub,principal.role,principal.membership,principal.exp,epoch,principal.sub,epoch)
  ]);
  if(!saved[1].meta.changes)throw new HttpError(409,'Quyền tài khoản vừa thay đổi. Vui lòng tải lại.');
  return principal;
}
export async function invalidateUser(db:D1Database,sub:string):Promise<void>{await db.batch([db.prepare('INSERT INTO user_epochs(sub,epoch) VALUES(?,1) ON CONFLICT(sub) DO UPDATE SET epoch=epoch+1').bind(sub),db.prepare('DELETE FROM collection_sessions WHERE sub=?').bind(sub)]);}
