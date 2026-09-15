'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const storage = require('./storage.cjs');
const ROOT = storage.ROOT, SLOT = path.join(ROOT, 'worker.json');
const ENDPOINT = 'https://mcs.zijieapi.com/v1/list';
function paused() { return process.env.AI_CONTRIBUTION_PAUSED === '1' || fs.existsSync(path.join(ROOT, 'PAUSED')); }
function log(value) { try { storage.append(path.join(ROOT, 'reports.jsonl'), value); } catch {} }
function schedule(options = {}) {
  try {
  if (process.env.AI_CONTRIBUTION_NO_WORKER === '1' || process.env.AI_CONTRIBUTION_SDK_DRY_RUN === '1') return;
  let token;
  storage.withRoot(() => {
    const slot = storage.read(SLOT);
    if (slot && (storage.liveOwner(slot.owner) || (slot.starting && Date.now() - slot.createdAt < 10000))) return;
    const maintenance = storage.read(path.join(ROOT, 'maintenance.json')) || {};
    const stats = storage.stats();
    const pending = fs.readdirSync(path.join(ROOT, 'outbox')).some(n => n.endsWith('.json'));
    const gcDebt = (maintenance.removed || 0) >= 1024 || (maintenance.reclaimedLocks || 0) >= 16;
    if (!gcDebt && (!pending || paused()) && Date.now() - (maintenance.lastGc || 0) < 3600000 && stats.bytes < stats.highBytes && stats.files < 2048) return;
    token = crypto.randomBytes(16).toString('hex');
    storage.control('worker.json', { token, owner: storage.owner(), starting: true, createdAt: Date.now() });
  }, options);
  if (token) {
    const env = { ...process.env }; delete env.AI_CONTRIBUTION_HOOK_DEADLINE_MS;
    const child = spawn(process.execPath, [__filename, token], { detached: true, stdio: 'ignore', windowsHide: true, env });
    child.on('error', () => {}); child.unref();
  }
  return true;
  } catch (error) { require('./diagnostics.cjs').emergency({ event: 'worker_schedule_skipped', reason: error.code || error.message }); return false; }
}
// Only loopback overrides are permitted for transport fault tests. Production endpoint is fixed.
function endpoint() {
  if (!process.env.AI_CONTRIBUTION_TEST_ENDPOINT) return ENDPOINT;
  const url = new URL(process.env.AI_CONTRIBUTION_TEST_ENDPOINT);
  if (!['127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'http:') throw new Error('invalid_test_endpoint');
  return url.href;
}
function send(envelopes, url = endpoint(), timeout = 8000) {
  return new Promise(resolve => {
    let finished = false, connected = false, bytes = 0, body = '';
    const complete = result => { if (!finished) { finished = true; clearTimeout(timer); resolve(result); } };
    const data = JSON.stringify(envelopes.map(e => ({ ...e, verbose: 1 }))), target = new URL(url);
    const request = (target.protocol === 'http:' ? http : https).request(target, {
      method: 'POST', agent: false, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
    }, response => {
      response.on('data', chunk => { bytes += chunk.length; if (bytes <= 65536) body += chunk; else request.destroy(new Error('response_too_large')); });
      response.on('error', e => complete({ status: 'delivery_unknown', reason: e.code || e.message }));
      response.on('end', () => {
        let parsed; try { parsed = JSON.parse(body); } catch {}
        const accepted = response.statusCode === 200 && parsed && parsed.e === 0;
        // A valid explicit rejection is terminal; a truncated/unrecognized response is ambiguous.
        const rejected = parsed && Number.isInteger(parsed.e) && parsed.e !== 0;
        complete({ status: accepted ? 'accepted' : rejected ? 'failed' : 'delivery_unknown', httpStatus: response.statusCode, responseCode: parsed?.e ?? parsed?.code, requestId: response.headers['x-tt-logid'] || response.headers['x-request-id'] });
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('request_timeout')), timeout);
    request.on('socket', socket => {
      if (!socket.connecting && (target.protocol === 'http:' || socket.authorized)) connected = true;
      socket.once(target.protocol === 'https:' ? 'secureConnect' : 'connect', () => { connected = true; });
    });
    request.on('error', e => complete({ status: connected ? 'delivery_unknown' : 'failed', safeToRetry: !connected, reason: e.code || e.message }));
    request.end(data);
  });
}
async function run(token) {
  const timer = setTimeout(() => process.exit(0), 55000);
  let released = false;
  try {
    const owned = storage.withRoot(() => {
      const slot = storage.read(SLOT); if (!slot || slot.token !== token) return false;
      storage.control('worker.json', { token, owner: storage.owner(), createdAt: Date.now() }); return true;
    });
    if (!owned) return;
    try { const m = storage.read(path.join(ROOT, 'maintenance.json')); storage.collect((m?.removed || 0) >= 1024 || (m?.reclaimedLocks || 0) >= 16); } catch (e) { log({ event: 'gc_failed', reason: e.code || e.message }); }
    // Legacy cleanup is scoped to the default home only; isolated runtime overrides never touch it.
    const migration = storage.withRoot(() => storage.read(path.join(ROOT, 'migration.json')));
    if (!process.env.AI_CONTRIBUTION_LOG_DIR && Date.now() - (migration?.attemptedAt || 0) > 3600000) {
      try {
        const summary = await require('./retire_cleanup_hook.cjs').runCleanup();
        storage.withRoot(() => storage.control('migration.json', { attemptedAt: Date.now(), status: summary.status }));
      } catch {}
    }
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline) {
      const batch = storage.withRoot(() => {
        if (paused()) { storage.control('worker.json', null); released = true; return null; }
        for (const name of fs.readdirSync(path.join(ROOT, 'outbox'))) {
          if (!name.endsWith('.json')) continue;
          const file = path.join(ROOT, 'outbox', name), value = storage.read(file);
          if (value.state === 'sending') {
            if (!storage.liveOwner(value.owner)) {
              log({ event: 'ai_contribution_delivery', batchId: value.id, status: 'delivery_unknown', reason: 'sender_interrupted', count: value.count });
              storage.remove(file);
            }
            continue;
          }
          if (value.state !== 'pending' || (value.nextAttemptAt || 0) > Date.now()) continue;
          value.state = 'sending'; value.owner = storage.owner();
          storage.write(file, JSON.stringify(value)); return value;
        }
        const queued = fs.readdirSync(path.join(ROOT, 'outbox')).some(n => n.endsWith('.json'));
        if (queued) return { wait: true };
        storage.control('worker.json', null); released = true; return null;
      });
      if (!batch) return;
      if (batch.wait) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
      const result = await send(batch.envelopes);
      storage.withRoot(() => {
        log({ event: 'ai_contribution_delivery', batchId: batch.id, sessionId: batch.sessionId, turnId: batch.turnId, count: batch.count, transport: process.env.AI_CONTRIBUTION_TEST_ENDPOINT ? 'loopback_test' : 'mcs_production', ...result });
        if (result.safeToRetry && (batch.attempts || 0) < 2) {
          batch.attempts = (batch.attempts || 0) + 1; batch.state = 'pending'; delete batch.owner;
          batch.nextAttemptAt = Date.now() + batch.attempts * 1000;
          storage.write(path.join(ROOT, 'outbox', batch.id + '.json'), JSON.stringify(batch));
        } else storage.remove(path.join(ROOT, 'outbox', batch.id + '.json'));
      });
    }
  } finally {
    clearTimeout(timer);
    if (!released) storage.withRoot(() => { if (storage.read(SLOT)?.token === token) storage.control('worker.json', null); });
  }
}
if (require.main === module) run(process.argv[2]).catch(e => log({ event: 'worker_failed', reason: e.code || e.message }));
module.exports = { schedule, send, paused, run };
