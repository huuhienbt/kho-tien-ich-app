export type NativeAdminPrincipal = {role:'admin';sub:'admin';exp:number};
type PublicConfig = {APP_ORIGIN:string;ADMIN_AUTH_PUBLIC_KEY?:string;ADMIN_AUTH_KEY_ID?:string};
export function base64url(bytes:Uint8Array):string {
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decode64(value:string):Uint8Array {
 return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
}
// undefined means an old Apps Script token; null means an invalid native token.
export async function verifyNativeAdmin(token:unknown,env:PublicConfig):Promise<NativeAdminPrincipal|null|undefined> {
 if(typeof token!=='string'||token.length>4096)return null;
 const parts=token.split('.');if(parts.length!==2)return null;
 if(parts[1].length!==342)return undefined;
 try {
  if(!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[A-Za-z0-9_-]{342}$/.test(parts[1])||!env.ADMIN_AUTH_PUBLIC_KEY||!env.ADMIN_AUTH_KEY_ID)return null;
  const claims=JSON.parse(new TextDecoder().decode(decode64(parts[0]))),now=Math.floor(Date.now()/1000);
  if(!claims||claims.iss!=='egv-cloudflare-admin'||claims.aud!==env.APP_ORIGIN||claims.kid!==env.ADMIN_AUTH_KEY_ID||claims.role!=='admin'||claims.sub!=='admin'||!Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||claims.iat>now+30||claims.exp<=now||claims.exp>claims.iat+8*3600||claims.exp<=claims.iat||typeof claims.nonce!=='string'||claims.nonce.length!==36)return null;
  const key=await crypto.subtle.importKey('jwk',JSON.parse(env.ADMIN_AUTH_PUBLIC_KEY),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode64(parts[1]),new TextEncoder().encode(parts[0])))return null;
  return {role:'admin',sub:'admin',exp:claims.exp};
 }catch{return null;}
}
