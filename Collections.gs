/** E-GV 9.6: xác thực và bản lưu Sheets cho kho Prompt/nhật ký trên D1.
 * Chỉ có khóa công khai trong mã. Khóa ký riêng nằm trong Cloudflare Secret.
 */
const EGV_COLLECTIONS_PUBLIC_KEY = {"kty":"RSA","n":"uBhMVQrksBr6nwsUtiBBFep-Ve3bfqfo6YUcAHHLRt9f7f-8glKrvKLmNFZicSQqt_q8otMe5RzQVH8xqd9ZdI1hJw294GsxjAD38yM7iurOZY3RrUr76pi9wPodkRXlTZOIC-JPl5HWHZR_TUf1D5J-fJ-moRXMSRKe8UF2it1F0dLPg93Pbs4drJVLQ3fyk_HPkodiq3rPVgVJRh-sAQB_HU1S8omoptvsx2rG3dJ5jFTLcaSTF39q1qlbibX1r8rBVXMLCjtXXXD7EU8-cYa9JxhU8cajYxUPKDAThKkXrkMDJdCWFY76RRe-RV4v3lW17iKbS9tjN-1pP9BqGw","e":"AQAB"};
const EGV_NATIVE_ADMIN_PUBLIC_KEY = {"kty":"RSA","n":"o5gWG8nXHBkAcY1_UGF23D8DlLdpDVa5SNJ7zLh43679dGXjNeQzjgxhYGprpC3WS1QZjmdLqTxX4LRGZXt-e51AZddIDU30uPYBtZpO_tzz-WtaEXPNqhGSZYSPO0JTWWb4Ww2U1oRC3_GjUIkQMua60YUEEbFxTj8Rgm3XTPyXVSR1sP1smBxDsuTJ3gXlY6KWLR1z5RxN4Wo1Kw_x-LP8Pr_0Mx6TQCK-4qQkpQvu1ZWH1BJZO5StLVas7-Y2GwUbleK6nkOgzwzfnPudKyyFthFahvwsFa1Ws2tt5LtQWJYpDPLjpctLYxFFRePJBADKvrfLGKW6ItXaY2mSfQ","e":"AQAB"};
const EGV_NATIVE_ADMIN_KEY_ID = "0a8dcb353c66494f";
const EGV_COLLECTIONS_KEY_ID = 'a21ada8e6e932c9a';
const EGV_COLLECTIONS_SHEET_ID = '1KPw-UYew83KygpFNe4vMd4VeO1xmkKbHBTLIr61l-L8';
const EGV_COLLECTIONS_HEADERS = {
  Prompts: ['id','title','category','content','platform','access','created_at'],
  Repairs: ['id','date','task','location','cost','warranty','status','vendor','reporter','asset_id','image_url','note'],
  PromptFavorites: ['user_id','prompt_id','created_at']
};
function egvCollectionsActive_(){return PropertiesService.getScriptProperties().getProperty('EGV_COLLECTIONS_ACTIVE')==='1';}
function egvCollectionsMoved_(){return createResponse({status:'error',code:'COLLECTIONS_MIGRATED',message:'Kho Prompt và nhật ký đã chuyển sang Cloudflare. Vui lòng tải lại E-GV.'});}
function egvCollectionsBridge_(payload){
  const action=String(payload.action||'');
  if(action==='verify'&&egvNativeAdminActive_())return createResponse({status:'error',code:'ADMIN_AUTH_MIGRATED',message:'Đăng nhập quản trị đã chuyển sang Cloudflare. Vui lòng tải lại E-GV.'});
  if(action==='admin_auth_complete'){
    if(!egvCloudAdminToken_(payload.adminToken,'admin'))return createResponse({status:'error',message:'Phiên quản trị không hợp lệ.'});
    PropertiesService.getScriptProperties().setProperty('EGV_NATIVE_ADMIN_AUTH_ACTIVE','1');
    return createResponse({status:'success'});
  }
  if(action==='collections_health')return createResponse({status:'success',version:'9.6.0',active:egvCollectionsActive_(),cryptoSupported:typeof BigInt==='function',keyId:EGV_COLLECTIONS_KEY_ID,nativeAdminKeyId:EGV_NATIVE_ADMIN_KEY_ID});
  if(action==='collections_auth'){
    const p=resolvePrincipal(payload);
    if(!p)return createResponse({status:'error',message:'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'});
    return createResponse({status:'success',data:{role:p.role,sub:p.sub,exp:p.exp,membership:p.role==='admin'?'admin':normalizeMembership(p.membership)}});
  }
  if(action==='collections_bridge')return egvCollectionsSigned_(payload);
  const writes=['create','update','delete','toggle_favorite','sync_favorites'];
  if(writes.indexOf(action)!==-1){
    const lock=LockService.getScriptLock();lock.waitLock(15000);
    try{
      if(egvCollectionsActive_())return egvCollectionsMoved_();
      const data=payload.data||{};
      if(action==='toggle_favorite')return handleToggleFavorite(payload,data);
      if(action==='sync_favorites')return handleSyncFavorites(payload,data);
      if(!isAdminPrincipal(payload))return createResponse({status:'error',message:'Phiên quản trị không hợp lệ hoặc đã hết hạn.'});
      if(action==='create')return handleCreate(payload.sheetType,data);
      if(action==='update')return handleUpdate(payload.sheetType,data);
      return handleDelete(payload.sheetType,data);
    }finally{lock.releaseLock();}
  }
  if(['get_prompts','get_repairs'].indexOf(action)!==-1&&egvCollectionsActive_())return egvCollectionsMoved_();
  return null;
}
function egvCollectionsHex_(bytes){return bytes.map(b=>(b&255).toString(16).padStart(2,'0')).join('');}
function egvCollectionsVerify_(message,signature,publicKey){
  if(typeof message!=='string'||message.length>1000000||typeof signature!=='string'||!/^[A-Za-z0-9_-]{342}$/.test(signature))return false;
  try{
    const bytes=Utilities.base64DecodeWebSafe(signature),modulusBytes=Utilities.base64DecodeWebSafe((publicKey||EGV_COLLECTIONS_PUBLIC_KEY).n);
    if(bytes.length!==256||modulusBytes.length!==256)return false;
    const modulus=BigInt('0x'+egvCollectionsHex_(modulusBytes));let value=BigInt('0x'+egvCollectionsHex_(bytes));
    if(value>=modulus)return false;
    let exponent=BigInt(65537),decoded=BigInt(1);
    while(exponent>BigInt(0)){if(exponent%BigInt(2))decoded=decoded*value%modulus;value=value*value%modulus;exponent=exponent/BigInt(2);}
    const digest=egvCollectionsHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,message,Utilities.Charset.UTF_8));
    const encoded='0001'+'ff'.repeat(202)+'00'+'3031300d060960864801650304020105000420'+digest;
    return constantTimeEquals(decoded.toString(16).padStart(512,'0'),encoded);
  }catch(error){return false;}
}
function egvCollectionsSpreadsheet_(){const ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss||ss.getId()!==EGV_COLLECTIONS_SHEET_ID)throw new Error('COLLECTIONS_SHEET_MISMATCH');return ss;}
function egvCollectionsRead_(){
  egvCollectionsSpreadsheet_();const tables={};
  Object.keys(EGV_COLLECTIONS_HEADERS).forEach(name=>{
    const columns=EGV_COLLECTIONS_HEADERS[name];ensureSheet(name,columns);
    tables[name]=getSheetObjects(name).map(row=>{const record={};columns.forEach(c=>{const value=readInsensitive(row,c);record[c]=value==null?'':value;});return record;});
  });
  return tables;
}
function egvCollectionsSigned_(payload){
  if(payload.keyId!==EGV_COLLECTIONS_KEY_ID||!egvCollectionsVerify_(payload.message,payload.signature))return createResponse({status:'error',code:'BRIDGE_SIGNATURE_INVALID',message:'Yêu cầu bản lưu không hợp lệ.'});
  let request;try{request=JSON.parse(payload.message);}catch(error){return createResponse({status:'error',message:'Yêu cầu không hợp lệ.'});}
  if(!request||request.version!==1||!Number.isSafeInteger(request.issuedAt)||Math.abs(Date.now()-request.issuedAt)>600000)return createResponse({status:'error',message:'Yêu cầu bản lưu đã hết hạn.'});
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const props=PropertiesService.getScriptProperties();
    if(request.op==='nh_backup')return createResponse({status:'success',data:egvNhMirror_(request)});
    if(request.op==='activate_export'){
      const tables=egvCollectionsRead_();
      props.setProperty('EGV_COLLECTIONS_ACTIVE','1');
      return createResponse({status:'success',data:{tables:tables,active:true}});
    }
    if(request.op==='export')return createResponse({status:'success',data:{tables:egvCollectionsRead_(),active:egvCollectionsActive_()}});
    if(request.op==='status')return createResponse({status:'success',data:{active:egvCollectionsActive_(),revision:Number(props.getProperty('EGV_COLLECTIONS_BACKUP_REVISION')||0),checksum:props.getProperty('EGV_COLLECTIONS_BACKUP_CHECKSUM')||''}});
    if(request.op!=='backup'||!egvCollectionsActive_()||!Number.isSafeInteger(request.revision)||request.revision<1)throw new Error('BACKUP_INVALID');
    const current=Number(props.getProperty('EGV_COLLECTIONS_BACKUP_REVISION')||0);
    if(current>=request.revision)return createResponse({status:'success',data:{revision:current,checksum:props.getProperty('EGV_COLLECTIONS_BACKUP_CHECKSUM')||''}});
    const plans=egvCollectionsPlans_(request.tables);
    plans.forEach(plan=>{
      const sheet=plan.sheet,rows=plan.rows,width=plan.headers.length;
      if(rows.length+1>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),rows.length+1-sheet.getMaxRows());
      if(rows.length){
        // setRichTextValue keeps literal =text as text, never as a Sheet formula.
        const values=rows.map(row=>row.map(v=>typeof v==='string'&&v.startsWith('=')?'':v));
        sheet.getRange(2,1,values.length,width).setValues(values);
        rows.forEach((row,r)=>row.forEach((v,c)=>{if(typeof v==='string'&&v.startsWith('='))sheet.getRange(r+2,c+1).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(v).build());}));
      }
      if(plan.previousRows>rows.length)sheet.getRange(rows.length+2,1,plan.previousRows-rows.length,width).clearContent();
    });
    SpreadsheetApp.flush();
    const actual=egvCollectionsRead_(),expected=JSON.stringify(request.tables),readback=JSON.stringify(actual);
    if(expected!==readback)throw new Error('BACKUP_READBACK_MISMATCH');
    const checksum=egvCollectionsHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,readback,Utilities.Charset.UTF_8));
    props.setProperties({EGV_COLLECTIONS_BACKUP_REVISION:String(request.revision),EGV_COLLECTIONS_BACKUP_CHECKSUM:checksum,EGV_COLLECTIONS_BACKUP_AT:new Date().toISOString()});
    return createResponse({status:'success',data:{revision:request.revision,checksum:checksum}});
  }catch(error){return createResponse({status:'error',code:'COLLECTIONS_BACKUP_FAILED',message:'Chưa hoàn tất bản lưu trên Google Sheets.'});}
  finally{lock.releaseLock();}
}
function egvCollectionsPlans_(tables){
  const ss=egvCollectionsSpreadsheet_();
  if(!tables||typeof tables!=='object'||Object.keys(tables).sort().join(',')!==Object.keys(EGV_COLLECTIONS_HEADERS).sort().join(','))throw new Error('TABLES_INVALID');
  return Object.keys(EGV_COLLECTIONS_HEADERS).map(name=>{
    const columns=EGV_COLLECTIONS_HEADERS[name],records=tables[name];if(!Array.isArray(records)||records.length>10000)throw new Error('RECORDS_INVALID');
    const sheet=ss.getSheetByName(name);if(!sheet)throw new Error('SHEET_MISSING');
    const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String),normalized=headers.map(normalizeHeader);
    columns.forEach(c=>{if(normalized.indexOf(c)===-1)throw new Error('HEADERS_INVALID');});
    const old=sheet.getDataRange().getValues().slice(1),idIndex=normalized.indexOf(name==='PromptFavorites'?'user_id':'id'),promptIndex=normalized.indexOf('prompt_id'),seen={};
    const rows=records.map(record=>{
      if(!record||typeof record!=='object'||Object.keys(record).sort().join(',')!==columns.slice().sort().join(','))throw new Error('FIELDS_INVALID');
      const id=name==='PromptFavorites'?record.user_id+'\n'+record.prompt_id:String(record.id);
      if(!id||seen[id])throw new Error('IDS_INVALID');seen[id]=true;
      const previous=old.find(row=>name==='PromptFavorites'?String(row[idIndex])+'\n'+String(row[promptIndex])===id:String(row[idIndex])===id);
      const row=previous?previous.slice():headers.map(()=> '');
      columns.forEach(c=>{
        const value=record[c];if(typeof value!=='string'&&typeof value!=='number'||typeof value==='number'&&!isFinite(value)||String(value).length>45000)throw new Error('CELL_INVALID');
        row[normalized.indexOf(c)]=c==='date'&&typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value)?new Date(value):value;
      });return row;
    });return {sheet:sheet,headers:headers,rows:rows,previousRows:old.length};
  });
}

/** Group mirror: the signed caller supplies a complete, consistent D1 snapshot. */
function egvNhMirrorRead_(book){
  const tables={};
  Object.keys(NH_SCHEMA).forEach(name=>{
    const columns=NH_SCHEMA[name],sheet=book.getSheetByName(name);
    if(!sheet||sheet.getLastRow()<1)throw new Error('NH_MIRROR_SHEET_MISSING');
    const values=sheet.getRange(1,1,sheet.getLastRow(),columns.length).getValues();
    if(columns.some((column,index)=>values[0][index]!==column))throw new Error('NH_MIRROR_HEADERS');
    tables[name]=values.slice(1).filter(row=>row.some(value=>value!==''&&value!=null)).map(row=>{
      const record={};columns.forEach((column,index)=>{
        let value=row[index];
        if(value instanceof Date)value=/(?:cap_nhat|chot)_luc/.test(column)?value.toISOString():Utilities.formatDate(value,'Asia/Ho_Chi_Minh',/gio_/.test(column)?'HH:mm':/^ky_/.test(column)?'yyyy-MM':'yyyy-MM-dd');
        record[column]=value==null?'':value;
      });return record;
    });
  });return tables;
}
function egvNhMirror_(request){
  if(!Number.isSafeInteger(request.revision)||request.revision<0||typeof NH_SCHEMA!=='object'||!request.tables||typeof request.tables!=='object'||Array.isArray(request.tables))throw new Error('NH_MIRROR_INVALID');
  const names=Object.keys(NH_SCHEMA),incoming=Object.keys(request.tables),tables={};
  if(incoming.length!==names.length||incoming.some(name=>names.indexOf(name)===-1))throw new Error('NH_MIRROR_TABLES');
  // Validate every table before changing any sheet, including literal formula-like text.
  names.forEach(name=>{
    const columns=NH_SCHEMA[name],rows=request.tables[name],ids=new Set();
    if(!Array.isArray(rows)||rows.length>10000)throw new Error('NH_MIRROR_ROWS');
    tables[name]=rows.map(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).length!==columns.length||columns.some(column=>!Object.prototype.hasOwnProperty.call(item,column)))throw new Error('NH_MIRROR_COLUMNS');
      const record={};columns.forEach(column=>{
        const value=item[column];if(typeof value!=='string'&&typeof value!=='number'||typeof value==='number'&&!Number.isSafeInteger(value)||typeof value==='string'&&value.length>45000)throw new Error('NH_MIRROR_CELL');
        record[column]=value;
      });
      const id=name==='DiemDanh'?JSON.stringify([record.ma_buoi,record.ma_hoc_sinh]):String(record[columns[0]]);
      if(!id||ids.has(id))throw new Error('NH_MIRROR_IDS');ids.add(id);return record;
    });
  });
  const props=PropertiesService.getScriptProperties(),sheetId=getSetting('EGV_NH_DATA_ID',true).trim();
  if(!/^[\w-]{20,150}$/.test(sheetId))throw new Error('NH_MIRROR_DESTINATION');
  const priorSheet=props.getProperty('EGV_NH_BACKUP_SHEET_ID');
  if(priorSheet&&priorSheet!==sheetId)throw new Error('NH_MIRROR_DESTINATION_CHANGED');
  const revision=Number(props.getProperty('EGV_NH_BACKUP_REVISION')||-1),serialized=JSON.stringify(tables);
  const checksum=egvCollectionsHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,serialized,Utilities.Charset.UTF_8));
  if(request.revision<revision)throw new Error('NH_MIRROR_STALE');
  if(request.revision===revision&&props.getProperty('EGV_NH_BACKUP_CHECKSUM')&&props.getProperty('EGV_NH_BACKUP_CHECKSUM')!==checksum)throw new Error('NH_MIRROR_CONFLICT');
  const book=SpreadsheetApp.openById(sheetId);
  if(book.getId()!==sheetId)throw new Error('NH_MIRROR_DESTINATION');
  let savedAt=props.getProperty('EGV_NH_BACKUP_AT')||'';
  if(request.revision===revision&&savedAt){
    try{
      if(JSON.stringify(egvNhMirrorRead_(book))===serialized)return {revision:revision,checksum:checksum,savedAt:savedAt,checkedAt:new Date().toISOString(),spreadsheetId:sheetId,written:false};
    }catch(error){/* Repair a changed/missing mirror using the same committed snapshot. */}
  }
  const plans=names.map(name=>{
    const columns=NH_SCHEMA[name],sheet=book.getSheetByName(name);
    if(sheet&&sheet.getLastRow()){
      const headers=sheet.getRange(1,1,1,sheet.getMaxColumns()).getValues()[0];
      if(columns.some((column,index)=>headers[index]&&headers[index]!==column)||headers.slice(columns.length).some(value=>String(value||'').trim()))throw new Error('NH_MIRROR_HEADERS');
    }
    return {name:name,columns:columns,sheet:sheet,previousRows:sheet?Math.max(0,sheet.getLastRow()-1):0,rows:tables[name].map(item=>columns.map(column=>item[column]))};
  });
  plans.forEach(plan=>{
    const sheet=plan.sheet||book.insertSheet(plan.name),width=plan.columns.length,rows=plan.rows;
    if(sheet.getMaxColumns()<width)sheet.insertColumnsAfter(sheet.getMaxColumns(),width-sheet.getMaxColumns());
    if(sheet.getMaxRows()<rows.length+1)sheet.insertRowsAfter(sheet.getMaxRows(),rows.length+1-sheet.getMaxRows());
    sheet.getRange(1,1,1,width).setValues([plan.columns]);sheet.setFrozenRows(1);
    if(rows.length){
      plan.columns.forEach((column,index)=>{
        if(rows.some(row=>typeof row[index]==='string'&&row[index]!==''))sheet.getRange(2,index+1,rows.length,1).setNumberFormat('@');
      });
      sheet.getRange(2,1,rows.length,width).setValues(rows.map(row=>row.map(value=>typeof value==='string'&&/^[=+@-]/.test(value)?'':value)));
      rows.forEach((row,r)=>row.forEach((value,c)=>{
        if(typeof value==='string'&&/^[=+@-]/.test(value))sheet.getRange(r+2,c+1).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(value).build());
      }));
    }
    if(plan.previousRows>rows.length)sheet.getRange(rows.length+2,1,plan.previousRows-rows.length,width).clearContent();
  });
  SpreadsheetApp.flush();
  if(JSON.stringify(egvNhMirrorRead_(book))!==serialized)throw new Error('NH_MIRROR_READBACK');
  savedAt=new Date().toISOString();
  props.setProperties({EGV_NH_BACKUP_SHEET_ID:sheetId,EGV_NH_BACKUP_REVISION:String(request.revision),EGV_NH_BACKUP_CHECKSUM:checksum,EGV_NH_BACKUP_AT:savedAt});
  return {revision:request.revision,checksum:checksum,savedAt:savedAt,checkedAt:savedAt,spreadsheetId:sheetId,written:true};
}

/** Native tokens grant admin only; member tokens keep their existing verifier. */
function egvNativeAdminActive_(){return PropertiesService.getScriptProperties().getProperty('EGV_NATIVE_ADMIN_AUTH_ACTIVE')==='1';}
function egvCloudAdminToken_(token,requiredRole){
  try{
    if(typeof token!=='string'||token.length>4096)return null;
    const parts=token.split('.');
    if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0]))return null;
    const p=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    const now=Math.floor(Date.now()/1000);
    if(!p||p.iss!=='egv-cloudflare-admin'||p.aud!==APP_ORIGIN||p.kid!==EGV_NATIVE_ADMIN_KEY_ID||p.role!=='admin'||p.sub!=='admin'||requiredRole&&requiredRole!=='admin'||!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.iat>now+30||p.exp<=now||p.exp>p.iat+8*3600||p.exp<=p.iat||typeof p.nonce!=='string'||p.nonce.length!==36)return null;
    if(!egvCollectionsVerify_(parts[0],parts[1],EGV_NATIVE_ADMIN_PUBLIC_KEY))return null;
    return p;
  }catch(error){return null;}
}
