(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => App.escapeHTML(String(value ?? ''));
  const money = value => Number(value || 0).toLocaleString('vi-VN') + 'đ';
  const dateLabel = value => String(value || '').split('-').reverse().join('/');
  const shortDate = value => dateLabel(value).slice(0,5);
  const periodLabel = value => 'tháng ' + String(value || '').split('-').reverse().join('/');
  const uid = () => window.crypto.randomUUID();
  const state = {boot:null,view:null,groupId:'',month:'',sessionId:'',tab:'attendance',drafts:{},dirty:false,busy:false,epoch:0,submit:null,search:'',feeSearch:'',feeFilter:'all',focusSession:false,profileId:''};
  const statusLabel = {co_mat:'Có mặt',vang:'Vắng',chua_diem_danh:'Chưa điểm danh'};
  const markSymbol = {co_mat:'✓',vang:'×',chua_diem_danh:'·'};
  const message = (text,error=false) => { $('nhFeedback').textContent=text; $('nhFeedback').className='nh-feedback'+(error?' error':''); $('nhFeedback').hidden=!text; };
  const call = async (action,data={}) => {
    const epoch=state.epoch;
    const result=await App.apiPost(action,data,{userAuth:true,timeoutMs:60000,timeoutMessage:'Chưa nhận được phản hồi. Tải lại để kiểm tra dữ liệu trước khi nhập lại.'});
    if(epoch!==state.epoch)throw new Error('Phiên làm việc đã thay đổi.');
    return result.data;
  };
  const within = (m,date) => m.ngay_vao<=date && (!m.ngay_nghi || m.ngay_nghi>=date);
  const selectedSession = () => state.view?.sessions.find(s=>s.ma_buoi===state.sessionId);
  const writable = s => !!s && !state.view.closed && s.trang_thai!=='da_huy' && s.ngay_hoc<=state.view.today && state.view.group.trang_thai==='dang_hoc';
  const savedMark = (sessionId,studentId) => state.view.marks.find(m=>m.ma_buoi===sessionId&&m.ma_hoc_sinh===studentId)||{trang_thai:'chua_diem_danh',ghi_chu:''};
  const getMark = (sessionId,studentId) => state.drafts[sessionId]?.[studentId]||{status:savedMark(sessionId,studentId).trang_thai,note:savedMark(sessionId,studentId).ghi_chu||''};
  const discard = () => !state.dirty || window.confirm('Điểm danh chưa lưu. Bỏ các thay đổi này?');
  const clearDrafts = () => {state.drafts={};state.dirty=false;};
  const normalize = text => String(text).toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
  function busy(on,text='Đang tải dữ liệu…') {
    state.busy=on;$('nhBusy').hidden=!on;$('nhBusyText').textContent=text;$('nhWorkspace').setAttribute('aria-busy',String(on));
    $('nhForm').querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=on);
  }
  function closeProfile() {if($('nhProfile').open)$('nhProfile').close();state.profileId='';$('nhProfileBody').replaceChildren();$('nhProfileName').textContent='';$('nhProfilePeriod').textContent='';}
  function resetAuth() {
    state.epoch++;state.boot=null;state.view=null;clearDrafts();state.groupId='';state.month='';state.search='';state.feeSearch='';state.feeFilter='all';state.sessionId='';state.tab='attendance';state.focusSession=false;
    $('nhDialog').close();state.submit=null;closeProfile();
    ['nhStats','nhAttendance','nhOverview','nhStudents','nhFees','nhGroup','nhGroupCards','nhPeriodInfo'].forEach(id=>$(id).replaceChildren());
    $('nhWorkspace').hidden=true;$('nhGroupContent').hidden=true;$('nhAddGroup').hidden=true;message('');$('nhGate').hidden=App.isAdmin();busy(false);
    if(App.isAdmin())boot();
  }
  async function boot() {
    const epoch=state.epoch;busy(true);
    try {
      const data=await call('nh_boot');if(epoch!==state.epoch)return;state.boot=data;$('nhWorkspace').hidden=false;
      paintGroupSelect();state.month=state.month||(data.groups.find(g=>g.ma_nhom===state.groupId)?.ky_hien_tai||data.today.slice(0,7));$('nhMonth').value=state.month;paintGroupCards();
      if(!data.features?.attendanceBatch){paintEmpty('Cập nhật NhomHoc.gs bản 9.4 trong Apps Script rồi triển khai bản mới để dùng bảng điểm danh này.');message('Máy chủ nhóm học cần được cập nhật lên bản 9.4.',true);return;}
      $('nhAddGroup').hidden=!data.admin;
      if(state.groupId)await loadView(epoch);else paintEmpty();message('');
    } catch(error){if(epoch===state.epoch){message(error.message,true);$('nhWorkspace').hidden=false;paintEmpty('Không tải được dữ liệu. Kiểm tra kết nối rồi bấm Tải lại.');}}
    finally {if(epoch===state.epoch)busy(false);}
  }
  function paintGroupSelect() {
    const groups=state.boot?.groups||[];
    if(!groups.some(g=>g.ma_nhom===state.groupId))state.groupId=(groups.find(g=>g.trang_thai==='dang_hoc')||groups[0])?.ma_nhom||'';
    $('nhGroup').innerHTML=groups.map(g=>`<option value="${esc(g.ma_nhom)}">${esc(g.ten_nhom)}${g.trang_thai==='luu_tru'?' · Đã lưu trữ':''}</option>`).join('');$('nhGroup').value=state.groupId;
  }
  function paintGroupCards() {
    $('nhGroupCards').innerHTML=(state.boot?.groups||[]).map((g,i)=>{
      const same=g.ma_nhom===state.groupId,v=same&&state.view?.month===g.ky_hien_tai?state.view:null,count=v?v.period.completed:Number(g.buoi_hien_tai||0),size=Number(g.so_buoi_ky||g.so_buoi_moi_ky||0);
      return `<button type="button" class="nh-group-card ${i%2?'teal':''}" data-group="${esc(g.ma_nhom)}" aria-pressed="${same}"><span class="nh-group-card-top"><span class="nh-group-icon">${esc(g.thu_trong_tuan?.replaceAll(',',' · ')||'NH')}</span><span class="nh-pill">${g.trang_thai==='luu_tru'?'Lưu trữ':size?count+'/'+size+' buổi':'Theo tháng'}</span></span><strong>${esc(g.ten_nhom)}</strong><small>Kỳ ${esc(periodLabel(g.ky_hien_tai||state.boot.today.slice(0,7)))}</small>${size?`<progress value="${count}" max="${size}" aria-label="Tiến độ ${esc(g.ten_nhom)}"></progress>`:''}</button>`;
    }).join('');
  }
  function paintEmpty(text) {$('nhEmpty').hidden=false;$('nhGroupContent').hidden=true;$('nhEditGroup').hidden=true;$('nhEmptyText').textContent=text||'Bấm Tạo nhóm để thêm nhóm học đầu tiên.';}
  async function loadView(epoch=state.epoch) {
    const groupId=state.groupId,month=state.month;$('nhGroupContent').hidden=true;$('nhEmpty').hidden=true;
    const data=await call('nh_view',{groupId,month});if(epoch!==state.epoch||groupId!==state.groupId||month!==state.month)return;
    state.view=data;clearDrafts();closeProfile();state.focusSession=false;
    const group=state.boot.groups.find(g=>g.ma_nhom===groupId);
    if(group){group.ky_hien_tai=data.period.current;group.buoi_hien_tai=data.currentPeriod.completed;group.so_buoi_ky=data.currentPeriod.size;}
    if(!data.sessions.some(s=>s.ma_buoi===state.sessionId&&s.trang_thai!=='da_huy')){
      const active=data.sessions.filter(s=>s.trang_thai!=='da_huy');state.sessionId=(active.find(s=>s.ngay_hoc===data.today)||active.filter(s=>s.ngay_hoc<=data.today).at(-1)||active[0])?.ma_buoi||'';
    }
    paint();
  }
  async function reload() {
    if(!discard())return;clearDrafts();if(!state.boot?.features?.attendanceBatch)return boot();
    const epoch=state.epoch;busy(true);message('');
    try{await loadView(epoch);}catch(error){if(epoch===state.epoch){message(error.message,true);paintEmpty('Không tải được dữ liệu nhóm. Bấm Tải lại để thử lại.');}}
    finally{if(epoch===state.epoch)busy(false);}
  }
  async function changeGroup(id) {
    if(!state.boot?.features?.attendanceBatch||state.busy||!discard()){$('nhGroup').value=state.groupId;return;}
    clearDrafts();state.groupId=id;state.search='';state.feeSearch='';state.sessionId='';state.month=state.boot.groups.find(g=>g.ma_nhom===id)?.ky_hien_tai||state.boot.today.slice(0,7);$('nhMonth').value=state.month;$('nhGroup').value=id;await reload();
  }
  function changeMonth(value) {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||value<'2000-01'||value>'2100-12'||!discard()){$('nhMonth').value=state.month;return;}
    clearDrafts();state.month=value;state.sessionId='';$('nhMonth').value=value;reload();
  }
  function shiftMonth(offset) {if(state.busy||!state.month)return;const [y,m]=state.month.split('-').map(Number);changeMonth(new Date(Date.UTC(y,m-1+offset,1)).toISOString().slice(0,7));}
  function projectedFees() {
    const v=state.view;if(!v)return [];
    if(!state.dirty)return v.fees;
    return v.fees.map(f=>{
      if(v.closed)return f;const m=v.roster.find(r=>r.ma_hoc_sinh===f.studentId);let attended=0,absent=0,unmarked=0;
      v.sessions.filter(s=>s.ngay_hoc<=v.today&&within(m,s.ngay_hoc)&&(s.trang_thai==='da_hoc'||s.trang_thai==='du_kien'&&Object.values(state.drafts[s.ma_buoi]||{}).some(d=>d.status==='co_mat'||d.status==='vang'))).forEach(s=>{
        const d=getMark(s.ma_buoi,m.ma_hoc_sinh);if(d.status==='co_mat')attended++;else if(d.status==='vang')absent++;else if(s.trang_thai==='da_hoc')unmarked++;
      });
      const due=v.group.cach_tinh_hoc_phi==='theo_buoi'?attended*f.rate:f.due;return {...f,attended,absent,unmarked,due,balance:due-f.paid};
    });
  }
  function feeStatus(f) {
    if(!f.rate)return {key:'free',text:'Miễn học phí',tone:'neutral'};
    if(f.balance<0)return {key:'credit',text:'Đóng dư',tone:'blue'};
    if(!f.due)return {key:'none',text:'Chưa phát sinh',tone:'neutral'};
    if(!f.balance)return {key:'paid',text:'Đã đủ',tone:'green'};
    if(f.paid)return {key:'partial',text:'Đóng một phần',tone:'orange'};
    return {key:'unpaid',text:'Chưa đóng',tone:'red'};
  }
  const studentButton = m => `<button class="nh-student-name" type="button" data-profile="${esc(m.ma_hoc_sinh)}">${esc(m.ho_ten)}</button>`;
  function paintSummary() {
    const v=state.view,cycle=v.period.mode==='eight_sessions',fees=projectedFees(),due=fees.reduce((n,f)=>n+f.due,0),paid=fees.reduce((n,f)=>n+f.paid,0),balance=fees.reduce((n,f)=>n+Math.max(0,f.balance),0);
    const stats=[['Học sinh',v.roster.length,(cycle?v.period.completed+'/'+v.period.size:v.period.completed)+' buổi đã học'],['Phải thu',money(due),state.dirty?'Tạm tính · điểm danh chưa lưu':v.closed?'Đã chốt kỳ':'Tạm tính theo buổi có mặt'],['Đã thu',money(paid),'Ghi nhận từng lần đóng tiền'],['Còn thiếu',money(balance),'Tiền dư được theo dõi riêng']];
    $('nhStats').innerHTML=stats.map(([label,value,hint],i)=>`<article class="nh-stat stat-${i}"><span>${label}</span><strong>${esc(value)}</strong><small>${hint}</small></article>`).join('');
  }
  function paint() {
    const v=state.view;if(!v)return;$('nhEmpty').hidden=true;$('nhGroupContent').hidden=false;$('nhEditGroup').hidden=false;const g=v.group,cycle=v.period.mode==='eight_sessions';
    $('nhGroupHint').textContent=[g.nam_hoc,g.thu_trong_tuan?'Thứ '+g.thu_trong_tuan.replaceAll(',',', '):'',g.gio_bat_dau?g.gio_bat_dau+'–'+g.gio_ket_thuc:'',money(g.don_gia_vnd)+(g.cach_tinh_hoc_phi==='theo_buoi'?'/buổi':'/kỳ')].filter(Boolean).join(' · ');
    $('nhPeriodInfo').hidden=!cycle;
    $('nhPeriodInfo').innerHTML=cycle?`<div><span class="nh-eyebrow">Kỳ đang xem</span><strong>${esc(periodLabel(v.month))} <span class="nh-period-count">${v.period.completed}/${v.period.size} buổi đã học</span></strong><p>${v.closed?'Đã chốt học phí. Mở lại kỳ nếu cần sửa điểm danh.':v.period.completed===8?'Đã đủ 8 buổi. Buổi học tiếp theo bắt đầu kỳ mới.':'Học đủ 8 buổi mới chuyển kỳ. Các buổi dự kiến và buổi hủy chưa được tính.'}</p></div><progress value="${v.period.completed}" max="8" aria-label="Số buổi đã học"></progress>`:'';
    $('nhOverviewTab').textContent=cycle?'8 buổi':'Tổng quan';
    $('nhPrevMonth').disabled=v.month==='2000-01';$('nhNextMonth').disabled=v.month==='2100-12';paintGroupCards();paintSummary();paintAttendance();paintOverview();paintStudents();paintFees();paintTab();
  }
  function paintTab() {Object.entries({attendance:'nhAttendance',overview:'nhOverview',students:'nhStudents',fees:'nhFees'}).forEach(([key,id])=>$(id).hidden=state.tab!==key);document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===state.tab)));}
  function isMakeup(s) {const days=(state.view.group.thu_trong_tuan||'').split(',').filter(Boolean).map(d=>d==='CN'?0:Number(d)-1);return !!days.length&&!days.includes(new Date(s.ngay_hoc+'T12:00:00Z').getUTCDay());}
  function sessionState(s) {return s.trang_thai==='da_huy'?'Đã hủy':s.ngay_hoc>state.view.today?'Dự kiến':s.trang_thai==='du_kien'?'Chưa xác nhận':'Đã học';}
  function slotSessions() {const v=state.view,active=v.sessions.filter(s=>s.trang_thai!=='da_huy');if(v.period.mode!=='eight_sessions')return active;const learned=active.filter(s=>s.trang_thai==='da_hoc'&&s.ngay_hoc<=v.today),plans=active.filter(s=>!learned.includes(s)).slice(0,Math.max(0,8-learned.length));return learned.concat(plans).sort((a,b)=>a.ngay_hoc.localeCompare(b.ngay_hoc));}
  function markCell(m,s) {
    if(!s)return '<span class="nh-matrix-empty">—</span>';
    if(!within(m,s.ngay_hoc))return '<span class="nh-matrix-empty" title="Chưa vào hoặc đã nghỉ nhóm">—</span>';
    const d=getMark(s.ma_buoi,m.ma_hoc_sinh),future=s.ngay_hoc>state.view.today,changed=!!state.drafts[s.ma_buoi]?.[m.ma_hoc_sinh];
    return `<button type="button" class="nh-cell-mark ${d.status} ${changed?'changed':''} ${future?'future':''}" data-cycle="${esc(s.ma_buoi)}" data-student="${esc(m.ma_hoc_sinh)}" aria-label="${esc(m.ho_ten)}, ${esc(dateLabel(s.ngay_hoc))}: ${future?'Dự kiến':statusLabel[d.status]}${d.note?', có ghi chú':''}" ${!writable(s)?'disabled':''}>${future?'—':markSymbol[d.status]}${d.note?'<span class="nh-note-dot" aria-hidden="true"></span>':''}</button>`;
  }
  function squareCell(m,s) {
    if(!s)return '<span class="nh-square unscheduled" role="img" aria-label="Chưa xếp lịch" title="Chưa xếp lịch"></span>';
    if(!within(m,s.ngay_hoc))return '<span class="nh-square outside" role="img" aria-label="Không thuộc buổi học" title="Chưa vào hoặc đã nghỉ nhóm"></span>';
    const d=getMark(s.ma_buoi,m.ma_hoc_sinh),future=s.ngay_hoc>state.view.today,changed=!!state.drafts[s.ma_buoi]?.[m.ma_hoc_sinh];
    const label=`${m.ho_ten}, ${dateLabel(s.ngay_hoc)}: ${future?'Dự kiến':statusLabel[d.status]}${d.note?', có ghi chú':''}`;
    return `<button type="button" class="nh-square-mark ${future?'future':d.status} ${changed?'changed':''}" data-cycle="${esc(s.ma_buoi)}" data-student="${esc(m.ma_hoc_sinh)}" aria-label="${esc(label)}" title="${esc(label)}" ${!writable(s)?'disabled':''}><span class="nh-square" aria-hidden="true"></span></button>`;
  }
  function paintOverview() {
    const v=state.view,slots=slotSessions(),size=v.period.mode==='eight_sessions'?8:Math.max(1,slots.length),columns=Array.from({length:size},(_,i)=>slots[i]||null),fees=projectedFees();
    const heads=columns.map((s,i)=>`<th scope="col">${s?`<button type="button" class="nh-overview-date" data-session="${esc(s.ma_buoi)}" aria-label="Điểm danh buổi ${i+1}, ${esc(dateLabel(s.ngay_hoc))}"><span>${i+1}</span><small>${shortDate(s.ngay_hoc)}</small></button>`:`<span>${i+1}</span><small class="nh-overview-unset">—</small>`}</th>`).join('');
    const rows=v.roster.map(m=>{const f=fees.find(f=>f.studentId===m.ma_hoc_sinh);return `<tr class="nh-student-entry" data-student-name="${esc(normalize(m.ho_ten))}"><th scope="row" class="nh-overview-name">${studentButton(m)}</th>${columns.map(s=>`<td class="nh-overview-cell" data-cell-session="${esc(s?.ma_buoi||'')}" data-cell-student="${esc(m.ma_hoc_sinh)}">${squareCell(m,s)}</td>`).join('')}<td class="nh-overview-count"><strong data-overview-count="${esc(m.ma_hoc_sinh)}" data-size="${size}" title="Có mặt ${f.attended} buổi, vắng ${f.absent||0} buổi">${f.attended}/${size}</strong></td></tr>`;}).join('');
    $('nhOverview').innerHTML=`<div class="nh-card nh-overview-card"><div class="nh-card-heading"><div><h2>${v.period.mode==='eight_sessions'?'Tổng quan 8 buổi':'Tổng quan điểm danh'}</h2><p>${esc(v.group.ten_nhom)} · Kỳ ${esc(periodLabel(v.month))} · ${v.roster.length} học sinh</p></div></div><label class="nh-overview-search"><span>Tìm học sinh</span><input id="nhOverviewSearch" class="form-control" placeholder="Tên học sinh…" value="${esc(state.search)}"></label><div class="nh-square-legend"><span><i class="nh-square co_mat" aria-hidden="true"></i>Có mặt</span><span><i class="nh-square vang" aria-hidden="true"></i>Vắng</span><span><i class="nh-square" aria-hidden="true"></i>Chưa điểm danh</span><span><i class="nh-square future" aria-hidden="true"></i>Dự kiến</span></div><div class="nh-table-wrap nh-overview-wrap" tabindex="0" role="region" aria-label="Tổng quan điểm danh tất cả học sinh"><table class="nh-table nh-overview-table"><thead><tr><th scope="col" class="nh-overview-name">Học sinh</th>${heads}<th scope="col" class="nh-overview-count" aria-label="Số buổi có mặt">Có mặt</th></tr></thead><tbody>${rows}</tbody></table></div><p class="nh-search-empty" id="nhOverviewEmpty" hidden>Không tìm thấy học sinh.</p><p class="nh-caption nh-overview-caption">Bấm ô vuông để đổi điểm danh; bấm ngày để mở từng buổi.</p><div class="nh-save-bar"><p id="nhOverviewSaveHint"></p><button class="btn btn-primary" type="button" data-action="save-attendance" id="nhSaveOverview">Lưu điểm danh</button></div></div>`;
    applyStudentFilter();updateDraftUi();
  }
  function paintAttendance() {
    const v=state.view,s=selectedSession(),slots=slotSessions(),size=v.period.mode==='eight_sessions'?8:Math.max(1,slots.length),columns=Array.from({length:size},(_,i)=>slots[i]||null);
    const extra=v.sessions.filter(b=>!slots.some(s=>s.ma_buoi===b.ma_buoi)),fees=projectedFees();
    const heads=columns.map((b,i)=>b?`<th scope="col"><button type="button" class="nh-date-head" data-session="${esc(b.ma_buoi)}"><small>Buổi ${i+1}</small><strong>${shortDate(b.ngay_hoc)}</strong><span>${b.ngay_hoc.slice(0,4)}</span></button>${isMakeup(b)?'<span class="nh-makeup">Học bù</span>':''}<small class="nh-session-state">${sessionState(b)}</small></th>`:`<th scope="col"><small>Buổi ${i+1}</small><span class="nh-empty-date">Chưa xếp</span></th>`).join('');
    const rows=v.roster.map(m=>{const f=fees.find(f=>f.studentId===m.ma_hoc_sinh);return `<tr class="nh-student-entry" data-student-name="${esc(normalize(m.ho_ten))}" data-roster="${esc(m.ma_hoc_sinh)}"><th scope="row" class="nh-sticky-name">${studentButton(m)}<small>${esc(m.lop)}${!f.rate?' · Miễn học phí':''}</small></th>${columns.map(b=>`<td data-cell-session="${esc(b?.ma_buoi||'')}" data-cell-student="${esc(m.ma_hoc_sinh)}">${markCell(m,b)}</td>`).join('')}<td class="nh-row-summary"><strong data-attended="${esc(m.ma_hoc_sinh)}">${f.attended}</strong><small data-absent="${esc(m.ma_hoc_sinh)}">${f.absent||0} vắng</small></td></tr>`;}).join('');
    const options=v.sessions.filter(b=>b.trang_thai!=='da_huy').map(b=>`<option value="${esc(b.ma_buoi)}" ${b.ma_buoi===state.sessionId?'selected':''}>${esc(dateLabel(b.ngay_hoc))}${b.thu_tu_ky?' · Buổi '+b.thu_tu_ky:''}${isMakeup(b)?' · Học bù':''} · ${sessionState(b)}</option>`).join('');
    let one='<div class="nh-empty-inline">Chưa có buổi học. Thêm buổi hoặc xếp lịch để bắt đầu điểm danh.</div>';
    if(s){const students=v.roster.filter(m=>within(m,s.ngay_hoc));one=`<div class="nh-single-heading"><div><h3>${dateLabel(s.ngay_hoc)}</h3><p>${sessionState(s)}${isMakeup(s)?' · Học bù':''} · ${students.length} học sinh</p></div><button type="button" class="nh-link" data-action="edit-session" ${v.closed?'disabled':''}>Sửa buổi</button></div>${s.trang_thai==='du_kien'&&s.ngay_hoc<=v.today?'<p class="nh-inline-info">Lưu điểm danh Có mặt/Vắng để xác nhận buổi này đã học.</p>':''}${s.ngay_hoc>v.today?'<p class="nh-inline-info">Chưa đến ngày học. Buổi này chưa tính vào số buổi đã học và học phí.</p>':''}<div class="nh-quick-actions"><button type="button" class="btn btn-secondary" data-action="all-present" ${!writable(s)?'disabled':''}>✓ Tất cả có mặt</button><span id="nhDraftCount" class="nh-caption"></span></div><div class="nh-mobile-roster">${students.map(m=>{const d=getMark(s.ma_buoi,m.ma_hoc_sinh);return `<article class="nh-student-entry nh-mobile-student" data-student-name="${esc(normalize(m.ho_ten))}"><div class="nh-mobile-student-top">${studentButton(m)}<button type="button" class="nh-link" data-mark-note="${esc(s.ma_buoi)}" data-student="${esc(m.ma_hoc_sinh)}" ${!writable(s)?'disabled':''}>${d.note?'Có ghi chú':'Ghi chú'}</button></div><div class="nh-mark-controls" data-mobile-marks="${esc(m.ma_hoc_sinh)}">${Object.entries(statusLabel).map(([key,label])=>`<button type="button" data-mark="${key}" data-student="${esc(m.ma_hoc_sinh)}" aria-pressed="${d.status===key}" ${!writable(s)?'disabled':''}>${label}</button>`).join('')}</div></article>`;}).join('')}</div>${!students.length?'<p class="nh-muted">Chưa có học sinh thuộc buổi này.</p>':''}`;}
    const canPlan=v.period.mode==='eight_sessions'&&!v.closed&&slots.length<8&&v.group.trang_thai==='dang_hoc';
    $('nhAttendance').innerHTML=`<div class="nh-card"><div class="nh-card-heading"><div><h2>Điểm danh kỳ ${esc(periodLabel(v.month))}</h2><p>Bấm ô để đổi: Có mặt → Vắng → Chưa điểm danh. Bấm tên để xem chi tiết.</p></div><div class="nh-actions"><button class="btn btn-secondary" type="button" data-action="plan-sessions" ${!canPlan?'disabled':''}>Xếp lịch còn thiếu</button><button class="btn btn-primary" type="button" data-action="new-session" ${v.group.trang_thai!=='dang_hoc'?'disabled':''}>+ Buổi học / học bù</button></div></div><div class="nh-attendance-tools"><label class="nh-search-label"><span>Tìm học sinh</span><input id="nhSearch" class="form-control" placeholder="Tên học sinh…" value="${esc(state.search)}"></label><label class="nh-session-select"><span>Chọn buổi</span><select id="nhSessionSelect" class="form-control" ${!options?'disabled':''}>${options||'<option>Chưa có buổi</option>'}</select></label><button class="btn btn-secondary nh-matrix-quick" type="button" data-action="all-present" ${!writable(s)?'disabled':''}>✓ Có mặt cả buổi</button><button class="btn btn-secondary nh-mode-button" type="button" data-action="toggle-mode">${state.focusSession?'Xem toàn kỳ':'Xem từng buổi'}</button></div><div class="nh-legend"><span><b class="green">✓</b> Có mặt</span><span><b class="red">×</b> Vắng</span><span><b class="neutral">·</b> Chưa điểm danh</span><span><b class="blue">—</b> Dự kiến / chưa tham gia</span><span class="nh-makeup">Học bù</span></div><div class="nh-matrix ${state.focusSession?'focus-session':''}"><div class="nh-table-wrap" tabindex="0" role="region" aria-label="Bảng điểm danh 8 buổi"><table class="nh-table nh-matrix-table"><thead><tr><th scope="col" class="nh-sticky-name">Học sinh</th>${heads}<th scope="col">Có mặt</th></tr></thead><tbody>${rows}</tbody></table></div></div><div class="nh-single-session ${state.focusSession?'force-show':''}">${one}</div>${extra.length?`<details class="nh-extra-sessions"><summary>${extra.length} buổi hủy hoặc dự kiến cần kiểm tra</summary><div>${extra.map(b=>`<button type="button" class="nh-extra-session" data-session="${esc(b.ma_buoi)}">${dateLabel(b.ngay_hoc)} <span>${sessionState(b)}</span></button>`).join('')}</div></details>`:''}<p class="nh-search-empty" id="nhSearchEmpty" hidden>Không tìm thấy học sinh.</p><div class="nh-save-bar"><p id="nhSaveHint"></p><button class="btn btn-primary" type="button" data-action="save-attendance" id="nhSaveAttendance">Lưu điểm danh</button></div></div>`;
    applyStudentFilter();updateDraftUi();
  }
  function setDraft(sessionId,studentId,patch) {
    const s=state.view.sessions.find(b=>b.ma_buoi===sessionId),m=state.view.roster.find(r=>r.ma_hoc_sinh===studentId);if(!writable(s)||!m||!within(m,s.ngay_hoc))return;
    const d={...getMark(sessionId,studentId),...patch},saved=savedMark(sessionId,studentId);
    if(d.status===saved.trang_thai&&d.note===(saved.ghi_chu||'')){if(state.drafts[sessionId]){delete state.drafts[sessionId][studentId];if(!Object.keys(state.drafts[sessionId]).length)delete state.drafts[sessionId];}}
    else (state.drafts[sessionId]??={})[studentId]=d;
    state.dirty=Object.keys(state.drafts).length>0;
  }
  function updateDraftUi() {
    if(!$('nhSaveAttendance'))return;const changed=Object.values(state.drafts).reduce((n,rows)=>n+Object.keys(rows).length,0);
    $('nhSaveHint').textContent=state.dirty?`${changed} ô điểm danh chưa lưu · Học phí đang tạm tính theo thay đổi.`:state.view.closed?'Kỳ đã chốt. Mở lại ở mục Học phí để sửa.':'Điểm danh đã đồng bộ.';
    $('nhSaveAttendance').disabled=!state.dirty||state.view.closed;
    if($('nhOverviewSaveHint'))$('nhOverviewSaveHint').textContent=$('nhSaveHint').textContent;
    if($('nhSaveOverview'))$('nhSaveOverview').disabled=!state.dirty||state.view.closed;
    const s=selectedSession();if($('nhDraftCount')&&s){const marks=state.view.roster.filter(m=>within(m,s.ngay_hoc)).map(m=>getMark(s.ma_buoi,m.ma_hoc_sinh));$('nhDraftCount').textContent=`Có mặt ${marks.filter(d=>d.status==='co_mat').length} · Vắng ${marks.filter(d=>d.status==='vang').length}`;}
    const close=$('nhFees').querySelector('[data-action="close"]');if(close)close.disabled=state.dirty||state.view.period.mode==='eight_sessions'&&state.view.period.completed<8;
  }
  function refreshAfterMark(sessionId,studentId) {
    const s=state.view.sessions.find(b=>b.ma_buoi===sessionId),m=state.view.roster.find(r=>r.ma_hoc_sinh===studentId),d=getMark(sessionId,studentId);
    document.querySelectorAll('[data-cell-session]').forEach(cell=>{if(cell.dataset.cellSession===sessionId&&cell.dataset.cellStudent===studentId)cell.innerHTML=cell.classList.contains('nh-overview-cell')?squareCell(m,s):markCell(m,s);});
    if(sessionId===state.sessionId)document.querySelectorAll('[data-mark]').forEach(b=>{if(b.dataset.student===studentId)b.setAttribute('aria-pressed',String(b.dataset.mark===d.status));});
    const f=projectedFees().find(f=>f.studentId===studentId);document.querySelectorAll('[data-attended]').forEach(e=>{if(e.dataset.attended===studentId)e.textContent=f.attended;});document.querySelectorAll('[data-absent]').forEach(e=>{if(e.dataset.absent===studentId)e.textContent=(f.absent||0)+' vắng';});
    document.querySelectorAll('[data-overview-count]').forEach(e=>{if(e.dataset.overviewCount===studentId){e.textContent=f.attended+'/'+e.dataset.size;e.title=`Có mặt ${f.attended} buổi, vắng ${f.absent||0} buổi`;}});
    paintSummary();paintFees();updateDraftUi();
  }
  function applyStudentFilter() {
    const query=normalize(state.search);
    [['nhAttendance','nhSearchEmpty'],['nhOverview','nhOverviewEmpty']].forEach(([panel,empty])=>{let shown=0;$(panel).querySelectorAll('.nh-student-entry').forEach(row=>{row.hidden=!row.dataset.studentName.includes(query);if(!row.hidden)shown++;});if($(empty))$(empty).hidden=shown>0||!state.search;});
    ['nhSearch','nhOverviewSearch'].forEach(id=>{if($(id)&&$(id).value!==state.search)$(id).value=state.search;});
  }
  function paintStudents() {
    const v=state.view;
    $('nhStudents').innerHTML=`<div class="nh-card"><div class="nh-card-heading"><div><h2>Học sinh trong kỳ</h2><p>Ngày vào và ngày nghỉ xác định danh sách từng buổi.</p></div><button type="button" class="btn btn-primary" data-action="add-students" ${v.group.trang_thai!=='dang_hoc'?'disabled':''}>+ Thêm học sinh</button></div><div class="nh-table-wrap"><table class="nh-table"><thead><tr><th>Học sinh</th><th>Ngày vào</th><th>Ngày nghỉ</th><th>Đơn giá riêng</th><th>Ghi chú</th><th></th></tr></thead><tbody>${v.roster.map(m=>`<tr><td>${studentButton(m)}<small>${esc(m.lop)}</small></td><td>${dateLabel(m.ngay_vao)}</td><td>${dateLabel(m.ngay_nghi)||'Đang học'}</td><td>${m.don_gia_rieng_vnd===''?'Theo nhóm':money(m.don_gia_rieng_vnd)}</td><td>${esc(m.ghi_chu)}</td><td><button type="button" class="nh-link" data-member="${esc(m.ma_thanh_vien)}">Sửa</button></td></tr>`).join('')}</tbody></table></div>${!v.roster.length?'<p class="nh-muted">Chưa có học sinh trong kỳ này.</p>':''}</div>`;
  }
  function receiptRows(receipts,names,individual=false) {return receipts.slice().sort((a,b)=>b.ngay_dong.localeCompare(a.ngay_dong)).map(p=>`<tr class="${p.trang_thai==='da_huy'?'nh-void-receipt':''}"><td data-label="Ngày đóng">${dateLabel(p.ngay_dong)}</td>${individual?'':`<td data-label="Học sinh">${esc(names[p.ma_hoc_sinh]||p.ma_hoc_sinh)}</td>`}<td class="nh-number" data-label="Số tiền">${money(p.so_tien_vnd)}</td><td data-label="Phương thức">${esc({tien_mat:'Tiền mặt',chuyen_khoan:'Chuyển khoản',khac:'Khác'}[p.phuong_thuc]||'')}</td><td data-label="Ghi chú">${esc(p.ghi_chu)||'—'}</td><td><span class="nh-pill ${p.trang_thai==='da_huy'?'neutral':'green'}">${p.trang_thai==='da_huy'?'Đã hủy':'Đã thu'}</span></td><td>${p.trang_thai==='da_thu'?`<button type="button" class="nh-link" data-void="${esc(p.ma_thu)}">Hủy</button>`:''}</td></tr>`).join('');}
  function paintFees() {
    const v=state.view,fees=projectedFees(),names=Object.fromEntries(v.roster.map(m=>[m.ma_hoc_sinh,m.ho_ten])),ready=v.period.mode!=='eight_sessions'||v.period.completed>=8;
    const rows=fees.map(f=>{const m=v.roster.find(m=>m.ma_hoc_sinh===f.studentId),status=feeStatus(f);return `<tr class="nh-fee-row" data-fee-name="${esc(normalize(m.ho_ten))}" data-fee-state="${status.key}"><td>${studentButton(m)}<small>${f.unmarked?f.unmarked+' buổi chưa điểm danh':esc(m.lop)}</small></td><td class="nh-number">${f.attended}</td><td class="nh-number">${f.absent||0}</td><td class="nh-number">${money(f.due)}</td><td class="nh-number">${money(f.paid)}</td><td class="nh-number ${f.balance>0?'nh-due':'nh-credit'}">${f.balance<0?'Dư '+money(-f.balance):money(f.balance)}</td><td><span class="nh-pill ${status.tone}">${status.text}</span></td><td><button type="button" class="btn btn-secondary nh-receive" data-receive="${esc(f.studentId)}">Thu tiền</button></td></tr>`;}).join('');
    $('nhFees').innerHTML=`<div class="nh-card"><div class="nh-card-heading"><div><h2>Học phí kỳ ${esc(periodLabel(v.month))}</h2><p>${state.dirty?'Điểm danh chưa lưu · Số tiền đang được xem trước.':v.closed?'Đã chốt · Số tiền phải thu của kỳ được giữ cố định.':'Số buổi có mặt × đơn giá. Có thể ghi nhiều lần đóng tiền.'}</p></div><button type="button" class="btn btn-secondary" data-action="${v.closed?'reopen':'close'}" ${!v.closed&&(!ready||state.dirty)?'disabled':''}>${v.closed?'Mở lại kỳ':ready?'Chốt kỳ':'Chưa đủ 8 buổi'}</button></div><div class="nh-fee-tools"><label><span>Tìm học sinh</span><input id="nhFeeSearch" class="form-control" placeholder="Tên học sinh…" value="${esc(state.feeSearch)}"></label><label><span>Trạng thái học phí</span><select id="nhFeeFilter" class="form-control">${[['all','Tất cả'],['unpaid','Chưa đóng'],['partial','Đóng một phần'],['paid','Đã đủ'],['credit','Đóng dư'],['free','Miễn học phí'],['none','Chưa phát sinh']].map(([key,label])=>`<option value="${key}" ${state.feeFilter===key?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="nh-table-wrap"><table class="nh-table nh-fees-table"><thead><tr><th>Học sinh</th><th>Có mặt</th><th>Vắng</th><th class="nh-number">Phải đóng</th><th class="nh-number">Đã đóng</th><th class="nh-number">Còn thiếu / Dư</th><th>Trạng thái</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><p id="nhFeeEmpty" class="nh-empty-inline" hidden>Không có học sinh phù hợp.</p><p class="nh-caption" style="margin-top:14px">Tiền đóng dư hiển thị riêng, không tự chuyển sang kỳ khác.</p></div><div class="nh-card nh-receipts-card"><div class="nh-card-heading"><h2>Lịch sử đóng tiền</h2><span class="nh-pill blue">Kỳ ${esc(periodLabel(v.month))}</span></div><div class="nh-table-wrap"><table class="nh-table nh-receipts-table"><thead><tr><th>Ngày đóng</th><th>Học sinh</th><th class="nh-number">Số tiền</th><th>Phương thức</th><th>Ghi chú</th><th>Trạng thái</th><th></th></tr></thead><tbody>${receiptRows(v.receipts,names)}</tbody></table></div>${!v.receipts.length?'<p class="nh-empty-inline">Chưa ghi nhận khoản thu nào.</p>':''}</div>`;applyFeeFilter();
  }
  function applyFeeFilter() {let shown=0;$('nhFees').querySelectorAll('.nh-fee-row').forEach(row=>{row.hidden=!row.dataset.feeName.includes(normalize(state.feeSearch))||state.feeFilter!=='all'&&row.dataset.feeState!==state.feeFilter;if(!row.hidden)shown++;});if($('nhFeeEmpty'))$('nhFeeEmpty').hidden=shown>0;}
  function openProfile(id) {
    const v=state.view,m=v.roster.find(m=>m.ma_hoc_sinh===id);if(!m)return;state.profileId=id;const f=projectedFees().find(f=>f.studentId===id),status=feeStatus(f),receipts=v.receipts.filter(p=>p.ma_hoc_sinh===id);
    $('nhProfileName').textContent=m.ho_ten;$('nhProfilePeriod').textContent=v.group.ten_nhom+' · Kỳ '+periodLabel(v.month);
    const metrics=[['Có mặt',f.attended+' buổi'],['Vắng',f.absent+' buổi'],['Phải đóng',money(f.due)],['Đã đóng',money(f.paid)]];
    const timeline=v.sessions.filter(s=>within(m,s.ngay_hoc)).map(s=>{const d=getMark(s.ma_buoi,id),label=s.trang_thai==='da_huy'?'Đã hủy':s.ngay_hoc>v.today?'Dự kiến':s.trang_thai==='du_kien'&&d.status==='chua_diem_danh'?'Chưa xác nhận':statusLabel[d.status],tone=s.trang_thai==='da_huy'||s.ngay_hoc>v.today?'neutral':d.status==='co_mat'?'green':d.status==='vang'?'red':'neutral';return `<li><div><strong>${dateLabel(s.ngay_hoc)}</strong><small>${s.thu_tu_ky?'Buổi '+s.thu_tu_ky+' · ':''}${isMakeup(s)?'Học bù · ':''}${esc(s.gio_bat_dau||'Chưa đặt giờ')}</small></div><span class="nh-pill ${tone}">${label}</span>${d.note?`<p>${esc(d.note)}</p>`:''}</li>`;}).join('');
    $('nhProfileBody').innerHTML=`<p class="nh-profile-meta">${esc(m.lop)} · Vào nhóm ${dateLabel(m.ngay_vao)}${m.ngay_nghi?' · Nghỉ nhóm '+dateLabel(m.ngay_nghi):''}</p><div class="nh-profile-metrics">${metrics.map(([label,value])=>`<div><small>${label}</small><strong>${esc(value)}</strong></div>`).join('')}</div><div class="nh-profile-balance"><div><span class="nh-pill ${status.tone}">${status.text}</span><p>${f.balance<0?'Đóng dư':f.balance>0?'Còn thiếu':'Còn thiếu'}: <strong>${money(Math.abs(f.balance))}</strong></p></div><button type="button" class="btn btn-primary" data-receive="${esc(id)}">Ghi nhận đóng tiền</button></div>${state.dirty?'<p class="nh-inline-info">Điểm danh chưa lưu. Số tiền phải đóng đang là bản xem trước.</p>':''}${m.ghi_chu?`<div class="nh-profile-note"><strong>Ghi chú học sinh</strong><p>${esc(m.ghi_chu)}</p></div>`:''}<section class="nh-profile-section"><h3>Các buổi trong kỳ</h3><ol class="nh-timeline">${timeline||'<li>Chưa có buổi học.</li>'}</ol></section><section class="nh-profile-section"><h3>Lịch sử đóng tiền</h3><div class="nh-table-wrap"><table class="nh-table nh-receipts-table"><thead><tr><th>Ngày đóng</th><th>Số tiền</th><th>Phương thức</th><th>Ghi chú</th><th>Trạng thái</th><th></th></tr></thead><tbody>${receiptRows(receipts,{},true)}</tbody></table></div>${!receipts.length?'<p class="nh-empty-inline">Chưa ghi nhận khoản đóng tiền trong kỳ này.</p>':''}</section>`;
    if(!$('nhProfile').open)$('nhProfile').showModal();
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
      `<label>Cách tính học phí<select name="mode" class="form-control"><option value="theo_buoi" ${g.cach_tinh_hoc_phi==='theo_buoi'?'selected':''}>Theo buổi có mặt</option><option value="theo_thang" ${g.cach_tinh_hoc_phi==='theo_thang'?'selected':''}>Trọn kỳ học</option></select></label>`+
      (state.boot.periodModel?`<label>Cách chia kỳ<select name="cycleSize" class="form-control"><option value="8" ${isNew||Number(g.so_buoi_moi_ky)===8?'selected':''}>Đủ 8 buổi mới sang kỳ sau</option><option value="0" ${!isNew&&!Number(g.so_buoi_moi_ky)?'selected':''}>Theo tháng dương lịch</option></select></label>`+field('Kỳ bắt đầu (nếu chia theo 8 buổi)','cycleStart',g.ky_bat_dau||state.month,'month','required'):'')+
      field('Giờ bắt đầu','start',g.gio_bat_dau||'','time')+field('Giờ kết thúc','end',g.gio_ket_thuc||'','time')+
      field('Đơn giá (đồng)','rate',g.don_gia_vnd??62500,'number','required min="0" max="1000000000" step="1" placeholder="Ví dụ: 62500"')+
      (state.boot.admin?`<label>Giáo viên quản lý<select class="form-control" name="teacher">${teachers.map(t=>`<option value="${esc(t.id)}" ${(g.giao_vien_id||'admin')===t.id?'selected':''}>${esc(t.name)}${t.email?' · '+esc(t.email):''}</option>`).join('')}</select></label>`:'')+
      `<label class="wide">Ghi chú<textarea class="form-control" name="note" maxlength="500">${esc(g.ghi_chu||'')}</textarea></label>`+
      (!isNew?`<label class="wide"><span><input type="checkbox" name="archived" ${g.trang_thai==='luu_tru'?'checked':''}> Lưu trữ nhóm (vẫn xem lịch sử và thu tiền)</span></label>`:''),
      async f=>{await call('nh_group_save',{id,...f,archived:f.archived==='on'});state.groupId=id;state.boot=await call('nh_boot');paintGroupSelect();},isNew?'Tạo nhóm':'Lưu cài đặt');
  }
  function studentsForm() {
    const ids=state.view.roster.map(m=>m.ma_hoc_sinh);
    const existing=(state.boot.students||[]).filter(s=>!ids.includes(s.ma_hoc_sinh));
    const firstDay=state.view.period?.mode==='eight_sessions'?state.view.today:state.month+'-01';
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
      field('Ngày học','date',s?.ngay_hoc||(state.view.period?.mode==='eight_sessions'||state.view.today.startsWith(state.month)?state.view.today:state.month+'-01'),'date',`required ${edit?'readonly':''}`)+
      field('Giờ bắt đầu','start',s?.gio_bat_dau||g.gio_bat_dau,'time')+field('Giờ kết thúc','end',s?.gio_ket_thuc||g.gio_ket_thuc,'time')+
      `<label class="wide">Ghi chú<textarea class="form-control" name="note" maxlength="500">${esc(s?.ghi_chu||'')}</textarea></label>`+
      `<label class="wide"><span><input type="checkbox" name="planned" ${s?.trang_thai==='du_kien'||!s?'checked':''}> Lịch dự kiến (chưa xác nhận đã học)</span><small>Ngày tương lai luôn là Dự kiến. Lưu điểm danh để xác nhận buổi đã học.</small></label>`+
      (edit?`<label class="wide"><span><input type="checkbox" name="cancelled" ${s.trang_thai==='da_huy'?'checked':''}> Hủy buổi học (giữ lịch sử điểm danh)</span></label>`:'<p class="nh-caption wide">Mỗi nhóm có một buổi trong một ngày. Chọn ngày đã có sẽ mở buổi đó.</p>'),
      async f=>{const result=await call('nh_session_save',{groupId:state.groupId,id,...f,update:edit,revision:s?.revision,cancelled:f.cancelled==='on',planned:f.planned==='on'});state.month=result.month||f.date.slice(0,7);$('nhMonth').value=state.month;state.sessionId=result.id;});
  }
  function receiptForm(studentId) {
    const m=state.view.roster.find(r=>r.ma_hoc_sinh===studentId),fee=projectedFees().find(f=>f.studentId===studentId),id=uid();
    openForm('Thu tiền · '+m.ho_ten,field('Số tiền (đồng)','amount',fee.balance>0?fee.balance:'','number','required min="1" max="1000000000" step="1"')+
      field('Ngày đóng','date',state.view.today,'date','required')+
      `<label>Phương thức<select class="form-control" name="method"><option value="tien_mat">Tiền mặt</option><option value="chuyen_khoan">Chuyển khoản</option><option value="khac">Khác</option></select></label><p class="nh-caption">Ghi nhận cho kỳ ${esc(periodLabel(state.month))}. Số tiền nhập bằng đồng.</p><label class="wide">Ghi chú<textarea class="form-control" name="note" maxlength="500"></textarea></label>`,
      f=>call('nh_receipt_save',{groupId:state.groupId,studentId,id,month:state.month,...f}),'Ghi nhận thu tiền');
  }
  function voidForm(id) {
    openForm('Hủy lần thu tiền','<label class="wide">Lý do hủy<textarea class="form-control" name="reason" required maxlength="200"></textarea><small>Lần thu vẫn được giữ trong lịch sử và không còn được tính vào số đã thu.</small></label>',
      f=>call('nh_receipt_void',{groupId:state.groupId,id,...f}),'Xác nhận hủy');
  }
  function monthForm(reopen) {
    openForm(reopen?'Mở lại kỳ học phí':'Chốt học phí kỳ '+periodLabel(state.month),`<p class="wide">${reopen?'Các khoản phải thu sẽ trở về tạm tính theo dữ liệu hiện tại. Các lần đóng tiền được giữ nguyên.':'Kiểm tra đủ buổi học và điểm danh. Có thể điều chỉnh đơn giá riêng của từng học sinh trước khi chốt.'}</p>`,
      ()=>call(reopen?'nh_reopen_month':'nh_close_month',{groupId:state.groupId,month:state.month,revision:state.view.revision}),reopen?'Mở lại kỳ':'Chốt kỳ');
  }
  async function planForm() {
    const epoch=state.epoch;busy(true,'Đang đề xuất lịch học…');
    try {
      const p=await call('nh_schedule_preview',{groupId:state.groupId,month:state.month});if(epoch!==state.epoch)return;
      if(!p.dates.length){message('Kỳ này đã có đủ lịch 8 buổi.');return;}
      const ids=p.dates.map(()=>uid());
      openForm('Xếp lịch kỳ '+periodLabel(state.month),`<p class="nh-caption wide">Đã có ${p.existing}/8 buổi. Lịch dưới đây dựa vào thứ học của nhóm; có thể đổi ngày để học bù. Các buổi này chỉ được lưu là Dự kiến.</p>`+p.dates.map((date,i)=>field('Buổi '+(p.existing+i+1),'date_'+i,date,'date',`required min="${state.view.today}" max="2100-12-31"`)).join('')+'<label class="wide">Ghi chú cho các buổi<textarea class="form-control" name="note" maxlength="500"></textarea></label>',
        f=>{const sessions=p.dates.map((_,i)=>({id:ids[i],date:f['date_'+i]}));if(new Set(sessions.map(s=>s.date)).size!==sessions.length)throw new Error('Có ngày học bị trùng. Kiểm tra lại lịch.');return call('nh_sessions_plan',{groupId:state.groupId,month:state.month,revision:p.revision,sessions,note:f.note});},'Lưu lịch dự kiến');
    }catch(error){if(epoch===state.epoch)message(error.message,true);}finally{if(epoch===state.epoch)busy(false);}
  }
  function noteForm(sessionId,studentId) {
    const s=state.view.sessions.find(s=>s.ma_buoi===sessionId),m=state.view.roster.find(m=>m.ma_hoc_sinh===studentId);if(!writable(s)||!m)return;
    const d=getMark(sessionId,studentId);
    openForm('Ghi chú · '+m.ho_ten,`<p class="nh-caption wide">Buổi ${dateLabel(s.ngay_hoc)}</p><label class="wide">Ghi chú<textarea class="form-control" name="note" maxlength="250">${esc(d.note)}</textarea></label>`,f=>{setDraft(sessionId,studentId,{note:f.note.trim()});return {local:true};},'Áp dụng ghi chú');
  }
  async function submitForm(event) {
    event.preventDefault();if(state.busy||!state.submit)return;const epoch=state.epoch,handler=state.submit,values=Object.fromEntries(new FormData($('nhForm'))),caption=$('nhSubmit').textContent;
    busy(true,'Đang lưu dữ liệu…');$('nhSubmit').textContent='Đang lưu…';$('nhFormError').hidden=true;
    try {
      const result=await handler(values);if(epoch!==state.epoch)return;$('nhDialog').close();state.submit=null;
      if(result?.local){paintAttendance();paintOverview();paintFees();paintSummary();updateDraftUi();return;}
      try{await loadView(epoch);if(epoch===state.epoch)message('Đã lưu dữ liệu.');}
      catch(error){if(epoch===state.epoch){message('Đã lưu, nhưng chưa tải lại được dữ liệu. Bấm Tải lại. '+error.message,true);paintEmpty('Dữ liệu đã lưu. Bấm Tải lại để xem kết quả.');}}
    }catch(error){if(epoch===state.epoch){$('nhFormError').hidden=false;$('nhFormError').textContent=error.message;}}
    finally{if(epoch===state.epoch){$('nhSubmit').textContent=caption;busy(false);}}
  }
  async function saveAttendance() {
    if(state.busy||!state.dirty)return;const epoch=state.epoch;
    const sessions=Object.entries(state.drafts).map(([sessionId,marks])=>({sessionId,revision:state.view.sessions.find(s=>s.ma_buoi===sessionId).revision,marks:Object.entries(marks).map(([studentId,d])=>({studentId,...d}))}));
    busy(true,'Đang lưu điểm danh…');
    try {
      await call('nh_attendance_batch_save',{groupId:state.groupId,sessions});if(epoch!==state.epoch)return;clearDrafts();
      try{await loadView(epoch);message('Đã lưu điểm danh và cập nhật học phí.');}
      catch(error){message('Đã lưu điểm danh, nhưng chưa tải lại được dữ liệu. Bấm Tải lại. '+error.message,true);paintEmpty('Điểm danh đã lưu. Tải lại để xem kết quả.');}
    }catch(error){if(epoch===state.epoch)message(error.message+' Nếu mất kết nối, bấm Tải lại để kiểm tra trạng thái lưu.',true);}
    finally{if(epoch===state.epoch)busy(false);}
  }
  function exportCsv() {
    if(!state.view)return;if(state.dirty){message('Lưu điểm danh trước khi xuất để số liệu khớp với dữ liệu đã lưu.',true);return;}
    const v=state.view,sessions=v.sessions.filter(s=>s.trang_thai!=='da_huy'),names=Object.fromEntries(v.roster.map(m=>[m.ma_hoc_sinh,m.ho_ten]));
    const rows=[['Nhóm',v.group.ten_nhom,'Kỳ',v.month],['Họ tên','Lớp',...sessions.map(s=>dateLabel(s.ngay_hoc)),'Có mặt','Vắng','Phải đóng (đồng)','Đã đóng (đồng)','Còn thiếu (đồng)','Đóng dư (đồng)','Trạng thái','Ghi chú']];
    v.roster.forEach(m=>{const f=v.fees.find(f=>f.studentId===m.ma_hoc_sinh);rows.push([m.ho_ten,m.lop,...sessions.map(s=>!within(m,s.ngay_hoc)?'Không thuộc buổi':s.trang_thai==='du_kien'||s.ngay_hoc>v.today?'Dự kiến':statusLabel[savedMark(s.ma_buoi,m.ma_hoc_sinh).trang_thai]),f.attended,f.absent,f.due,f.paid,Math.max(0,f.balance),Math.max(0,-f.balance),feeStatus(f).text,m.ghi_chu]);});
    rows.push([],['LỊCH SỬ ĐÓNG TIỀN'],['Ngày đóng','Học sinh','Số tiền (đồng)','Phương thức','Trạng thái','Ghi chú']);
    v.receipts.forEach(p=>rows.push([dateLabel(p.ngay_dong),names[p.ma_hoc_sinh]||p.ma_hoc_sinh,p.so_tien_vnd,p.phuong_thuc,p.trang_thai==='da_huy'?'Đã hủy':'Đã thu',p.ghi_chu]));
    const cell=x=>'"'+String(typeof x==='string'&&/^[=+@-]/.test(x)?"'"+x:x??'').replaceAll('"','""')+'"';
    const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Nhom_hoc_'+v.month+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function externalEdit(handler) {if(!discard())return;clearDrafts();closeProfile();paint();handler();}
  function onClick(event) {
    const button=event.target.closest('button');if(!button||button.disabled||state.busy)return;
    if(button.dataset.profile)return openProfile(button.dataset.profile);
    if(button.dataset.tab){state.tab=button.dataset.tab;paintTab();return;}
    if(button.dataset.session){state.sessionId=button.dataset.session;state.focusSession=true;state.tab='attendance';paintAttendance();paintTab();return;}
    if(button.dataset.cycle){const panel=button.closest('.nh-tab-panel'),sessionId=button.dataset.cycle,id=button.dataset.student,old=getMark(sessionId,id).status,next={chua_diem_danh:'co_mat',co_mat:'vang',vang:'chua_diem_danh'}[old];setDraft(sessionId,id,{status:next});refreshAfterMark(sessionId,id);panel.querySelectorAll('[data-cycle]').forEach(b=>{if(b.dataset.cycle===sessionId&&b.dataset.student===id)b.focus({preventScroll:true});});return;}
    if(button.dataset.mark){const id=button.dataset.student;setDraft(state.sessionId,id,{status:button.dataset.mark});refreshAfterMark(state.sessionId,id);return;}
    if(button.dataset.markNote)return noteForm(button.dataset.markNote,button.dataset.student);
    if(button.dataset.member)return externalEdit(()=>memberForm(button.dataset.member));
    if(button.dataset.receive)return externalEdit(()=>receiptForm(button.dataset.receive));
    if(button.dataset.void)return externalEdit(()=>voidForm(button.dataset.void));
    const action=button.dataset.action;
    if(action==='save-attendance')return saveAttendance();
    if(action==='toggle-mode'){state.focusSession=!state.focusSession;paintAttendance();return;}
    if(action==='all-present'){const s=selectedSession();if(!writable(s))return;state.view.roster.filter(m=>within(m,s.ngay_hoc)).forEach(m=>setDraft(s.ma_buoi,m.ma_hoc_sinh,{status:'co_mat'}));paintAttendance();paintOverview();paintSummary();paintFees();updateDraftUi();return;}
    const actions={'add-students':studentsForm,'new-session':()=>sessionForm(false),'edit-session':()=>sessionForm(true),'plan-sessions':planForm,'close':()=>monthForm(false),'reopen':()=>monthForm(true)};
    if(actions[action])externalEdit(actions[action]);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    App.init('groups');$('nhLogin').addEventListener('click',()=>App.openLogin('admin'));
    $('nhAddGroup').addEventListener('click',()=>externalEdit(()=>groupForm(true)));$('nhEditGroup').addEventListener('click',()=>externalEdit(()=>groupForm(false)));
    $('nhReload').addEventListener('click',()=>state.groupId?reload():boot());$('nhGroup').addEventListener('change',()=>changeGroup($('nhGroup').value));
    $('nhGroupCards').addEventListener('click',e=>{const b=e.target.closest('[data-group]');if(b)changeGroup(b.dataset.group);});
    $('nhMonth').addEventListener('change',()=>changeMonth($('nhMonth').value));$('nhPrevMonth').addEventListener('click',()=>shiftMonth(-1));$('nhNextMonth').addEventListener('click',()=>shiftMonth(1));
    $('nhExport').addEventListener('click',exportCsv);$('nhGroupContent').addEventListener('click',onClick);$('nhProfileBody').addEventListener('click',onClick);
    $('nhAttendance').addEventListener('input',event=>{if(event.target.id==='nhSearch'){state.search=event.target.value;applyStudentFilter();}});
    $('nhOverview').addEventListener('input',event=>{if(event.target.id==='nhOverviewSearch'){state.search=event.target.value;applyStudentFilter();}});
    $('nhAttendance').addEventListener('change',event=>{if(event.target.id==='nhSessionSelect'){state.sessionId=event.target.value;paintAttendance();}});
    $('nhAttendance').addEventListener('contextmenu',event=>{const b=event.target.closest('[data-cycle]');if(b&&!b.disabled){event.preventDefault();noteForm(b.dataset.cycle,b.dataset.student);}});
    $('nhOverview').addEventListener('contextmenu',event=>{const b=event.target.closest('[data-cycle]');if(b&&!b.disabled){event.preventDefault();noteForm(b.dataset.cycle,b.dataset.student);}});
    $('nhFees').addEventListener('input',event=>{if(event.target.id==='nhFeeSearch'){state.feeSearch=event.target.value;applyFeeFilter();}});
    $('nhFees').addEventListener('change',event=>{if(event.target.id==='nhFeeFilter'){state.feeFilter=event.target.value;applyFeeFilter();}});
    $('nhForm').addEventListener('submit',submitForm);
    ['nhCloseDialog','nhCancelDialog'].forEach(id=>$(id).addEventListener('click',()=>{if(!state.busy){$('nhDialog').close();state.submit=null;}}));$('nhDialog').addEventListener('cancel',e=>{if(state.busy)e.preventDefault();});
    $('nhCloseProfile').addEventListener('click',closeProfile);$('nhProfile').addEventListener('close',()=>{state.profileId='';});
    window.addEventListener('app:auth-change',resetAuth);window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});resetAuth();
  });
})();
