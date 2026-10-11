import {HttpError,text,type Item,type Principal} from './util.js';
export const HEADERS={Prompts:['id','title','category','content','platform','access','created_at'],Repairs:['id','date','task','location','cost','warranty','status','vendor','reporter','asset_id','image_url','note'],PromptFavorites:['user_id','prompt_id','created_at']} as const;
type Table='prompts'|'repairs';
type Meta={revision:number,initialized:number,backup_revision:number,last_backup_at:string,backup_error:string};
export async function meta(db:D1Database):Promise<Meta>{const m=await db.prepare('SELECT revision,initialized,backup_revision,last_backup_at,backup_error FROM collection_meta WHERE id=1').first<Meta>();if(!m?.initialized)throw new HttpError(503,'Kho dữ liệu đang được chuyển. Vui lòng thử lại sau.');return m;}
export async function items(db:D1Database,table:Table):Promise<Item[]>{return (await db.prepare(`SELECT record FROM ${table} ORDER BY position DESC`).all<{record:string}>()).results.map(r=>JSON.parse(r.record));}
export function vip(p:Principal|null):boolean{return p?.role==='admin'||p?.membership==='vip';}
export function mask(items:Item[],p:Principal|null):Item[]{return items.map(i=>String(i.access).trim().toLowerCase()==='vip'&&!vip(p)?{...i,content:'',locked:true}:i);}
export function summary(rows:Item[],admin:boolean):Record<string,number>{const result:Record<string,number>={total:rows.length,pending:rows.filter(i=>i.status!=='Đã hoàn thành').length,watch:rows.filter(i=>i.status==='Cần theo dõi').length};if(admin)result.cost=rows.reduce((n,i)=>n+(Number(String(i.cost||'').replace(/[^0-9-]/g,''))||0),0);return result;}
export async function favoriteIds(db:D1Database,p:Principal):Promise<string[]>{return (await db.prepare('SELECT prompt_id FROM favorites WHERE user_id=? ORDER BY created_at,prompt_id').bind(p.role+':'+p.sub).all<{prompt_id:string}>()).results.map(r=>r.prompt_id);}
async function budget(db:D1Database,additionalBytes:number):Promise<void>{
 const row=await db.prepare("SELECT (SELECT COALESCE(SUM(length(CAST(record AS BLOB))),0) FROM prompts)+(SELECT COALESCE(SUM(length(CAST(record AS BLOB))),0) FROM repairs)+(SELECT COALESCE(SUM(length(CAST(json_object('user_id',user_id,'prompt_id',prompt_id,'created_at',created_at) AS BLOB))),0) FROM favorites) AS bytes").first<{bytes:number}>();
 if(Number(row?.bytes||0)+additionalBytes+5000>850000)throw new HttpError(413,'Kho dữ liệu đạt giới hạn bản lưu. Vui lòng xuất bản lưu và điều chỉnh dung lượng trước khi thêm nội dung.');
}
// A single transactional batch gates all row mutations with the unique revision token.
async function mutation(db:D1Database,revision:number,build:(gate:string,token:string)=>D1PreparedStatement[]):Promise<void>{
 const token=crypto.randomUUID(),gate='EXISTS(SELECT 1 FROM collection_meta WHERE id=1 AND write_token=?)';
 const results=await db.batch([db.prepare('UPDATE collection_meta SET revision=revision+1,write_token=? WHERE id=1 AND initialized=1 AND revision=?').bind(token,revision),...build(gate,token)]);
 if(!results[0].meta.changes)throw new HttpError(409,'Dữ liệu vừa thay đổi. Vui lòng tải lại trước khi lưu.');
}
export async function writeItem(db:D1Database,action:string,sheetType:unknown,data:Record<string,unknown>):Promise<{status:string,message:string,id:string}>{
 if(sheetType!=='prompts'&&sheetType!=='repairs')throw new HttpError(400,'Loại dữ liệu không hợp lệ.');
 const table:Table=sheetType,m=await meta(db),id=action==='create'?(table==='prompts'?'PR-':'REP-')+crypto.randomUUID():text(data.id,120);
 if(!id)throw new HttpError(400,'Thiếu mã dữ liệu.');
 const old=action==='create'?null:await db.prepare(`SELECT record FROM ${table} WHERE id=?`).bind(id).first<{record:string}>();
 if(action!=='create'&&!old)throw new HttpError(404,'Không tìm thấy ID.');
 if(action==='delete')await mutation(db,m.revision,(gate,token)=>[db.prepare(`DELETE FROM ${table} WHERE id=? AND ${gate}`).bind(id,token)]);
 else{
  const record:Item=old?JSON.parse(old.record):{id};
  const headers=table==='prompts'?HEADERS.Prompts:HEADERS.Repairs;
  for(const key of headers){if(key==='id'||key==='created_at')continue;const value=data[key]??'';record[key]=typeof value==='number'&&Number.isFinite(value)?value:text(value,key==='content'?45000:2000);}
  if(table==='prompts'){record.access=String(record.access).toLowerCase()==='vip'?'vip':'normal';if(action==='create')record.created_at=new Date().toISOString();if(!String(record.title).trim()||!String(record.content).trim())throw new HttpError(400,'Vui lòng nhập tên và nội dung Prompt.');}
  else if(!String(record.task).trim())throw new HttpError(400,'Vui lòng nhập tên công việc.');
  const raw=JSON.stringify(record);
  await budget(db,new TextEncoder().encode(raw).byteLength-(old?new TextEncoder().encode(old.record).byteLength:0));
  await mutation(db,m.revision,(gate,token)=>action==='create'?[db.prepare(`INSERT INTO ${table}(id,record,position) SELECT ?,?,COALESCE((SELECT MAX(position)+1 FROM ${table}),0) WHERE ${gate}`).bind(id,raw,token)]:[db.prepare(`UPDATE ${table} SET record=? WHERE id=? AND ${gate}`).bind(raw,id,token)]);
 }
 return {status:'success',message:action==='delete'?'Đã xóa dữ liệu.':action==='create'?'Đã tạo dữ liệu.':'Cập nhật thành công.',id};
}
export async function writeFavorites(db:D1Database,p:Principal,action:string,data:Record<string,unknown>):Promise<Record<string,unknown>>{
 const m=await meta(db),user=p.role+':'+p.sub;
 if(action==='toggle_favorite'){
  const id=text(data.promptId,120);if(!id||!await db.prepare('SELECT id FROM prompts WHERE id=?').bind(id).first())throw new HttpError(404,'Prompt không còn tồn tại.');
  const favorite=data.favorite===true||String(data.favorite).toLowerCase()==='true'||data.favorite===1;
  if(favorite)await budget(db,new TextEncoder().encode(JSON.stringify({user_id:user,prompt_id:id,created_at:new Date().toISOString()})).byteLength);
  await mutation(db,m.revision,(gate,token)=>[favorite?db.prepare(`INSERT INTO favorites(user_id,prompt_id,created_at) SELECT ?,?,? WHERE ${gate} ON CONFLICT(user_id,prompt_id) DO NOTHING`).bind(user,id,new Date().toISOString(),token):db.prepare(`DELETE FROM favorites WHERE user_id=? AND prompt_id=? AND ${gate}`).bind(user,id,token)]);
  return {status:'success',favorite,favorites:await favoriteIds(db,p)};
 }
 const ids=Array.isArray(data.promptIds)?[...new Set(data.promptIds.slice(0,300).map(i=>text(i,120)))]:[],now=new Date().toISOString();
 if(ids.length){await budget(db,ids.reduce((n,id)=>n+new TextEncoder().encode(JSON.stringify({user_id:user,prompt_id:id,created_at:now})).byteLength,0));await mutation(db,m.revision,(gate,token)=>[db.prepare(`INSERT INTO favorites(user_id,prompt_id,created_at) SELECT ?,p.id,? FROM prompts p JOIN json_each(?) j ON p.id=j.value WHERE ${gate} ON CONFLICT(user_id,prompt_id) DO NOTHING`).bind(user,now,JSON.stringify(ids),token)]);}
 return {status:'success',favorites:await favoriteIds(db,p)};
}
