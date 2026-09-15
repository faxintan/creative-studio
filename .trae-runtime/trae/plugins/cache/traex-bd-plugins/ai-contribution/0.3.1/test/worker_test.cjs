'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn, spawnSync } = require('child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-contribution-worker-'));
process.env.AI_CONTRIBUTION_LOG_DIR = root;
const storage = require('../storage.cjs');
const worker = require('../report-worker.cjs');
const cwd = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn) { const end = Date.now()+15000; while (!fn()) { if(Date.now()>end)throw new Error('timeout'); await wait(20); } }
function spawnScript(code) { return new Promise(resolve => { const child=spawn(process.execPath,['-e',code],{cwd,env:process.env,stdio:'ignore'});child.on('exit',code=>resolve(code)); }); }
function enqueue(id){storage.enqueue({id:id.repeat(32),state:'pending',createdAt:Date.now(),count:1,envelopes:[]});}
async function main(){
 let requests=0,active=0,maxActive=0;
 const server=http.createServer((req,res)=>{requests++;active++;maxActive=Math.max(active,maxActive);req.resume();req.on('end',()=>setTimeout(()=>{res.end('{"e":0}');active--;},150));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));process.env.AI_CONTRIBUTION_TEST_ENDPOINT='http://127.0.0.1:'+server.address().port;
 try{
  enqueue('a');enqueue('b');enqueue('c');
  const codes=await Promise.all(Array.from({length:12},()=>spawnScript("require('./report-worker.cjs').schedule()")));
  assert(codes.every(c=>c===0));
  await until(()=>fs.readdirSync(path.join(root,'outbox')).length===0&&!fs.existsSync(path.join(root,'worker.json'))&&!fs.existsSync(path.join(root,'.storage.lock')));
  assert.strictEqual(requests,3);assert.strictEqual(maxActive,1,'one sender per runtime root');
  enqueue('d');fs.writeFileSync(path.join(root,'PAUSED'),'1');worker.schedule();await wait(350);assert.strictEqual(requests,3);fs.unlinkSync(path.join(root,'PAUSED'));
  worker.schedule();await until(()=>requests===4&&!fs.existsSync(path.join(root,'worker.json'))&&!fs.existsSync(path.join(root,'.storage.lock')));
  // Kill a process after marking sending but before a response. A new worker logs unknown, never replays.
  enqueue('e');
  const r=spawnSync(process.execPath,['-e',"const s=require('./storage.cjs'),p=require('path');s.withRoot(()=>{const f=p.join(s.ROOT,'outbox','"+'e'.repeat(32)+".json');const b=s.read(f);b.state='sending';b.owner=s.owner();s.write(f,JSON.stringify(b));process.exit(98);});"],{cwd,env:process.env});assert.strictEqual(r.status,98);
  worker.schedule();await until(()=>fs.readdirSync(path.join(root,'outbox')).length===0&&!fs.existsSync(path.join(root,'worker.json'))&&!fs.existsSync(path.join(root,'.storage.lock')));assert.strictEqual(requests,4);
  const entries=fs.readFileSync(path.join(root,'reports.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert(entries.some(e=>e.status==='delivery_unknown'&&e.batchId==='e'.repeat(32)));
  console.log('single worker, pause/resume and sender-crash tests passed');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:20});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
