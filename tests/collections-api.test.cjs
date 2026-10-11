'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(require.resolve('jsdom',{paths:[process.env.EGV_QA_DEPENDENCIES||process.cwd()]}));
test('Prompt/repair data route to D1, authentication/AI/Drive stay on GAS, group endpoint stays independent',async t=>{
 const dom=new JSDOM('<!doctype html>',{url:'https://e-gv.vercel.app',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 w.APP_CONFIG={API_URL:'https://gas.test/exec',COLLECTIONS_API_URL:'https://collections.test',GROUPS_API_URL:'https://groups.test',SESSION_KEY:'admin',USER_TOKEN_KEY:'user',USER_PROFILE_KEY:'profile',CLIENT_ID_KEY:'client'};
 const token=Buffer.from(JSON.stringify({role:'admin',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signed';w.sessionStorage.setItem('admin',token);
 const calls=[];w.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({status:'success',data:[]})};};
 w.eval(fs.readFileSync(path.resolve(__dirname,'../js/app.js'),'utf8'));
 for(const action of ['get_prompts','get_repairs','toggle_favorite','sync_favorites','admin_set_membership']){await w.App.apiPost(action);assert.equal(calls.at(-1).url,'https://collections.test/api');assert.equal(JSON.parse(calls.at(-1).options.body).adminToken,token);}
 for(const sheetType of ['prompts','repairs'])for(const action of ['create','update','delete']){await w.App.apiPost(action,{}, {sheetType});assert.equal(calls.at(-1).url,'https://collections.test/api');}
 for(const action of ['verify','user_login','google_login','generate_lesson_plan','age_reading','upload']){await w.App.apiPost(action);assert.equal(calls.at(-1).url,'https://gas.test/exec');}
 await w.App.apiPost('nh_boot');assert.equal(calls.at(-1).url,'https://groups.test/api');
 for(const type of ['prompts','repairs']){await w.App.apiGet(type);assert.equal(new URL(calls.at(-1).url).origin,'https://collections.test');assert.equal(new URL(calls.at(-1).url).searchParams.get('type'),type);assert.equal(new URL(calls.at(-1).url).searchParams.has('userToken'),false);}
});
