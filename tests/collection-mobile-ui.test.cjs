'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.EGV_QA_DEPENDENCIES||process.cwd()]}));
const root=path.resolve(__dirname,'..'),settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
const fullPrompt='Đọc ảnh SGK và tạo kế hoạch bài dạy.\nGiữ đầy đủ từng yêu cầu.\n<b>Đây là văn bản, không phải HTML.</b>\nNội dung cuối phải được sao chép nguyên vẹn.';
const prompts=[{id:'p1',title:'Soạn KHBD từ ảnh SGK',content:fullPrompt,category:'teaching',platform:'ChatGPT',access:'normal'},{id:'p2',title:'Prompt VIP',content:'VIP_CONTENT_MARKER',category:'admin',platform:'NotebookLM',access:'vip'}];
const repairs=[{id:'r1',task:'Sửa quạt trần phòng học',status:'Đang chờ linh kiện',date:'2026-10-14',location:'4/12',cost:350000,vendor:'PRIVATE_VENDOR_MARKER',warranty:'12 tháng',note:'<b>PRIVATE_NOTE_MARKER</b>',reporter:'Quản trị',image_url:''}];
function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function fixture(t,page,initialRole){
 const dom=new JSDOM(fs.readFileSync(path.join(root,page+'.html'),'utf8'),{url:'https://egv.test/'+page+'.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;t.after(()=>w.close());
 await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));let role=initialRole;const calls=[],copied=[],modals=[],errors=[];
 const authenticated=()=>role!=='guest',vip=()=>['vip','admin'].includes(role);
 function data(){if(page==='prompts')return {data:prompts.map(p=>p.access==='vip'&&!vip()?{...p,content:'',locked:true}:{...p}),favorites:[],membership:role};const accessLevel=role==='admin'?'admin':authenticated()?'member':'public';return {accessLevel,data:accessLevel==='public'?[]:accessLevel==='member'?repairs.map(({id,task,status})=>({id,task,status})):repairs,summary:{total:1,pending:1,watch:0,...(accessLevel==='admin'?{cost:350000}:{})}};}
 w.App={init(){d.body.classList.toggle('admin-logged-in',role==='admin');},escapeHTML,safeUrl:value=>value||'',isAdmin:()=>role==='admin',isAuthenticated:authenticated,isVipMember:vip,debounce:fn=>fn,toast(){},openModal:id=>modals.push(id),closeModal(){},requireAdmin:fn=>{if(role==='admin')fn();},requireUser:fn=>{if(authenticated()&&fn)fn();},apiGet:async type=>{calls.push(type);return data();},apiPost:async(action,payload)=>{calls.push(action);if(action==='toggle_favorite')return {favorites:payload.favorite?[payload.promptId]:[]};return data();}};
 d.execCommand=command=>{assert.equal(command,'copy');copied.push(d.activeElement.value);return true;};w.addEventListener('error',e=>errors.push(e.message));
 w.eval(fs.readFileSync(path.join(root,'js/'+page+'.js'),'utf8'));await settle();
 return {w,d,calls,copied,modals,errors,async role(next){role=next;d.body.classList.toggle('admin-logged-in',role==='admin');w.dispatchEvent(new w.Event('app:auth-change'));await settle();}};
}
test('Compact prompts expand accessibly, copy the complete prompt and preserve guest/member/VIP actions and filters',async t=>{
 const h=await fixture(t,'prompts','guest'),{d,w}=h;const card=()=>d.querySelector('[data-id="p1"]');
 assert.equal(card().querySelector('[data-action="use"]'),null);assert.equal(card().querySelector('[data-action="favorite"]'),null);
 assert.equal(d.querySelector('[data-id="p2"] .prompt-box'),null);assert(!d.querySelector('[data-id="p2"]').textContent.includes('VIP_CONTENT_MARKER'));
 const expand=card().querySelector('[data-action="expand"]'),before=h.calls.length;
 assert.equal(expand.getAttribute('aria-expanded'),'false');assert.equal(d.getElementById(expand.getAttribute('aria-controls')).textContent,fullPrompt);
 expand.querySelector('.collection-action-short').click();assert.equal(expand.getAttribute('aria-expanded'),'true');assert(card().querySelector('.prompt-box').classList.contains('expanded'));assert.equal(card().querySelector('.prompt-box b'),null);
 card().querySelector('[data-action="copy"] .collection-action-short').click();await settle();assert.deepEqual(h.copied,[fullPrompt]);expand.click();assert.equal(expand.getAttribute('aria-expanded'),'false');assert.equal(h.calls.length,before,'expanding and copying do not request data');
 await h.role('member');assert(card().querySelector('[data-action="use"]'));assert(card().querySelector('[data-action="favorite"]'));assert.equal(d.querySelector('[data-id="p2"] [data-action="use"]'),null);
 card().querySelector('[data-action="use"] .collection-action-short').click();await settle();assert(h.modals.includes('usePromptModal'));assert(d.querySelector('[data-prompt-destination="chatgpt"]'));
 card().querySelector('[data-action="favorite"]').click();await settle();assert(card().querySelector('.favorite-btn.active'));
 d.getElementById('promptSearch').value='Soạn KHBD';d.getElementById('promptSearch').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelectorAll('.prompt-card').length,1);
 d.getElementById('promptSearch').value='';d.getElementById('promptSearch').dispatchEvent(new w.Event('input',{bubbles:true}));d.getElementById('promptAccessFilter').value='vip';d.getElementById('promptAccessFilter').dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('.prompt-card').length,1);
 await h.role('vip');assert.match(d.querySelector('[data-id="p2"] .prompt-box').textContent,/VIP_CONTENT_MARKER/);assert(d.querySelector('[data-id="p2"] [data-action="use"]'));
 assert.deepEqual(h.errors,[]);
});
test('Repair detail disclosure is local and reversible; member/guest views never contain admin details or controls',async t=>{
 const h=await fixture(t,'repairs','admin'),{d,w}=h,card=d.querySelector('.repair-card'),toggle=card.querySelector('[data-action="details"]'),before=h.calls.length;
 assert.equal(d.getElementById(toggle.getAttribute('aria-controls')),card.querySelector('.repair-grid'));assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(d.getElementById('repairCost').textContent,'350.000 đ');
 toggle.click();assert(card.classList.contains('repair-expanded'));assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.match(card.querySelector('.repair-note').textContent,/<b>PRIVATE_NOTE_MARKER<\/b>/);assert.equal(card.querySelector('.repair-note b'),null);
 toggle.click();assert(!card.classList.contains('repair-expanded'));assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(h.calls.length,before);
 d.getElementById('repairSearch').value='không tồn tại';d.getElementById('repairSearch').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelectorAll('.repair-card').length,0);
 d.getElementById('repairSearch').value='';d.getElementById('repairSearch').dispatchEvent(new w.Event('input',{bubbles:true}));d.getElementById('repairStatus').value='Đã hoàn thành';d.getElementById('repairStatus').dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('.repair-card').length,0);d.getElementById('repairStatus').value='all';d.getElementById('repairStatus').dispatchEvent(new w.Event('change'));
 for(const role of ['member','google','vip']){await h.role(role);assert.match(d.getElementById('repairContainer').textContent,/Sửa quạt trần/);assert(!d.getElementById('repairContainer').textContent.includes('PRIVATE_'));assert.equal(d.querySelector('#repairContainer [data-action]'),null);assert.equal(d.querySelector('#repairContainer .repair-grid'),null);assert.equal(d.getElementById('repairCost').textContent,'🔒');}
 await h.role('guest');assert.equal(d.getElementById('repairContainer').hidden,true);assert.equal(d.getElementById('repairContainer').textContent,'');assert.equal(d.getElementById('repairTotal').textContent,'1');assert.deepEqual(h.errors,[]);
});
