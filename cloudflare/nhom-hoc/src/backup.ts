import {NH_SCHEMA} from './engine.js';
import {loadSnapshot} from './storage.js';
import {boundedText} from './util.js';

export async function backupStatus(env:Env) {
  const row=await env.DB.prepare('SELECT m.revision,b.* FROM nh_meta m JOIN nh_backup b ON b.id=m.id WHERE m.id=1').first<{
    revision:number;backup_revision:number;checksum:string;last_success_at:string;last_attempt_at:string;last_checked_at:string;
    error_code:string;spreadsheet_id:string;lease_until:number;
  }>();
  if(!row)throw Error('BACKUP_META_MISSING');
  const state=!env.SHEETS_BRIDGE?'unconfigured':row.lease_until>Date.now()?'syncing':row.error_code?'error':row.backup_revision===row.revision&&row.checksum?'synced':'pending';
  return {state,revision:row.revision,backupRevision:row.backup_revision,lastSuccessAt:row.last_success_at,
    lastAttemptAt:row.last_attempt_at,lastCheckedAt:row.last_checked_at,errorCode:row.error_code,
    spreadsheetId:row.spreadsheet_id,intervalMinutes:10,direction:'cloudflare-to-drive'};
}

async function runBackup(env:Env,lease:string):Promise<void> {
  try {
    if(!env.SHEETS_BRIDGE)throw Error('NOT_CONFIGURED');
    // D1 batch provides one consistent snapshot, including removals and historical periods.
    const snapshot=await loadSnapshot(env.DB,'nh_backup_snapshot'),tables:Record<string,Record<string,string|number>[]>={};
    for(const [name,columns] of Object.entries(NH_SCHEMA))tables[name]=snapshot.tables[name].map(row=>Object.fromEntries(columns.map(column=>[column,row[column]])));
    const bytes=new TextEncoder().encode(JSON.stringify(tables));
    const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
    const message=JSON.stringify({op:'nh_backup',version:1,revision:snapshot.revision,issuedAt:Date.now(),tables});
    if(new TextEncoder().encode(message).byteLength>900000)throw Error('SIZE_LIMIT');
    const response=await env.SHEETS_BRIDGE.fetch('https://egv-internal/nh-backup',{method:'POST',body:message});
    if(!response.ok)throw Error('DRIVE_UNAVAILABLE');
    const result=JSON.parse(await boundedText(response.body,32768));
    const data=result.data;
    if(result.status!=='success'||!data||data.revision!==snapshot.revision||data.checksum!==checksum||
      typeof data.savedAt!=='string'||!Number.isFinite(Date.parse(data.savedAt))||typeof data.spreadsheetId!=='string'||!/^[\w-]{20,150}$/.test(data.spreadsheetId))throw Error('VERIFY_FAILED');
    await env.DB.prepare("UPDATE nh_backup SET backup_revision=?,checksum=?,last_success_at=?,last_checked_at=?,spreadsheet_id=?,error_code='' WHERE id=1 AND lease_token=?")
      .bind(snapshot.revision,checksum,data.savedAt,new Date().toISOString(),data.spreadsheetId,lease).run();
  } catch(error) {
    const code=error instanceof Error&&['NOT_CONFIGURED','SIZE_LIMIT','VERIFY_FAILED','DRIVE_UNAVAILABLE'].includes(error.message)?error.message:'DRIVE_UNAVAILABLE';
    await env.DB.prepare('UPDATE nh_backup SET error_code=? WHERE id=1 AND lease_token=?').bind(code,lease).run();
    console.warn(JSON.stringify({event:'groups_drive_backup_pending',code}));
  } finally {
    await env.DB.prepare("UPDATE nh_backup SET lease_token='',lease_until=0 WHERE id=1 AND lease_token=?").bind(lease).run();
  }
}

// Claim before returning from a manual request; Google work remains off the request path.
export async function startBackup(env:Env,force=false):Promise<(()=>Promise<void>)|null> {
  if(!env.SHEETS_BRIDGE)return null;
  const now=Date.now(),lease=crypto.randomUUID();
  const claim=await env.DB.prepare(`UPDATE nh_backup SET lease_token=?,lease_until=?,last_attempt_at=?,error_code=''
    WHERE id=1 AND lease_until<=? AND (?=1 OR backup_revision<(SELECT revision FROM nh_meta WHERE id=1) OR last_checked_at<?)`)
    .bind(lease,now+120000,new Date(now).toISOString(),now,force?1:0,new Date(now-300000).toISOString()).run();
  return claim.meta.changes?()=>runBackup(env,lease):null;
}
export async function backup(env:Env,force=false):Promise<void> {const run=await startBackup(env,force);if(run)await run();}
