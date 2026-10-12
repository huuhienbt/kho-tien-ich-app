'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require(require.resolve('jsdom', { paths: [process.env.EGV_QA_DEPENDENCIES || process.cwd()] }));
const { ledgerFixture } = require('./nhom-hoc-ledger.test.cjs');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const token = role => Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now()/1000) + 3600 })).toString('base64url') + '.test-signature';

function homeFixture(t, role = 'guest', hook) {
    const dom = new JSDOM(source('index.html'), { url: 'https://e-gv.test', runScripts: 'outside-only' });
    const w = dom.window, d = w.document, calls = [];
    t.after(() => w.close());
    const group = id => ({ ma_nhom:id, ten_nhom:id==='a'?'Thứ 2–4':'Thứ 3–5', trang_thai:'dang_hoc', ky_hien_tai:'2026-09' });
    const view = id => ({
        today:'2026-10-12', period:{ completed:7, size:8 }, closed:id==='b',
        roster:[{ma_hoc_sinh:'s1',ngay_vao:'2026-09-01',ngay_nghi:''},{ma_hoc_sinh:'s2',ngay_vao:'2026-09-01',ngay_nghi:'2026-10-01'}],
        sessions:[{ma_buoi:'past',ngay_hoc:'2026-10-08',trang_thai:'da_hoc'},{ma_buoi:'today',ngay_hoc:'2026-10-12',trang_thai:'du_kien'},{ma_buoi:'future',ngay_hoc:'2026-10-15',trang_thai:'du_kien'},{ma_buoi:'cancelled',ngay_hoc:'2026-10-01',trang_thai:'da_huy'}],
        marks:[{ma_buoi:'past',ma_hoc_sinh:'s1',trang_thai:'co_mat'}],
        fees:[{studentId:'s1',balance:id==='a'?125000:0},{studentId:'s2',balance:-62500},{studentId:'free',balance:0}]
    });
    let currentRole = role, currentToken = 'admin-one';
    w.App = {
        init(){}, escapeHTML, getUser:()=>({name:'Tên thành viên'}), isAuthenticated:()=>currentRole!=='guest', isAdmin:()=>currentRole==='admin', getAdminToken:()=>currentRole==='admin'?currentToken:'',
        apiGet:async type => ({data:type==='prompts'?[{},{}]:[], summary:{pending:3,watch:1}}),
        apiPost:async (action,data,options) => {
            calls.push({action,data,options});
            const overridden = hook?.(action,data);
            if (overridden !== undefined) return overridden;
            return {data:action==='nh_boot'?{today:'2026-10-12',groups:[group('a'),group('b')]}:view(data.groupId)};
        }
    };
    w.eval(source('js/index.js'));
    return {w,d,calls,setRole(value){currentRole=value;currentToken='admin-two';w.dispatchEvent(new w.Event('app:auth-change'));}};
}

test('Homepage exposes current-period attendance and fees only to administrators', async t => {
    const h = homeFixture(t); await settle();
    assert.equal(h.calls.length,0); assert.equal(h.d.getElementById('homeAdminOverview').hidden,true);
    assert.equal(h.d.querySelectorAll('.dash-card').length,6);
    for (const role of ['member','google','vip']) { h.setRole(role); await settle(); assert.equal(h.calls.length,0); assert.equal(h.d.getElementById('homeAdminOverview').hidden,true); }
    h.setRole('admin'); await settle();
    assert.deepEqual(h.calls.map(c=>c.action),['nh_boot','nh_view','nh_view']);
    assert(h.calls.every(c=>c.options.auth===true));
    const cards = h.d.querySelectorAll('.home-group-card'); assert.equal(cards.length,2);
    assert.match(cards[0].textContent,/Còn 1 học sinh chưa điểm danh/);
    assert.equal(cards[0].querySelector('.home-group-metrics dd').textContent,'1');
    assert.match(cards[0].textContent,/125\.000đ/); // Credit for another student must not offset the debt.
    assert.equal(cards[1].querySelector('.home-group-metrics dd').textContent,'0'); // Closed period is not editable.
    const attendance = new URL(cards[0].querySelector('.home-group-actions a').href);
    assert.equal(attendance.searchParams.get('group'),'a'); assert.equal(attendance.searchParams.get('month'),'2026-09'); assert.equal(attendance.searchParams.get('session'),'today');
    const fees = new URL(cards[0].querySelector('.home-group-actions a:last-child').href); assert.equal(fees.searchParams.get('tab'),'fees');
    assert.equal(h.d.getElementById('homeGroupsShortcut').hidden,false);
    h.setRole('guest'); assert.equal(h.d.getElementById('homeGroupCards').textContent,''); assert.equal(h.d.getElementById('homeAdminOverview').hidden,true);
});

test('Homepage ignores stale privileged responses after logout and reports unavailable data', async t => {
    let release;
    const h = homeFixture(t,'admin',(action,data)=>action==='nh_view'&&data.groupId==='a'?new Promise(resolve=>release=resolve):undefined);
    await settle(); h.setRole('guest'); release({data:{}}); await settle();
    assert.equal(h.d.getElementById('homeAdminOverview').hidden,true); assert.equal(h.d.getElementById('homeGroupCards').childElementCount,0);
    const failed = homeFixture(t,'admin',action=>action==='nh_view'?Promise.reject(new Error('offline')):undefined); await settle();
    assert.equal(failed.d.querySelectorAll('.home-group-unavailable').length,2);
    assert.equal(failed.d.querySelectorAll('.home-group-metrics').length,0); assert.match(failed.d.getElementById('homeGroupsStatus').textContent,/chưa tải được/);
});

async function modalFixture(t,native=true,success=false) {
    const dom = new JSDOM('<!doctype html><div id="appShell"></div><main><button id="opener">Mở quản trị</button></main><aside id="alreadyInert" inert aria-hidden="true"></aside>', {url:'https://e-gv.test',runScripts:'outside-only',pretendToBeVisual:true});
    const w=dom.window,d=w.document; t.after(()=>w.close());
    const css=d.createElement('style');css.textContent=source('style.css');d.head.append(css);
    w.APP_CONFIG={APP_NAME:'E-GV',OWNER_NAME:'Thầy Hiển',API_URL:'https://gas.test/exec',ADMIN_AUTH_API_URL:'https://cloud.test',SESSION_KEY:'admin',USER_TOKEN_KEY:'user',USER_PROFILE_KEY:'profile',CLIENT_ID_KEY:'client'};
    w.fetch=async()=>({ok:true,json:async()=>success?{status:'success',adminToken:token('admin')}:{status:'success'}});
    if(native) {
        w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
        w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
    }
    w.eval(source('js/app.js'));w.App.init('home');
    d.getElementById('opener').addEventListener('click',()=>w.App.openLogin('admin'));
    return {w,d,modal:d.getElementById('loginModal'),key:(element,key,shift=false)=>element.dispatchEvent(new w.KeyboardEvent('keydown',{key,shiftKey:shift,bubbles:true,cancelable:true}))};
}

test('Native login dialog selects the right field, supports tab arrows, and restores focus and scrolling', async t => {
    const h=await modalFixture(t), {w,d,modal,key}=h;
    d.body.style.overflow='auto'; d.body.style.paddingRight='3px';
    const opener=d.getElementById('opener'); opener.focus();opener.click();
    assert.equal(modal.tagName,'DIALOG');assert.equal(modal.open,true);assert.equal(d.activeElement.id,'adminPass'); assert.equal(d.body.style.overflow,'hidden');
    assert.equal(modal.contains(d.getElementById('toastRegion')),true); assert.equal(modal.contains(d.getElementById('authProgress')),true);
    const tab=d.getElementById('adminAuthTab');tab.focus();key(tab,'ArrowLeft');assert.equal(d.activeElement.id,'userAuthTab');assert.equal(d.getElementById('adminAuthPanel').hidden,true);
    assert.equal(d.getElementById('userAuthTab').getAttribute('aria-selected'),'true'); assert.equal(tab.tabIndex,-1);
    key(d.activeElement,'End');assert.equal(d.activeElement.id,'adminAuthTab');assert.equal(d.getElementById('userAuthPanel').hidden,true);
    const first=modal.querySelector('.modal-close'), last=d.getElementById('adminLoginSubmit');first.focus();key(first,'Tab',true);assert.equal(d.activeElement,last);key(last,'Tab');assert.equal(d.activeElement,first);
    d.getElementById('userAuthTab').click();first.focus();key(first,'Tab',true);assert.equal(d.activeElement,modal.querySelector('.auth-cancel'));key(d.activeElement,'Tab');assert.equal(d.activeElement,first);
    key(d.activeElement,'Escape'); assert.equal(modal.open,false); assert.equal(d.activeElement,opener);assert.equal(d.body.style.overflow,'auto');assert.equal(d.body.style.paddingRight,'3px');
    assert.equal(d.getElementById('toastRegion').parentElement,d.body); assert.equal(d.getElementById('alreadyInert').getAttribute('aria-hidden'),'true');
    opener.click();modal.dispatchEvent(new w.Event('cancel',{cancelable:true}));assert.equal(modal.open,false);assert.equal(d.activeElement,opener);
    opener.click();modal.querySelector('[data-close-modal]').click();assert.equal(modal.open,false);assert.equal(d.activeElement,opener);
});

test('Older-browser login fallback traps both tab directions and preserves existing inert attributes',async t=>{
    const {w,d,modal,key}=await modalFixture(t,false);const opener=d.getElementById('opener');opener.focus();opener.click();
    assert.equal(d.querySelector('main').hasAttribute('inert'),true);
    const first=modal.querySelector('.modal-close'), last=d.getElementById('adminLoginSubmit');first.focus();key(first,'Tab',true);assert.equal(d.activeElement,last);
    key(last,'Tab');assert.equal(d.activeElement,first);
    opener.focus();assert(modal.contains(d.activeElement));
    last.disabled=true;const cancel=modal.querySelector('#adminAuthPanel [data-close-modal]');first.focus();key(first,'Tab',true);assert.equal(d.activeElement,cancel);
    w.App.closeModal('loginModal');assert.equal(d.activeElement,opener);assert.equal(d.querySelector('main').hasAttribute('inert'),false);assert.equal(d.getElementById('alreadyInert').hasAttribute('inert'),true);
});

test('Successful login returns focus to an available account control when the opener is hidden',async t=>{
    const {w,d,modal}=await modalFixture(t,true,true);const opener=d.getElementById('loginButton');opener.focus();opener.click();d.getElementById('adminAuthTab').click();
    d.getElementById('adminPass').value='fixture-password';d.getElementById('adminLoginForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await new Promise(resolve=>w.setTimeout(resolve,100));
    assert.equal(w.App.isAdmin(),true);assert.equal(modal.open,false);assert.equal(d.activeElement.id,'logoutButton');assert.equal(d.getElementById('authProgress').hidden,true);
});

test('Group shortcuts select the requested group, period and tab without modifying the ledger',async t=>{
    const h=ledgerFixture(), before=JSON.stringify([...h.sheets].map(([name,s])=>[name,s.values]));
    const dom=new JSDOM(source('groups.html'),{url:'https://e-gv.test/groups.html?group=g35&month=2026-09&tab=fees',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
    t.after(()=>w.close());await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
    w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    const calls=[];w.App={init(){},escapeHTML,isAdmin:()=>true,apiPost:async(action,data)=>{calls.push(action);return {data:h.api(action,data)};}};
    w.eval(source('js/groups.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));await settle();
    assert.equal(d.getElementById('nhGroup').value,'g35');assert.equal(d.getElementById('nhMonth').value,'2026-09');assert.equal(d.getElementById('nhFees').hidden,false);assert.equal(d.getElementById('nhAttendancePanel').hidden,true);
    assert.deepEqual(calls,['nh_boot','nh_view']);assert.equal(JSON.stringify([...h.sheets].map(([name,s])=>[name,s.values])),before);
});
