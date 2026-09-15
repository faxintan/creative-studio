'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-storage-'));
process.env.AI_CONTRIBUTION_LOG_DIR = ROOT;
process.env.AI_CONTRIBUTION_MAX_BYTES = String(1024 * 1024);
process.env.AI_CONTRIBUTION_HIGH_BYTES = String(512 * 1024);
process.env.AI_CONTRIBUTION_MAX_STATES = '32';
process.env.AI_CONTRIBUTION_STATE_TTL_MS = '1000';
process.env.AI_CONTRIBUTION_QUEUE_TTL_MS = '1000';
process.env.AI_CONTRIBUTION_LOG_BYTES = '4096';
const storage = require('../storage.cjs');
const { send, run } = require('../report-worker.cjs');
const locks = require('../state-lock.cjs');
function file(...names) { return path.join(ROOT, ...names); }
function put(name, value) { storage.write(file('turn-snapshots', name + '.json'), JSON.stringify(value)); }
function uuid(time) { const s = time.toString(16).padStart(12, '0'); return s.slice(0,8) + '-' + s.slice(8) + '-7000-8000-000000000000'; }
function disk() { let bytes=0, allocatedBytes=0, files=0; const visit=d=>{for(const n of fs.readdirSync(d)){const p=path.join(d,n),s=fs.lstatSync(p);if(s.isDirectory())visit(p);else{bytes+=s.size;allocatedBytes+=s.blocks*512;files++;}}};visit(ROOT);return {bytes,allocatedBytes,files}; }
function child(code) { const r=spawnSync(process.execPath,['-e',code],{cwd:path.join(__dirname,'..'),env:process.env,encoding:'utf8'});return r; }
async function main() {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-outside-'));
  try {
    storage.withRoot(() => {
      const live = storage.blob('shared active'), dead = storage.blob('orphan');
      put('active', { turnId: uuid(Date.now()-5000), createdAt: new Date(0).toISOString(), runtimeOwner: storage.owner(), toolSpans: { a: { roots: { live } } } });
      put('finished', { turnId: uuid(Date.now()-4000), createdAt: new Date(0).toISOString(), completedAt: new Date(0).toISOString() });
      storage.collect(true);
      assert(fs.existsSync(file('snapshot-blobs', live.blobId)));
      assert(!fs.existsSync(file('snapshot-blobs', dead.blobId)));
      assert(!fs.existsSync(file('turn-snapshots', 'finished.json')));
      assert(!storage.admit({ turn_id: uuid(Date.now()-4500) }));
      assert(storage.admit({ turn_id: uuid(Date.now()+1) }));
    });
    fs.symlinkSync(outside, file('tmp', 'escape'));
    assert.throws(() => storage.write(file('tmp','escape','keep'), 'no'), /SYMLINK_PATH/);
    assert.deepStrictEqual(fs.readdirSync(outside), []); fs.unlinkSync(file('tmp','escape'));
    assert.throws(() => storage.write(path.join(outside, 'keep'), 'no'), /UNOWNED_PATH/);
    // A crash after atomic rename leaves a dirty ledger. The next process must include the new bytes.
    const crashed = child("const s=require('./storage.cjs');s.withRoot(()=>{s.write(require('path').join(s.ROOT,'tmp','crashed'),Buffer.alloc(123456));process.exit(97)});");
    assert.strictEqual(crashed.status,97);
    const recovered = storage.stats(); assert(recovered.bytes >= 123456);
    storage.collect(true); assert(!fs.existsSync(file('tmp','crashed')));
    // Queue admission is bounded separately and does not consume a reporting claim when rejected.
    storage.enqueue({id:'f'.repeat(32),createdAt:Date.now(),state:'pending',envelopes:[],padding:'x'.repeat(300000)});
    let claimed=false;
    assert.throws(()=>storage.enqueue({id:'e'.repeat(32),createdAt:Date.now(),state:'pending',envelopes:[],padding:'x'.repeat(300000)},()=>{claimed=true}),/QUEUE_QUOTA_EXCEEDED/);
    assert.strictEqual(claimed,false);
    storage.withRoot(()=>{const f=file('outbox','f'.repeat(32)+'.json');const b=storage.read(f);b.createdAt=0;storage.write(f,JSON.stringify(b));});
    storage.collect(true);assert.deepStrictEqual(fs.readdirSync(file('outbox')),[]);
    // Contended writers may reject at quota, but their combined atomic copies must fit the hard cap.
    const writers = Array.from({length:12}, (_,i)=>new Promise(resolve=>{
      const c=spawn(process.execPath,['-e',"const s=require('./storage.cjs');try{s.write(require('path').join(s.ROOT,'tmp','writer-"+i+"'),Buffer.alloc(100000));}catch(e){if(e.code!=='QUOTA_EXCEEDED')throw e;}"],{cwd:path.join(__dirname,'..'),env:process.env,stdio:'ignore'});c.on('exit',code=>resolve(code));
    }));
    assert((await Promise.all(writers)).every(code=>code===0));
    assert(disk().allocatedBytes <= storage.HARD_BYTES);storage.collect(true);
    // Fixed workload for 10,000 turns; unique blobs, bounded tombstones and rotating diagnostics.
    const samples=[], start=Date.now();
    for(let i=0;i<10000;i++) {
      storage.withRoot(()=>{
        const ref=storage.blob('const value = '+i+';'.repeat(64));
        put('round-'+i,{turnId:uuid(start+i),createdAt:new Date().toISOString(),toolSpans:{a:{roots:{ref}}}});
        put('round-'+i,{turnId:uuid(start+i),createdAt:new Date().toISOString(),completedAt:new Date().toISOString()});
        storage.append(file('diagnostics.jsonl'),{event:'stress_turn',i});
        if(i%32===31)storage.collect(true);
      });
      if(i%1000===999) {const sample=disk();assert(sample.allocatedBytes<=storage.HARD_BYTES);samples.push({turns:i+1,...sample});}
    }
    storage.collect(true);
    assert(fs.readdirSync(file('turn-snapshots')).length <= 34);
    assert(fs.readdirSync(file('snapshot-blobs')).length <= 1);
    assert(samples.at(-1).files <= samples[1].files + 32);
    console.log(JSON.stringify({stressRounds:10000,durationMs:Date.now()-start,samples}));
    // Read the actual HTTP response; timeout/invalid JSON may never be logged accepted.
    let requests=0;
    const server=http.createServer((req,res)=>{requests++;req.resume();req.on('end',()=>{
      if(req.url==='/timeout')return;
      if(req.url==='/reject'){res.end('{"e":7}');return;}
      if(req.url==='/bad'){res.end('not-json');return;}
      res.setHeader('x-tt-logid','test-request');res.end('{"e":0}');
    });});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    try {
      assert.strictEqual((await send([],base+'/ok')).status,'accepted');
      assert.strictEqual((await send([],base+'/reject')).status,'failed');
      assert.strictEqual((await send([],base+'/bad')).status,'delivery_unknown');
      assert.strictEqual((await send([],base+'/timeout',30)).status,'delivery_unknown');
      process.env.AI_CONTRIBUTION_TEST_ENDPOINT=base+'/ok';
      const id='a'.repeat(32), deadId='b'.repeat(32), token='c'.repeat(32);
      storage.enqueue({id,state:'pending',createdAt:Date.now(),count:1,envelopes:[]});
      storage.enqueue({id:deadId,state:'sending',createdAt:Date.now(),count:1,envelopes:[],owner:{pid:99999999,identity:'gone'}});
      storage.withRoot(()=>storage.control('worker.json',{token,owner:storage.owner(),createdAt:Date.now()}));
      const before=requests;await run(token);assert.strictEqual(requests,before+1,'interrupted sending entries must not replay');
      assert.deepStrictEqual(fs.readdirSync(file('outbox')),[]);
      const logs=fs.readFileSync(file('reports.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
      assert(logs.some(e=>e.batchId===id&&e.status==='accepted'&&e.requestId==='test-request'));
      assert(logs.some(e=>e.batchId===deadId&&e.status==='delivery_unknown'));
    } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    console.log('storage and transport tests passed');
  } finally { fs.rmSync(ROOT,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true}); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
