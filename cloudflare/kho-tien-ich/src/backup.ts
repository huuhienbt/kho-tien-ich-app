import {boundedText,hash,type Item} from './util.js';
export async function signedEnvelope(env:Env,message:string):Promise<Record<string,string>>{
 const bytes=Uint8Array.from(atob(env.SHEETS_SIGNING_KEY),c=>c.charCodeAt(0)),key=await crypto.subtle.importKey('pkcs8',bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(message));
 return {action:'collections_bridge',keyId:env.SHEETS_KEY_ID,message,signature:btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
}
export async function backup(env:Env):Promise<void>{
 const now=Math.floor(Date.now()/1000),lease=crypto.randomUUID();
 const claim=await env.DB.prepare('UPDATE collection_meta SET lease_token=?,lease_until=? WHERE id=1 AND initialized=1 AND revision>backup_revision AND lease_until<?').bind(lease,now+120,now).run();
 if(!claim.meta.changes)return;
 try{
  const batch=await env.DB.batch<Record<string,string|number>>([env.DB.prepare('SELECT revision FROM collection_meta WHERE id=1'),env.DB.prepare('SELECT record FROM prompts ORDER BY position'),env.DB.prepare('SELECT record FROM repairs ORDER BY position'),env.DB.prepare('SELECT user_id,prompt_id,created_at FROM favorites ORDER BY created_at,user_id,prompt_id')]);
  const revision=Number(batch[0].results[0].revision),tables={Prompts:batch[1].results.map(r=>JSON.parse(String(r.record)) as Item),Repairs:batch[2].results.map(r=>JSON.parse(String(r.record)) as Item),PromptFavorites:batch[3].results};
  const message=JSON.stringify({op:'backup',version:1,revision,issuedAt:Date.now(),tables}),checksum=await hash(JSON.stringify(tables));
  if(new TextEncoder().encode(message).byteLength>900000)throw Error('SIZE_LIMIT');
  const envelope=await signedEnvelope(env,message),r=await fetch(env.GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(envelope),signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error('SHEETS_HTTP');
  const result=JSON.parse(await boundedText(r.body,32768));
  if(result.status!=='success'||!result.data||Number(result.data.revision)<revision||Number(result.data.revision)===revision&&result.data.checksum!==checksum)throw Error('SHEETS_VERIFY');
  await env.DB.prepare("UPDATE collection_meta SET backup_revision=MAX(backup_revision,?),last_backup_at=?,backup_error='' WHERE id=1 AND lease_token=?").bind(revision,new Date().toISOString(),lease).run();
 }catch{
  console.warn(JSON.stringify({event:'sheets_backup_pending'}));
  await env.DB.prepare("UPDATE collection_meta SET backup_error='SHEETS_PENDING' WHERE id=1 AND lease_token=?").bind(lease).run();
 }finally{await env.DB.prepare("UPDATE collection_meta SET lease_token='',lease_until=0 WHERE id=1 AND lease_token=?").bind(lease).run();}
}
