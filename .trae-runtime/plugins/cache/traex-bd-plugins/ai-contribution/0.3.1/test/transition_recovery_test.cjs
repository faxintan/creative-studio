'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const locksPath = process.env.AI_CONTRIBUTION_TEST_LOCK_MODULE || path.join(__dirname, '../state-lock.cjs');
const locks = require(locksPath);
const childPath = path.join(__dirname, 'fixtures/transition_recovery_child.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transition-recovery-'));
const token = 'a'.repeat(32);
const env = { ...process.env, AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '120', AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '50' };
const run = (file, mode = 'acquire', extra = {}) => spawnSync(process.execPath, [childPath, file, mode, locksPath], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 5000 });
function makeGate(name, files) {
  const file = path.join(root, name + '.json'), gate = file + '.lock.transition';
  fs.mkdirSync(gate);
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(gate, name), value);
  fs.utimesSync(gate, new Date(0), new Date(0));
  return { file, gate };
}
function blocked(file) {
  const result = run(file); assert.equal(result.status, 1); assert.match(result.stderr, /TURN_STATE_TRANSITION_TIMEOUT/);
}
async function main() {
  for (const [name, mode, status] of [['.storage', 'crash-owner', 91], ['turn-state', 'crash-owner', 91], ['partial', 'crash-partial-owner', 92]]) {
    const file = path.join(root, name + '.json'), gate = file + '.lock.transition';
    assert.equal(run(file, mode).status, status, 'child must actually crash during owner publication');
    assert.equal(fs.existsSync(path.join(gate, 'owner.json')), false);
    assert.match(fs.readdirSync(gate)[0], /^\.owner-[a-f0-9]{32}\.tmp$/);
    fs.utimesSync(gate, new Date(0), new Date(0));
    const recovered = run(file); assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(fs.existsSync(gate), false); assert.equal(fs.existsSync(file + '.lock'), false);
  }
  // An abandoned legacy empty marker and a new atomic nonempty marker both recover.
  const legacy = makeGate('legacy-reclaim', {});
  fs.mkdirSync(path.join(legacy.gate, '.reclaim')); fs.utimesSync(path.join(legacy.gate, '.reclaim'), new Date(0), new Date(0));
  fs.utimesSync(legacy.gate, new Date(0), new Date(0));
  assert.equal(run(legacy.file).status, 0);
  for (const [mode, code] of [['crash-reclaim', 93], ['crash-retired-transition', 94], ['crash-partial-reclaim', 95]]) {
    const broken = makeGate(mode, {});
    assert.equal(run(broken.file, mode).status, code);
    if (fs.existsSync(broken.gate)) fs.utimesSync(broken.gate, new Date(0), new Date(0));
    for (const n of fs.readdirSync(root).filter(n=>n.startsWith(path.basename(broken.gate)+'.candidate-'))) fs.utimesSync(path.join(root,n),new Date(0),new Date(0));
    const result = run(broken.file); assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readdirSync(root).filter(n => n.startsWith(path.basename(broken.gate) + '.candidate-')).length, 0);
  }
  const liveReclaim = makeGate('live-reclaim', {}), reclaim = path.join(liveReclaim.gate, '.reclaim');
  fs.mkdirSync(reclaim);
  fs.writeFileSync(path.join(reclaim, `owner-${token}.json`), JSON.stringify({ token, pid: process.pid, processIdentity: locks.processGenerationIdentity(process.pid) }));
  fs.utimesSync(liveReclaim.gate, new Date(0), new Date(0));
  blocked(liveReclaim.file); assert(fs.existsSync(path.join(reclaim, `owner-${token}.json`)));
  const liveOwner = JSON.stringify({ token, pid: process.pid, processIdentity: locks.processGenerationIdentity(process.pid) });
  const live = makeGate('live-pending', { ['.owner-' + token + '.tmp']: liveOwner });
  blocked(live.file); assert.equal(fs.readFileSync(path.join(live.gate, '.owner-' + token + '.tmp'), 'utf8'), liveOwner);
  for (const name of ['poison.json', '.poison-' + token + '.tmp', 'unexpected', '.owner-invalid.tmp']) {
    const fence = makeGate('fence-' + name.replaceAll('.', '-'), { [name]: '{}', ['.owner-' + token + '.tmp']: '{' });
    blocked(fence.file);
    assert.deepEqual(fs.readdirSync(fence.gate).sort(), [name, '.owner-' + token + '.tmp'].sort(), 'unknown or poison entries must preserve the whole generation');
  }
  const retired = makeGate('retired', { ['.owner-' + token + '.tmp']: '{' });
  fs.mkdirSync(retired.file + '.lock.retired-unverified'); blocked(retired.file);
  assert.equal(fs.existsSync(path.join(retired.gate, '.owner-' + token + '.tmp')), true);
  const linked = makeGate('symlink', {}), target = path.join(root, 'outside'); fs.writeFileSync(target, '{}');
  fs.symlinkSync(target, path.join(linked.gate, '.owner-' + token + '.tmp')); fs.utimesSync(linked.gate, new Date(0), new Date(0));
  blocked(linked.file); assert.equal(fs.readFileSync(target, 'utf8'), '{}'); assert(fs.lstatSync(path.join(linked.gate, '.owner-' + token + '.tmp')).isSymbolicLink());
  const young = makeGate('young-partial', { ['.owner-' + token + '.tmp']: '{' }); fs.utimesSync(young.gate, new Date(), new Date());
  assert.equal(run(young.file, 'acquire', { AI_CONTRIBUTION_TURN_STATE_STALE_LOCK_MS: '30000' }).status, 1);
  const replacement = makeGate('replacement', {});
  assert.equal(run(replacement.file, 'replace-generation').status, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(replacement.gate, 'owner.json'))).token, 'replacement');
  assert.equal(fs.readFileSync(path.join(replacement.gate, 'unknown'), 'utf8'), 'replacement must survive');
  assert(fs.existsSync(path.join(replacement.gate, '.reclaim')), 'cleanup must never remove the replacement generation reclaim gate');

  // Two recoverers must not enter the critical section at once after an owner-publication crash.
  const file = path.join(root, 'concurrent.json'), gate = file + '.lock.transition';
  assert.equal(run(file, 'crash-owner').status, 91); fs.utimesSync(gate, new Date(0), new Date(0));
  assert.equal(run(file, 'crash-reclaim').status, 93); fs.utimesSync(gate, new Date(0), new Date(0));
  const children = Array.from({ length: 2 }, () => spawn(process.execPath, [childPath, file, 'hold', locksPath], { env: { ...env, AI_CONTRIBUTION_TURN_STATE_LOCK_TIMEOUT_MS: '5000' }, stdio: ['pipe', 'pipe', 'pipe'] }));
  const acquired = [], errors = [];
  const exits = children.map((child, index) => new Promise((resolve, reject) => {
    child.stdout.on('data', data => { if (data.toString().includes('acquired')) acquired.push(index); });
    child.stderr.on('data', data => errors.push(data.toString()));
    child.on('error', reject); child.on('exit', code => resolve(code));
  }));
  try {
    const deadline = Date.now() + 4000;
    while (!acquired.length && Date.now() < deadline) await new Promise(r => setTimeout(r, 5));
    assert.equal(acquired.length, 1);
    await new Promise(r => setTimeout(r, 150)); assert.equal(acquired.length, 1, 'second recovery must wait for the first live lock owner');
    children[acquired[0]].stdin.write('release\n');
    while (acquired.length < 2 && Date.now() < deadline) await new Promise(r => setTimeout(r, 5));
    assert.equal(acquired.length, 2, errors.join('\n')); children[acquired[1]].stdin.write('release\n');
    assert.deepEqual(await Promise.all(exits), [0, 0]);
    assert.equal(fs.existsSync(gate), false); assert.equal(fs.existsSync(file + '.lock'), false);
  } finally { for (const child of children) if (child.exitCode === null) child.kill(); }
  console.log('transition recovery: crashed/partial owner, live owner, poison/unknown/symlink/retired fences and concurrent recovery passed');
}
main().finally(() => fs.rmSync(root, { recursive: true, force: true })).catch(error => { console.error(error); process.exitCode = 1; });
