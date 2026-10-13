import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{ledgerFixture}=require('./nhom-hoc-ledger.test.cjs');
const moduleSource=fs.readFileSync(new URL('../Collections.gs',import.meta.url),'utf8');

export function mirrorFixture() {
  const h=ledgerFixture(),ctx=h.ctx,book=ctx.SpreadsheetApp.openById(),sheetId='test-group-drive-spreadsheet-id',props=new Map(),writes=[];
  const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),pub=publicKey.export({format:'jwk'});
  book.getId=()=>sheetId;ctx.getSetting=()=>sheetId;ctx.constantTimeEquals=(a,b)=>a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
  ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperties:o=>Object.entries(o).forEach(([k,v])=>props.set(k,v))})};
  ctx.Utilities.base64DecodeWebSafe=value=>[...Buffer.from(value,'base64url')];
  ctx.SpreadsheetApp.newRichTextValue=()=>({setText(text){this.text=text;return this;},build(){return {text:this.text};}});
  function wrap(sheet){const original=sheet.getRange.bind(sheet);sheet.getRange=(...args)=>{
    const range=original(...args),set=range.setValues.bind(range);
    range.setValues=rows=>{writes.push(sheet.name);return set(rows);};range.clearContent=()=>range.setValues(Array.from({length:args[2]||1},()=>Array(args[3]||1).fill('')));
    range.setNumberFormat=()=>range;range.setRichTextValue=value=>range.setValues([[value.text]]);return range;
  };return sheet;}
  for(const sheet of h.sheets.values())wrap(sheet);const insert=book.insertSheet.bind(book);book.insertSheet=name=>wrap(insert(name));
  h.sheets.set('Unrelated',{values:[['Preserve this sheet'],['=literal note']]});
  vm.runInContext(moduleSource.replace(/const EGV_COLLECTIONS_PUBLIC_KEY = [^;]+;/,'const EGV_COLLECTIONS_PUBLIC_KEY = '+JSON.stringify(pub)+';'),ctx);
  const schema=vm.runInContext('NH_SCHEMA',ctx),keyId=moduleSource.match(/EGV_COLLECTIONS_KEY_ID = '([^']+)'/)[1];
  const tables=()=>Object.fromEntries(Object.entries(schema).map(([name,cols])=>[name,h.sheets.get(name).values.slice(1).filter(row=>row[0]).map(row=>Object.fromEntries(cols.map((col,i)=>[col,row[i]??''])))]));
  function envelope(request){const message=JSON.stringify({op:'nh_backup',version:1,issuedAt:Date.now(),...request});return {action:'collections_bridge',keyId,message,signature:crypto.sign('sha256',Buffer.from(message),privateKey).toString('base64url')};}
  return {...h,book,sheetId,props,writes,privateKey,publicKey,keyId,tables,envelope,run:payload=>JSON.parse(JSON.stringify(ctx.egvCollectionsBridge_(payload)))};
}

test('Signed group mirror preserves all seven tables, literal text, other sheets and stable save time',()=>{
  const h=mirrorFixture(),tables=h.tables(),other=JSON.stringify(h.sheets.get('Unrelated'));
  tables.HocSinh[0].ghi_chu='=SUM(A1:A3)';tables.HocSinh[1].ghi_chu='+literal text';
  tables.BuoiHoc[0].ghi_chu='-Ghi chú nguyên vẹn';
  const result=h.run(h.envelope({revision:38,tables}));assert.equal(result.status,'success');assert.equal(result.data.revision,38);assert.equal(result.data.spreadsheetId,h.sheetId);
  assert.equal(result.data.checksum,crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex'));
  assert.deepEqual(h.tables(),tables);assert.equal(JSON.stringify(h.sheets.get('Unrelated')),other);
  const before=h.writes.length,again=h.run(h.envelope({revision:38,tables}));assert.equal(again.data.written,false);assert.equal(again.data.savedAt,result.data.savedAt);assert.equal(h.writes.length,before);
  h.sheets.get('HocSinh').values[1][1]='Mirror was edited';const repair=h.run(h.envelope({revision:38,tables}));assert.equal(repair.status,'success');assert.equal(repair.data.written,true);assert.deepEqual(h.tables(),tables);
  const removed=structuredClone(tables);removed.ThanhVienNhom=removed.ThanhVienNhom.slice(1);assert.equal(h.run(h.envelope({revision:39,tables:removed})).status,'success');assert.deepEqual(h.tables(),removed);
});
test('Forged, expired, stale, conflicting and malformed group snapshots never overwrite a valid mirror',()=>{
  const h=mirrorFixture(),tables=h.tables();h.run(h.envelope({revision:38,tables}));
  const before=JSON.stringify(h.tables()),count=h.writes.length;
  const forged=h.envelope({revision:39,tables});forged.signature='a'.repeat(342);
  const conflict=structuredClone(tables);conflict.HocSinh[0].ho_ten='Other snapshot';
  const duplicate=structuredClone(tables);duplicate.HocSinh.push(duplicate.HocSinh[0]);
  const malformed=structuredClone(tables);delete malformed.HocSinh[0].ho_ten;
  for(const payload of [forged,h.envelope({revision:39,tables,issuedAt:Date.now()-700000}),h.envelope({revision:37,tables}),h.envelope({revision:38,tables:conflict}),h.envelope({revision:39,tables:duplicate}),h.envelope({revision:39,tables:malformed}),h.envelope({revision:39,tables:{...tables,Users:[]}})])assert.equal(h.run(payload).status,'error');
  assert.equal(JSON.stringify(h.tables()),before);assert.equal(h.writes.length,count);assert.equal(h.props.get('EGV_NH_BACKUP_REVISION'),'38');
});
test('A failed readback does not advance the acknowledged backup revision',()=>{
  const h=mirrorFixture(),tables=h.tables();h.run(h.envelope({revision:38,tables}));const lastAt=h.props.get('EGV_NH_BACKUP_AT');
  tables.HocSinh[0].ho_ten='New name';const read=h.ctx.egvNhMirrorRead_;h.ctx.egvNhMirrorRead_=book=>{const data=read(book);data.HocSinh[0].ho_ten='Corrupt readback';return data;};
  assert.equal(h.run(h.envelope({revision:39,tables})).status,'error');assert.equal(h.props.get('EGV_NH_BACKUP_REVISION'),'38');assert.equal(h.props.get('EGV_NH_BACKUP_AT'),lastAt);
  h.ctx.egvNhMirrorRead_=read;assert.equal(h.run(h.envelope({revision:39,tables})).status,'success');assert.equal(h.props.get('EGV_NH_BACKUP_REVISION'),'39');
});
