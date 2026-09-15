'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {spawnSync,execFileSync}=require('child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ai-contribution-queue-'));
const root=path.join(temp,'repo'),log=path.join(temp,'runtime');fs.mkdirSync(root);fs.mkdirSync(log);
process.env.AI_CONTRIBUTION_LOG_DIR=log;
const storage=require('../storage.cjs');
const adapter=path.join(__dirname,'../ai_contribution_sdk_adapter.js'),runner=path.join(__dirname,'../ai_contribution_sdk_hook.js');
function git(args){return execFileSync('git',args,{cwd:root,stdio:'pipe'});}
const env={...process.env,AI_CONTRIBUTION_NO_WORKER:'1'};
let serial=0;
function hook(payload,extra={},file=adapter){const r=spawnSync(process.execPath,[file],{cwd:root,input:JSON.stringify(payload),encoding:'utf8',env:{...env,...extra}});assert.strictEqual(r.status,0,r.stderr);}
function queue(){return fs.readdirSync(path.join(log,'outbox')).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(log,'outbox',n))));}
function scenario(name,input,before,after,expected,event='PostToolUse'){
 const p={session_id:'queue',turn_id:'turn-'+serial++,tool_use_id:'call',tool_name:name,cwd:root,model:'test-model',tool_input:input};
 before?.();hook({...p,hook_event_name:'UserPromptSubmit'});hook({...p,hook_event_name:'PreToolUse'});after();
 const beforeCount=queue().length;
 hook({...p,hook_event_name:event,tool_response:'completed'});hook({...p,hook_event_name:event,tool_response:'completed'});hook({...p,hook_event_name:'Stop'});
 assert.strictEqual(queue().length-beforeCount,expected?1:0,name+' must enqueue exactly once');
 if(expected){const batch=queue().at(-1);const events=queue().flatMap(b=>b.envelopes.flatMap(e=>e.events));assert(events.some(e=>{const p=JSON.parse(e.params);return p.originAcceptText.includes(expected)}));}
}
try{
 git(['init']);git(['config','user.name','Test']);git(['config','user.email','test@example.invalid']);
 fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/base.js'),'const base = 1;\n');fs.writeFileSync(path.join(root,'.gitignore'),'ignored/\n');git(['add','.']);git(['commit','-m','fixture']);
 scenario('Write',{file_path:'src/write.js'},null,()=>fs.writeFileSync(path.join(root,'src/write.js'),'const written = 2;\n'),'written = 2');
 scenario('Edit',{file_path:'src/base.js',old_string:'1',new_string:'3'},null,()=>fs.writeFileSync(path.join(root,'src/base.js'),'const base = 3;\n'),'base = 3');
 scenario('Bash',{command:'rm src/write.js'},null,()=>fs.unlinkSync(path.join(root,'src/write.js')),false);
 scenario('apply_patch',{command:'*** Begin Patch\n*** Add File: README.md\n+documentation\n*** End Patch'},null,()=>fs.writeFileSync(path.join(root,'README.md'),'documentation\n'),false);
 scenario('apply_patch',{command:'*** Begin Patch\n*** Add File: ignored/no.js\n+const ignored = 1;\n*** End Patch'},()=>fs.mkdirSync(path.join(root,'ignored')),()=>fs.writeFileSync(path.join(root,'ignored/no.js'),'const ignored = 1;\n'),false);
 scenario('Bash',{command:'printf code > src/failed.js; exit 7'},null,()=>fs.writeFileSync(path.join(root,'src/failed.js'),'const failure = 7;\n'),'failure = 7','PostToolUseFailure');
 // Stop recovers an abandoned Pre using its immutable before snapshot.
 scenario('Bash',{command:'printf code > src/recovered.js'},null,()=>fs.writeFileSync(path.join(root,'src/recovered.js'),'const recovery = 8;\n'),'recovery = 8','Stop');
 // A file skipped before modification must never be reported as a newly created full file.
 scenario('Write',{file_path:'src/large.js'},()=>fs.writeFileSync(path.join(root,'src/large.js'),Buffer.alloc(2*1024*1024+1,65)),()=>fs.writeFileSync(path.join(root,'src/large.js'),'const small = 1;\n'),false);
 const before=queue().length;
 fs.writeFileSync(path.join(log,'PAUSED'),'');
 hook({session_id:'paused',turn_id:'paused',hook_event_name:'UserPromptSubmit',cwd:root},{},runner);
 assert(!fs.existsSync(path.join(log,'turn-snapshots','paused-paused.json')));assert.strictEqual(queue().length,before);fs.unlinkSync(path.join(log,'PAUSED'));
 storage.collect(true);assert.strictEqual(fs.readdirSync(path.join(log,'snapshot-blobs')).length,0,'terminal spans must release all shared blobs');
 console.log('report queue scenarios passed');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
