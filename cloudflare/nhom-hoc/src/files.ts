import {cleanText,HttpError,validId} from './util.js';
import type {Principal} from './auth.js';
const mimes=new Set(['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']);
function bucket(env:Env) {if(!env.FILES)throw new HttpError(503,'Chức năng tệp chưa được bật. Quản trị cần kích hoạt R2.');return env.FILES;}
export async function listFiles(env:Env,groupId:unknown) {
  bucket(env);
  if(!validId(groupId))throw new HttpError(400,'Mã nhóm không hợp lệ.');
  const result=await env.DB.prepare('SELECT id,name,mime,size,note,created_at FROM nh_files WHERE group_id=? AND status=? ORDER BY created_at DESC LIMIT 201').bind(groupId,'ready').all();
  return {files:result.results.slice(0,200),hasMore:result.results.length>200,maxBytes:Number(env.FILE_MAX_BYTES)};
}
export async function uploadFile(request:Request,env:Env,user:Principal) {
  const files=bucket(env),groupId=new URL(request.url).searchParams.get('groupId');
  if(!validId(groupId))throw new HttpError(400,'Mã nhóm không hợp lệ.');
  const group=await env.DB.prepare('SELECT ma_nhom FROM NhomHoc WHERE ma_nhom=?').bind(groupId).first();
  if(!group)throw new HttpError(404,'Không tìm thấy nhóm học.');
  const size=Number(request.headers.get('X-File-Size')),max=Number(env.FILE_MAX_BYTES),budget=Number(env.FILE_TOTAL_BYTES);
  if(!Number.isSafeInteger(size)||size<=0||size>max||!request.body)throw new HttpError(413,`Mỗi tệp tối đa ${max/1048576} MB.`);
  const mime=(request.headers.get('Content-Type')||'').split(';')[0].toLowerCase();
  if(!mimes.has(mime))throw new HttpError(400,'Chọn PDF, Word, Excel, PowerPoint, ảnh hoặc tệp văn bản.');
  let name:string,note:string;
  try {name=cleanText(decodeURIComponent(request.headers.get('X-File-Name')||''),180).replace(/[\\/:*?"<>|]/g,'_');note=cleanText(decodeURIComponent(request.headers.get('X-File-Note')||''));}
  catch {throw new HttpError(400,'Tên tệp không hợp lệ.');}
  if(!name)throw new HttpError(400,'Thiếu tên tệp.');
  const id=crypto.randomUUID(),key=`groups/${groupId}/${id}`,now=new Date().toISOString();
  const reserved=await env.DB.prepare(`INSERT INTO nh_files(id,group_id,object_key,name,mime,size,note,created_at,created_by,status)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM nh_files)+?<=?`).bind(id,groupId,key,name,mime,size,note,now,user.sub,'pending',size,budget).run();
  if(!reserved.meta.changes)throw new HttpError(413,'Kho tệp đã đạt giới hạn 1 GB được thiết lập. Xóa tệp cũ trước khi tải thêm.');
  try {
    // FixedLengthStream enforces actual size and lets R2 stream without buffering the upload.
    const stream=new FixedLengthStream(size);
    const operations=await Promise.allSettled([
      request.body.pipeTo(stream.writable),
      files.put(key,stream.readable,{httpMetadata:{contentType:mime,contentDisposition:`attachment; filename*=UTF-8''${encodeURIComponent(name)}`}})
    ]);
    if(operations.some(r=>r.status==='rejected'))throw new HttpError(400,'Kích thước tệp không khớp hoặc tải lên bị gián đoạn.');
    await env.DB.prepare('UPDATE nh_files SET status=? WHERE id=?').bind('ready',id).run();
    return {id,name,size,note,created_at:now};
  } catch(error) {
    // Keep the reservation when cleanup fails so orphaned storage never escapes the budget.
    try {await files.delete(key);await env.DB.prepare('DELETE FROM nh_files WHERE id=?').bind(id).run();}
    catch {console.error(JSON.stringify({event:'file_cleanup_pending',fileId:id}));}
    throw error;
  }
}
export async function downloadFile(env:Env,id:unknown) {
  const files=bucket(env);
  if(!validId(id))throw new HttpError(400,'Mã tệp không hợp lệ.');
  const metadata=await env.DB.prepare('SELECT object_key,name FROM nh_files WHERE id=? AND status=?').bind(id,'ready').first<{object_key:string,name:string}>();
  if(!metadata)throw new HttpError(404,'Không tìm thấy tệp.');
  const object=await files.get(metadata.object_key);
  if(!object)throw new HttpError(404,'Tệp không còn trong kho lưu trữ.');
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,'Content-Length':String(object.size),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
}
export async function deleteFile(env:Env,id:unknown) {
  const files=bucket(env);
  if(!validId(id))throw new HttpError(400,'Mã tệp không hợp lệ.');
  const metadata=await env.DB.prepare('SELECT object_key FROM nh_files WHERE id=?').bind(id).first<{object_key:string}>();
  if(!metadata) return {deleted:true};
  await files.delete(metadata.object_key);
  await env.DB.prepare('DELETE FROM nh_files WHERE id=?').bind(id).run();
  return {deleted:true};
}
