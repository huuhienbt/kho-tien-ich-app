import {authenticate} from './auth.js';
import {ACTIONS,runAction} from './engine.js';
import {commitChanges,loadSnapshot} from './storage.js';
import {boundedText,HttpError,todayVietnam} from './util.js';
import {deleteFile,downloadFile,listFiles,uploadFile} from './files.js';
import {memberAction,memberActions} from './members.js';
import {transferAction,transferActions} from './transfers.js';
import {backup,backupStatus,startBackup} from './backup.js';
const VERSION='9.11.0';
const backupActions=['nh_backup_status','nh_backup_now'];
const fileActions=['nh_files_list','nh_file_download','nh_file_delete'];
function responseJSON(value:unknown,status=200) {return Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
    const origin=request.headers.get('Origin'),url=new URL(request.url);
    if(origin && origin!==env.APP_ORIGIN) return responseJSON({status:'error',message:'Nguồn truy cập không được phép.'},403);
    const cors=new Headers({'Vary':'Origin','Cache-Control':'private, no-store'});
    if(origin===env.APP_ORIGIN) {
      cors.set('Access-Control-Allow-Origin',origin);cors.set('Access-Control-Allow-Methods','POST, GET, OPTIONS');
      cors.set('Access-Control-Allow-Headers','Content-Type, Authorization, X-File-Size, X-File-Name, X-File-Note');
      cors.set('Access-Control-Expose-Headers','Content-Disposition');cors.set('Access-Control-Max-Age','600');
    }
    const decorate=(response:Response)=>{const out=new Response(response.body,response);cors.forEach((v,k)=>out.headers.set(k,v));return out;};
    if(request.method==='OPTIONS')return decorate(new Response(null,{status:204}));
    try {
      if(request.method==='GET'&&url.pathname==='/health')return decorate(responseJSON({status:'success',backend:'cloudflare-d1',version:VERSION,files:!!env.FILES}));
      if(request.method!=='POST')throw new HttpError(405,'Phương thức không được hỗ trợ.');
      if(url.pathname==='/files/upload') {
        const user=await authenticate(request,env,request.headers.get('Authorization')?.replace(/^Bearer /,''));
        return decorate(responseJSON({status:'success',data:await uploadFile(request,env,user)}));
      }
      if(!['/','/api'].includes(url.pathname))throw new HttpError(404,'Không tìm thấy chức năng.');
      let payload:{action?:string,adminToken?:unknown,data?:Record<string,unknown>};
      try {payload=JSON.parse(await boundedText(request.body,524288));}
      catch(error) {if(error instanceof HttpError)throw error;throw new HttpError(400,'Dữ liệu gửi lên không hợp lệ.');}
      if(!payload||typeof payload!=='object'||!ACTIONS.concat(fileActions,memberActions,transferActions,backupActions).includes(String(payload.action))||payload.data&&typeof payload.data!=='object'||Array.isArray(payload.data))throw new HttpError(400,'Lệnh nhóm học không hợp lệ.');
      const user=await authenticate(request,env,payload.adminToken),data=payload.data||{},action=String(payload.action);
      if(backupActions.includes(action)) {
        if(action==='nh_backup_now'){const run=await startBackup(env,true);if(run)ctx.waitUntil(run());}
        return decorate(responseJSON({status:'success',data:await backupStatus(env),version:VERSION}));
      }
      if(transferActions.includes(action)){
        const result=await transferAction(env.DB,user,action,data);if(action==='nh_member_transfer')ctx.waitUntil(backup(env));
        return decorate(responseJSON({status:'success',data:result,version:VERSION}));
      }
      if(memberActions.includes(action)){
        const result=await memberAction(env.DB,user,action,data);if(action==='nh_member_remove')ctx.waitUntil(backup(env));
        return decorate(responseJSON({status:'success',data:result,version:VERSION}));
      }
      if(action==='nh_file_download')return decorate(await downloadFile(env,data.id));
      if(action==='nh_files_list')return decorate(responseJSON({status:'success',data:await listFiles(env,data.groupId)}));
      if(action==='nh_file_delete')return decorate(responseJSON({status:'success',data:await deleteFile(env,data.id)}));
      const snapshot=await loadSnapshot(env.DB,action,typeof data.groupId==='string'?data.groupId:undefined),now=new Date().toISOString();
      let execution;
      try {execution=runAction(snapshot.tables,user,action,data,todayVietnam(),snapshot.teachers,now);}
      catch(error) {throw new HttpError(400,error instanceof Error?error.message:'Dữ liệu nhóm học không hợp lệ.');}
      await commitChanges(env.DB,snapshot.revision,execution.dirty,action,user.sub,now);
      if(Object.values(execution.dirty).some(rows=>rows.length))ctx.waitUntil(backup(env));
      const result=execution.result;
      if(action==='nh_boot' && 'features' in result) Object.assign(result,{storage:'cloudflare-d1',version:VERSION,backup:await backupStatus(env),students:snapshot.tables.HocSinh.map(({_row,...student})=>student),features:{...result.features,files:!!env.FILES,memberRemoval:true,memberTransfer:true,driveBackup:true}});
      return decorate(responseJSON({status:'success',data:result,version:VERSION}));
    } catch(error) {
      if(error instanceof HttpError)return decorate(responseJSON({status:'error',message:error.message},error.status));
      console.error(JSON.stringify({event:'groups_request_failed',code:'INTERNAL_ERROR'}));
      return decorate(responseJSON({status:'error',message:'Chưa xử lý được dữ liệu. Vui lòng tải lại để kiểm tra trước khi nhập lại.'},503));
    }
  },
  async scheduled(_controller:ScheduledController,env:Env):Promise<void> {await backup(env,true);}
} satisfies ExportedHandler<Env>;
