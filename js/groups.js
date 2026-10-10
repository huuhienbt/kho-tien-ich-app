(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => App.escapeHTML(String(value ?? ''));
  const money = value => Number(value || 0).toLocaleString('vi-VN') + ' đ';
  const dateLabel = value => String(value || '').split('-').reverse().join('/');
  const uid = () => window.crypto.randomUUID();
  const state = {boot:null,view:null,groupId:'',month:'',sessionId:'',tab:'attendance',draft:{},dirty:false,busy:false,epoch:0,submit:null};
  const statusLabel = {co_mat:'Có mặt',vang:'Vắng',chua_diem_danh:'Chưa điểm danh'};
  const message = (text,error=false) => { $('nhFeedback').textContent=text; $('nhFeedback').className='nh-feedback'+(error?' error':''); $('nhFeedback').hidden=!text; };
  const call = async (action,data={}) => {
    const epoch=state.epoch;
    const result=await App.apiPost(action,data,{userAuth:true,timeoutMs:60000,timeoutMessage:'Chưa nhận được phản hồi. Tải lại để kiểm tra dữ liệu trước khi nhập lại.'});
    if(epoch!==state.epoch)throw new Error('Phiên làm việc đã thay đổi.');
    return result.data;
  };
  const within = (m,date) => m.ngay_vao<=date && (!m.ngay_nghi || m.ngay_nghi>=date);
  const selectedSession = () => state.view?.sessions.find(s=>s.ma_buoi===state.sessionId);
  const discard = () => !state.dirty || window.confirm('Điểm danh chưa lưu. Bỏ các thay đổi này?');
  function busy(on,text='Đang tải dữ liệu…') {
    state.busy=on; $('nhBusy').hidden=!on; $('nhBusyText').textContent=text;
    $('nhWorkspace').setAttribute('aria-busy',String(on));
    $('nhForm').querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=on);
  }
  function resetAuth() {
    state.epoch++; state.boot=null; state.view=null; state.dirty=false; state.draft={}; state.groupId='';
    $('nhDialog').close(); state.submit=null;
    ['nhStats','nhAttendance','nhStudents','nhFees','nhGroup'].forEach(id=>$(id).replaceChildren());
    $('nhWorkspace').hidden=true; $('nhGroupContent').hidden=true; $('nhAddGroup').hidden=true; message('');
    $('nhGate').hidden=App.isAuthenticated();
    busy(false);
    if(App.isAuthenticated()) boot();
  }
  async function boot() {
    const epoch=state.epoch; busy(true);
    try {
      const data=await call('nh_boot'); if(epoch!==state.epoch)return;
      state.boot=data; state.month=state.month||data.today.slice(0,7); $('nhMonth').value=state.month;
      $('nhWorkspace').hidden=false; $('nhAddGroup').hidden=!data.admin;
      paintGroupSelect();
      if(state.groupId)await loadView(epoch); else paintEmpty();
      message('');
    } catch(error) {if(epoch===state.epoch){message(error.message,true);$('nhWorkspace').hidden=false;paintEmpty('Không tải được danh sách. Kiểm tra kết nối rồi bấm Tải lại.');}}
    finally {if(epoch===state.epoch)busy(false);}
  }
  function paintGroupSelect() {
    const groups=state.boot?.groups||[];
    if(!groups.some(g=>g.ma_nhom===state.groupId))state.groupId=(groups.find(g=>g.trang_thai==='dang_hoc')||groups[0])?.ma_nhom||'';
    $('nhGroup').innerHTML=groups.map(g=>`<option value="${esc(g.ma_nhom)}">${esc(g.ten_nhom)}${g.trang_thai==='luu_tru'?' · Đã lưu trữ':''}</option>`).join('');
    $('nhGroup').value=state.groupId;
  }
  function paintEmpty(text) {
    $('nhEmpty').hidden=false; $('nhGroupContent').hidden=true; $('nhEditGroup').hidden=true;
    $('nhEmptyText').textContent=text||(state.boot?.admin?'Bấm Tạo nhóm để thêm nhóm học đầu tiên.':'Chưa có nhóm được giao cho tài khoản này. Liên hệ quản trị để được phân công.');
  }
  async function loadView(epoch=state.epoch) {
    const groupId=state.groupId,month=state.month;
    $('nhGroupContent').hidden=true; $('nhEmpty').hidden=true;
    const data=await call('nh_view',{groupId,month});
    if(epoch!==state.epoch || groupId!==state.groupId || month!==state.month)return;
    state.view=data; state.dirty=false;
    if(!data.sessions.some(s=>s.ma_buoi===state.sessionId))state.sessionId=(data.sessions.find(s=>s.ngay_hoc===data.today)||data.sessions[data.sessions.length-1])?.ma_buoi||'';
    buildDraft(); paint();
  }
  async function reload() {
    if(!discard())return; state.dirty=false;
    if(!state.boot)return boot();
    const epoch=state.epoch; busy(true); message('');
    try {await loadView(epoch);} catch(error){if(epoch===state.epoch){message(error.message,true);paintEmpty('Không tải được dữ liệu nhóm. Bấm Tải lại để thử lại.');}}
    finally {if(epoch===state.epoch)busy(false);}
  }
  function buildDraft() {
    state.draft={}; const session=selectedSession(); if(!session)return;
    state.view.roster.filter(m=>within(m,session.ngay_hoc)).forEach(m=>{
      const mark=state.view.marks.find(d=>d.ma_buoi===session.ma_buoi && d.ma_hoc_sinh===m.ma_hoc_sinh);
      state.draft[m.ma_hoc_sinh]={status:mark?.trang_thai||'chua_diem_danh',note:mark?.ghi_chu||''};
    });
  }
  function paint() {
    const v=state.view;if(!v)return;
    $('nhEmpty').hidden=true; $('nhGroupContent').hidden=false; $('nhEditGroup').hidden=false;
    const g=v.group;
    $('nhGroupHint').textContent=[g.nam_hoc,g.thu_trong_tuan?'Thứ '+g.thu_trong_tuan.replaceAll(',',', '):'',g.gio_bat_dau?g.gio_bat_dau+'–'+g.gio_ket_thuc:'',money(g.don_gia_vnd)+(g.cach_tinh_hoc_phi==='theo_buoi'?'/buổi có mặt':'/tháng')].filter(Boolean).join(' · ');
    const due=v.fees.reduce((n,f)=>n+f.due,0),paid=v.fees.reduce((n,f)=>n+f.paid,0),balance=v.fees.reduce((n,f)=>n+Math.max(0,f.balance),0);
    const stats=[['Học sinh trong tháng',v.roster.length,v.sessions.filter(s=>s.trang_thai==='da_hoc').length+' buổi học'],[v.closed?'Phải thu đã chốt':'Phải thu tạm tính',money(due),v.closed?'Đơn giá đã được lưu theo kỳ':'Chốt tháng sau khi điểm danh đủ'],['Đã thu',money(paid),'Các lần thu còn hiệu lực'],['Còn thiếu',money(balance),'Tổng phần thiếu của từng học sinh']];
    $('nhStats').innerHTML=stats.map(([label,value,hint])=>`<article class="nh-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></article>`).join('');
    paintAttendance();paintStudents();paintFees();paintTab();
  }
  function paintTab() {
    const ids={attendance:'nhAttendance',students:'nhStudents',fees:'nhFees'};
    Object.entries(ids).forEach(([key,id])=>$(id).hidden=state.tab!==key);
    document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===state.tab)));
  }
  function paintAttendance() {
    const v=state.view,s=selectedSession();
    const writable=!!s && !v.closed && s.trang_thai!=='da_huy' && s.ngay_hoc<=v.today && v.group.trang_thai==='dang_hoc';
    const sessions=v.sessions.map(b=>{
      const eligible=v.roster.filter(m=>within(m,b.ngay_hoc));
      const count=eligible.filter(m=>v.marks.some(d=>d.ma_buoi===b.ma_buoi && d.ma_hoc_sinh===m.ma_hoc_sinh && d.trang_thai==='co_mat')).length;
      return `<button type="button" class="nh-session-button" data-session="${esc(b.ma_buoi)}" aria-pressed="${b.ma_buoi===state.sessionId}"><span><strong>${esc(dateLabel(b.ngay_hoc))}</strong><small>${esc(b.gio_bat_dau||'Chưa đặt giờ')}</small></span><span class="nh-pill ${b.trang_thai==='da_huy'?'':'green'}">${b.trang_thai==='da_huy'?'Đã hủy':count+'/'+eligible.length}</span></button>`;
    }).join('');
    let content='<h2>Chọn buổi học</h2><p class="nh-muted">Thêm buổi học theo ngày, sau đó điểm danh từng học sinh.</p>';
    if(s){
      const roster=v.roster.filter(m=>within(m,s.ngay_hoc));
      content=`<div class="nh-card-heading"><div><h2>Ngày ${esc(dateLabel(s.ngay_hoc))}</h2><p>${roster.length} học sinh · ${esc(s.gio_bat_dau)}–${esc(s.gio_ket_thuc)}</p></div><button type="button" class="nh-link" data-action="edit-session" ${v.closed?'disabled':''}>Sửa buổi học</button></div>
      ${v.closed?'<p class="nh-feedback">Tháng đã chốt. Mở lại ở mục Học phí nếu cần sửa điểm danh.</p>':''}
      ${s.trang_thai==='da_huy'?'<p class="nh-feedback">Buổi học đã hủy, không tính học phí theo buổi.</p>':''}
      ${s.ngay_hoc>v.today?'<p class="nh-feedback">Chưa đến ngày học. Có thể điểm danh từ ngày diễn ra buổi học.</p>':''}
      <div class="nh-actions"><button type="button" class="btn btn-secondary" data-action="all-present" ${!writable?'disabled':''}>✓ Tất cả có mặt</button><span class="nh-caption" id="nhDraftCount"></span></div>
      <div class="nh-table-wrap"><table class="nh-table nh-attendance-table"><thead><tr><th>Học sinh</th><th>Điểm danh</th><th>Ghi chú</th></tr></thead><tbody>${roster.map(m=>{
        const d=state.draft[m.ma_hoc_sinh]||{status:'chua_diem_danh',note:''};
        return `<tr><td><strong>${esc(m.ho_ten)}</strong><small>${esc(m.lop)}</small></td><td><div class="nh-mark-controls">${Object.entries(statusLabel).map(([key,label])=>`<button type="button" data-mark="${key}" data-student="${esc(m.ma_hoc_sinh)}" aria-pressed="${d.status===key}" ${!writable?'disabled':''}>${label}</button>`).join('')}</div></td><td><input class="form-control" aria-label="Ghi chú ${esc(m.ho_ten)}" data-note="${esc(m.ma_hoc_sinh)}" maxlength="250" value="${esc(d.note)}" ${!writable?'disabled':''}></td></tr>`;
      }).join('')}</tbody></table></div>${!roster.length?'<p class="nh-muted">Chưa có học sinh tham gia vào ngày này. Thêm danh sách tại mục Học sinh.</p>':''}
      <div class="nh-save-bar"><p id="nhSaveHint">${state.dirty?'Có thay đổi chưa lưu.':'Điểm danh đã đồng bộ.'}</p><button type="button" class="btn btn-primary" data-action="save-attendance" id="nhSaveAttendance" ${!writable||!state.dirty?'disabled':''}>Lưu điểm danh</button></div>`;
    }
    $('nhAttendance').innerHTML=`<div class="nh-attendance-layout"><aside class="nh-session-list"><h2>Buổi học trong tháng</h2><button class="btn btn-secondary" type="button" data-action="new-session" ${v.closed||v.group.trang_thai!=='dang_hoc'?'disabled':''}>+ Thêm buổi học</button><div class="nh-session-items">${sessions||'<p class="nh-caption">Chưa có buổi học.</p>'}</div></aside><div class="nh-card">${content}</div></div>`;
    updateDraftUi();
  }
  function updateDraftUi() {
    if(!$('nhDraftCount'))return;
    const list=Object.values(state.draft),present=list.filter(d=>d.status==='co_mat').length,absent=list.filter(d=>d.status==='vang').length;
    $('nhDraftCount').textContent=`Có mặt ${present} · Vắng ${absent} · Chưa điểm danh ${list.length-present-absent}`;
    $('nhSaveHint').textContent=state.dirty?'Có thay đổi chưa lưu.':'Điểm danh đã đồng bộ.';
    const s=selectedSession();$('nhSaveAttendance').disabled=!state.dirty||state.view.closed||s?.trang_thai==='da_huy'||s?.ngay_hoc>state.view.today||state.view.group.trang_thai!=='dang_hoc';
  }
  function paintStudents() {
    const v=state.view;
    $('nhStudents').innerHTML=`<div class="nh-card"><div class="nh-card-heading"><div><h2>Học sinh trong tháng</h2><p>Ngày vào và ngày nghỉ xác định danh sách từng buổi.</p></div><button type="button" class="btn btn-primary" data-action="add-students" ${v.group.trang_thai!=='dang_hoc'?'disabled':''}>+ Thêm học sinh</button></div><div class="nh-table-wrap"><table class="nh-table"><thead><tr><th>Học sinh</th><th>Ngày vào</th><th>Ngày nghỉ</th><th>Đơn giá riêng</th><th></th></tr></thead><tbody>${v.roster.map(m=>`<tr><td><strong>${esc(m.ho_ten)}</strong><small>${esc(m.lop)}${m.ghi_chu?' · '+esc(m.ghi_chu):''}</small></td><td>${esc(dateLabel(m.ngay_vao))}</td><td>${esc(dateLabel(m.ngay_nghi)||'Đang học')}</td><td>${m.don_gia_rieng_vnd===''?'Theo nhóm':esc(money(m.don_gia_rieng_vnd))}</td><td><button type="button" class="nh-link" data-member="${esc(m.ma_thanh_vien)}">Sửa</button></td></tr>`).join('')}</tbody></table></div>${!v.roster.length?'<p class="nh-muted">Chưa có học sinh trong tháng này.</p>':''}</div>`;
  }
  function paintFees() {
    const v=state.view,names=Object.fromEntries(v.roster.map(m=>[m.ma_hoc_sinh,m.ho_ten]));
    $('nhFees').innerHTML=`<div class="nh-card"><div class="nh-card-heading"><div><h2>Học phí tháng ${esc(v.month.split('-').reverse().join('/'))}</h2><p>${v.closed?'Đã chốt · Thay đổi đơn giá nhóm không làm đổi số tiền kỳ này.':'Tạm tính · Theo buổi: chỉ tính buổi có mặt. Theo tháng: thu trọn tháng tham gia.'}</p></div><button type="button" class="btn btn-secondary" data-action="${v.closed?'reopen':'close'}">${v.closed?'Mở lại kỳ':'Chốt tháng'}</button></div>
    <div class="nh-table-wrap"><table class="nh-table"><thead><tr><th>Học sinh</th><th class="nh-number">Có mặt</th><th class="nh-number">Phải thu</th><th class="nh-number">Đã thu</th><th class="nh-number">Còn thiếu / Dư</th><th></th></tr></thead><tbody>${v.fees.map(f=>`<tr><td><strong>${esc(names[f.studentId])}</strong></td><td class="nh-number">${f.attended}</td><td class="nh-number">${money(f.due)}</td><td class="nh-number">${money(f.paid)}</td><td class="nh-number ${f.balance>0?'nh-due':'nh-credit'}">${f.balance<0?'Dư '+money(-f.balance):money(f.balance)}</td><td><button type="button" class="nh-link" data-receive="${esc(f.studentId)}">Thu tiền</button></td></tr>`).join('')}</tbody></table></div>
    <p class="nh-caption" style="margin-top:14px">Đơn vị: đồng. Có thể ghi nhiều lần đóng; tiền dư hiển thị riêng cho từng học sinh, không tự chuyển kỳ.</p></div>
    <div class="nh-card" style="margin-top:18px"><h2>Lịch sử thu tiền của kỳ</h2><div class="nh-table-wrap"><table class="nh-table"><thead><tr><th>Ngày đóng</th><th>Học sinh</th><th class="nh-number">Số tiền</th><th>Ghi chú</th><th>Trạng thái</th><th></th></tr></thead><tbody>${v.receipts.slice().reverse().map(p=>`<tr><td>${esc(dateLabel(p.ngay_dong))}</td><td>${esc(names[p.ma_hoc_sinh]||p.ma_hoc_sinh)}</td><td class="nh-number">${money(p.so_tien_vnd)}</td><td>${esc(p.ghi_chu)}</td><td>${p.trang_thai==='da_huy'?'Đã hủy':'Đã thu'}</td><td>${p.trang_thai==='da_thu'?`<button type="button" class="nh-link" data-void="${esc(p.ma_thu)}">Hủy lần thu</button>`:''}</td></tr>`).join('')}</tbody></table></div>${!v.receipts.length?'<p class="nh-muted">Chưa ghi nhận khoản thu nào.</p>':''}</div>`;
  }
  function field(label,name,value='',type='text',extra='') {
    return `<label>${label}<input class="form-control" name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  }
  function openForm(title,html,handler,submit='Lưu') {
    $('nhDialogTitle').textContent=title; $('nhFormFields').innerHTML=`<div class="nh-form-grid">${html}</div>`;
    $('nhFormError').hidden=true; $('nhSubmit').textContent=submit;state.submit=handler; $('nhDialog').showModal();
  }
  function groupForm(isNew=false) {
    const g=isNew?{}:state.view.group,id=g.ma_nhom||uid();
    const teachers=[{id:'admin',name:'Quản trị',email:''},...(state.boot.teachers||[])];
    openForm(isNew?'Tạo nhóm học':'Cài đặt nhóm',
      field('Tên nhóm','name',g.ten_nhom||'','text','required maxlength="100"')+field('Năm học','year',g.nam_hoc||'','text','placeholder="2026–2027" maxlength="20"')+
      field('Thứ học','days',g.thu_trong_tuan||'','text','placeholder="2,4 hoặc 3,5"')+
      `<label>Cách tính học phí<select name="mode" class="form-control"><option value="theo_buoi" ${g.cach_tinh_hoc_phi==='theo_buoi'?'selected':''}>Theo buổi có mặt</option><option value="theo_thang" ${g.cach_tinh_hoc_phi==='theo_thang'?'selected':''}>Theo tháng (trọn tháng)</option></select></label>`+
      field('Giờ bắt đầu','start',g.gio_bat_dau||'','time')+field('Giờ kết thúc','end',g.gio_ket_thuc||'','time')+
      field('Đơn giá (đồng)','rate',g.don_gia_vnd??'','number','required min="0" max="1000000000" step="1" placeholder="Ví dụ: 500000"')+
      (state.boot.admin?`<label>Giáo viên quản lý<select class="form-control" name="teacher">${teachers.map(t=>`<option value="${esc(t.id)}" ${(g.giao_vien_id||'admin')===t.id?'selected':''}>${esc(t.name)}${t.email?' · '+esc(t.email):''}</option>`).join('')}</select></label>`:'')+
      `<label class="wide">Ghi chú<textarea class="form-control" name="note" maxlength="500">${esc(g.ghi_chu||'')}</textarea></label>`+
      (!isNew?`<label class="wide"><span><input type="checkbox" name="archived" ${g.trang_thai==='luu_tru'?'checked':''}> Lưu trữ nhóm (vẫn xem lịch sử và thu tiền)</span></label>`:''),
      async f=>{await call('nh_group_save',{id,...f,archived:f.archived==='on'});state.groupId=id;state.boot=await call('nh_boot');paintGroupSelect();},isNew?'Tạo nhóm':'Lưu cài đặt');
  }
  function studentsForm() {
    const ids=state.view.roster.map(m=>m.ma_hoc_sinh);
    const existing=(state.boot.students||[]).filter(s=>!ids.includes(s.ma_hoc_sinh));
    const firstDay=state.month+'-01';
    openForm('Thêm học sinh',`<label class="wide">Danh sách mới<textarea class="form-control" name="names" rows="7" placeholder="Mỗi dòng một họ tên. Có thể sao chép cột Họ tên từ Excel." maxlength="15000"></textarea><small>Chỉ dán họ tên. Kiểm tra danh sách trước khi bấm Thêm.</small></label>`+
      `<label class="wide">Hoặc chọn học sinh đã có<select class="form-control" name="existing"><option value="">— Thêm từ danh sách phía trên —</option>${existing.map(s=>`<option value="${esc(s.ma_hoc_sinh)}">${esc(s.ho_ten)} · ${esc(s.lop)}</option>`).join('')}</select></label>`+
      field('Lớp (cho học sinh mới)','className','','text','maxlength="40"')+field('Ngày vào nhóm','joinDate',firstDay,'date','required'),
      async f=>{
        const names=f.names.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
        if(f.existing && names.length)throw new Error('Chọn học sinh đã có hoặc nhập danh sách mới, không dùng cả hai.');
        if(!f.existing && (!names.length||names.length>100))throw new Error('Nhập từ 1 đến 100 họ tên.');
        if(names.some(n=>n.includes('\t')||n.length>120))throw new Error('Chỉ sao chép một cột họ tên, mỗi dòng tối đa 120 ký tự.');
        if(new Set(names.map(n=>n.toLocaleLowerCase('vi'))).size!==names.length)throw new Error('Có họ tên trùng trong danh sách. Kiểm tra lại trước khi thêm.');
        const key=JSON.stringify([f.existing,names,f.className]);
        // Giữ cùng ID khi thử lại sau lỗi mạng.
        if(state.studentBatchKey!==key){state.studentBatchKey=key;state.studentBatch=f.existing?[{id:f.existing,memberId:uid()}]:names.map(name=>({id:uid(),memberId:uid(),name,className:f.className}));}
        await call('nh_students_save',{groupId:state.groupId,joinDate:f.joinDate,students:state.studentBatch});
        state.studentBatchKey=null;state.boot=await call('nh_boot');
      },'Thêm học sinh');
  }
  function memberForm(id) {
    const m=state.view.roster.find(x=>x.ma_thanh_vien===id);if(!m)return;
    openForm(m.ho_ten,field('Họ tên','name',m.ho_ten,'text','required maxlength="120"')+field('Lớp','className',m.lop,'text','maxlength="40"')+field('Ngày vào','joinDate',m.ngay_vao,'date','required')+field('Ngày nghỉ (để trống nếu còn học)','leaveDate',m.ngay_nghi,'date')+
      `<label class="wide">Đơn giá riêng (đồng)<input class="form-control" name="rate" type="number" min="0" max="1000000000" step="1" value="${esc(m.don_gia_rieng_vnd)}" placeholder="Để trống: theo đơn giá nhóm"><small>Nhập 0 nếu miễn học phí. Áp dụng cùng cách tính của nhóm cho các kỳ chưa chốt.</small></label><label class="wide">Ghi chú<textarea class="form-control" name="note" maxlength="500">${esc(m.ghi_chu)}</textarea></label>`,
      f=>call('nh_member_save',{groupId:state.groupId,memberId:id,...f}));
  }
  function sessionForm(edit=false) {
    const s=edit?selectedSession():null,g=state.view.group,id=s?.ma_buoi||uid();
    openForm(edit?'Sửa buổi học':'Thêm buổi học',
      field('Ngày học','date',s?.ngay_hoc||(state.view.today.startsWith(state.month)?state.view.today:state.month+'-01'),'date',`required ${edit?'readonly':''}`)+
      field('Giờ bắt đầu','start',s?.gio_bat_dau||g.gio_bat_dau,'time')+field('Giờ kết thúc','end',s?.gio_ket_thuc||g.gio_ket_thuc,'time')+
      `<label class="wide">Ghi chú<textarea class="form-control" name="note" maxlength="500">${esc(s?.ghi_chu||'')}</textarea></label>`+
      (edit?`<label class="wide"><span><input type="checkbox" name="cancelled" ${s.trang_thai==='da_huy'?'checked':''}> Hủy buổi học (giữ lịch sử điểm danh)</span></label>`:'<p class="nh-caption wide">Mỗi nhóm có một buổi trong một ngày. Chọn ngày đã có sẽ mở buổi đó.</p>'),
      async f=>{const result=await call('nh_session_save',{groupId:state.groupId,id,...f,update:edit,revision:s?.revision,cancelled:f.cancelled==='on'});state.month=f.date.slice(0,7);$('nhMonth').value=state.month;state.sessionId=result.id;});
  }
  function receiptForm(studentId) {
    const m=state.view.roster.find(r=>r.ma_hoc_sinh===studentId),fee=state.view.fees.find(f=>f.studentId===studentId),id=uid();
    openForm('Thu tiền · '+m.ho_ten,field('Số tiền (đồng)','amount',fee.balance>0?fee.balance:'','number','required min="1" max="1000000000" step="1"')+
      field('Ngày đóng','date',state.view.today,'date','required')+
      `<label>Phương thức<select class="form-control" name="method"><option value="tien_mat">Tiền mặt</option><option value="chuyen_khoan">Chuyển khoản</option><option value="khac">Khác</option></select></label><p class="nh-caption">Ghi nhận cho kỳ ${esc(state.month)}. Số tiền nhập bằng đồng.</p><label class="wide">Ghi chú<textarea class="form-control" name="note" maxlength="500"></textarea></label>`,
      f=>call('nh_receipt_save',{groupId:state.groupId,studentId,id,month:state.month,...f}),'Ghi nhận thu tiền');
  }
  function voidForm(id) {
    openForm('Hủy lần thu tiền','<label class="wide">Lý do hủy<textarea class="form-control" name="reason" required maxlength="200"></textarea><small>Lần thu vẫn được giữ trong lịch sử và không còn được tính vào số đã thu.</small></label>',
      f=>call('nh_receipt_void',{groupId:state.groupId,id,...f}),'Xác nhận hủy');
  }
  function monthForm(reopen) {
    openForm(reopen?'Mở lại kỳ học phí':'Chốt học phí tháng',`<p class="wide">${reopen?'Các khoản phải thu sẽ trở về tạm tính theo dữ liệu hiện tại. Các lần đóng tiền được giữ nguyên.':'Kiểm tra đủ buổi học và điểm danh. Học phí theo tháng được tính trọn tháng; có thể điều chỉnh đơn giá riêng của từng học sinh trước khi chốt.'}</p>`,
      ()=>call(reopen?'nh_reopen_month':'nh_close_month',{groupId:state.groupId,month:state.month,revision:state.view.revision}),reopen?'Mở lại kỳ':'Chốt tháng');
  }
  async function submitForm(event) {
    event.preventDefault(); if(state.busy||!state.submit)return;
    const epoch=state.epoch,handler=state.submit,values=Object.fromEntries(new FormData($('nhForm')));
    busy(true,'Đang lưu dữ liệu…');$('nhFormError').hidden=true;
    try {
      await handler(values);if(epoch!==state.epoch)return;
      $('nhDialog').close();state.submit=null;
      try {await loadView(epoch);if(epoch===state.epoch)message('Đã lưu dữ liệu.');}
      catch(error){if(epoch===state.epoch){message('Đã lưu, nhưng chưa tải lại được dữ liệu. Bấm Tải lại. '+error.message,true);paintEmpty('Dữ liệu đã lưu. Bấm Tải lại để xem kết quả.');}}
    } catch(error){if(epoch===state.epoch){$('nhFormError').hidden=false;$('nhFormError').textContent=error.message;}}
    finally {if(epoch===state.epoch)busy(false);}
  }
  async function saveAttendance() {
    if(state.busy||!state.dirty)return;
    const epoch=state.epoch,s=selectedSession();busy(true,'Đang lưu điểm danh…');
    try {
      await call('nh_attendance_save',{groupId:state.groupId,sessionId:s.ma_buoi,revision:s.revision,marks:Object.entries(state.draft).map(([studentId,d])=>({studentId,status:d.status,note:d.note}))});
      if(epoch!==state.epoch)return;state.dirty=false;await loadView(epoch);message('Đã lưu điểm danh.');
    } catch(error){if(epoch===state.epoch)message(error.message+' Nếu mất kết nối, bấm Tải lại để kiểm tra trạng thái lưu.',true);}
    finally {if(epoch===state.epoch)busy(false);}
  }
  function exportCsv() {
    const v=state.view,sessions=v.sessions.filter(s=>s.trang_thai==='da_hoc');
    const rows=[['Họ tên','Lớp',...sessions.map(s=>dateLabel(s.ngay_hoc)),'Số buổi có mặt',v.closed?'Phải thu đã chốt (đồng)':'Phải thu tạm tính (đồng)','Đã thu (đồng)','Còn thiếu (đồng)','Dư (đồng)']];
    v.roster.forEach(m=>{
      const f=v.fees.find(x=>x.studentId===m.ma_hoc_sinh);
      rows.push([m.ho_ten,m.lop,...sessions.map(s=>!within(m,s.ngay_hoc)?'Không thuộc buổi':statusLabel[v.marks.find(d=>d.ma_buoi===s.ma_buoi&&d.ma_hoc_sinh===m.ma_hoc_sinh)?.trang_thai||'chua_diem_danh']),f.attended,f.due,f.paid,Math.max(0,f.balance),Math.max(0,-f.balance)]);
    });
    const cell=x=>'"'+String(typeof x==='string'&&/^[=+@-]/.test(x)?"'"+x:x??'').replaceAll('"','""')+'"';
    const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Nhom_hoc_'+v.month+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function onClick(event) {
    const button=event.target.closest('button');if(!button||button.disabled||state.busy)return;
    if(button.dataset.tab){state.tab=button.dataset.tab;paintTab();return;}
    if(button.dataset.session){if(!discard())return;state.sessionId=button.dataset.session;state.dirty=false;buildDraft();paintAttendance();return;}
    if(button.dataset.mark){const id=button.dataset.student;if(!state.draft[id])return;state.draft[id].status=button.dataset.mark;state.dirty=true;button.parentElement.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));updateDraftUi();return;}
    if(button.dataset.member)return memberForm(button.dataset.member);
    if(button.dataset.receive)return receiptForm(button.dataset.receive);
    if(button.dataset.void)return voidForm(button.dataset.void);
    const actions={'add-students':studentsForm,'new-session':()=>sessionForm(false),'edit-session':()=>sessionForm(true),'save-attendance':saveAttendance,'close':()=>monthForm(false),'reopen':()=>monthForm(true),'all-present':()=>{Object.values(state.draft).forEach(d=>d.status='co_mat');state.dirty=true;paintAttendance();}};
    if(actions[button.dataset.action]){
      if(!['save-attendance','all-present'].includes(button.dataset.action)&&!discard())return;
      actions[button.dataset.action]();
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{
    App.init('groups');
    $('nhLogin').addEventListener('click',()=>App.openLogin('user'));
    $('nhAddGroup').addEventListener('click',()=>{if(discard())groupForm(true);});
    $('nhEditGroup').addEventListener('click',()=>{if(discard())groupForm();});
    $('nhReload').addEventListener('click',()=>state.groupId?reload():boot());
    $('nhGroup').addEventListener('change',()=>{if(!discard()){$('nhGroup').value=state.groupId;return;}state.dirty=false;state.groupId=$('nhGroup').value;reload();});
    $('nhMonth').addEventListener('change',()=>{if(!$('nhMonth').value||!discard()){$('nhMonth').value=state.month;return;}state.dirty=false;state.month=$('nhMonth').value;reload();});
    $('nhExport').addEventListener('click',exportCsv);
    $('nhGroupContent').addEventListener('click',onClick);
    $('nhAttendance').addEventListener('input',event=>{const id=event.target.dataset.note;if(id&&state.draft[id]){state.draft[id].note=event.target.value;state.dirty=true;updateDraftUi();}});
    $('nhForm').addEventListener('submit',submitForm);
    ['nhCloseDialog','nhCancelDialog'].forEach(id=>$(id).addEventListener('click',()=>{if(!state.busy)$('nhDialog').close();}));
    $('nhDialog').addEventListener('cancel',e=>{if(state.busy)e.preventDefault();});
    window.addEventListener('app:auth-change',resetAuth);
    window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
    resetAuth();
  });
})();
