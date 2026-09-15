'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync, execFileSync, spawn } = require('node:child_process');
const plugin = path.resolve(__dirname, '..'), root = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-performance-'));
const gitBin = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const cleanEnv = { ...process.env, AI_CONTRIBUTION_HOOK_BUDGET_MS: '500', AI_CONTRIBUTION_NO_WORKER: '1', AI_CONTRIBUTION_SDK_DRY_RUN: '1' };
delete cleanEnv.AI_CONTRIBUTION_HOOK_DEADLINE_MS;
const run = (script, payload, env = {}, cwd = root, timeout = 6000) => {
  const started = performance.now();
  const result = spawnSync(process.execPath, [path.join(plugin, script)], { input: JSON.stringify(payload), encoding: 'utf8', cwd, env: { ...cleanEnv, ...env }, timeout });
  return { ...result, ms: performance.now() - started };
};
const stateRoot = name => { const dir = path.join(root, name); fs.mkdirSync(dir); return dir; };
const payload = { hook_event_name: 'UserPromptSubmit', session_id: 'perf', turn_id: 'turn', cwd: root, prompt: 'test' };
const fakebin = stateRoot('bin');
fs.writeFileSync(path.join(fakebin, 'git'), `#!${process.execPath}
const fs=require('fs'),cp=require('child_process');
if (process.argv[2] !== 'ls-files') { const r=cp.spawnSync(${JSON.stringify(gitBin)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status||0); }
if(process.env.PID_FILE)fs.writeFileSync(process.env.PID_FILE,String(process.pid));
const mode=process.env.GIT_MODE;
if(mode==='stall')setInterval(()=>{},1000);
else if(mode==='filtered')process.stdout.write('docs/a.md\\0dist/a.js\\0src/a.js\\0src/a.js\\0');
else if(mode==='chunks'){const b=Buffer.from('src/你好\\nworld.js\\0'); let i=0; const t=setInterval(()=>{if(i===b.length){clearInterval(t);return;}process.stdout.write(b.subarray(i,i+1));i++;},1);}
else if(mode==='bytes')process.stdout.write('x'.repeat(10000));
else { let i=0; const t=setInterval(()=>{if(i>=300000){clearInterval(t);return;} const prefix=mode==='candidates'?'docs/':'src/';process.stdout.write(Array.from({length:1000},()=>prefix+(i++)+(mode==='candidates'?'.md':'.js')+'\\0').join(''));},1); }
`, { mode: 0o755 });
const fakeenv = { PATH: fakebin + path.delimiter + process.env.PATH };
function list(mode, extra = {}) {
  const pidFile = path.join(root, 'pid-'+mode);
  const result = run('snapshot-list.cjs', { root, pathspecs: ['.'], fileLimit: 5, timeoutMs: 200, outputLimit: 4096, candidateLimit: 100, ...extra }, { ...fakeenv, GIT_MODE: mode, PID_FILE: pidFile });
  assert.equal(result.status, 0, result.stderr);
  if (fs.existsSync(pidFile)) assert.throws(() => process.kill(Number(fs.readFileSync(pidFile)), 0), { code: 'ESRCH' }, 'Git must be reaped before helper exits');
  return JSON.parse(result.stdout);
}
async function main() {
  const good = stateRoot('good');
  const healthy = run('ai_contribution_sdk_hook.js', payload, { AI_CONTRIBUTION_LOG_DIR: good });
  assert.equal(healthy.status, 0); assert(healthy.ms < 800, `healthy hook ${healthy.ms}`);
  // Poisoned gate: all five events must fast-open without touching the fence or worker.
  const bad = stateRoot('bad'), gate = path.join(bad, '.storage.lock.transition'); fs.mkdirSync(gate);
  fs.writeFileSync(path.join(gate, 'poison.json'), '{}');
  const timings = [];
  for (const hook_event_name of ['UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','Stop']) {
    const result = run('ai_contribution_sdk_hook.js', { ...payload, hook_event_name, tool_name: 'Bash', tool_input: { command:'true' } }, { AI_CONTRIBUTION_LOG_DIR: bad, AI_CONTRIBUTION_NO_WORKER: '0', AI_CONTRIBUTION_SDK_DRY_RUN: '0' });
    assert.equal(result.status, 0); assert(result.ms < 800, `${hook_event_name}: ${result.ms}`);
    assert.match(result.stderr, /hook_adapter_process/); timings.push(Math.round(result.ms));
    assert(!fs.existsSync(path.join(bad, 'worker.json')));
  }
  assert.equal(fs.readFileSync(path.join(gate, 'poison.json'), 'utf8'), '{}');
  if (process.platform === 'linux') {
    const fixture = stateRoot('unresponsive'), pidFile = path.join(fixture,'pids');
    fs.writeFileSync(path.join(fixture,'ai_contribution_sdk_adapter.js'), `
      const fs=require('fs'),cp=require('child_process');
      process.on('SIGTERM',()=>{});process.stdin.resume();
      const child=cp.spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});
      fs.writeFileSync(${JSON.stringify(pidFile)},JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);
    `);
    const cancelled = run('ai_contribution_sdk_hook.js',payload,{AI_CONTRIBUTION_PLUGIN_DIR:fixture});
    assert.equal(cancelled.status,0);assert(cancelled.ms<800);assert.match(cancelled.stderr,/HOOK_BUDGET_EXHAUSTED/);
    for(const pid of JSON.parse(fs.readFileSync(pidFile))) {
      try {assert.equal(fs.readFileSync('/proc/'+pid+'/stat','utf8').split(') ')[1][0],'Z','timeout left a running descendant');}
      catch(e) {if(e.code!=='ENOENT')throw e;}
    }
  }
  // The original bundle's empty .reclaim shape must recover, not just fast-fail.
  const legacy = stateRoot('legacy'), legacyGate = path.join(legacy, '.storage.lock.transition');
  fs.mkdirSync(path.join(legacyGate, '.reclaim'), { recursive:true });
  for (const dir of [path.join(legacyGate,'.reclaim'),legacyGate]) fs.utimesSync(dir,new Date(0),new Date(0));
  const recovered = run('ai_contribution_sdk_hook.js', payload, { AI_CONTRIBUTION_LOG_DIR: legacy });
  assert.equal(recovered.status,0); assert(fs.readFileSync(path.join(legacy,'diagnostics.jsonl'),'utf8').includes('turn_snapshot_start'));
  assert(!fs.existsSync(legacyGate));
  assert.deepEqual(list('filtered').paths, ['src/a.js']);
  assert.deepEqual(list('chunks').paths, ['src/你好\nworld.js']);
  assert.equal(list('many', { outputLimit: 100000 }).reason, 'snapshot_file_count_exceeds_limit');
  assert.equal(list('candidates', { outputLimit: 100000 }).reason, 'snapshot_candidate_count_exceeds_limit');
  assert.equal(list('bytes').reason, 'snapshot_listing_bytes_exceeds_limit');
  assert.equal(list('stall').reason, 'snapshot_time_budget');
  // A stalled enumeration must not own the root lock or block an unrelated turn.
  const small = stateRoot('small'); execFileSync(gitBin, ['init','-q'], {cwd:small});
  const concurrent = stateRoot('concurrent'), scanning = path.join(root,'scanning.pid');
  const slow = spawn(process.execPath, [path.join(plugin,'ai_contribution_sdk_hook.js')], {
    env: {...cleanEnv,...fakeenv,AI_CONTRIBUTION_LOG_DIR:concurrent,AI_CONTRIBUTION_HOOK_BUDGET_MS:'1500',
      AI_CONTRIBUTION_SNAPSHOT_BUDGET_MS:'900', GIT_MODE:'stall',PID_FILE:scanning}, stdio:['pipe','pipe','pipe'] });
  let slowError='';slow.stderr.on('data',c=>slowError+=c);slow.stdout.resume();
  const slowDone = new Promise(resolve=>slow.on('close',resolve));
  slow.stdin.end(JSON.stringify({...payload,cwd:small,hook_event_name:'PreToolUse',tool_name:'Bash',tool_use_id:'slow',tool_input:{command:'python3 unknown.py'}}));
  const waitUntil = Date.now()+2000;
  while(!fs.existsSync(scanning) && Date.now()<waitUntil && slow.exitCode===null) await new Promise(r=>setTimeout(r,5));
  assert(fs.existsSync(scanning), slowError);
  // Simulate GC advancing admission while the old Pre is out of lock.
  execFileSync(process.execPath,['-e',`const s=require(${JSON.stringify(path.join(plugin,'storage.cjs'))});const p=require('path');s.withRoot(()=>{const g=s.read(p.join(s.ROOT,'generation.json'));g.rejectBefore=Date.now();s.control('generation.json',g);});`], {env:{...cleanEnv,AI_CONTRIBUTION_LOG_DIR:concurrent}});
  const hex=(Date.now()+1000).toString(16).padStart(12,'0'), newTurn=hex.slice(0,8)+'-'+hex.slice(8)+'-7000-8000-000000000000';
  const unrelated = run('ai_contribution_sdk_hook.js',{...payload,cwd:small,turn_id:newTurn}, {AI_CONTRIBUTION_LOG_DIR:concurrent});
  assert.equal(unrelated.status,0);assert(!unrelated.stderr,unrelated.stderr);
  assert(fs.readFileSync(path.join(concurrent,'diagnostics.jsonl'),'utf8').includes(newTurn));
  assert.equal(await slowDone,0); assert.match(slowError,/expired turn/);
  assert(!fs.existsSync(path.join(concurrent,'turn-snapshots','perf-turn.json')), 'Pre must not reopen an expired turn after GC');
  // Scratch used by an in-flight unlocked diff must survive concurrent GC.
  const scratch = stateRoot('scratch');
  execFileSync(process.execPath,['-e',`const s=require(${JSON.stringify(path.join(plugin,'storage.cjs'))});const p=require('path'),fs=require('fs');s.withRoot(()=>{const f=p.join(s.ROOT,'tmp','diff-'+process.pid+'-abcdef-before');s.write(f,'before');s.collect(true);if(!fs.existsSync(f))throw Error('GC removed live diff');s.remove(f);});`], {env:{...cleanEnv,AI_CONTRIBUTION_LOG_DIR:scratch}});
  // Real Git index with 300,000 tracked entries; no 300k-file disk fixture necessary.
  const repo = stateRoot('repo'); execFileSync(gitBin,['init','-q'],{cwd:repo});
  const oid = execFileSync(gitBin,['hash-object','-w','--stdin'],{cwd:repo,input:'const x = 1;\n',encoding:'utf8'}).trim();
  execFileSync(gitBin,['update-index','--index-info'], { cwd:repo, input:Array.from({length:300000},(_,i)=>`100644 ${oid}\tsrc/f${String(i).padStart(6,'0')}.js\n`).join(''), maxBuffer: 64*1024*1024 });
  const large = stateRoot('large');
  const pre = { ...payload, cwd:repo, hook_event_name:'PreToolUse',tool_name:'Bash',tool_use_id:'large',tool_input:{command:'python3 unknown.py'} };
  const result = run('ai_contribution_sdk_hook.js',pre,{AI_CONTRIBUTION_LOG_DIR:large});
  assert.equal(result.status,0); assert(result.ms<800, `large index ${result.ms}`);
  const stateFile = fs.readdirSync(path.join(large,'turn-snapshots')).find(n=>n.endsWith('.json'));
  assert(stateFile, `Pre must persist a lightweight skipped span, stderr=${result.stderr}`);
  const state = JSON.parse(fs.readFileSync(path.join(large,'turn-snapshots',stateFile)));
  const span = Object.values(state.toolSpans)[0];assert.equal(Object.keys(span.roots).length,0);
  assert(['snapshot_file_count_exceeds_limit','snapshot_time_budget'].includes(span.skippedRoots[0].reason));
  // Explicit apply_patch still works in this same huge repository (no wide scan).
  fs.writeFileSync(path.join(repo,'direct.js'),'const direct = 1;\n');
  const patch = '*** Begin Patch\n*** Update File: direct.js\n@@\n-const direct = 1;\n+const direct = 2;\n*** End Patch';
  const patchPre = { ...pre, tool_use_id:'direct', tool_name:'apply_patch', tool_input:{command:patch} };
  assert.equal(run('ai_contribution_sdk_hook.js',patchPre,{AI_CONTRIBUTION_LOG_DIR:large}).status,0);
  fs.writeFileSync(path.join(repo,'direct.js'),'const direct = 2;\n');
  const post = run('ai_contribution_sdk_hook.js',{...patchPre,hook_event_name:'PostToolUse',tool_response:'Success. Updated the following files:\nM direct.js\n'},{AI_CONTRIBUTION_LOG_DIR:large});
  assert.equal(post.status,0);assert(fs.readFileSync(path.join(large,'reports.jsonl'),'utf8').includes('const direct = 2;'),post.stderr);
  console.log(JSON.stringify({healthyMs:Math.round(healthy.ms), poisonedEventMs:timings, largeIndexPreMs:Math.round(result.ms), largeIndexPostMs:Math.round(post.ms)}));
  console.log('hook performance: budgets, real 300k index, streaming bounds, orphan recovery and direct patch passed');
}
main().finally(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:20})).catch(e=>{console.error(e);process.exitCode=1;});
