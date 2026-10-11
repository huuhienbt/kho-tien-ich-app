import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {replaceCollections} from '../scripts/sync-collections-gas.mjs';
const backend=fs.readFileSync(new URL('../Code.gs',import.meta.url),'utf8'),moduleSource=fs.readFileSync(new URL('../Collections.gs',import.meta.url),'utf8');
function harness(){
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),pub=publicKey.export({format:'jwk'}),props=new Map(),writes=[];
 class Sheet{
  constructor(name,values){this.name=name;this.values=values;this.maxRows=100;}
  getLastRow(){let n=this.values.length;while(n&&this.values[n-1].every(v=>v===''||v==null))n--;return n;}
  getLastColumn(){return this.values[0].length;}
  getMaxRows(){return this.maxRows;}
  insertRowsAfter(_r,n){this.maxRows+=n;}
  setFrozenRows(){}
  appendRow(row){this.values.push(row);}
  getDataRange(){return this.getRange(1,1,Math.max(this.getLastRow(),1),this.getLastColumn());}
  getRange(r,c,h=1,w=1){const sheet=this;return {
   getValues(){return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>sheet.values[r-1+i]?.[c-1+j]??''));},
   setValues(rows){writes.push(sheet.name);rows.forEach((row,i)=>row.forEach((value,j)=>{sheet.values[r-1+i]??=[];sheet.values[r-1+i][c-1+j]=value;}));},
   clearContent(){this.setValues(Array.from({length:h},()=>Array(w).fill('')));},
   setRichTextValue(v){this.setValues([[v.text]]);}
  };}
 }
 const initial={Prompts:[['id','title','category','content','platform','created_at','access'],['p1','Title','teaching','Text','ChatGPT','2026-10-11T00:00:00Z','normal']],Repairs:[['id','date','task','location','cost','warranty','status','vendor','reporter','asset_id','image_url','note'],['r1',new Date('2026-09-01T07:00:00Z'),'Task','Room',120000,'12','Cần theo dõi','Vendor','Name','A1','','Note']],PromptFavorites:[['user_id','prompt_id','created_at'],['member:u1','p1','2026-10-11T00:00:00Z']],Users:[['private'],['untouched']],NhomHoc:[['private'],['untouched']]};
 const sheets=new Map(Object.entries(initial).map(([name,values])=>[name,new Sheet(name,values)])),ss={getId:()=> '1KPw-UYew83KygpFNe4vMd4VeO1xmkKbHBTLIr61l-L8',getSheetByName:n=>sheets.get(n)};
 const ctx=vm.createContext({console,Date,BigInt,SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){},newRichTextValue:()=>({setText(text){this.text=text;return this;},build(){return {text:this.text};}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),setProperties:o=>Object.entries(o).forEach(([k,v])=>props.set(k,v))})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{DigestAlgorithm:{SHA_256:'SHA256'},Charset:{UTF_8:'utf8'},base64DecodeWebSafe:s=>[...Buffer.from(s,'base64url')],computeDigest:(_a,s)=>[...crypto.createHash('sha256').update(s).digest()]}});
 vm.runInContext(backend+'\n'+moduleSource.replace(/const EGV_COLLECTIONS_PUBLIC_KEY = [^;]+;/,'const EGV_COLLECTIONS_PUBLIC_KEY = '+JSON.stringify(pub)+';'),ctx);
 vm.runInContext('createResponse=x=>x; resolvePrincipal=payload=>payload.userToken==="member"?{role:"member",sub:"u1",exp:Math.floor(Date.now()/1000)+60,membership:"regular"}:null;',ctx);
 const keyId=moduleSource.match(/EGV_COLLECTIONS_KEY_ID = '([^']+)'/)[1];
 function envelope(request){const message=JSON.stringify({version:1,issuedAt:Date.now(),...request});return {action:'collections_bridge',keyId,message,signature:crypto.sign('sha256',Buffer.from(message),privateKey).toString('base64url')};}
 const run=p=>JSON.parse(JSON.stringify(ctx.egvCollectionsBridge_(p)));
 return {ctx,sheets,props,writes,run,envelope};
}
test('surgical hook preserves live Code/Mã, other modules, manifest and private properties',()=>{
 for(const name of ['Code','Mã']){
  const unhooked=backend.replace(/\n    \/\/ D1 collections:.*?\n    \}\n/s,'\n');
  const files=[{name,type:'SERVER_JS',source:unhooked},{name:'NhomHoc',type:'SERVER_JS',source:'private-ledger'},{name:'Custom',type:'SERVER_JS',source:'keep'},{name:'appsscript',type:'JSON',source:'{"timeZone":"Asia/Ho_Chi_Minh"}'}];
  const next=replaceCollections(files,moduleSource);assert.deepEqual(next.slice(1,-1),files.slice(1));assert.equal(next.at(-1).name,'Collections');assert(next[0].source.includes('egvCollectionsBridge_(payload)'));assert.deepEqual(replaceCollections(next,moduleSource),next);
  assert.equal(next[0].source.replace(/\n\n    \/\/ D1 collections bridge:.*?\n    \}/s,''),unhooked);
 }
 assert.throws(()=>replaceCollections([{name:'Code',type:'SERVER_JS',source:'function doPost(e) { return 1; }'}],moduleSource),/UNRECOGNIZED/);
});
test('signed export, full backup readback, stale retry, dates, literal formulas and unrelated tabs',()=>{
 const h=harness(),beforeUsers=JSON.stringify(h.sheets.get('Users').values),beforeGroups=JSON.stringify(h.sheets.get('NhomHoc').values);
 const exported=h.run(h.envelope({op:'activate_export'}));assert.equal(exported.status,'success');assert.equal(h.props.get('EGV_COLLECTIONS_ACTIVE'),'1');
 const tables=exported.data.tables;assert.equal(tables.Repairs[0].date,'2026-09-01T07:00:00.000Z');tables.Prompts[0].content='=literal text, never a formula';
 const result=h.run(h.envelope({op:'backup',revision:1,tables}));assert.equal(result.status,'success');assert.equal(result.data.revision,1);assert.equal(result.data.checksum,crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex'));
 assert.deepEqual(h.run(h.envelope({op:'export'})).data.tables,tables);assert.equal(JSON.stringify(h.sheets.get('Users').values),beforeUsers);assert.equal(JSON.stringify(h.sheets.get('NhomHoc').values),beforeGroups);
 h.writes.length=0;const older=h.run(h.envelope({op:'backup',revision:1,tables:{bad:'old'}}));assert.equal(older.status,'success');assert.equal(h.writes.length,0);
 tables.Prompts=[];tables.PromptFavorites=[];const deleted=h.run(h.envelope({op:'backup',revision:2,tables}));assert.equal(deleted.status,'success');assert.equal(h.run(h.envelope({op:'export'})).data.tables.Prompts.length,0);
 assert(h.writes.every(n=>['Prompts','Repairs','PromptFavorites'].includes(n)));
});
test('forged/tampered/expired signed requests and malformed backup never mutate Sheets',()=>{
 const h=harness();let e=h.envelope({op:'activate_export'});e.message=e.message.replace('activate_export','export');assert.equal(h.run(e).status,'error');assert.equal(h.props.size,0);
 e=h.envelope({op:'activate_export',issuedAt:Date.now()-700000});assert.equal(h.run(e).status,'error');
 const exported=h.run(h.envelope({op:'activate_export'}));h.writes.length=0;
 const tables=exported.data.tables;tables.Repairs.push({...tables.Repairs[0]});assert.equal(h.run(h.envelope({op:'backup',revision:1,tables})).status,'error');assert.equal(h.writes.length,0);
 for(const action of ['create','update','delete','toggle_favorite','sync_favorites','get_prompts','get_repairs'])assert.equal(h.run({action,sheetType:'prompts',data:{}}).code,'COLLECTIONS_MIGRATED');
 const proof=h.run({action:'collections_auth',userToken:'member'});assert.deepEqual(Object.keys(proof.data).sort(),['exp','membership','role','sub']);assert.equal(h.run({action:'collections_auth',userToken:'forged'}).status,'error');
});
