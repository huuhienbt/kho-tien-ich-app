/* E-GV v9.3.1 — Kỳ học đủ 8 buổi. Dùng cùng dự án Apps Script với Code.gs. */
const NH_VERSION = '9.3.1';
const NH_SCHEMA = {
  NhomHoc: ['ma_nhom','ten_nhom','nam_hoc','thu_trong_tuan','gio_bat_dau','gio_ket_thuc','giao_vien_id','cach_tinh_hoc_phi','don_gia_vnd','trang_thai','ghi_chu','so_buoi_moi_ky','ky_bat_dau'],
  HocSinh: ['ma_hoc_sinh','ho_ten','lop','trang_thai','ghi_chu'],
  ThanhVienNhom: ['ma_thanh_vien','ma_nhom','ma_hoc_sinh','ngay_vao','ngay_nghi','don_gia_rieng_vnd','trang_thai','ghi_chu'],
  BuoiHoc: ['ma_buoi','ma_nhom','ngay_hoc','gio_bat_dau','gio_ket_thuc','trang_thai','ghi_chu'],
  DiemDanh: ['ma_buoi','ma_hoc_sinh','trang_thai','ghi_chu','nguoi_cap_nhat_id','cap_nhat_luc'],
  ThuHocPhi: ['ma_thu','ma_nhom','ma_hoc_sinh','ky_thu','so_tien_vnd','ngay_dong','phuong_thuc','trang_thai','nguoi_thu_id','ghi_chu'],
  HocPhiKy: ['ma_chot','ma_nhom','ma_hoc_sinh','ky_thu','so_buoi','cach_tinh','don_gia_vnd','phai_thu_vnd','trang_thai','nguoi_chot_id','chot_luc']
};

function nhBook_() {
  return SpreadsheetApp.openById(getSetting('EGV_NH_DATA_ID', true).trim());
}

// Có thể chạy một lần từ trình biên tập; không cần xóa hay thay trang cũ.
function setupNhomHoc() {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const book = nhBook_();
    Object.keys(NH_SCHEMA).forEach(function (name) {
      const sheet = book.getSheetByName(name);
      if (sheet && sheet.getLastRow()) nhTable_({book: book, tables: {}}, name);
    });
    Object.keys(NH_SCHEMA).forEach(function (name) {
      let sheet = book.getSheetByName(name);
      if (!sheet) sheet = book.insertSheet(name);
      const columns = NH_SCHEMA[name];
      if (sheet.getMaxColumns() < columns.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns.length - sheet.getMaxColumns());
      const headers=sheet.getRange(1,1,1,columns.length).getValues()[0];
      columns.forEach(function(h,i){if(!headers[i])sheet.getRange(1,i+1).setValues([[h]]).setFontWeight('bold');});
      sheet.setFrozenRows(1);
    });
    SpreadsheetApp.flush();
    return 'Đã sẵn sàng dữ liệu nhóm học v' + NH_VERSION;
  } finally { lock.releaseLock(); }
}

function nhTable_(ctx, name) {
  if (ctx.tables[name]) return ctx.tables[name];
  const sheet = ctx.book.getSheetByName(name);
  if (!sheet || !sheet.getLastRow()) throw new Error('Thiếu trang ' + name + '. Quản trị cần chạy setupNhomHoc trong Apps Script.');
  const width = NH_SCHEMA[name].length;
  const rows = sheet.getRange(1,1,sheet.getLastRow(),Math.min(width,sheet.getMaxColumns())).getValues();
  // Hai cột cấu hình cuối của NhomHoc có thể chưa có ở bản 9.3.
  if (NH_SCHEMA[name].some(function(h,i){return rows[0][i] !== h && !(name==='NhomHoc' && i>=11 && !rows[0][i]);})) throw new Error('Cấu trúc ' + name + ' khác mẫu. Vui lòng kiểm tra hàng tiêu đề.');
  const items = rows.slice(1).map(function(row,i){
    const item = {_row:i+2};
    NH_SCHEMA[name].forEach(function(h,j){
      const value = row[j];
      item[h] = value instanceof Date ? Utilities.formatDate(value, 'Asia/Ho_Chi_Minh', /gio_/.test(h) ? 'HH:mm' : /^ky_/.test(h) ? 'yyyy-MM' : 'yyyy-MM-dd') : (value===undefined?'':value);
    });
    return item;
  }).filter(function(r){return String(r[NH_SCHEMA[name][0]] || '');});
  const table = {sheet:sheet, items:items, next:rows.length+1, width:width};
  ctx.tables[name] = table; return table;
}

function nhRows_(ctx,name) {return nhTable_(ctx,name).items;}
function nhPublic_(obj) {const copy = Object.assign({},obj); delete copy._row; return copy;}
function nhText_(value,max) {return cleanText(value,max || 500);}
function nhId_(value) {
  const id=String(value || '');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Mã dữ liệu không hợp lệ.');
  return id;
}
function nhDate_(value, optional) {
  const s=String(value || ''); if (!s && optional) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !isFinite(Date.parse(s+'T12:00:00Z')) || new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s) throw new Error('Ngày không hợp lệ.');
  if (s<'2000-01-01' || s>'2100-12-31') throw new Error('Ngày phải thuộc giai đoạn 2000–2100.');
  return s;
}
function nhMonth_(value) {
  const s=String(value || ''); if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new Error('Kỳ thu không hợp lệ.');
  nhDate_(s+'-01'); return s;
}
function nhTime_(value) {
  const s=String(value || ''); if(s && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new Error('Giờ học không hợp lệ.'); return s;
}
function nhMoney_(value,optional) {
  if ((value === '' || value === undefined || value === null) && optional) return '';
  if (value === '' || value === undefined || value === null) throw new Error('Vui lòng nhập số tiền bằng đồng.');
  const n=Number(value); if(!Number.isSafeInteger(n)||n<0||n>1000000000) throw new Error('Số tiền phải là số nguyên từ 0 đến 1 tỷ đồng.'); return n;
}
function nhToday_() {return Utilities.formatDate(new Date(),'Asia/Ho_Chi_Minh','yyyy-MM-dd');}
function nhHash_(value) {return base64WebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value),Utilities.Charset.UTF_8));}
function nhSafeCell_(value) {return typeof value==='string' && /^[=+@-]/.test(value) ? "'"+value : value;}

// Gộp các hàng kề nhau để giảm số lần ghi; không ghi lại các hàng ngoài phạm vi.
function nhWrite_(ctx,name,items) {
  if(!items.length) return;
  const table=nhTable_(ctx,name), columns=NH_SCHEMA[name];
  if(table.sheet.getMaxColumns()<columns.length)table.sheet.insertColumnsAfter(table.sheet.getMaxColumns(),columns.length-table.sheet.getMaxColumns());
  if(name==='NhomHoc'){
    const extra=table.sheet.getRange(1,12,1,2).getValues()[0];
    if(!extra[0] || !extra[1])table.sheet.getRange(1,12,1,2).setValues([columns.slice(11)]).setFontWeight('bold');
  }
  items.forEach(function(item){if(!item._row){item._row=table.next++; table.items.push(item);}});
  const sorted=items.slice().sort(function(a,b){return a._row-b._row;});
  const last=sorted[sorted.length-1]._row;
  if(last>table.sheet.getMaxRows()) table.sheet.insertRowsAfter(table.sheet.getMaxRows(),last-table.sheet.getMaxRows());
  let block=[];
  function flush(){if(!block.length)return;table.sheet.getRange(block[0]._row,1,block.length,columns.length).setValues(block.map(function(item){return columns.map(function(h){return nhSafeCell_(item[h] === undefined ? '' : item[h]);});}));block=[];}
  sorted.forEach(function(item){if(block.length && item._row!==block[block.length-1]._row+1)flush();block.push(item);});flush();
}

function nhGroups_(ctx) {return ctx.admin?nhRows_(ctx,'NhomHoc'):[];}
function nhGroup_(ctx,id) {
  const group=nhGroups_(ctx).find(function(g){return g.ma_nhom===id;});
  if(!group) throw new Error('Không có quyền truy cập nhóm này.');return group;
}
function nhMembers_(ctx,group) {return nhRows_(ctx,'ThanhVienNhom').filter(function(m){return m.ma_nhom===group.ma_nhom;});}
function nhWithin_(member,date) {return member.ngay_vao<=date && (!member.ngay_nghi || member.ngay_nghi>=date);}
function nhBills_(ctx,group,month) {return nhRows_(ctx,'HocPhiKy').filter(function(b){return b.ma_nhom===group.ma_nhom && b.ky_thu===month && b.trang_thai==='da_chot';});}
function nhAssertOpen_(ctx,group,month) {if(nhBills_(ctx,group,month).length)throw new Error('Kỳ này đã chốt học phí. Mở lại kỳ trước khi sửa buổi học hoặc điểm danh.');}
function nhActiveGroup_(g) {if(g.trang_thai!=='dang_hoc')throw new Error('Nhóm đã lưu trữ. Mở lại nhóm trước khi thêm buổi hoặc điểm danh.');}

function nhCycle_(group) {
  const size=Number(group.so_buoi_moi_ky||0);
  if(!size)return null; // Nhóm cũ vẫn chia theo tháng dương lịch.
  if(size!==8)throw new Error('Kỳ học theo số buổi phải gồm 8 buổi.');
  return {size:size,start:nhMonth_(group.ky_bat_dau)};
}
function nhShiftMonth_(month,offset) {
  const parts=month.split('-').map(Number),date=new Date(Date.UTC(parts[0],parts[1]-1+offset,1));
  return nhMonth_(date.toISOString().slice(0,7));
}
// Đếm buổi của nhóm theo ngày thực tế. Buổi hủy không chiếm một suất trong kỳ.
// Lịch đặt trước giữ thứ tự, nhưng chỉ buổi đã đến ngày mới được tính là đã học.
function nhSessionPeriods_(ctx,group,rows) {
  const cycle=nhCycle_(group),start=cycle?cycle.start+'-01':'',source=rows||nhRows_(ctx,'BuoiHoc');
  const sessions=source.filter(function(b){return b.ma_nhom===group.ma_nhom;}).map(nhPublic_);
  sessions.sort(function(a,b){return a.ngay_hoc.localeCompare(b.ngay_hoc)||a.ma_buoi.localeCompare(b.ma_buoi);});
  let count=0;
  sessions.forEach(function(b){
    b.ky_hoc=b.ngay_hoc.slice(0,7);b.thu_tu_ky=0;
    if(!cycle || b.ngay_hoc<start)return;
    b.ky_hoc=nhShiftMonth_(cycle.start,Math.floor(count/cycle.size));
    if(b.trang_thai==='da_hoc'){b.thu_tu_ky=count%cycle.size+1;count++;}
  });
  return sessions;
}
function nhCurrentPeriod_(ctx,group) {
  const cycle=nhCycle_(group);if(!cycle)return nhToday_().slice(0,7);
  const count=nhRows_(ctx,'BuoiHoc').filter(function(b){return b.ma_nhom===group.ma_nhom && b.trang_thai==='da_hoc' && b.ngay_hoc>=cycle.start+'-01' && b.ngay_hoc<=nhToday_();}).length;
  return nhShiftMonth_(cycle.start,Math.floor(count/cycle.size));
}
function nhPeriod_(ctx,group,month,assigned) {
  const all=assigned||nhSessionPeriods_(ctx,group),sessions=all.filter(function(b){return b.ky_hoc===month;}),cycle=nhCycle_(group);
  let start=month+'-01',end=month+'-31';
  const mode=cycle && month>=cycle.start?'eight_sessions':'calendar';
  if(mode==='eight_sessions'){
    const previous=all.filter(function(b){return b.ky_hoc<month && b.trang_thai==='da_hoc';});
    if(sessions.length)start=sessions[0].ngay_hoc;
    else if(previous.length)start=new Date(Date.parse(previous[previous.length-1].ngay_hoc+'T12:00:00Z')+86400000).toISOString().slice(0,10);
    else start=cycle.start+'-01';
    end=sessions.length?sessions[sessions.length-1].ngay_hoc:start;
    if(sessions.filter(function(b){return b.trang_thai==='da_hoc';}).length<cycle.size && end<nhToday_())end=nhToday_();
  }
  const completed=sessions.filter(function(b){return b.trang_thai==='da_hoc' && b.ngay_hoc<=nhToday_();}).length;
  return {sessions:sessions,start:start,end:end,mode:mode,size:mode==='eight_sessions'?cycle.size:0,completed:completed,current:nhCurrentPeriod_(ctx,group)};
}
// Thêm ngược ngày/hủy buổi không được dịch các buổi vào hoặc ra khỏi kỳ đã chốt.
function nhAssertPeriodChangesOpen_(ctx,group,before,after) {
  const months=Array.from(new Set(nhRows_(ctx,'HocPhiKy').filter(function(b){return b.ma_nhom===group.ma_nhom && b.trang_thai==='da_chot';}).map(function(b){return b.ky_thu;})));
  months.forEach(function(month){
    function signature(rows){return JSON.stringify(rows.filter(function(b){return b.ky_hoc===month;}).map(function(b){return [b.ma_buoi,b.ngay_hoc,b.trang_thai];}));}
    if(signature(before)!==signature(after))throw new Error('Thay đổi này làm dịch buổi học của kỳ '+month+' đã chốt. Mở lại kỳ liên quan trước khi sửa.');
  });
}

function nhBoot_(ctx) {
  const groups=nhGroups_(ctx), ids=groups.map(function(g){return g.ma_nhom;});
  const memberIds=nhRows_(ctx,'ThanhVienNhom').filter(function(m){return ids.indexOf(m.ma_nhom)!==-1;}).map(function(m){return m.ma_hoc_sinh;});
  const students=nhRows_(ctx,'HocSinh').filter(function(s){return memberIds.indexOf(s.ma_hoc_sinh)!==-1;}).map(nhPublic_);
  let teachers=[];
  if(ctx.admin) teachers=getSheetObjects('Users').filter(function(u){return String(u.status||'active')==='active';}).map(function(u){return {id:String(u.id),name:String(u.name||''),email:String(u.email||'')};});
  return {groups:groups.map(function(g){return Object.assign(nhPublic_(g),{ky_hien_tai:nhCurrentPeriod_(ctx,g)});}),students:students,teachers:teachers,admin:ctx.admin,today:nhToday_(),version:NH_VERSION,periodModel:'eight_sessions'};
}

function nhView_(ctx,group,month) {
  const period=nhPeriod_(ctx,group,month),start=period.start,end=period.end;
  const members=nhMembers_(ctx,group).filter(function(m){return m.ngay_vao<=end && (!m.ngay_nghi || m.ngay_nghi>=start);});
  const studentMap={};nhRows_(ctx,'HocSinh').forEach(function(s){studentMap[s.ma_hoc_sinh]=s;});
  const roster=members.map(function(m){return Object.assign(nhPublic_(studentMap[m.ma_hoc_sinh]||{ho_ten:'Học sinh chưa có hồ sơ'}),nhPublic_(m));});
  roster.sort(function(a,b){return a.ho_ten.localeCompare(b.ho_ten,'vi');});
  const sessions=period.sessions;
  const ids=sessions.map(function(b){return b.ma_buoi;});
  const marks=nhRows_(ctx,'DiemDanh').filter(function(m){return ids.indexOf(m.ma_buoi)!==-1;}).map(nhPublic_);
  const receipts=nhRows_(ctx,'ThuHocPhi').filter(function(p){return p.ma_nhom===group.ma_nhom && p.ky_thu===month;}).map(nhPublic_);
  const bills=nhBills_(ctx,group,month).map(nhPublic_);
  // Học sinh đã có tiền/bản chốt vẫn được hiển thị nếu sau này sửa ngày tham gia.
  bills.concat(receipts).forEach(function(p){
    if(!roster.some(function(r){return r.ma_hoc_sinh===p.ma_hoc_sinh;})){
      const m=nhMembers_(ctx,group).find(function(x){return x.ma_hoc_sinh===p.ma_hoc_sinh;});
      if(m)roster.push(Object.assign(nhPublic_(studentMap[m.ma_hoc_sinh]||{}),nhPublic_(m)));
    }
  });
  const fees=roster.map(function(m){
    const attended=sessions.filter(function(b){return b.trang_thai==='da_hoc' && b.ngay_hoc<=nhToday_() && nhWithin_(m,b.ngay_hoc) && marks.some(function(d){return d.ma_buoi===b.ma_buoi && d.ma_hoc_sinh===m.ma_hoc_sinh && d.trang_thai==='co_mat';});}).length;
    const bill=bills.find(function(b){return b.ma_hoc_sinh===m.ma_hoc_sinh;});
    const eligible=m.ngay_vao<=end && (!m.ngay_nghi || m.ngay_nghi>=start);
    const rate=m.don_gia_rieng_vnd==='' ? Number(group.don_gia_vnd) : Number(m.don_gia_rieng_vnd);
    const due=bill ? Number(bill.phai_thu_vnd) : (eligible ? (group.cach_tinh_hoc_phi==='theo_buoi' ? attended*rate : rate) : 0);
    const paid=receipts.filter(function(p){return p.ma_hoc_sinh===m.ma_hoc_sinh && p.trang_thai==='da_thu';}).reduce(function(n,p){return n+Number(p.so_tien_vnd);},0);
    return {studentId:m.ma_hoc_sinh,attended:attended,rate:bill?Number(bill.don_gia_vnd):rate,due:due,paid:paid,balance:due-paid,closed:!!bill};
  });
  sessions.forEach(function(b){b.revision=nhHash_([b,marks.filter(function(m){return m.ma_buoi===b.ma_buoi;}),roster.map(function(m){return [m.ma_hoc_sinh,m.ngay_vao,m.ngay_nghi];})]);});
  const view={group:nhPublic_(group),month:month,period:{mode:period.mode,size:period.size,completed:period.completed,current:period.current,start:start,end:end},roster:roster,sessions:sessions,marks:marks,receipts:receipts,fees:fees,closed:bills.length>0,today:nhToday_()};
  view.revision=nhHash_(view);return view;
}

function handleNhomHoc(payload) {
  const principal=resolvePrincipal(payload);
  if(!principal) return createResponse({status:'error',message:'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'});
  if(principal.role!=='admin')return createResponse({status:'error',message:'Chỉ tài khoản quản trị được xem và quản lý nhóm học.'});
  const action=String(payload.action),data=payload.data||{};
  const allowed=['nh_boot','nh_view','nh_group_save','nh_students_save','nh_member_save','nh_session_save','nh_attendance_save','nh_receipt_save','nh_receipt_void','nh_close_month','nh_reopen_month'];
  if(allowed.indexOf(action)===-1)throw new Error('Lệnh nhóm học không hợp lệ.');
  const write=action!=='nh_boot' && action!=='nh_view';
  const lock=write?LockService.getScriptLock():null;
  if(lock)lock.waitLock(10000);
  try {
    const ctx={book:nhBook_(),tables:{},user:principal,admin:principal.role==='admin'};
    let result;
    if(action==='nh_boot') result=nhBoot_(ctx);
    else if(action==='nh_group_save') result=nhSaveGroup_(ctx,data);
    else {
      const group=nhGroup_(ctx,nhId_(data.groupId));
      if(action==='nh_view')result=nhView_(ctx,group,nhMonth_(data.month));
      else if(action==='nh_students_save')result=nhSaveStudents_(ctx,group,data);
      else if(action==='nh_member_save')result=nhSaveMember_(ctx,group,data);
      else if(action==='nh_session_save')result=nhSaveSession_(ctx,group,data);
      else if(action==='nh_attendance_save')result=nhSaveAttendance_(ctx,group,data);
      else if(action==='nh_receipt_save')result=nhSaveReceipt_(ctx,group,data);
      else if(action==='nh_receipt_void')result=nhVoidReceipt_(ctx,group,data);
      else if(action==='nh_close_month')result=nhCloseMonth_(ctx,group,data);
      else result=nhReopenMonth_(ctx,group,data);
    }
    if(write)SpreadsheetApp.flush();
    return createResponse({status:'success',data:result,version:NH_VERSION});
  } finally {if(lock)lock.releaseLock();}
}

function nhSaveGroup_(ctx,data) {
  const id=nhId_(data.id),all=nhRows_(ctx,'NhomHoc');
  const old=all.find(function(g){return g.ma_nhom===id;});
  if(!old && !ctx.admin)throw new Error('Chỉ quản trị được tạo nhóm.');
  if(old)nhGroup_(ctx,id);
  const name=nhText_(data.name,100);if(!name)throw new Error('Vui lòng nhập tên nhóm.');
  const mode=data.mode;if(['theo_buoi','theo_thang'].indexOf(mode)===-1)throw new Error('Cách tính học phí không hợp lệ.');
  let teacher=old?old.giao_vien_id:'admin';
  if(ctx.admin){
    teacher=nhId_(data.teacher||'admin');
    if(teacher!=='admin' && !getSheetObjects('Users').some(function(u){return String(u.id)===teacher && String(u.status||'active')==='active';}))throw new Error('Tài khoản giáo viên không tồn tại hoặc đã khóa.');
  } else if(data.teacher && data.teacher!==teacher)throw new Error('Chỉ quản trị được giao nhóm.');
  const days=String(data.days||'').trim();
  if(days && !/^(?:[2-7]|CN)(?:,(?:[2-7]|CN))*$/.test(days))throw new Error('Thứ học ghi dạng 2,4 hoặc 3,5 hoặc CN.');
  const from=nhTime_(data.start),to=nhTime_(data.end);if(from && to && to<=from)throw new Error('Giờ kết thúc phải sau giờ bắt đầu.');
  const size=data.cycleSize===undefined?Number(old&&old.so_buoi_moi_ky||0):Number(data.cycleSize);
  if(size!==0 && size!==8)throw new Error('Chọn kỳ 8 buổi hoặc tháng dương lịch.');
  const cycleStart=size?nhMonth_(data.cycleStart===undefined?old&&old.ky_bat_dau:data.cycleStart):'';
  if(old && (size!==Number(old.so_buoi_moi_ky||0) || cycleStart!==String(old.ky_bat_dau||'')) && nhRows_(ctx,'HocPhiKy').some(function(b){return b.ma_nhom===id && b.trang_thai==='da_chot';}))throw new Error('Mở lại các kỳ đã chốt trước khi đổi cách chia kỳ học.');
  const group=old||{};
  Object.assign(group,{ma_nhom:id,ten_nhom:name,nam_hoc:nhText_(data.year,20),thu_trong_tuan:days,gio_bat_dau:from,gio_ket_thuc:to,giao_vien_id:teacher,cach_tinh_hoc_phi:mode,don_gia_vnd:nhMoney_(data.rate),trang_thai:data.archived?'luu_tru':'dang_hoc',ghi_chu:nhText_(data.note),so_buoi_moi_ky:size,ky_bat_dau:cycleStart});
  nhWrite_(ctx,'NhomHoc',[group]);return {id:id};
}

function nhSaveStudents_(ctx,group,data) {
  nhActiveGroup_(group);
  const date=nhDate_(data.joinDate),members=nhMembers_(ctx,group),students=nhRows_(ctx,'HocSinh');
  if(!Array.isArray(data.students)||!data.students.length||data.students.length>100)throw new Error('Mỗi lần thêm từ 1 đến 100 học sinh.');
  const accessible=nhBoot_(ctx).students.map(function(s){return s.ma_hoc_sinh;});
  const studentWrites=[],memberWrites=[],seen={};
  data.students.forEach(function(input){
    const id=nhId_(input.id),memberId=nhId_(input.memberId);
    if(seen[id])throw new Error('Danh sách có mã học sinh trùng.');seen[id]=true;
    const found=students.find(function(s){return s.ma_hoc_sinh===id;});
    const previous=members.find(function(m){return m.ma_hoc_sinh===id;});
    if(previous)return; // Thử lại cùng mã không tạo bản sao.
    if(found && !ctx.admin && accessible.indexOf(id)===-1)throw new Error('Không có quyền thêm hồ sơ học sinh này.');
    if(nhRows_(ctx,'ThanhVienNhom').some(function(m){return m.ma_thanh_vien===memberId;}))throw new Error('Mã thành viên đã được sử dụng.');
    if(!found){
      const name=nhText_(input.name,120);if(!name)throw new Error('Thiếu họ tên học sinh.');
      studentWrites.push({ma_hoc_sinh:id,ho_ten:name,lop:nhText_(input.className,40),trang_thai:'dang_hoc',ghi_chu:''});
    }
    // Không bổ sung ngược vào kỳ đã chốt vì có thể làm thay đổi danh sách tính phí.
    if(nhRows_(ctx,'HocPhiKy').some(function(b){return b.ma_nhom===group.ma_nhom && b.trang_thai==='da_chot' && nhPeriod_(ctx,group,b.ky_thu).end>=date;}))throw new Error('Ngày vào nằm trong hoặc trước kỳ đã chốt. Chọn ngày sau kỳ chốt hoặc mở lại kỳ.');
    memberWrites.push({ma_thanh_vien:memberId,ma_nhom:group.ma_nhom,ma_hoc_sinh:id,ngay_vao:date,ngay_nghi:'',don_gia_rieng_vnd:'',trang_thai:'dang_hoc',ghi_chu:''});
  });
  nhWrite_(ctx,'HocSinh',studentWrites);nhWrite_(ctx,'ThanhVienNhom',memberWrites);return {added:memberWrites.length};
}

function nhSaveMember_(ctx,group,data) {
  const m=nhMembers_(ctx,group).find(function(x){return x.ma_thanh_vien===data.memberId;});if(!m)throw new Error('Không tìm thấy học sinh trong nhóm.');
  const student=nhRows_(ctx,'HocSinh').find(function(s){return s.ma_hoc_sinh===m.ma_hoc_sinh;});
  if(!student)throw new Error('Không tìm thấy hồ sơ học sinh.');
  const name=nhText_(data.name===undefined?student.ho_ten:data.name,120),className=nhText_(data.className===undefined?student.lop:data.className,40);
  if(!name)throw new Error('Vui lòng nhập họ tên học sinh.');
  const editProfile=name!==student.ho_ten || className!==student.lop;
  if(editProfile && !ctx.admin){
    const own=nhGroups_(ctx).map(function(g){return g.ma_nhom;});
    if(nhRows_(ctx,'ThanhVienNhom').some(function(x){return x.ma_hoc_sinh===m.ma_hoc_sinh && own.indexOf(x.ma_nhom)===-1;}))throw new Error('Học sinh có hồ sơ dùng chung với nhóm khác. Nhờ quản trị sửa họ tên/lớp.');
  }
  const join=nhDate_(data.joinDate),leave=nhDate_(data.leaveDate,true);
  if(leave && leave<join)throw new Error('Ngày nghỉ không thể trước ngày vào.');
  if(join!==m.ngay_vao || leave!==m.ngay_nghi){
    if(nhRows_(ctx,'HocPhiKy').some(function(b){
      if(b.ma_nhom!==group.ma_nhom || b.ma_hoc_sinh!==m.ma_hoc_sinh || b.trang_thai!=='da_chot')return false;
      const period=nhPeriod_(ctx,group,b.ky_thu),first=period.start,last=period.end;
      const previous=[m.ngay_vao>first?m.ngay_vao:first,m.ngay_nghi&&m.ngay_nghi<last?m.ngay_nghi:last];
      const next=[join>first?join:first,leave&&leave<last?leave:last];
      return JSON.stringify(previous)!==JSON.stringify(next);
    }))throw new Error('Ngày tham gia mới ảnh hưởng kỳ đã chốt. Mở lại kỳ liên quan trước khi sửa.');
    const dates={};nhRows_(ctx,'BuoiHoc').forEach(function(b){if(b.ma_nhom===group.ma_nhom)dates[b.ma_buoi]=b.ngay_hoc;});
    if(nhRows_(ctx,'DiemDanh').some(function(d){return d.ma_hoc_sinh===m.ma_hoc_sinh && dates[d.ma_buoi] && d.trang_thai!=='chua_diem_danh' && !nhWithin_({ngay_vao:join,ngay_nghi:leave},dates[d.ma_buoi]);}))throw new Error('Ngày tham gia mới loại bỏ buổi đã điểm danh. Sửa điểm danh trước.');
  }
  Object.assign(m,{ngay_vao:join,ngay_nghi:leave,don_gia_rieng_vnd:nhMoney_(data.rate,true),trang_thai:leave?'nghi_hoc':'dang_hoc',ghi_chu:nhText_(data.note)});
  if(editProfile){student.ho_ten=name;student.lop=className;nhWrite_(ctx,'HocSinh',[student]);}
  nhWrite_(ctx,'ThanhVienNhom',[m]);return {saved:true};
}

function nhSaveSession_(ctx,group,data) {
  nhActiveGroup_(group);const date=nhDate_(data.date);
  const sessions=nhRows_(ctx,'BuoiHoc');
  const existing=sessions.find(function(b){return b.ma_nhom===group.ma_nhom && b.ngay_hoc===date;});
  const before=nhSessionPeriods_(ctx,group),oldPeriod=existing?before.find(function(b){return b.ma_buoi===existing.ma_buoi;}).ky_hoc:null;
  if(oldPeriod)nhAssertOpen_(ctx,group,oldPeriod);
  const id=existing?existing.ma_buoi:nhId_(data.id);
  if(!existing && sessions.some(function(b){return b.ma_buoi===id;}))throw new Error('Mã buổi học đã được sử dụng.');
  if(existing && !data.update)return {id:id,month:oldPeriod};
  if(existing && data.revision){
    const current=nhView_(ctx,group,oldPeriod).sessions.find(function(b){return b.ma_buoi===id;});
    if(current.revision!==data.revision)throw new Error('Buổi học vừa được cập nhật. Tải lại trước khi sửa.');
  }
  if(data.update && !data.revision)throw new Error('Thiếu phiên bản buổi học. Tải lại dữ liệu.');
  const from=nhTime_(data.start||group.gio_bat_dau),to=nhTime_(data.end||group.gio_ket_thuc);
  if(from && to && to<=from)throw new Error('Giờ kết thúc phải sau giờ bắt đầu.');
  const cycle=nhCycle_(group);if(cycle && !existing && date<cycle.start+'-01')throw new Error('Ngày học phải từ kỳ bắt đầu '+cycle.start+' trở đi.');
  const item=Object.assign({},existing||{});
  Object.assign(item,{ma_buoi:id,ma_nhom:group.ma_nhom,ngay_hoc:date,gio_bat_dau:from,gio_ket_thuc:to,trang_thai:data.cancelled?'da_huy':'da_hoc',ghi_chu:nhText_(data.note)});
  const after=nhSessionPeriods_(ctx,group,sessions.filter(function(b){return b.ma_buoi!==id;}).concat([item]));
  const period=after.find(function(b){return b.ma_buoi===id;}).ky_hoc;
  nhAssertOpen_(ctx,group,period);nhAssertPeriodChangesOpen_(ctx,group,before,after);
  if(existing)Object.assign(existing,item);
  nhWrite_(ctx,'BuoiHoc',[existing||item]);return {id:id,month:period};
}

function nhSaveAttendance_(ctx,group,data) {
  nhActiveGroup_(group);
  const session=nhRows_(ctx,'BuoiHoc').find(function(b){return b.ma_buoi===data.sessionId && b.ma_nhom===group.ma_nhom;});
  if(!session || session.trang_thai==='da_huy')throw new Error('Buổi học không tồn tại hoặc đã hủy.');
  if(session.ngay_hoc>nhToday_())throw new Error('Chỉ điểm danh khi đến ngày học.');
  const period=nhSessionPeriods_(ctx,group).find(function(b){return b.ma_buoi===session.ma_buoi;}).ky_hoc;
  nhAssertOpen_(ctx,group,period);
  const current=nhView_(ctx,group,period).sessions.find(function(b){return b.ma_buoi===session.ma_buoi;});
  if(data.revision!==current.revision)throw new Error('Điểm danh vừa thay đổi ở phiên khác. Tải lại để tránh ghi đè.');
  if(!Array.isArray(data.marks)||data.marks.length>200)throw new Error('Danh sách điểm danh không hợp lệ.');
  const eligible=nhMembers_(ctx,group).filter(function(m){return nhWithin_(m,session.ngay_hoc);}).map(function(m){return m.ma_hoc_sinh;});
  const all=nhRows_(ctx,'DiemDanh'),now=new Date().toISOString(),seen={};
  const writes=data.marks.map(function(d){
    if(eligible.indexOf(d.studentId)===-1 || seen[d.studentId])throw new Error('Học sinh không thuộc buổi học hoặc bị trùng.');seen[d.studentId]=true;
    if(['co_mat','vang','chua_diem_danh'].indexOf(d.status)===-1)throw new Error('Trạng thái điểm danh không hợp lệ.');
    const old=all.find(function(m){return m.ma_buoi===session.ma_buoi && m.ma_hoc_sinh===d.studentId;});
    return Object.assign({},old||{},{ma_buoi:session.ma_buoi,ma_hoc_sinh:d.studentId,trang_thai:d.status,ghi_chu:nhText_(d.note,250),nguoi_cap_nhat_id:ctx.user.sub,cap_nhat_luc:now});
  });
  nhWrite_(ctx,'DiemDanh',writes);return {saved:writes.length};
}

function nhSaveReceipt_(ctx,group,data) {
  const id=nhId_(data.id),month=nhMonth_(data.month),amount=nhMoney_(data.amount);
  if(!amount)throw new Error('Số tiền đóng phải lớn hơn 0.');
  if(!nhMembers_(ctx,group).some(function(m){return m.ma_hoc_sinh===data.studentId;}))throw new Error('Học sinh không thuộc nhóm.');
  const date=nhDate_(data.date);if(date>nhToday_())throw new Error('Ngày đóng tiền không thể ở tương lai.');
  const old=nhRows_(ctx,'ThuHocPhi').find(function(p){return p.ma_thu===id;});
  if(old){
    if(old.ma_nhom!==group.ma_nhom || old.ma_hoc_sinh!==data.studentId || old.ky_thu!==month || Number(old.so_tien_vnd)!==amount || old.ngay_dong!==date)throw new Error('Mã thu đã tồn tại với nội dung khác. Tải lại để kiểm tra.');
    return {id:id,repeated:true};
  }
  if(['tien_mat','chuyen_khoan','khac'].indexOf(data.method)===-1)throw new Error('Phương thức thu không hợp lệ.');
  nhWrite_(ctx,'ThuHocPhi',[{ma_thu:id,ma_nhom:group.ma_nhom,ma_hoc_sinh:nhId_(data.studentId),ky_thu:month,so_tien_vnd:amount,ngay_dong:date,phuong_thuc:data.method,trang_thai:'da_thu',nguoi_thu_id:ctx.user.sub,ghi_chu:nhText_(data.note)}]);return {id:id};
}
function nhVoidReceipt_(ctx,group,data) {
  const receipt=nhRows_(ctx,'ThuHocPhi').find(function(p){return p.ma_thu===data.id && p.ma_nhom===group.ma_nhom;});
  if(!receipt)throw new Error('Không tìm thấy lần thu.');if(receipt.trang_thai==='da_huy')return {saved:true};
  const reason=nhText_(data.reason,200);if(!reason)throw new Error('Vui lòng ghi lý do hủy.');
  receipt.trang_thai='da_huy';receipt.ghi_chu=nhText_(receipt.ghi_chu+' | Hủy: '+reason+' ('+ctx.user.sub+', '+new Date().toISOString()+')',800);
  nhWrite_(ctx,'ThuHocPhi',[receipt]);return {saved:true};
}
function nhCloseMonth_(ctx,group,data) {
  const month=nhMonth_(data.month),view=nhView_(ctx,group,month);
  if(view.closed)return {saved:true,repeated:true};
  if(view.revision!==data.revision)throw new Error('Dữ liệu kỳ vừa thay đổi. Tải lại trước khi chốt.');
  if(view.period.mode==='eight_sessions'){
    if(view.period.completed<view.period.size)throw new Error('Kỳ này mới học '+view.period.completed+'/'+view.period.size+' buổi. Đủ 8 buổi mới chốt kỳ.');
  }else if(month>nhToday_().slice(0,7))throw new Error('Không chốt học phí tháng tương lai.');
  if(!view.roster.length)throw new Error('Kỳ này chưa có học sinh.');
  view.sessions.filter(function(b){return b.trang_thai==='da_hoc';}).forEach(function(b){
    if(b.ngay_hoc>nhToday_())throw new Error('Còn buổi học chưa đến ngày.');
    view.roster.filter(function(m){return nhWithin_(m,b.ngay_hoc);}).forEach(function(m){
      if(!view.marks.some(function(d){return d.ma_buoi===b.ma_buoi && d.ma_hoc_sinh===m.ma_hoc_sinh && ['co_mat','vang'].indexOf(d.trang_thai)!==-1;}))throw new Error('Còn học sinh chưa điểm danh ngày '+b.ngay_hoc+'.');
    });
  });
  nhWrite_(ctx,'HocPhiKy',view.fees.map(function(f){return {ma_chot:Utilities.getUuid(),ma_nhom:group.ma_nhom,ma_hoc_sinh:f.studentId,ky_thu:month,so_buoi:f.attended,cach_tinh:group.cach_tinh_hoc_phi,don_gia_vnd:f.rate,phai_thu_vnd:f.due,trang_thai:'da_chot',nguoi_chot_id:ctx.user.sub,chot_luc:new Date().toISOString()};}));
  return {saved:true};
}
function nhReopenMonth_(ctx,group,data) {
  const month=nhMonth_(data.month),view=nhView_(ctx,group,month);
  if(!view.closed)return {saved:true};
  if(view.revision!==data.revision)throw new Error('Dữ liệu kỳ vừa thay đổi. Tải lại trước khi mở kỳ.');
  const bills=nhBills_(ctx,group,month);bills.forEach(function(b){b.trang_thai='da_mo_lai';});nhWrite_(ctx,'HocPhiKy',bills);return {saved:true};
}
