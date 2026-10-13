'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.EGV_QA_DEPENDENCIES||process.cwd()]}));
const {ledgerFixture}=require('./nhom-hoc-ledger.test.cjs');
const root=path.resolve(__dirname,'..'),settle=async()=>{for(let i=0;i<15;i++)await new Promise(resolve=>setImmediate(resolve));};
test('Backup status is admin-only, dates are visible, unsaved attendance cannot be backed up, logout ignores stale replies',async t=>{
  const h=ledgerFixture(),dom=new JSDOM(fs.readFileSync(path.join(root,'groups.html'),'utf8'),{url:'https://egv.test/groups.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
  t.after(()=>w.close());await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};let role='guest',fail=false,release;const calls=[];
  let status={state:'synced',revision:38,backupRevision:38,lastSuccessAt:'2026-10-13T00:10:00Z',lastCheckedAt:'2026-10-13T00:20:00Z',spreadsheetId:'test-group-drive-spreadsheet-id'};
  w.App={init(){},isAdmin:()=>role==='admin',escapeHTML:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),apiPost:async(action,data)=>{
    calls.push(action);
    if(action==='nh_backup_now')return new Promise(resolve=>release=resolve);
    if(action==='nh_backup_status'){if(fail)throw Error('Offline');return {data:status};}
    const value=h.api(action,data);if(action==='nh_boot'){value.features.driveBackup=true;value.backup=status;}return {data:value};
  }};
  w.eval(fs.readFileSync(path.join(root,'js/groups.js'),'utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));await settle();
  for(const user of ['guest','member','google','vip']){role=user;w.dispatchEvent(new w.Event('app:auth-change'));await settle();assert.equal(calls.length,0);assert.equal(d.getElementById('nhBackupPanel').hidden,true);}
  role='admin';w.dispatchEvent(new w.Event('app:auth-change'));await settle();assert.equal(d.getElementById('nhBackupPanel').hidden,false);assert.match(d.getElementById('nhBackupSummary').textContent,/13\/10\/26/);assert.match(d.getElementById('nhBackupHint').textContent,/đọc lại/);
  assert.equal(d.getElementById('nhBackupDrive').href,'https://docs.google.com/spreadsheets/d/test-group-drive-spreadsheet-id/edit');
  d.querySelector('[data-group="g35"]').click();await settle();const square=d.querySelector('#nhOverview [data-cycle][data-student="s1"]');square.click();assert.equal(d.getElementById('nhBackupNow').disabled,true);assert.match(d.getElementById('nhBackupHint').textContent,/chưa được lưu/);
  const count=calls.length;d.getElementById('nhBackupNow').click();assert.equal(calls.length,count);
  d.querySelector('#nhOverview [data-cycle][data-student="s1"]').click();d.querySelector('#nhOverview [data-cycle][data-student="s1"]').click();await settle();assert.equal(d.getElementById('nhBackupNow').disabled,false);
  fail=true;d.getElementById('nhReload').click();await settle();assert.equal(d.getElementById('nhBackupPanel').dataset.state,'error');assert.match(d.getElementById('nhBackupSuccess').textContent,/13\/10\/26/);fail=false;
  d.getElementById('nhBackupNow').click();await settle();assert(release);assert.equal(d.getElementById('nhBackupNow').disabled,true);
  role='guest';w.dispatchEvent(new w.Event('app:auth-change'));release({data:status});await settle();assert.equal(d.getElementById('nhBackupPanel').hidden,true);assert.equal(d.getElementById('nhBackupDrive').hasAttribute('href'),false);assert.equal(d.getElementById('nhBackupSummary').textContent,'');
});
