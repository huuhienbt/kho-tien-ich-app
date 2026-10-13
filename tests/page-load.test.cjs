'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.EGV_QA_DEPENDENCIES||process.cwd()]}));
const root=path.resolve(__dirname,'..'),source=f=>fs.readFileSync(path.join(root,f),'utf8');
const token=role=>Buffer.from(JSON.stringify({role,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
function fixture(t,page='calendar'){
 const dom=new JSDOM('<!doctype html><div id="appShell"></div><main></main>',{url:'https://e-gv.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,calls=[];
 t.after(()=>w.close());
 w.APP_CONFIG={APP_NAME:'E-GV',OWNER_NAME:'Thầy Hiển',API_URL:'https://gas.test/exec',COLLECTIONS_API_URL:'https://cloud.test',ADMIN_AUTH_API_URL:'https://cloud.test',GOOGLE_CLIENT_ID:'fixture-google-client',SESSION_KEY:'admin',USER_TOKEN_KEY:'user',USER_PROFILE_KEY:'profile',CLIENT_ID_KEY:'client'};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const css=d.createElement('style');css.textContent=source('style.css');d.head.append(css);
 w.fetch=async(url,options={})=>{
  const action=options.body?JSON.parse(options.body).action:'';calls.push({url:String(url),action});
  return {ok:true,json:async()=>action==='verify'?{status:'success',adminToken:token('admin')}:action?{status:'success',userToken:token('member'),user:{name:'Thành viên',email:'fixture@example.test'}}:{status:'success',data:{prompts:19,pending:2,watch:1}}};
 };
 w.eval(source('js/app.js'));w.App.init(page);
 const scripts=()=>[...d.querySelectorAll('script[src="https://accounts.google.com/gsi/client"]')];
 let initialized=0,rendered=0,callback;
 function sdk(){w.google={accounts:{id:{initialize(config){initialized++;callback=config.callback;},renderButton(holder){rendered++;const b=d.createElement('button');b.textContent='Google';holder.append(b);},disableAutoSelect(){}}}};}
 return {w,d,calls,scripts,sdk,counts:()=>({initialized,rendered}),credential:()=>callback};
}
test('Shared shell stays quiet on every page; native admin login does not load Google or ping Apps Script',async t=>{
 for(const page of ['home','prompts','repairs','groups','ai','calendar','upload']){
  const h=fixture(t,page);await new Promise(r=>setTimeout(r,420));assert.equal(h.calls.length,0);assert.equal(h.scripts().length,0);
  h.w.App.openLogin('admin');assert.equal(h.scripts().length,0);assert.equal(h.calls.length,0);
  h.d.getElementById('adminPass').value='fixture-password';h.d.getElementById('adminLoginForm').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(r=>setTimeout(r,120));assert(h.w.App.isAdmin());assert.deepEqual(h.calls,[{url:'https://cloud.test/api',action:'verify'}]);
 }
});
test('Google loads once on the member tab, survives close/reopen, and verifies credentials only when supplied',async t=>{
 const h=fixture(t),{w,d}=h;w.App.openLogin('admin');d.getElementById('userAuthTab').click();
 const [script]=h.scripts();assert(script);assert.equal(h.calls.length,0);
 w.App.closeModal('loginModal');h.sdk();script.dispatchEvent(new w.Event('load'));assert.deepEqual(h.counts(),{initialized:0,rendered:0});
 w.App.openLogin('user');assert.deepEqual(h.counts(),{initialized:1,rendered:1});
 d.getElementById('adminAuthTab').click();d.getElementById('userAuthTab').click();w.App.closeModal('loginModal');w.App.openLogin('user');
 assert.equal(h.scripts().length,1);assert.deepEqual(h.counts(),{initialized:1,rendered:1});assert.equal(h.calls.length,0);
 await h.credential()({credential:'fixture-google-credential'});assert.deepEqual(h.calls,[{url:'https://gas.test/exec',action:'google_login'}]);assert(w.App.isAuthenticated());
});
test('Failed and timed-out Google loads can retry without duplicate scripts or stale callbacks',t=>{
 const h=fixture(t),{w,d}=h;let timeout;const setTimeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>{if(ms===12000){timeout=fn;return 0;}return setTimeout(fn,ms,...args);};
 w.App.openLogin('user');const first=h.scripts()[0];first.dispatchEvent(new w.Event('error'));assert.equal(h.scripts().length,0);assert.equal(d.getElementById('googleRetry').hidden,false);
 d.getElementById('googleRetry').click();const second=h.scripts()[0];w.App.openLogin('user');d.getElementById('userAuthTab').click();assert.equal(h.scripts().length,1);
 timeout();assert.equal(h.scripts().length,0);d.getElementById('googleRetry').click();const third=h.scripts()[0];h.sdk();second.dispatchEvent(new w.Event('load'));assert.equal(h.counts().initialized,0);
 third.dispatchEvent(new w.Event('load'));assert.deepEqual(h.counts(),{initialized:1,rendered:1});assert.equal(d.getElementById('googleRetry').hidden,true);assert.equal(h.calls.length,0);
});
test('Member password sign-in works while Google is unavailable; homepage uses a single public summary request',async t=>{
 const h=fixture(t),{w,d}=h;w.App.openLogin('user');h.scripts()[0].dispatchEvent(new w.Event('error'));
 d.getElementById('guestEmail').value='fixture@example.test';d.getElementById('guestPassword').value='fixture-password';d.getElementById('guestAuthForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await new Promise(r=>setTimeout(r,120));assert(w.App.isAuthenticated());assert.equal(d.getElementById('loginModal').open,false);assert.deepEqual(h.calls,[{url:'https://gas.test/exec',action:'user_login'}]);
 assert.doesNotMatch(d.getElementById('toastRegion').textContent,/Không thể|Cannot|properties/);
 await w.App.apiGet('overview',{includeAuth:true});assert.equal(h.calls[1].url,'https://cloud.test/api?type=overview');
 assert(!h.calls.some(c=>c.url.includes('health')||c.url.includes('userToken')));
});
