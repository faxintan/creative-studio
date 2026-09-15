'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { args, inspect } = require('../skills/check-hook-reporting/scripts/inspect-reporting.cjs');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'report-inspector-'));
const ts = '2026-09-14T09:50:00.000Z';
const record = (batchId, extra = {}) => ({ ts, event: 'ai_contribution_code', phase: 'result', status: 'queued', sessionId: 's1', turnId: 't1', batchId, count: 2, ...extra });
const delivery = (batchId, extra = {}) => record(batchId, { event: 'ai_contribution_delivery', status: 'accepted', transport: 'mcs_production', httpStatus: 200, responseCode: 0, ...extra });
function put(root, name, value) { fs.writeFileSync(path.join(root, name), typeof value === 'string' ? value : JSON.stringify(value)); }
function logs(root, name, records) { put(root, name, records.map(x => JSON.stringify(x)).join('\n') + '\n'); }
function run(root, extra = {}) { return inspect({ root, limit: 100, ...extra }); }
function outcome(result, key) { return result.reporting.byBatchOutcome[key]?.batches || 0; }
function snapshot(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(e => {
    const file = path.join(root, e.name), st = fs.lstatSync(file);
    return e.isDirectory() ? snapshot(file) : [[file, st.size, st.mtimeMs, st.ctimeMs, e.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file).toString('hex')]];
  });
}
try {
  const root = path.join(base, 'runtime'); fs.mkdirSync(root); fs.mkdirSync(path.join(root, 'outbox'));
  logs(root, 'reports.jsonl.1', [record('retry'), delivery('retry', { status: 'failed', safeToRetry: true, reason: 'ECONNRESET' }), record('unknown'), record('loop'), record('dry', { status: 'dry_run' }), record('waiting'), record('expired'), record('bad'), record('conflict'), record('reversed'), record('legacy', { status: 'ok' })]);
  logs(root, 'reports.jsonl', [delivery('retry'), delivery('unknown', { status: 'delivery_unknown', reason: 'request_timeout' }), delivery('loop', { transport: 'loopback_test' }), delivery('expired', { status: 'failed' }), record('expired', { event: 'queue_expired', sessionId: undefined, turnId: undefined, count: undefined }), delivery('bad', { httpStatus: 500 }), delivery('conflict'), delivery('conflict', { status: 'delivery_unknown' }), delivery('reversed'), delivery('reversed', { status: 'failed' }), delivery('other', { sessionId: 's2', turnId: 't2', count: 1 }), record(undefined), { event: 'ai_contribution_code', phase: 'before', params: { code: 'SECRET_CODE_BODY' } }]);
  logs(root, 'diagnostics.jsonl', [record(undefined, { event: 'turn_snapshot_pre', toolUseId: 'tool1', skippedRoots: [{ reason: 'file_too_large' }], params: { code: 'SECRET_CODE_BODY' } }), record(undefined, { event: 'turn_snapshot_stop', sessionId: undefined, stateCompacted: true }), record(undefined, { event: 'malformed', skippedRoots: {}, roots: [null, 'bad', { reason: { code: 'SECRET_CODE_BODY' } }] }), record(undefined, { event: '__proto__', reason: 'constructor' })]);
  put(root, 'usage.json', { version: 1, dirty: false, bytes: 10000, files: 20 });
  put(root, 'maintenance.json', { lastGc: 1, removed: 2, beforeBytes: { code: 'SECRET_CODE_BODY' } });
  put(root, 'worker.json', { owner: { pid: { code: 'SECRET_CODE_BODY' } }, token: 'SECRET_CODE_BODY', createdAt: 1 });
  put(root, 'PAUSED', ''); put(root, 'outbox/one.json', 'SECRET_CODE_BODY');
  const before = snapshot(root), realOpen = fs.openSync;
  const blocked = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'unlinkSync', 'renameSync', 'rmSync'];
  const originals = Object.fromEntries(blocked.map(k => [k, fs[k]]));
  let result;
  try {
    for (const k of blocked) fs[k] = () => { throw new Error('inspector attempted mutation: ' + k); };
    fs.openSync = (file, flags, ...rest) => {
      assert.equal(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC), 0);
      assert.match(path.basename(file), /^(reports.jsonl(\.1)?|diagnostics.jsonl(\.1)?|usage.json|maintenance.json|worker.json)$/);
      return realOpen(file, flags, ...rest);
    };
    result = run(root, { session: 's1' });
  } finally { fs.openSync = realOpen; Object.assign(fs, originals); }
  assert.deepEqual(snapshot(root), before);
  assert.equal(outcome(result, 'production_accepted'), 1);
  assert.equal(result.reporting.byBatchOutcome.production_accepted.events, 2);
  for (const name of ['loopback_accepted', 'dry_run', 'delivery_unknown', 'queued_without_confirmation', 'queue_expired', 'unverified_accepted', 'unrecognized_capture']) assert.equal(outcome(result, name), 1, name);
  assert.equal(outcome(result, 'conflicting_terminal_records'), 2);
  assert.equal(result.reporting.recentBatches.find(x => x.batchId === 'retry').observedAttempts, 2);
  assert.equal(result.reporting.legacyOkRecords, 1); assert.equal(result.reporting.missingBatchRecords, 1);
  assert.equal(result.diagnostics.eventCounts.turn_snapshot_stop, 1);
  assert.equal(result.diagnostics.eventCounts.__proto__, 1); assert.equal(result.diagnostics.reasonCounts.constructor, 1);
  assert.equal(result.runtime.queue.observedFiles, 1); assert.equal(result.runtime.pausedFilePresent, true); assert.equal(result.runtime.ledger.trusted, true);
  assert.equal(JSON.stringify(result).includes('SECRET_CODE_BODY'), false);
  assert.equal(run(root, { since: '2026-09-14T18:00:00+08:00' }).coverage.reportRecords, 0);
  assert.equal(outcome(run(root, { turn: 't2' }), 'production_accepted'), 1);
  assert.equal(run(root, { limit: 1 }).reporting.recentBatches.length, 1);
  assert.equal(run(root).reporting.dashboardAttribution, 'not_verified');
  logs(root, 'reports.jsonl', [record('orphan', { event: 'queue_expired', count: undefined })]);
  const orphan = run(root).reporting; assert.equal(orphan.byBatchOutcome.queue_expired.unknownCountBatches, 1); assert.equal(orphan.recentBatches.find(x => x.batchId === 'orphan').count, null);
  fs.appendFileSync(path.join(root, 'reports.jsonl'), JSON.stringify({ ts, event: 'gc_failed', reason: 'INVALID_JSON' }) + '\n' + JSON.stringify({ ts, event: 'log_entry_truncated' }) + '\n');
  const controls = run(root, { session: 's2' }); assert.equal(controls.runtimeControlEvents.recent[0].event, 'gc_failed'); assert(controls.coverage.issues.some(x => x.code === 'writer_truncated_record'));
  put(root, 'usage.json', { version: 1, dirty: true, bytes: 1, files: 1 }); assert.equal(run(root).runtime.ledger.trusted, false);
  put(root, 'usage.json', { version: { code: 'SECRET_CODE_BODY' }, bytes: { code: 'SECRET_CODE_BODY' } }); assert.equal(JSON.stringify(run(root)).includes('SECRET_CODE_BODY'), false);
  put(root, 'worker.json', '{'); fs.appendFileSync(path.join(root, 'reports.jsonl'), '{partial');
  const damaged = run(root); assert(damaged.coverage.issues.some(x => x.code === 'invalid_json')); assert(damaged.coverage.issues.some(x => x.code === 'invalid_or_partial_lines'));
  const missing = path.join(base, 'missing'); assert.equal(run(missing).rootExists, false); assert.equal(fs.existsSync(missing), false);
  const link = path.join(base, 'link'); fs.symlinkSync(root, link, 'dir'); assert(run(link).coverage.issues.some(x => x.code === 'unsafe_or_non_directory'));
  const unsafe = path.join(base, 'unsafe'); fs.mkdirSync(unsafe); fs.symlinkSync(path.join(root, 'reports.jsonl'), path.join(unsafe, 'reports.jsonl')); fs.symlinkSync(path.join(root, 'outbox'), path.join(unsafe, 'outbox'), 'dir');
  const symlinks = run(unsafe); assert(symlinks.coverage.issues.some(x => x.code === 'not_regular_file')); assert(symlinks.coverage.issues.some(x => x.code === 'unsafe_directory')); assert.equal(symlinks.runtime.queue.observedFiles, 0);
  const large = path.join(base, 'large'); fs.mkdirSync(large);
  put(large, 'reports.jsonl', 'X'.repeat(4 * 1024 * 1024 + 100)); assert.equal(run(large).coverage.reportRecords, 0); assert(run(large).coverage.issues.some(x => x.code === 'tail_only'));
  fs.appendFileSync(path.join(large, 'reports.jsonl'), '\n' + JSON.stringify(delivery('tail')) + '\n'); assert.equal(outcome(run(large), 'production_accepted'), 1);
  put(large, 'usage.json', 'X'.repeat(20000)); assert(run(large).coverage.issues.some(x => x.code === 'read_limit'));
  logs(large, 'diagnostics.jsonl', Array.from({ length: 20500 }, (_, i) => ({ ts, event: 'event' + i, reason: 'reason' + i })));
  const bounded = run(large); assert(bounded.coverage.issues.some(x => x.code === 'record_limit')); assert(bounded.coverage.issues.some(x => x.code === 'counter_key_limit')); assert.equal(Object.keys(bounded.diagnostics.eventCounts).length, 100); assert(JSON.stringify(bounded).length < 50000);
  for (const argv of [['--since', '2026-09-14T09:00:00'], ['--since', '2026-09-14Z'], ['--limit', '0'], ['--limit', '101'], ['--wat']]) assert.throws(() => args(argv));
  assert.equal(args(['--since', '2026-09-14T17:00:00+08:00']).since, '2026-09-14T17:00:00+08:00'); assert.equal(args(['--help']).help, true);
  console.log('inspect reporting: readonly, outcomes, retries, rotation, filters, privacy, corrupt data, symlinks, bounds passed');
} finally { fs.rmSync(base, { recursive: true, force: true }); }

