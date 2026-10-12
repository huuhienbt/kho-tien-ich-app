import type {Principal} from './auth.js';
import {runAction} from './engine.js';
import {loadSnapshot,upsertSQL} from './storage.js';
import type {Row} from './storage.js';
import {HttpError,todayVietnam,validId} from './util.js';

export const transferActions=['nh_member_transfer_preview','nh_member_transfer'];
const nextDay=(date:string)=>new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);

export async function transferAction(db:D1Database,user:Principal,action:string,data:Record<string,unknown>) {
  if(!validId(data.groupId)||!validId(data.memberId)||!validId(data.targetGroupId))throw new HttpError(400,'Vui lòng chọn nhóm chuyển đến.');
  const groupId=String(data.groupId),targetId=String(data.targetGroupId),memberId=String(data.memberId);
  if(groupId===targetId)throw new HttpError(400,'Nhóm chuyển đến phải khác nhóm hiện tại.');
  const snapshot=await loadSnapshot(db,'nh_view'),tables=snapshot.tables,today=todayVietnam();
  const source=tables.ThanhVienNhom.find(m=>m.ma_thanh_vien===memberId&&m.ma_nhom===groupId);
  if(!source)throw new HttpError(404,'Học sinh không còn trong nhóm này. Bấm Tải lại để kiểm tra.');
  const sourceGroup=tables.NhomHoc.find(g=>g.ma_nhom===groupId),target=tables.NhomHoc.find(g=>g.ma_nhom===targetId);
  if(!sourceGroup||!target||target.trang_thai!=='dang_hoc')throw new HttpError(400,'Nhóm chuyển đến không còn hoạt động.');
  if(source.ngay_nghi&&source.ngay_nghi<today)throw new HttpError(400,'Học sinh đã nghỉ nhóm này. Chọn nhóm đang học để chuyển.');
  const studentId=String(source.ma_hoc_sinh),student=tables.HocSinh.find(s=>s.ma_hoc_sinh===studentId);
  if(!student)throw new HttpError(404,'Không tìm thấy hồ sơ học sinh.');
  const sessions=new Map(tables.BuoiHoc.filter(b=>b.ma_nhom===groupId).map(b=>[b.ma_buoi,b]));
  const marks=tables.DiemDanh.filter(d=>d.ma_hoc_sinh===studentId&&sessions.has(d.ma_buoi));
  const receipts=tables.ThuHocPhi.filter(p=>p.ma_nhom===groupId&&p.ma_hoc_sinh===studentId);
  const bills=tables.HocPhiKy.filter(b=>b.ma_nhom===groupId&&b.ma_hoc_sinh===studentId);
  const hasHistory=marks.length+receipts.length+bills.length>0;
  const existing=tables.ThanhVienNhom.find(m=>m.ma_nhom===targetId&&m.ma_hoc_sinh===studentId);
  if(existing?.ngay_nghi&&existing.ngay_nghi<today)throw new HttpError(400,'Học sinh từng nghỉ ở nhóm đích. Cần kiểm tra lại ngày tham gia và lịch sử tại nhóm đó trước khi chuyển lại.');
  let minDate=String(source.ngay_vao);
  if(hasHistory)minDate=nextDay(minDate);
  if(existing&&String(existing.ngay_vao)>minDate)minDate=String(existing.ngay_vao);
  marks.filter(m=>m.trang_thai!=='chua_diem_danh').forEach(m=>{
    const after=nextDay(String(sessions.get(m.ma_buoi)!.ngay_hoc));if(after>minDate)minDate=after;
  });
  const closed=tables.HocPhiKy.filter(b=>b.trang_thai==='da_chot'&&((b.ma_nhom===groupId&&b.ma_hoc_sinh===studentId)||(!existing&&b.ma_nhom===targetId)));
  const periods=new Set(closed.map(b=>String(b.ma_nhom)+'|'+String(b.ky_thu)));
  for(const key of periods) {
    const [id,month]=key.split('|'),view=runAction(tables,user,'nh_view',{groupId:id,month},today,snapshot.teachers).result;
    if('period' in view) {
      const end=id===groupId&&source.ngay_nghi&&source.ngay_nghi<view.period.end?String(source.ngay_nghi):view.period.end;
      const after=nextDay(end);if(after>minDate)minDate=after;
    }
  }
  if(existing?.ngay_nghi&&minDate>String(existing.ngay_nghi))throw new HttpError(400,'Nhóm đích đã ghi ngày nghỉ trước ngày chuyển. Kiểm tra hồ sơ ở nhóm đó trước khi chuyển lại.');
  const defaultDate=today>minDate?today:minDate;
  const rateMode=source.don_gia_rieng_vnd!==''&&(Number(source.don_gia_rieng_vnd)===0||sourceGroup.cach_tinh_hoc_phi===target.cach_tinh_hoc_phi)?'keep':'group';
  if(action==='nh_member_transfer_preview')return {
    revision:snapshot.revision,name:student.ho_ten,studentId,sourceName:sourceGroup.ten_nhom,targetName:target.ten_nhom,
    minDate,defaultDate,hasHistory,reusesMembership:!!existing,existingJoinDate:existing?.ngay_vao||'',
    sourceRate:source.don_gia_rieng_vnd,targetRate:target.don_gia_vnd,targetMode:target.cach_tinh_hoc_phi,rateMode
  };
  if(data.revision!==snapshot.revision)throw new HttpError(409,'Dữ liệu vừa thay đổi. Đóng hộp thoại và chọn chuyển nhóm lại để kiểm tra.');
  const date=data.date;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date<minDate||date>'2100-12-31')throw new HttpError(400,'Ngày chuyển phải hợp lệ, từ '+minDate+' trở đi để giữ lịch sử.');
  if(existing&&(date<String(existing.ngay_vao)||(existing.ngay_nghi&&date>String(existing.ngay_nghi))))throw new HttpError(400,'Ngày chuyển không nằm trong thời gian học ở nhóm đích. Kiểm tra hồ sơ nhóm đích trước khi chuyển.');
  if(!['keep','group'].includes(String(data.rateMode)))throw new HttpError(400,'Vui lòng chọn cách áp dụng học phí ở nhóm mới.');
  const now=new Date().toISOString(),writes:Row[]=[];
  try {
    if(hasHistory) {
      const lastDay=new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);
      writes.push(...runAction(tables,user,'nh_member_save',{groupId,memberId,joinDate:source.ngay_vao,leaveDate:lastDay,rate:source.don_gia_rieng_vnd,note:source.ghi_chu},today,snapshot.teachers,now).dirty.ThanhVienNhom);
    }
    if(!existing) {
      if(!validId(data.transferId))throw new Error('Thiếu mã chuyển nhóm. Đóng hộp thoại và chọn chuyển nhóm lại.');
      const added=runAction(tables,user,'nh_students_save',{groupId:targetId,joinDate:date,students:[{id:studentId,memberId:data.transferId}]},today,snapshot.teachers,now).dirty.ThanhVienNhom;
      added.forEach(m=>{m.don_gia_rieng_vnd=data.rateMode==='keep'?source.don_gia_rieng_vnd:'';m.ghi_chu=(String(source.ghi_chu||'')+(source.ghi_chu?' · ':'')+'Chuyển từ '+String(sourceGroup.ten_nhom)+' ngày '+date+'.').slice(0,500);});
      writes.push(...added);
    }
  } catch(error) {throw new HttpError(400,error instanceof Error?error.message:'Chưa chuyển được học sinh.');}
  const token=crypto.randomUUID();
  let guard='',params:unknown[]=[token,snapshot.revision];
  if(!hasHistory) {
    guard=` AND EXISTS (SELECT 1 FROM ThanhVienNhom WHERE ma_thanh_vien=? AND ma_nhom=? AND ma_hoc_sinh=?)
      AND NOT EXISTS (SELECT 1 FROM DiemDanh d JOIN BuoiHoc b ON b.ma_buoi=d.ma_buoi WHERE d.ma_hoc_sinh=? AND b.ma_nhom=?)
      AND NOT EXISTS (SELECT 1 FROM ThuHocPhi WHERE ma_hoc_sinh=? AND ma_nhom=?)
      AND NOT EXISTS (SELECT 1 FROM HocPhiKy WHERE ma_hoc_sinh=? AND ma_nhom=?)`;
    params=params.concat([memberId,groupId,studentId,studentId,groupId,studentId,groupId,studentId,groupId]);
  }
  const statements=[db.prepare('UPDATE nh_meta SET revision=revision+1,write_token=? WHERE id=1 AND revision=?'+guard).bind(...params)];
  if(writes.length)statements.push(db.prepare(upsertSQL('ThanhVienNhom')).bind(JSON.stringify(writes),token));
  if(!hasHistory)statements.push(db.prepare('DELETE FROM ThanhVienNhom WHERE ma_thanh_vien=? AND ma_nhom=? AND ma_hoc_sinh=? AND (SELECT write_token FROM nh_meta WHERE id=1)=?').bind(memberId,groupId,studentId,token));
  statements.push(db.prepare('INSERT INTO nh_audit(id,action,user_id,created_at,changed_rows) SELECT ?,?,?,?,? WHERE (SELECT write_token FROM nh_meta WHERE id=1)=?').bind(crypto.randomUUID(),'nh_member_transfer',user.sub,now,writes.length+(hasHistory?0:1),token));
  statements.push(db.prepare('SELECT write_token FROM nh_meta WHERE id=1'));
  const result=await db.batch<{write_token:string}>(statements);
  if(result.at(-1)?.results[0]?.write_token!==token)throw new HttpError(409,'Dữ liệu vừa thay đổi. Bấm Tải lại trước khi chuyển nhóm.');
  return {studentId,targetGroupId:targetId,date,message:'Đã chuyển '+String(student.ho_ten)+' sang nhóm '+String(target.ten_nhom)+'. Điểm danh và khoản thu cũ được giữ ở nhóm cũ.'};
}
