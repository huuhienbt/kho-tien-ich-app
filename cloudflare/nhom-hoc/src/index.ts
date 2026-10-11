import {authenticate} from './auth.js';
import {ACTIONS,runAction,VERSION} from './engine.js';
import {commitChanges,loadSnapshot} from './storage.js';
import {boundedText,HttpError,todayVietnam} from './util.js';
import {deleteFile,downloadFile,listFiles,uploadFile} from './files.js';
const fileActions=['nh_files_list','nh_file_download','nh_file_delete'];
function responseJSON(value:unknown,status=200) {return Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
export default {
  async fetch(request:Request,env:Env):Promise<Response> {
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
      if(!payload||typeof payload!=='object'||!ACTIONS.concat(fileActions).includes(String(payload.action))||payload.data&&typeof payload.data!=='object'||Array.isArray(payload.data))throw new HttpError(400,'Lệnh nhóm học không hợp lệ.');
      const user=await authenticate(request,env,payload.adminToken),data=payload.data||{},action=String(payload.action);
      if(action==='nh_file_download')return decorate(await downloadFile(env,data.id));
      if(action==='nh_files_list')return decorate(responseJSON({status:'success',data:await listFiles(env,data.groupId)}));
      if(action==='nh_file_delete')return decorate(responseJSON({status:'success',data:await deleteFile(env,data.id)}));
      const snapshot=await loadSnapshot(env.DB,action,typeof data.groupId==='string'?data.groupId:undefined),now=new Date().toISOString();
      let execution;
      try {execution=runAction(snapshot.tables,user,action,data,todayVietnam(),snapshot.teachers,now);}
      catch(error) {throw new HttpError(400,error instanceof Error?error.message:'Dữ liệu nhóm học không hợp lệ.');}
      await commitChanges(env.DB,snapshot.revision,execution.dirty,action,user.sub,now);
      const result=execution.result;
      if(action==='nh_boot' && 'features' in result) Object.assign(result,{storage:'cloudflare-d1',features:{...result.features,files:!!env.FILES}});
      return decorate(responseJSON({status:'success',data:result,version:VERSION}));
    } catch(error) {
      if(error instanceof HttpError)return decorate(responseJSON({status:'error',message:error.message},error.status));
      console.error(JSON.stringify({event:'groups_request_failed',code:'INTERNAL_ERROR'}));
      return decorate(responseJSON({status:'error',message:'Chưa xử lý được dữ liệu. Vui lòng tải lại để kiểm tra trước khi nhập lại.'},503));
    }
  }
} satisfies ExportedHandler<Env>;
