import {WorkerEntrypoint} from 'cloudflare:workers';
import {signedEnvelope} from './backup.js';
import {boundedText} from './util.js';

// Named entrypoint: reachable only through the group's Service binding, never the public API.
// Reuse the existing signing secret in this Worker; no secret is sent to the group Worker.
export class GroupsSheetsBridge extends WorkerEntrypoint<Env> {
  async fetch(request:Request):Promise<Response> {
    try {
      if(request.method!=='POST'||new URL(request.url).pathname!=='/nh-backup')return new Response(null,{status:404});
      const message=await boundedText(request.body,900000),data=JSON.parse(message);
      if(data?.op!=='nh_backup'||data.version!==1||!Number.isSafeInteger(data.revision)||data.revision<0||!Number.isSafeInteger(data.issuedAt)||Math.abs(Date.now()-data.issuedAt)>600000||!data.tables)throw Error('INVALID_SNAPSHOT');
      const envelope=await signedEnvelope(this.env,message);
      const response=await fetch(this.env.GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(envelope),signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw Error('DRIVE_UNAVAILABLE');
      const result=JSON.parse(await boundedText(response.body,32768));
      if(result.status!=='success')throw Error('DRIVE_UNAVAILABLE');
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    } catch {
      return Response.json({status:'error',code:'DRIVE_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});
    }
  }
}
