'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {spawnSync}=require('child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-contribution-quota-'));
process.env.AI_CONTRIBUTION_LOG_DIR=root;
process.env.AI_CONTRIBUTION_MAX_BYTES='262144';
process.env.AI_CONTRIBUTION_HIGH_BYTES='131072';
process.env.AI_CONTRIBUTION_QUEUE_BYTES='32768';
process.env.AI_CONTRIBUTION_LOG_BYTES='4096';
const s=require('../storage.cjs');
const p=(...n)=>path.join(root,...n);
try {
 let writes=0;
 for(let i=0;i<500;i++) {
  try{s.withRoot(()=>{const b=s.blob('unique '+i+' '+ 'x'.repeat(8192));s.write(p('turn-snapshots','active-'+i+'.json'),JSON.stringify({createdAt:new Date().toISOString(),runtimeOwner:s.owner(),toolSpans:{a:{roots:{b}}}}));});writes++;}
  catch(e){assert.strictEqual(e.code,'QUOTA_EXCEEDED');}
 }
 assert(writes>0&&writes<500);
 const before=s.stats().bytes;s.collect(true);const after=s.stats().bytes;
 assert(after<=before);assert(after<s.HARD_BYTES);
 const active=fs.readdirSync(p('turn-snapshots')).filter(n=>n.endsWith('.json'));
 assert.strictEqual(active.length,writes,'quota must preserve every accepted active state');
 // Collection and worker election retain reserved capacity when all remaining payloads are live.
 s.withRoot(()=>s.control('worker.json',{token:'quota-test',owner:s.owner(),createdAt:Date.now()}));
 assert(s.read(p('worker.json')));s.withRoot(()=>s.control('worker.json',null));
 for(const name of active)s.withRoot(()=>{const f=p('turn-snapshots',name),state=s.read(f);delete state.runtimeOwner;state.createdAt=new Date(0).toISOString();s.remove(f);});
 s.collect(true);assert.strictEqual(fs.readdirSync(p('snapshot-blobs')).length,0);
 for(let i=0;i<10000;i++)s.append(p('diagnostics.jsonl'),{event:'offline_failure',reason:'ECONNRESET',i});
 assert(fs.statSync(p('diagnostics.jsonl')).size<=4096);
 assert(fs.statSync(p('diagnostics.jsonl.1')).size<=4096);
 // Reject a symlinked runtime root and legacy root override before any collector writes.
 const outside=fs.mkdtempSync(path.join(os.tmpdir(),'ai-contribution-quota-outside-'));
 try{
  const link=p('runtime-link');fs.symlinkSync(outside,link);
  const result=spawnSync(process.execPath,['-e',"require('./storage.cjs').stats()"],{cwd:path.join(__dirname,'..'),env:{...process.env,AI_CONTRIBUTION_LOG_DIR:link}});
  assert.notStrictEqual(result.status,0);assert.deepStrictEqual(fs.readdirSync(outside),[]);
 }finally{fs.rmSync(outside,{recursive:true,force:true});}
 console.log('active-data saturation, log rotation and unsafe-root tests passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
