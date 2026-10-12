import {readFile,appendFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {pathToFileURL} from 'node:url';
import {syncNhomHoc} from './sync-nhomhoc-gas.mjs';
export function replaceCollections(files,source){
 if(typeof source!=='string'||!source.trim())throw new Error('COLLECTIONS_SOURCE_INVALID');
 try{new Script(source);}catch{throw new Error('COLLECTIONS_SOURCE_INVALID');}
 const next=files.map(f=>({...f})),backends=next.filter(f=>f.type==='SERVER_JS'&&/function\s+doPost\s*\(/.test(f.source));
 if(backends.length!==1)throw new Error('COLLECTIONS_BACKEND_AMBIGUOUS');
 const backend=backends[0];
 if(!backend.source.includes('egvCollectionsBridge_(payload)')){
  const pattern=/(function\s+doPost\(e\)\s*\{\s*try\s*\{\s*const payload = JSON\.parse\([^\n]+\);\s*const action = String\([^\n]+\);\s*const data = payload\.data \|\| \{\};)/g;
  const matches=[...backend.source.matchAll(pattern)];if(matches.length!==1)throw new Error('COLLECTIONS_HOOK_UNRECOGNIZED');
  backend.source=backend.source.replace(pattern,"$1\n\n    // D1 collections bridge: preserve all other live backend functions.\n    if (typeof egvCollectionsBridge_ === 'function') {\n      const collectionsResponse = egvCollectionsBridge_(payload);\n      if (collectionsResponse) return collectionsResponse;\n    }");
 }
 if(!backend.source.includes('return egvCloudAdminToken_(token, requiredRole);')){
  const pattern=/function verifyToken\(token, requiredRole\) \{/g;
  if([...backend.source.matchAll(pattern)].length!==1)throw new Error('ADMIN_TOKEN_HOOK_UNRECOGNIZED');
  backend.source=backend.source.replace(pattern,"$&\n  if (typeof egvCloudAdminToken_ === 'function' && String(token || '').split('.')[1]?.length === 342) {\n    return egvCloudAdminToken_(token, requiredRole);\n  }");
 }
 try{new Script(backend.source);}catch{throw new Error('COLLECTIONS_BACKEND_INVALID');}
 const old=next.find(f=>f.name==='Collections');if(old&&old.type!=='SERVER_JS')throw new Error('COLLECTIONS_FILE_TYPE_INVALID');
 const replacement={name:'Collections',type:'SERVER_JS',source};if(old)next[next.indexOf(old)]=replacement;else next.push(replacement);
 return next;
}
async function main(){
 const source=await readFile(new URL('../Collections.gs',import.meta.url),'utf8'),config=await readFile(new URL('../js/config.js',import.meta.url),'utf8');
 const expectedUrl=config.match(/API_URL\s*:\s*['"](https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec)['"]/)?.[1];
 const result=await syncNhomHoc({env:process.env,source,expectedUrl,transformFiles:replaceCollections,label:'Collections'});
 const message=`Collections.gs đã đồng bộ; phiên bản ${result.version} đang hoạt động. Các tệp khác và URL Web App được giữ nguyên.`;
 console.log(message);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,message+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(/^[A-Z_]+(?:_\d+)?$/.test(error.message)?error.message:'COLLECTIONS_SYNC_FAILED');process.exitCode=1;});
