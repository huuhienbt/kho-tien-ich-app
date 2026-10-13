'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.EGV_QA_DEPENDENCIES||process.cwd()]}));
const {ledgerFixture}=require('./nhom-hoc-ledger.test.cjs');
const root=path.resolve(__dirname,'..'),settle=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));};
test('Rent is admin-only; payment UI carries excess, retries one ID, blocks unsaved attendance and clears on logout',async t=>{
  const h=ledgerFixture();h.setToday('2026-10-20');
  for(let i=0;i<6;i++)h.api('nh_session_save',{groupId:'g35',id:'extra'+i,date:'2026-10-'+(12+i)});
  const dom=new JSDOM(fs.readFileSync(path.join(root,'groups.html'),'utf8'),{url:'https://egv.test/groups.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;t.after(()=>w.close());
  await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.confirm=()=>true;
  let role='guest',loseReply=true,block=false,release;const calls=[];
  w.App={init(){},isAdmin:()=>role==='admin',escapeHTML:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),apiPost:async(action,data)=>{
    calls.push({action,data});const value=h.api(action,data);
    if(action==='nh_room_rent_save'&&loseReply){loseReply=false;throw Error('Mất kết nối sau khi ghi');}
    if(action==='nh_boot'&&block)return new Promise(resolve=>release=()=>resolve({data:value}));
    return {data:value};
  }};
  w.eval(fs.readFileSync(path.join(root,'js/groups.js'),'utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));await settle();
  for(const user of ['guest','member','google','vip']){role=user;w.dispatchEvent(new w.Event('app:auth-change'));await settle();assert.equal(calls.length,0);assert.equal(d.getElementById('nhRentPanel').hidden,true);}
  role='admin';w.dispatchEvent(new w.Event('app:auth-change'));await settle();
  assert.equal(d.getElementById('nhRentCount').textContent,'18/16');assert.equal(d.getElementById('nhRentPanel').dataset.state,'due');assert.match(d.getElementById('nhRentDate').textContent,/15\/10\/2026/);assert.match(d.getElementById('nhRentHint').textContent,/2 buổi chuyển tiếp/);
  d.querySelector('[data-group="g35"]').click();await settle();
  const square=()=>d.querySelector('#nhOverview [data-cycle]');square().click();assert.equal(d.getElementById('nhRentPay').disabled,true);assert.match(d.getElementById('nhRentHint').textContent,/Lưu điểm danh/);square().click();square().click();assert.equal(d.getElementById('nhRentPay').disabled,false);
  d.getElementById('nhRentPay').click();assert.equal(d.getElementById('nhDialog').open,true);assert.equal(d.querySelector('[name="amount"]').readOnly,true);assert.equal(d.querySelector('[name="date"]').min,'2026-10-15');assert.equal(d.querySelector('[name="date"]').max,'2026-10-20');
  d.querySelector('[name="note"]').value='<img src=x onerror=alert(1)> Chuyển khoản';
  const form=d.getElementById('nhForm'),views=calls.filter(c=>c.action==='nh_view').length;
  form.dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(d.getElementById('nhDialog').open,true);assert.match(d.getElementById('nhFormError').textContent,/Mất kết nối/);
  form.dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(d.getElementById('nhDialog').open,false);
  const writes=calls.filter(c=>c.action==='nh_room_rent_save');assert.equal(writes.length,2);assert.equal(writes[0].data.id,writes[1].data.id,'retry keeps a stable payment ID');
  assert.equal(d.getElementById('nhRentCount').textContent,'2/16');assert.equal(d.getElementById('nhRentPanel').dataset.state,'paid');assert.equal(d.getElementById('nhRentPay').disabled,true);assert.equal(d.querySelectorAll('.nh-rent-payment').length,1);assert.equal(d.querySelector('#nhRentHistory img'),null);assert.match(d.getElementById('nhRentHistory').textContent,/<img src/);
  assert.equal(calls.filter(c=>c.action==='nh_view').length,views,'rent updates reuse the write response without another view request');
  d.querySelector('[data-rent-void]').click();d.querySelector('[name="reason"]').value='Nhập nhầm';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();assert.equal(d.getElementById('nhRentCount').textContent,'18/16');assert.equal(d.querySelectorAll('.nh-rent-payment.voided').length,1);assert.equal(d.querySelector('[data-rent-void]'),null);
  block=true;w.dispatchEvent(new w.Event('app:auth-change'));await settle();assert(release);
  role='guest';w.dispatchEvent(new w.Event('app:auth-change'));release();await settle();assert.equal(d.getElementById('nhRentPanel').hidden,true);assert.equal(d.getElementById('nhRentHistory').textContent,'');assert.equal(d.getElementById('nhRentGroups').textContent,'');assert.equal(d.getElementById('nhRentCount').textContent,'');assert.equal(d.getElementById('nhRentProgress').value,0);
});
test('Rent reflects class changes from both groups when reloading or changing the selected period',async t=>{
  const h=ledgerFixture(),dom=new JSDOM(fs.readFileSync(path.join(root,'groups.html'),'utf8'),{url:'https://egv.test/groups.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;t.after(()=>w.close());
  await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const calls=[];w.App={init(){},isAdmin:()=>true,escapeHTML:String,apiPost:async(action,data)=>{calls.push(action);return {data:h.api(action,data)};}};
  w.eval(fs.readFileSync(path.join(root,'js/groups.js'),'utf8'));d.dispatchEvent(new w.Event('DOMContentLoaded'));await settle();assert.equal(d.getElementById('nhRentCount').textContent,'12/16');
  h.setToday('2026-10-20');for(let i=0;i<4;i++)h.api('nh_session_save',{groupId:'g35',id:'later'+i,date:'2026-10-'+(12+i)});
  d.getElementById('nhReload').click();await settle();assert.equal(d.getElementById('nhRentCount').textContent,'16/16');assert.equal(d.getElementById('nhRentPay').disabled,false);
  d.querySelector('[data-group="g35"]').click();await settle();assert.equal(d.getElementById('nhRentCount').textContent,'16/16');assert.match(d.getElementById('nhRentGroups').textContent,/Thứ 2–4: 7.*Thứ 3–5: 9/);
  assert(calls.every(action=>['nh_boot','nh_view'].includes(action)),'no extra rent API request on boot, reload or group switch');
});
