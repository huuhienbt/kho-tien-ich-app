import {runAction} from './engine.js';
import type {Principal} from './auth.js';
import {commitChanges,loadSnapshot} from './storage.js';
import type {Row} from './storage.js';
import {HttpError,todayVietnam} from './util.js';

export const memberActions=['nh_member_remove_preview','nh_member_remove'];

function identifier(value:unknown):string {
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value))throw new HttpError(400,'Mã nhóm hoặc học sinh không hợp lệ.');
  return value;
}

export async function memberAction(db:D1Database,user:Principal,action:string,data:Record<string,unknown>) {
  const groupId=identifier(data.groupId),memberId=identifier(data.memberId);
  const snapshot=await loadSnapshot(db,'nh_view',groupId),tables=snapshot.tables;
  const member=tables.ThanhVienNhom.find(m=>m.ma_nhom===groupId&&m.ma_thanh_vien===memberId);
  if(!member)throw new HttpError(404,'Học sinh không còn trong nhóm này. Bấm Tải lại để kiểm tra.');
  const student=tables.HocSinh.find(s=>s.ma_hoc_sinh===member.ma_hoc_sinh);
  if(!student)throw new HttpError(404,'Không tìm thấy hồ sơ học sinh.');
  const studentId=String(member.ma_hoc_sinh),today=todayVietnam();
  const sessions=new Map(tables.BuoiHoc.map(b=>[b.ma_buoi,b]));
  const marks=tables.DiemDanh.filter(d=>d.ma_hoc_sinh===studentId&&sessions.has(d.ma_buoi));
  const receipts=tables.ThuHocPhi.filter(p=>p.ma_hoc_sinh===studentId);
  const bills=tables.HocPhiKy.filter(b=>b.ma_hoc_sinh===studentId);
  const hasHistory=marks.length+receipts.length+bills.length>0;
  let minLeaveDate=String(member.ngay_vao);
  marks.filter(m=>m.trang_thai!=='chua_diem_danh').forEach(m=>{
    const date=String(sessions.get(m.ma_buoi)!.ngay_hoc);
    if(date>minLeaveDate)minLeaveDate=date;
  });
  for(const month of new Set(bills.filter(b=>b.trang_thai==='da_chot').map(b=>String(b.ky_thu)))) {
    const view=runAction(tables,user,'nh_view',{groupId,month},today,snapshot.teachers).result;
    if('period' in view) {
      const previousEnd=member.ngay_nghi&&member.ngay_nghi<view.period.end?String(member.ngay_nghi):view.period.end;
      const validEnd=new Date(previousEnd+'T12:00:00Z').toISOString().slice(0,10);
      if(validEnd>minLeaveDate)minLeaveDate=validEnd;
    }
  }
  const leaveDate=String(member.ngay_nghi||'')>=minLeaveDate?String(member.ngay_nghi):today>minLeaveDate?today:minLeaveDate;
  if(action==='nh_member_remove_preview')return {
    revision:snapshot.revision,studentId,name:student.ho_ten,hasHistory,
    attendanceCount:marks.length,receiptCount:receipts.length,billCount:bills.length,
    minLeaveDate,leaveDate
  };
  if(data.revision!==snapshot.revision)throw new HttpError(409,'Dữ liệu nhóm vừa thay đổi. Đóng hộp thoại, bấm Tải lại rồi thử lại.');
  const now=new Date().toISOString();
  if(hasHistory) {
    if(data.mode!=='leave')throw new HttpError(409,'Học sinh đã có điểm danh hoặc học phí. Chọn ngày nghỉ để giữ lịch sử.');
    if(typeof data.leaveDate!=='string'||!data.leaveDate)throw new HttpError(400,'Vui lòng chọn ngày học cuối trong nhóm.');
    let dirty:Record<string,Row[]>;
    try {
      dirty=runAction(tables,user,'nh_member_save',{
        groupId,memberId,joinDate:member.ngay_vao,leaveDate:data.leaveDate,
        rate:member.don_gia_rieng_vnd,note:member.ghi_chu
      },today,snapshot.teachers,now).dirty;
    } catch(error) {throw new HttpError(400,error instanceof Error?error.message:'Ngày nghỉ không hợp lệ.');}
    await commitChanges(db,snapshot.revision,dirty,'nh_member_leave',user.sub,now);
    return {mode:'left',studentId,leaveDate:data.leaveDate,message:'Đã ghi nhận nghỉ nhóm. Điểm danh và học phí trước ngày nghỉ vẫn được giữ lại.'};
  }
  if(data.mode!=='remove')throw new HttpError(400,'Thao tác xóa khỏi nhóm không hợp lệ.');
  const token=crypto.randomUUID();
  const statements=[
    db.prepare(`UPDATE nh_meta SET revision=revision+1,write_token=? WHERE id=1 AND revision=?
      AND EXISTS (SELECT 1 FROM ThanhVienNhom WHERE ma_thanh_vien=? AND ma_nhom=? AND ma_hoc_sinh=?)
      AND NOT EXISTS (SELECT 1 FROM DiemDanh d JOIN BuoiHoc b ON b.ma_buoi=d.ma_buoi WHERE d.ma_hoc_sinh=? AND b.ma_nhom=?)
      AND NOT EXISTS (SELECT 1 FROM ThuHocPhi WHERE ma_hoc_sinh=? AND ma_nhom=?)
      AND NOT EXISTS (SELECT 1 FROM HocPhiKy WHERE ma_hoc_sinh=? AND ma_nhom=?)`)
      .bind(token,snapshot.revision,memberId,groupId,studentId,studentId,groupId,studentId,groupId,studentId,groupId),
    db.prepare('DELETE FROM ThanhVienNhom WHERE ma_thanh_vien=? AND ma_nhom=? AND ma_hoc_sinh=? AND (SELECT write_token FROM nh_meta WHERE id=1)=?').bind(memberId,groupId,studentId,token),
    db.prepare('INSERT INTO nh_audit(id,action,user_id,created_at,changed_rows) SELECT ?,?,?,?,1 WHERE (SELECT write_token FROM nh_meta WHERE id=1)=?').bind(crypto.randomUUID(),'nh_member_remove',user.sub,now,token),
    db.prepare('SELECT write_token FROM nh_meta WHERE id=1')
  ];
  const result=await db.batch<{write_token:string}>(statements);
  if(result.at(-1)?.results[0]?.write_token!==token)throw new HttpError(409,'Dữ liệu vừa thay đổi. Bấm Tải lại trước khi xóa khỏi nhóm.');
  return {mode:'removed',studentId,message:'Đã xóa học sinh khỏi nhóm. Có thể chọn lại hồ sơ trong Thêm học sinh.'};
}
