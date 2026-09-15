'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const locks = require('./state-lock.cjs');
const MiB = 1024 * 1024;
function limit(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), fallback) : fallback;
}
const HARD_BYTES = limit('AI_CONTRIBUTION_MAX_BYTES', 256 * MiB);
const HIGH_BYTES = Math.min(limit('AI_CONTRIBUTION_HIGH_BYTES', 128 * MiB), HARD_BYTES * 0.75);
const MAX_FILES = limit('AI_CONTRIBUTION_MAX_FILES', 20000);
const STATE_TTL = limit('AI_CONTRIBUTION_STATE_TTL_MS', 7 * 86400000);
const QUEUE_TTL = limit('AI_CONTRIBUTION_QUEUE_TTL_MS', 86400000);
const MAX_STATES = limit('AI_CONTRIBUTION_MAX_STATES', 2048);
const QUEUE_BYTES = Math.min(limit('AI_CONTRIBUTION_QUEUE_BYTES', 32 * MiB), HARD_BYTES / 2);
const LOG_BYTES = Math.min(limit('AI_CONTRIBUTION_LOG_BYTES', 2 * MiB), HARD_BYTES / 16);
const HEADROOM = Math.min(128 * 1024, HARD_BYTES / 2);
function error(code) { return Object.assign(new Error(code), { code }); }
function charge(size) { return Math.max(4096, Math.ceil(size / 4096) * 4096); }
function diskCharge(s) { return Math.max(charge(s.size), Number(s.blocks || 0) * 512); }
function stat(file) { try { return fs.lstatSync(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
// Canonicalize existing ancestors (including macOS /var and symlinked home), never the owned root.
function canonicalParent(file) {
  const tail = [path.basename(file)]; let parent = path.dirname(file);
  while (!stat(parent)) { tail.unshift(path.basename(parent)); parent = path.dirname(parent); }
  return path.join(fs.realpathSync(parent), ...tail);
}
const ROOT = canonicalParent(path.resolve(process.env.AI_CONTRIBUTION_LOG_DIR || path.join(os.homedir(), '.trae/hooks/ai-contribution-v2')));
const AREAS = ['turn-snapshots', 'snapshot-blobs', 'outbox', 'tmp'];
let depth = 0, usage = null, generation = null, mutationFailed = false;
function safe(file) {
  const resolved = path.resolve(file);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) throw error('UNOWNED_PATH');
  let current = ROOT;
  for (const segment of ['', ...path.relative(ROOT, resolved).split(path.sep).filter(Boolean)]) {
    current = path.join(current, segment);
    if (stat(current)?.isSymbolicLink()) throw error('SYMLINK_PATH');
  }
  return resolved;
}
function read(file) {
  safe(file);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
function initialize() {
  if (ROOT === path.parse(ROOT).root || ['ai-contribution', 'ai-contribution-sdk', 'npm-cache'].includes(path.basename(ROOT))) throw error('UNSAFE_RUNTIME_ROOT');
  const legacyHome = canonicalParent(path.join(os.homedir(), '.trae/hooks/ai-contribution-sdk'));
  const oldRoots = [legacyHome, path.join(path.dirname(legacyHome), 'ai-contribution'), path.join(path.dirname(legacyHome), 'npm-cache')];
  if (oldRoots.some(old => ROOT === old || ROOT.startsWith(old + path.sep))) throw error('UNSAFE_RUNTIME_ROOT');
  const existing = stat(ROOT);
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw error('UNSAFE_RUNTIME_ROOT');
  if (existing && !stat(path.join(ROOT, 'generation.json'))) {
    const allowed = new Set([...AREAS, 'reports.jsonl', 'reports.jsonl.1', 'diagnostics.jsonl', 'diagnostics.jsonl.1', 'hook-stdio.log', 'hook-stdio.log.1', 'PAUSED', 'usage.json', 'usage.json.tmp', 'generation.json.tmp']);
    if (fs.readdirSync(ROOT).some(name => !allowed.has(name) && !name.startsWith('.storage.lock'))) throw error('UNOWNED_RUNTIME_DIRECTORY');
  }
  fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
  for (const name of AREAS) fs.mkdirSync(safe(path.join(ROOT, name)), { recursive: true, mode: 0o700 });
}
function control(name, value) {
  if (!['usage.json', 'generation.json', 'maintenance.json', 'worker.json', 'migration.json'].includes(name)) throw error('INVALID_CONTROL');
  const file = safe(path.join(ROOT, name)), tmp = safe(file + '.tmp');
  if (value === null) { try { fs.unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; } return; }
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > 8192) throw error('CONTROL_TOO_LARGE');
  fs.writeFileSync(tmp, body, { mode: 0o600 }); fs.renameSync(tmp, file);
}
function inventory() {
  const result = { bytes: 0, files: 0 };
  for (const name of [...AREAS, 'reports.jsonl', 'reports.jsonl.1', 'diagnostics.jsonl', 'diagnostics.jsonl.1', 'hook-stdio.log', 'hook-stdio.log.1']) {
    const pending = [path.join(ROOT, name)];
    while (pending.length) {
      const file = safe(pending.pop()), s = stat(file);
      if (!s) continue;
      if (s.isDirectory()) {
        if (file !== path.join(ROOT, name)) { result.bytes += diskCharge(s); result.files++; }
        for (const child of fs.readdirSync(file)) {
          // Turn locks are bounded control records, not payload. Never GC them here.
          // Abandoned lock files are counted after dirty-ledger recovery.
          pending.push(path.join(file, child));
        }
      } else { result.bytes += diskCharge(s); result.files++; }
    }
  }
  return result;
}
function enter(options = {}) {
  initialize();
  const lock = locks.acquireStateLock(path.join(ROOT, '.storage'), options);
  try {
    let ledger; try { ledger = read(path.join(ROOT, 'usage.json')); } catch {}
    usage = ledger && ledger.version === 1 && !ledger.dirty && Number.isSafeInteger(ledger.bytes) && Number.isSafeInteger(ledger.files) ? ledger : inventory();
    if (usage.bytes < 0 || usage.files < 0) usage = inventory();
    control('usage.json', { dirty: true }); // Crash recovery rescans before permitting another write.
    generation = read(path.join(ROOT, 'generation.json'));
    if (!generation) {
      generation = { id: crypto.randomBytes(16).toString('hex'), createdAt: Date.now(), rejectBefore: 0 };
      control('generation.json', generation);
    }
    mutationFailed = false;
    depth++;
    return lock;
  } catch (e) { locks.releaseStateLock(lock); throw e; }
}
function leave(lock, failed = false) {
  try { control('usage.json', { version: 1, bytes: usage.bytes, files: usage.files, dirty: failed || mutationFailed }); }
  finally { depth--; usage = null; locks.releaseStateLock(lock); }
}
function withRoot(fn, options = {}) {
  if (depth) return fn();
  const lock = enter(options);
  let failed = false;
  try { const result = fn(); if (result?.then) throw error('ASYNC_ROOT_TRANSACTION'); return result; }
  catch (e) { failed = true; throw e; } finally { leave(lock, failed); }
}
async function withRootAsync(fn) {
  if (depth) return fn();
  const lock = enter();
  let failed = false;
  try { return await fn(); } catch (e) { failed = true; throw e; } finally { leave(lock, failed); }
}
function reserve(bytes, files = 1) {
  if (usage.bytes + bytes + HEADROOM > HARD_BYTES || usage.files + files + 32 > MAX_FILES) throw error('QUOTA_EXCEEDED');
}
function write(file, data) {
  return withRoot(() => {
    file = safe(file);
    const body = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
    reserve(charge(body.length));
    if (!stat(path.dirname(file))?.isDirectory()) throw error('INVALID_DATA_DIRECTORY');
    const old = stat(file), tmp = safe(file + '.tmp');
    if (stat(tmp)) remove(tmp);
    try {
      fs.writeFileSync(tmp, body, { flag: 'wx', mode: 0o600 });
      fs.renameSync(tmp, file);
      usage.bytes += diskCharge(stat(file)) - (old ? diskCharge(old) : 0); if (!old) usage.files++;
    } catch (e) { mutationFailed = true; try { fs.unlinkSync(tmp); } catch {} throw e; }
  });
}
function remove(file) {
  return withRoot(() => {
    file = safe(file); const s = stat(file); if (!s) return;
    if (!s.isFile()) throw error('NOT_OWNED_FILE');
    fs.unlinkSync(file); usage.bytes -= diskCharge(s); usage.files--;
  });
}
function append(file, value) {
  return withRoot(() => {
    file = safe(file);
    let text = typeof value === 'string' ? value : JSON.stringify({ ts: new Date().toISOString(), ...value }) + '\n';
    if (Buffer.byteLength(text) > 16384) text = JSON.stringify({ ts: new Date().toISOString(), event: 'log_entry_truncated' }) + '\n';
    let old = stat(file);
    if (old && old.size + Buffer.byteLength(text) > LOG_BYTES) { remove(file + '.1'); fs.renameSync(file, safe(file + '.1')); old = null; }
    reserve(charge((old ? old.size : 0) + Buffer.byteLength(text)) - (old ? diskCharge(old) : 0), old ? 0 : 1);
    try { fs.appendFileSync(file, text, { mode: 0o600 }); } catch (e) { mutationFailed = true; throw e; }
    usage.bytes += diskCharge(stat(file)) - (old ? diskCharge(old) : 0); if (!old) usage.files++;
  });
}
function blob(content) {
  return withRoot(() => {
    const data = Buffer.from(content), id = crypto.createHash('sha256').update(data).digest('hex');
    const file = path.join(ROOT, 'snapshot-blobs', id);
    if (!stat(file)) write(file, data);
    return { blobId: id, size: data.length };
  });
}
function collectIds(value, ids) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.blobId === 'string') ids.add(value.blobId);
  for (const child of Object.values(value)) if (child && typeof child === 'object') collectIds(child, ids);
}
function owner(pid = process.pid) { return { pid, identity: locks.processGenerationIdentity(pid) }; }
function liveOwner(value) { return value && locks.recordedProcessOwnerIsAlive(Number(value.pid), value.identity || ''); }
function turnTime(id) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id || '') ? parseInt(id.slice(0, 8) + id.slice(9, 13), 16) : null;
}
function admit(payload) {
  const time = turnTime(payload.turn_id);
  if (!generation.rejectBefore) return true;
  // Current TraeX uses UUIDv7 turn IDs. Unordered legacy IDs cannot safely reopen after expiry.
  return time !== null && time > generation.rejectBefore && time <= Date.now() + 60000;
}
function collect(force = false) {
  return withRoot(() => {
    const now = Date.now(), maintenance = read(path.join(ROOT, 'maintenance.json')) || {};
    if (!force && usage.bytes < HIGH_BYTES && usage.files < MAX_STATES && now - (maintenance.lastGc || 0) < 3600000) return { skipped: true };
    const before = usage.bytes, states = [], refs = new Set(), liveCache = new Map();
    let reclaimedLocks = 0;
    for (const name of fs.readdirSync(path.join(ROOT, 'turn-snapshots'))) {
      if (!name.endsWith('.json.lock') || reclaimedLocks >= 16) continue;
      const lockDir = safe(path.join(ROOT, 'turn-snapshots', name));
      let ownerRecord;
      try { ownerRecord = read(path.join(lockDir, 'owner.json')); } catch { continue; }
      if (ownerRecord && locks.recordedProcessOwnerIsAlive(Number(ownerRecord.pid), ownerRecord.processIdentity)) continue;
      if (!ownerRecord && Date.now() - stat(lockDir).mtimeMs < 60000) continue;
      try { const lock = locks.acquireStateLock(lockDir.slice(0, -5)); locks.releaseStateLock(lock); reclaimedLocks++; } catch {}
    }

    const isLive = o => { if (!o) return false; const key = JSON.stringify(o); if (!liveCache.has(key)) liveCache.set(key, liveOwner(o)); return liveCache.get(key); };
    for (const name of fs.readdirSync(path.join(ROOT, 'turn-snapshots'))) {
      if (!name.endsWith('.json')) continue;
      const file = safe(path.join(ROOT, 'turn-snapshots', name));
      try {
        const value = read(file);
        if (value) {
          const spans = Object.values(value.toolSpans || {});
          const active = !value.completedAt && (isLive(value.runtimeOwner) || spans.some(s => isLive({ pid: s.terminalClaimOwnerPid, identity: s.terminalClaimOwnerIdentity })));
          states.push({ file, turnId: value.turnId, completed: Boolean(value.completedAt), active, time: Number.isFinite(Date.parse(value.updatedAt || value.createdAt)) ? Date.parse(value.updatedAt || value.createdAt) : stat(file).mtimeMs });
        }
      }
      catch { throw error('CORRUPT_STATE_GC_DEFERRED'); }
    }
    states.sort((a, b) => a.time - b.time);
    let remaining = states.length, removed = 0;
    const victims = [];
    for (const item of states) {
      const active = item.active;
      if (victims.length < 256 && !active && (now - item.time > STATE_TTL || (item.completed && (remaining > MAX_STATES || usage.bytes > HIGH_BYTES)))) {
        victims.push(item); remaining--;
      } else collectIds(read(item.file), refs);
    }
    if (victims.length) {
      generation.rejectBefore = Math.max(generation.rejectBefore, ...victims.map(v => turnTime(v.turnId) || v.time));
      control('generation.json', generation); // Persist replay fence BEFORE removing any tombstone.
      for (const item of victims) { remove(item.file); removed++; }
    }
    for (const name of fs.readdirSync(path.join(ROOT, 'snapshot-blobs'))) {
      if (removed >= 1024) break;
      if (/^[a-f0-9]{64}$/.test(name) && !refs.has(name)) { remove(path.join(ROOT, 'snapshot-blobs', name)); removed++; }
    }
    for (const name of fs.readdirSync(path.join(ROOT, 'outbox'))) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(ROOT, 'outbox', name), entry = read(file);
      if (entry && now - entry.createdAt > QUEUE_TTL && !isLive(entry.owner)) {
        remove(file); removed++;
        try { append(path.join(ROOT, 'reports.jsonl'), { event: 'queue_expired', batchId: entry.id }); } catch {}
      }
    }
    // Diff work is outside the root lock. Preserve scratch while its owner is live.
    for (const area of AREAS) for (const name of fs.readdirSync(path.join(ROOT, area))) {
      if (area === 'tmp' || name.endsWith('.tmp')) {
        const match = /^diff-(\d+)-[a-f0-9]+-(before|after)$/.exec(name);
        if (match && locks.recordedProcessOwnerIsAlive(Number(match[1]), '')) continue;
        const file = safe(path.join(ROOT, area, name)); if (stat(file)?.isFile()) { remove(file); removed++; } }
    }
    usage = inventory();
    const summary = { lastGc: now, beforeBytes: before, afterBytes: usage.bytes, removed, reclaimedLocks };
    control('maintenance.json', summary); return summary;
  });
}
function enqueue(batch, beforePublish) {
  return withRoot(() => {
    if (!/^[a-f0-9]{32,64}$/.test(batch.id)) throw error('INVALID_BATCH_ID');
    const serialized = JSON.stringify(batch);
    let queuedBytes = 0;
    for (const name of fs.readdirSync(path.join(ROOT, 'outbox'))) queuedBytes += stat(safe(path.join(ROOT, 'outbox', name)))?.size || 0;
    if (queuedBytes + Buffer.byteLength(serialized) > QUEUE_BYTES) throw error('QUEUE_QUOTA_EXCEEDED');
    reserve(charge(Buffer.byteLength(serialized)));
    if (beforePublish) beforePublish();
    write(path.join(ROOT, 'outbox', batch.id + '.json'), serialized);
  });
}
function stats() { return withRoot(() => ({ bytes: usage.bytes, files: usage.files, hardBytes: HARD_BYTES, highBytes: HIGH_BYTES })); }
module.exports = { ROOT, HARD_BYTES, HIGH_BYTES, STATE_TTL, QUEUE_TTL, initialize, withRoot, withRootAsync, safe, read, write, remove, append, blob, collect, enqueue, owner, liveOwner, stats, admit, turnTime, reserve, control };
