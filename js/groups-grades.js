(function(){
  'use strict';
  const terms={gk1:'Giữa kỳ I',ck1:'Cuối kỳ I',gk2:'Giữa kỳ II',ck2:'Cuối kỳ II'};
  const yearFor=date=>{const year=Number(String(date).slice(0,4))-(Number(String(date).slice(5,7))<8?1:0);return year+'-'+(year+1);};
  const score=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>10?'—':String(Number(value)).replace('.',',');
  function create(options) {
    const esc=options.escape,$=id=>document.getElementById(id);
    let data=null,loadedKey='',pendingKey='',sequence=0,dialogSequence=0,loading=false,error='',year='',assessment='gk1',working=false,source=null,preview=null,requestId='',undoBatch='',returnFocus=null;
    let dialog=null;
    const context=()=>options.context();
    const valid=()=>{const c=context();return c.admin&&c.view&&c.boot?.features?.grades;};
    const selectedYear=()=>year||(year=yearFor(context().boot?.today||new Date().toISOString().slice(0,10)));
    const key=()=>valid()?[context().epoch,context().view.group.ma_nhom,selectedYear(),assessment].join(':'):'';
    function controls() {
      const years=Array.from(new Set([selectedYear(),...(data?.years||[])])).sort().reverse();
      return '<div class="nh-grade-context"><label>Đợt kiểm tra<select class="form-control" id="nhGradeAssessment">'+Object.entries(terms).map(([id,label])=>'<option value="'+id+'" '+(id===assessment?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+(years.length>1?'<label>Năm học<select class="form-control" id="nhGradeYear">'+years.map(y=>'<option '+(y===selectedYear()?'selected':'')+'>'+esc(y)+'</option>').join('')+'</select></label>':'<span>Năm học '+esc(selectedYear().replace('-','–'))+'</span>')+'</div>';
    }
    function paint() {
      if(!valid())return;
      const c=context(),ready=loadedKey===key(),scores=new Map((ready?data.scores:[]).map(row=>[row.ma_hoc_sinh,row]));
      const rows=c.view.roster.map(m=>{const result=scores.get(m.ma_hoc_sinh);return '<tr><th scope="row"><button type="button" class="nh-student-name" data-profile="'+esc(m.ma_hoc_sinh)+'">'+esc(m.ho_ten)+'</button>'+(m.lop?'<small>'+esc(m.lop)+'</small>':'')+'</th><td class="nh-grade-score" data-grade-tv="'+esc(m.ma_hoc_sinh)+'">'+score(result?.tieng_viet)+'</td><td class="nh-grade-score" data-grade-math="'+esc(m.ma_hoc_sinh)+'">'+score(result?.toan)+'</td><td class="nh-grade-edit"><button type="button" class="nh-link" data-member="'+esc(m.ma_thanh_vien)+'" aria-label="Sửa thông tin nhóm của '+esc(m.ho_ten)+'">Sửa</button></td></tr>';}).join('');
      const history=ready?data.history:[];
      $('nhStudents').innerHTML='<div class="nh-card nh-grades-card"><div class="nh-card-heading"><div><h2>Học sinh <span class="nh-caption">· '+c.view.roster.length+'</span></h2></div><div class="nh-actions"><button type="button" class="btn btn-secondary" data-grade-import>Nhập điểm Excel</button><button type="button" class="btn btn-primary" data-action="add-students" '+(c.view.group.trang_thai!=='dang_hoc'?'disabled':'')+'>+ Thêm học sinh</button></div></div>'+controls()+'<p id="nhGradesStatus" class="nh-caption" role="status" aria-live="polite">'+(error?esc(error)+' <button type="button" class="nh-link" data-grade-reload>Thử lại</button>':loading?'Đang tải điểm…':'')+'</p><div class="nh-table-wrap"><table class="nh-table nh-grades-table" aria-label="'+esc(terms[assessment]+' · Năm học '+selectedYear())+'"><thead><tr><th scope="col">Học sinh</th><th scope="col" class="nh-grade-score">Tiếng Việt</th><th scope="col" class="nh-grade-score">Toán</th><th scope="col" class="nh-grade-edit"><span class="sr-only">Thông tin nhóm</span></th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="nh-caption nh-grades-caption">'+(ready?'—: chưa có điểm · ':'')+'Bấm tên để xem hồ sơ; Sửa để cập nhật thông tin nhóm.</p>'+(history.length?'<details class="nh-grade-history"><summary>Lịch sử nhập điểm ('+history.length+')</summary>'+history.map(b=>'<div class="nh-grade-history-row"><div><strong>'+esc(b.undoOf?'Hoàn tác · '+b.source:b.source)+'</strong><small>'+esc(new Date(b.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))+' · '+b.count+' học sinh</small></div>'+(b.canUndo?'<button type="button" class="nh-link" data-grade-undo="'+esc(b.id)+'">Hoàn tác</button>':'')+'</div>').join('')+'</details>':'')+'</div>';
    }
    async function load(force=false) {
      if(!valid())return;
      const currentKey=key();if(!force&&(loadedKey===currentKey||pendingKey===currentKey))return;
      const ticket=++sequence,groupId=context().view.group.ma_nhom;pendingKey=currentKey;loading=true;error='';paint();
      try {
        const result=await options.call('nh_grades_list',{groupId,schoolYear:selectedYear(),assessment});
        if(ticket!==sequence||currentKey!==key())return;
        data=result;loadedKey=currentKey;
      }catch(e){if(ticket===sequence&&currentKey===key())error='Chưa tải được điểm. '+e.message;}
      finally{if(ticket===sequence&&currentKey===key()){loading=false;pendingKey='';paint();}}
    }
    function ensureDialog() {
      if(dialog)return;
      dialog=document.createElement('dialog');dialog.id='nhGradeDialog';dialog.className='nh-dialog nh-grade-dialog';dialog.setAttribute('aria-labelledby','nhGradeDialogTitle');document.body.appendChild(dialog);
      dialog.addEventListener('cancel',event=>{if(working)event.preventDefault();});
      dialog.addEventListener('close',()=>{dialogSequence++;source=null;preview=null;requestId='';undoBatch='';dialog.replaceChildren();if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null;});
    }
    const payload=()=>({schoolYear:$('nhGradeImportYear').value,assessment:$('nhGradeImportAssessment').value,sourceClass:$('nhGradeSourceClass').value,sourceFile:source.sourceFile,rows:source.rows});
    function showError(text) {const el=$('nhGradeError');if(el){el.textContent=text;el.hidden=!text;}}
    function fieldsBusy(value) {working=value;if(dialog)dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);}
    function importForm(button) {
      if(!valid()||context().busy||working)return;
      ensureDialog();returnFocus=button;source=null;preview=null;undoBatch='';requestId=crypto.randomUUID();dialogSequence++;
      dialog.innerHTML='<header><div><h2 id="nhGradeDialogTitle">Nhập điểm từ Excel</h2><p>Tiếng Việt ở cột J · Toán ở cột K</p></div><button type="button" class="nh-icon-button" data-grade-cancel aria-label="Đóng">×</button></header><label class="nh-grade-file">Chọn tệp .xlsx<input type="file" class="form-control" id="nhGradeExcelFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label><div class="nh-grade-import-context"><label>Năm học<input class="form-control" id="nhGradeImportYear" value="'+esc(selectedYear())+'" pattern="20[0-9]{2}-20[0-9]{2}"></label><label>Đợt kiểm tra<select class="form-control" id="nhGradeImportAssessment">'+Object.entries(terms).map(([id,label])=>'<option value="'+id+'" '+(id===assessment?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label>Lớp trong tệp<input class="form-control" id="nhGradeSourceClass" maxlength="40"></label></div><p id="nhGradeError" class="nh-form-error" role="alert" hidden></p><div id="nhGradePreview"></div><footer><button class="btn btn-secondary" type="button" data-grade-cancel>Quay lại</button><button class="btn btn-secondary" type="button" data-grade-preview hidden>Xem trước lại</button><button class="btn btn-primary" type="button" data-grade-save disabled>Chọn tệp để xem trước</button></footer>';
      dialog.showModal();
    }
    async function previewImport() {
      if(!source||working||!valid())return;
      const ticket=dialogSequence,epoch=context().epoch;fieldsBusy(true);showError('');
      try {
        const result=await options.call('nh_grades_preview',payload());if(ticket!==dialogSequence||context().epoch!==epoch||!valid())return;
        preview=result;
        const unknown=result.rows.filter(r=>r.state==='matched'&&r.missingClass).length;
        const rows=result.rows.map(r=>'<tr><td>'+esc(r.name)+(r.studentName&&r.name!==r.studentName?'<small>→ '+esc(r.studentName)+'</small>':'')+'<small>Dòng '+r.row+(r.groups?' · '+esc(r.groups.join(', ')):'')+'</small></td><td class="nh-grade-score">'+score(r.vietnamese)+'</td><td class="nh-grade-score">'+score(r.math)+'</td><td class="nh-grade-match">'+(r.state==='matched'?r.changed?'Sẽ cập nhật':'Giữ nguyên':r.state==='outside'?'Ngoài nhóm':'Cần chọn lại')+(r.state==='review'?'<select class="form-control" data-grade-map="'+r.row+'" aria-label="Chọn học sinh cho '+esc(r.name)+'"><option value="">Chưa ghép</option>'+result.candidates.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+(s.className?' · '+esc(s.className):'')+'</option>').join('')+'</select>':'')+'</td></tr>').join('');
        $('nhGradePreview').innerHTML='<div class="nh-grade-import-summary"><strong>'+result.matched+' khớp</strong><span>'+result.changed+' cập nhật</span><span>'+result.outside+' ngoài nhóm</span>'+(result.review?'<span>'+result.review+' cần chọn lại</span>':'')+'</div>'+(unknown?'<p class="nh-inline-info">'+unknown+' hồ sơ chưa có lớp. Kiểm tra đúng học sinh '+esc(result.sourceClass?'lớp '+result.sourceClass:'trước khi nhập')+'. Hồ sơ cũ được giữ nguyên.</p>':'')+'<div class="nh-table-wrap"><table class="nh-table nh-grade-preview-table"><thead><tr><th>Học sinh</th><th class="nh-grade-score">Tiếng Việt</th><th class="nh-grade-score">Toán</th><th>Ghép tên</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="nh-caption">Điểm trống giữ điểm đã có; điểm 0 được giữ nguyên. Chỉ nhập học sinh đã ghép.</p>';
      }catch(e){if(ticket===dialogSequence&&context().epoch===epoch){preview=null;showError(e.message);}}
      finally{if(ticket===dialogSequence&&context().epoch===epoch){fieldsBusy(false);const save=dialog.querySelector('[data-grade-save]');save.disabled=!preview?.changed;save.textContent=preview?.changed?'Nhập điểm '+preview.changed+' học sinh':preview?'Không có điểm thay đổi':'Xem trước chưa hoàn tất';dialog.querySelector('[data-grade-preview]').hidden=false;}}
    }
    async function readFile(file) {
      if(!file||working||!valid())return;
      if(!/\.xlsx$/i.test(file.name)||file.size>5242880){showError('Chọn tệp .xlsx tối đa 5 MB.');return;}
      const ticket=++dialogSequence,epoch=context().epoch;fieldsBusy(true);preview=null;showError('');
      try {
        const bytes=file.arrayBuffer?await file.arrayBuffer():await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Không đọc được tệp Excel.'));reader.readAsArrayBuffer(file);});
        if(ticket!==dialogSequence||context().epoch!==epoch||!valid())return;
        const parsed=NHExcel.parse(bytes);source={...parsed,sourceFile:file.name};requestId=crypto.randomUUID();
        if(parsed.schoolYear)$('nhGradeImportYear').value=parsed.schoolYear;if(parsed.assessment)$('nhGradeImportAssessment').value=parsed.assessment;$('nhGradeSourceClass').value=parsed.sourceClass;
      }catch(e){if(ticket===dialogSequence&&context().epoch===epoch){source=null;showError(e.message);}}
      finally{if(ticket===dialogSequence&&context().epoch===epoch){fieldsBusy(false);const save=dialog.querySelector('[data-grade-save]');save.disabled=true;save.textContent='Chọn tệp để xem trước';}}
      if(ticket===dialogSequence&&source)await previewImport();
    }
    async function saveImport() {
      if(!valid()||working||!preview?.changed)return;
      const ticket=dialogSequence,epoch=context().epoch,body={...payload(),id:requestId,revision:preview.revision};fieldsBusy(true);showError('');options.busy(true);
      try {
        const result=await options.call('nh_grades_import',body);if(ticket!==dialogSequence||context().epoch!==epoch||!valid())return;
        year=body.schoolYear;assessment=body.assessment;dialog.close();await load(true);options.message('Đã lưu điểm cho '+result.saved+' học sinh. Hồ sơ, điểm danh và học phí được giữ nguyên.');
      }catch(e){if(ticket===dialogSequence&&context().epoch===epoch)showError(e.message);}
      finally{if(context().epoch===epoch){options.busy(false);fieldsBusy(false);}}
    }
    function undoForm(button) {
      if(!valid()||working||context().busy||!data)return;
      const batch=data.history.find(b=>b.id===button.dataset.gradeUndo&&b.canUndo);if(!batch)return;
      ensureDialog();source=null;preview=null;returnFocus=button;undoBatch=batch.id;requestId=crypto.randomUUID();dialogSequence++;
      dialog.innerHTML='<header><h2 id="nhGradeDialogTitle">Hoàn tác lần nhập điểm</h2></header><p>'+esc(batch.source)+' · '+batch.count+' học sinh</p><p>Khôi phục điểm trước lần nhập này. Lịch sử điểm vẫn được giữ lại.</p><p id="nhGradeError" class="nh-form-error" role="alert" hidden></p><footer><button type="button" class="btn btn-secondary" data-grade-cancel>Quay lại</button><button type="button" class="btn btn-primary" data-grade-confirm-undo>Hoàn tác '+batch.count+' học sinh</button></footer>';
      dialog.showModal();
    }
    async function undo() {
      if(!valid()||working||!undoBatch)return;
      const ticket=dialogSequence,epoch=context().epoch,body={id:requestId,batchId:undoBatch,revision:data.revision};fieldsBusy(true);showError('');options.busy(true);
      try{const result=await options.call('nh_grades_undo',body);if(ticket!==dialogSequence||context().epoch!==epoch||!valid())return;dialog.close();await load(true);options.message('Đã hoàn tác điểm của '+result.saved+' học sinh; lịch sử được giữ nguyên.');}
      catch(e){if(ticket===dialogSequence&&context().epoch===epoch)showError(e.message);}
      finally{if(context().epoch===epoch){options.busy(false);fieldsBusy(false);}}
    }
    document.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b||b.disabled||!valid())return;
      if(b.hasAttribute('data-grade-import'))importForm(b);
      else if(b.hasAttribute('data-grade-cancel')&&!working)dialog.close();
      else if(b.hasAttribute('data-grade-preview'))previewImport();
      else if(b.hasAttribute('data-grade-save'))saveImport();
      else if(b.hasAttribute('data-grade-reload'))load(true);
      else if(b.hasAttribute('data-grade-undo'))undoForm(b);
      else if(b.hasAttribute('data-grade-confirm-undo'))undo();
    });
    document.addEventListener('change',event=>{
      if(!valid())return;const el=event.target;
      if(el.id==='nhGradeAssessment'||el.id==='nhGradeYear'){if(context().busy||working)return;if(el.id==='nhGradeAssessment')assessment=el.value;else year=el.value;loadedKey='';load();}
      if(el.id==='nhGradeExcelFile')readFile(el.files[0]);
      if(el.matches('[data-grade-map]')&&source){const row=source.rows.find(r=>r.row===Number(el.dataset.gradeMap));if(row){row.studentId=el.value;previewImport();}}
      if(['nhGradeImportYear','nhGradeImportAssessment','nhGradeSourceClass'].includes(el.id)&&source){preview=null;dialog.querySelector('[data-grade-save]').disabled=true;dialog.querySelector('[data-grade-preview]').hidden=false;}
    });
    function reset(keepAcademic=false) {sequence++;dialogSequence++;data=null;loadedKey='';pendingKey='';loading=false;error='';working=false;source=null;preview=null;requestId='';undoBatch='';returnFocus=null;if(dialog){if(dialog.open)dialog.close();dialog.replaceChildren();}if(!keepAcademic){year='';assessment='gk1';}}
    function profileHTML(id) {
      if(!valid()||loadedKey!==key())return '';
      const row=data.scores.find(r=>r.ma_hoc_sinh===id);
      return '<section class="nh-profile-grades"><h3>'+esc(terms[assessment])+' · '+esc(selectedYear())+'</h3><div><span>Tiếng Việt <strong>'+score(row?.tieng_viet)+'</strong></span><span>Toán <strong>'+score(row?.toan)+'</strong></span></div>'+(row?'<p class="nh-caption">Nguồn: '+esc(row.tep_nguon)+' · Dòng '+row.dong_nguon+'</p>':'<p class="nh-caption">Chưa có điểm đợt này.</p>')+'</section>';
    }
    return {paint,load,reset,invalidate:()=>reset(true),profileHTML};
  }
  window.NHGrades={create,yearFor};
})();
