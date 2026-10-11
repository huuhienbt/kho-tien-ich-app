import {authenticate,gas,invalidateUser} from './auth.js';
import {backup} from './backup.js';
import {favoriteIds,items,mask,meta,summary,writeFavorites,writeItem} from './store.js';
import {boundedText,HttpError,json,text,type Principal} from './util.js';
const VERSION='9.6.0';
const ACTIONS=['get_prompts','get_repairs','toggle_favorite','sync_favorites','create','update','delete','admin_get_users','admin_set_membership','collections_backup_status','collections_backup_now'];
export default{
 async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(origin&&origin!==env.APP_ORIGIN)return json({status:'error',message:'Nguồn truy cập không được phép.'},403);
  const decorate=(r:Response)=>{const out=new Response(r.body,r);out.headers.set('Vary','Origin');if(origin===env.APP_ORIGIN){out.headers.set('Access-Control-Allow-Origin',origin);out.headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');out.headers.set('Access-Control-Allow-Headers','Content-Type');out.headers.set('Access-Control-Max-Age','600');}return out;};
  if(request.method==='OPTIONS')return decorate(new Response(null,{status:204}));
  try{
   if(request.method==='GET'&&url.pathname==='/health'){const m=await env.DB.prepare('SELECT initialized FROM collection_meta WHERE id=1').first<{initialized:number}>();return decorate(json({status:'success',backend:'cloudflare-d1',version:VERSION,ready:!!m?.initialized,sheetsBackupConfigured:!!env.SHEETS_SIGNING_KEY}));}
   if(!['/','/api'].includes(url.pathname))throw new HttpError(404,'Không tìm thấy chức năng.');
   await meta(env.DB);
   if(request.method==='GET'){
    const type=url.searchParams.get('type');if(type==='prompts')return decorate(json({status:'success',data:mask(await items(env.DB,'prompts'),null)}));
    if(type==='repairs')return decorate(json({status:'success',data:[],summary:summary(await items(env.DB,'repairs'),false),accessLevel:'public',restricted:true}));
    throw new HttpError(400,'Loại dữ liệu không hợp lệ.');
   }
   if(request.method!=='POST')throw new HttpError(405,'Phương thức không được hỗ trợ.');
   let payload:{action?:unknown,adminToken?:unknown,userToken?:unknown,sheetType?:unknown,data?:unknown};
   try{payload=JSON.parse(await boundedText(request.body,262144));}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'Dữ liệu gửi lên không hợp lệ.');}
   if(!payload||typeof payload!=='object'||Array.isArray(payload)||!ACTIONS.includes(String(payload.action))||payload.data!=null&&(typeof payload.data!=='object'||Array.isArray(payload.data)))throw new HttpError(400,'Lệnh không hợp lệ.');
   const action=String(payload.action),data=(payload.data||{}) as Record<string,unknown>,p:Principal=await authenticate(request,env,payload);
   if(action==='get_prompts')return decorate(json({status:'success',data:mask(await items(env.DB,'prompts'),p),favorites:await favoriteIds(env.DB,p),membership:p.membership}));
   if(action==='get_repairs'){
    const rows=await items(env.DB,'repairs'),admin=p.role==='admin';
    return decorate(json({status:'success',data:admin?rows:rows.map(i=>({id:String(i.id||''),task:String(i.task||''),status:String(i.status||'')})),summary:summary(rows,admin),accessLevel:admin?'admin':'member',restricted:!admin}));
   }
   if(action==='toggle_favorite'||action==='sync_favorites'){
    if(env.WRITE_LIMITER&&!(await env.WRITE_LIMITER.limit({key:p.role+':'+p.sub})).success)throw new HttpError(429,'Vui lòng thử lại sau một phút.');
    const result=await writeFavorites(env.DB,p,action,data);ctx.waitUntil(backup(env));return decorate(json(result));
   }
   if(p.role!=='admin')throw new HttpError(403,'Chỉ quản trị được thực hiện thao tác này.');
   if(action==='admin_get_users'||action==='admin_set_membership'){
    if(action==='admin_set_membership')text(data.userId,120);
    const result=await gas(env,{action,data,adminToken:payload.adminToken});
    if(result.status!=='success')throw new HttpError(400,String(result.message||'Chưa cập nhật tài khoản.'));
    if(action==='admin_set_membership')await invalidateUser(env.DB,text(data.userId,120));
    return decorate(json(result));
   }
   if(action==='collections_backup_now')ctx.waitUntil(backup(env));
   if(action==='collections_backup_now'||action==='collections_backup_status')return decorate(json({status:'success',data:await meta(env.DB)}));
   const result=await writeItem(env.DB,action,payload.sheetType,data);ctx.waitUntil(backup(env));return decorate(json(result));
  }catch(error){if(error instanceof HttpError)return decorate(json({status:'error',message:error.message},error.status));console.error(JSON.stringify({event:'collections_request_failed'}));return decorate(json({status:'error',message:'Chưa xử lý được dữ liệu. Vui lòng tải lại để kiểm tra trước khi nhập lại.'},503));}
 },
 async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext):Promise<void>{ctx.waitUntil(backup(env));}
} satisfies ExportedHandler<Env>;
