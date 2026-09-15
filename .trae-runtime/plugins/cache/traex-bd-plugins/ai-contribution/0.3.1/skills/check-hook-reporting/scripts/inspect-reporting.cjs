#!/usr/bin/env node
'use strict';
// Read-only evidence summarizer. Do not import the writer/storage modules here.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const MAX_READ = 4 * 1024 * 1024;
const MAX_ENTRIES = 20000;
const MAX_RECORDS = 20000;
const safeText = x => typeof x === 'string' && /^[a-z0-9_.:+/-]{1,200}$/i.test(x) ? x : undefined;
const code = x => typeof x === 'string' && /^[a-z0-9_.:-]{1,100}$/i.test(x) ? x : undefined;
const number = x => Number.isSafeInteger(x) && x >= 0 ? x : undefined;
const count = x => number(x) ?? 0;
const time = x => typeof x === 'string' && x.length <= 40 ? Date.parse(x) : NaN;
const help = 'node inspect-reporting.cjs [--log-dir DIR] [--session ID] [--turn ID] [--since ISO_WITH_TIMEZONE] [--limit 1..100]';
function args(argv) {
  const value = { root: process.env.AI_CONTRIBUTION_LOG_DIR || path.join(os.homedir(), '.trae/hooks/ai-contribution-v2'), limit: 20 };
  const names = { '--log-dir': 'root', '--session': 'session', '--turn': 'turn', '--since': 'since', '--limit': 'limit' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help') return { help: true };
    if (!names[argv[i]] || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(help);
    value[names[argv[i]]] = argv[++i];
  }
  value.limit = Number(value.limit);
  if (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 100) throw new Error('invalid_limit');
  if (value.since && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/i.test(value.since) || !Number.isFinite(Date.parse(value.since)))) throw new Error('since_requires_ISO_timestamp_with_timezone');
  value.root = path.resolve(value.root);
  return value;
}
function inspect(options) {
  const issues = [], files = [];
  let root = path.resolve(options.root), suppressedIssues = 0;
  // Match the writer's canonical parent handling (e.g. macOS /var) without following the runtime root itself.
  try { root = path.join(fs.realpathSync(path.dirname(root)), path.basename(root)); } catch {}
  const issue = (file, code, count) => { if (issues.length < 100) issues.push({ file, code, count }); else suppressedIssues++; };
  function stat(file) { try { return fs.lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') issue(path.basename(file), e.code); return null; } }
  const rootStat = stat(root);
  const rootUsable = Boolean(rootStat?.isDirectory() && !rootStat.isSymbolicLink());
  if (!rootUsable) issue('runtime', rootStat ? 'unsafe_or_non_directory' : 'not_found');
  function read(name, max = MAX_READ, tail = false) {
    if (!rootUsable) return null;
    const file = path.join(root, name), s = stat(file);
    if (!s) return null;
    if (!s.isFile() || s.isSymbolicLink()) { issue(name, 'not_regular_file'); return null; }
    let fd;
    try {
      fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
      const current = fs.fstatSync(fd);
      if (!current.isFile()) { issue(name, 'not_regular_file'); return null; }
      const truncated = current.size > max;
      files.push({ name, bytes: current.size, truncated });
      if (truncated && !tail) { issue(name, 'read_limit'); return null; }
      const offset = tail ? Math.max(0, current.size - max) : 0;
      const data = Buffer.alloc(Math.min(current.size, max));
      let n = 0;
      while (n < data.length) { const got = fs.readSync(fd, data, n, data.length - n, offset + n); if (!got) break; n += got; }
      let text = data.subarray(0, n).toString('utf8');
      if (offset) { const newline = text.indexOf(String.fromCharCode(10)); text = newline < 0 ? '' : text.slice(newline + 1); issue(name, 'tail_only'); }
      return text;
    } catch (e) { issue(name, e.code || 'read_failed'); return null; }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  function json(name) {
    const text = read(name, 16384);
    if (text === null) return null;
    try { const value = JSON.parse(text); if (value && typeof value === 'object' && !Array.isArray(value)) return value; } catch {}
    issue(name, 'invalid_json'); return null;
  }
  function logs(base) {
    const records = [];
    for (const name of [base + '.1', base]) {
      const text = read(name, MAX_READ, true);
      if (text === null) continue;
      const lines = text.split(String.fromCharCode(10));
      if (lines.length > MAX_RECORDS) issue(name, 'record_limit');
      let invalid = 0;
      for (const line of lines.slice(-MAX_RECORDS)) {
        if (!line.trim()) continue;
        try { const x = JSON.parse(line); if (x && typeof x === 'object' && !Array.isArray(x)) { records.push(x); if (x.event === 'log_entry_truncated') issue(name, 'writer_truncated_record'); } else invalid++; }
        catch { invalid++; }
      }
      if (invalid) issue(name, 'invalid_or_partial_lines', invalid);
    }
    return records.sort((a, b) => (time(a.ts) || 0) - (time(b.ts) || 0));
  }
  const reports = logs('reports.jsonl'), diagnostics = logs('diagnostics.jsonl');
  const all = [...reports, ...diagnostics];
  const turns = new Set(all.filter(x => !options.session || x.sessionId === options.session).map(x => x.turnId).filter(Boolean));
  const batchesForSession = new Set(reports.filter(x => !options.session || x.sessionId === options.session).map(x => x.batchId).filter(Boolean));
  const batchesForTurn = new Set(reports.filter(x => !options.turn || x.turnId === options.turn).map(x => x.batchId).filter(Boolean));
  function selected(x) {
    if (options.since && (!Number.isFinite(time(x.ts)) || time(x.ts) < time(options.since))) return false;
    if (options.session && x.sessionId !== options.session && !(!x.sessionId && (turns.has(x.turnId) || batchesForSession.has(x.batchId)))) return false;
    if (options.turn && x.turnId !== options.turn && !(!x.turnId && batchesForTurn.has(x.batchId))) return false;
    return true;
  }
  const selectedReports = reports.filter(selected), selectedDiagnostics = diagnostics.filter(selected);
  const batchMap = new Map(); let legacyOkRecords = 0, missingBatchRecords = 0;
  for (const x of selectedReports) {
    if (x.status === 'ok' && x.event === 'ai_contribution_code') legacyOkRecords++;
    if (!['ai_contribution_code', 'ai_contribution_delivery', 'queue_expired'].includes(x.event) || x.phase === 'before') continue;
    if (!safeText(x.batchId)) { missingBatchRecords++; continue; }
    const key = x.batchId;
    if (!batchMap.has(key)) batchMap.set(key, { batchId: safeText(key), deliveries: [], count: 0 });
    const b = batchMap.get(key);
    b.sessionId = safeText(x.sessionId) || b.sessionId; b.turnId = safeText(x.turnId) || b.turnId;
    b.lastTs = safeText(x.ts); b.count = Math.max(b.count, count(x.count));
    if (number(x.count) !== undefined) b.countKnown = true;
    if (x.event === 'queue_expired') b.expired = true;
    if (x.event === 'ai_contribution_code') b.captureStatus = code(x.status);
    if (x.event === 'ai_contribution_delivery') b.deliveries.push(x);
  }
  const summary = Object.create(null), recentBatches = [];
  for (const b of batchMap.values()) {
    const last = b.deliveries.at(-1), terminal = new Set();
    for (const x of b.deliveries) {
      if (x.status === 'accepted') terminal.add(x.transport === 'mcs_production' && x.httpStatus === 200 && x.responseCode === 0 ? 'production_accepted' : x.transport === 'loopback_test' && x.httpStatus === 200 && x.responseCode === 0 ? 'loopback_accepted' : 'unverified_accepted');
      if (x.status === 'delivery_unknown') terminal.add('delivery_unknown');
    }
    let state = b.expired ? 'queue_expired' : b.captureStatus === 'dry_run' ? 'dry_run' : b.captureStatus === 'queued' ? 'queued_without_confirmation' : 'unrecognized_capture';
    if (last) state = last.status === 'failed' ? 'failed_attempt_no_later_confirmation' : 'unrecognized_delivery';
    if (terminal.size) state = terminal.size > 1 ? 'conflicting_terminal_records' : [...terminal][0];
    if (b.expired && !terminal.size) state = 'queue_expired';
    if ((b.expired && terminal.size) || (terminal.size && last?.status === 'failed') || (b.captureStatus === 'dry_run' && b.deliveries.length)) state = 'conflicting_terminal_records';
    const total = summary[state] ||= { batches: 0, events: 0, unknownCountBatches: 0 }; total.batches++; total.events += b.count;
    if (!b.countKnown) total.unknownCountBatches++;
    recentBatches.push({ batchId: b.batchId, sessionId: b.sessionId, turnId: b.turnId, lastTs: b.lastTs, state, count: b.countKnown ? b.count : null, observedAttempts: b.deliveries.length, transport: code(last?.transport), httpStatus: number(last?.httpStatus), responseCode: number(last?.responseCode), reason: code(last?.reason), safeToRetry: typeof last?.safeToRetry === 'boolean' ? last.safeToRetry : undefined, requestId: safeText(last?.requestId) });
  }
  recentBatches.sort((a, b) => (time(a.lastTs) || 0) - (time(b.lastTs) || 0));
  const eventCounts = Object.create(null), reasonCounts = Object.create(null);
  let omittedCounterKeys = 0;
  const increment = (map, key) => { if (Object.hasOwn(map, key) || Object.keys(map).length < 100) map[key] = (map[key] || 0) + 1; else omittedCounterKeys++; };
  for (const x of selectedDiagnostics) {
    const event = code(x.event); if (event) increment(eventCounts, event);
    for (const reason of [x.reason, x.terminalReason, ...(Array.isArray(x.skippedRoots) ? x.skippedRoots : []).map(r => r?.reason), ...(Array.isArray(x.roots) ? x.roots : []).map(r => r?.reason)]) {
      if (code(reason)) increment(reasonCounts, reason);
    }
  }
  if (omittedCounterKeys) issue('diagnostics', 'counter_key_limit', omittedCounterKeys);
  const ledger = json('usage.json'), maintenance = json('maintenance.json'), worker = json('worker.json');
  const queue = { scope: 'whole_runtime_metadata_only', observedFiles: 0, observedBytes: 0, truncated: false };
  const queueDir = rootUsable ? stat(path.join(root, 'outbox')) : null;
  if (queueDir && (!queueDir.isDirectory() || queueDir.isSymbolicLink())) issue('outbox', 'unsafe_directory');
  else if (queueDir) {
    let dir;
    try {
      dir = fs.opendirSync(path.join(root, 'outbox')); let entry, visited = 0;
      while ((entry = dir.readSync())) {
        if (++visited > MAX_ENTRIES) { queue.truncated = true; issue('outbox', 'entry_limit'); break; }
        if (!entry.name.endsWith('.json')) continue;
        const s = stat(path.join(root, 'outbox', entry.name));
        if (s?.isFile() && !s.isSymbolicLink()) { queue.observedFiles++; queue.observedBytes += s.size; }
        else issue('outbox entry', 'not_regular_file');
      }
    } catch (e) { issue('outbox', e.code || 'read_failed'); } finally { dir?.closeSync(); }
  }
  const times = [...selectedReports, ...selectedDiagnostics].map(x => x.ts).filter(x => Number.isFinite(time(x))).sort((a, b) => time(a) - time(b));
  return {
    schemaVersion: 1, observedAt: new Date().toISOString(), runtimeRoot: root, rootExists: Boolean(rootStat),
    filters: { session: options.session || null, turn: options.turn || null, since: options.since || null },
    coverage: { scope: 'retained_logs_only', firstTs: times[0] || null, lastTs: times.at(-1) || null, reportRecords: selectedReports.length, diagnosticRecords: selectedDiagnostics.length, completeHistory: false, files, issues, suppressedIssues },
    reporting: { byBatchOutcome: summary, legacyOkRecords, missingBatchRecords, recentBatches: recentBatches.slice(-options.limit), dashboardAttribution: 'not_verified' },
    diagnostics: { eventCounts, reasonCounts, recent: selectedDiagnostics.slice(-options.limit).map(x => ({ ts: safeText(x.ts), event: code(x.event), status: code(x.status), reason: code(x.reason || x.terminalReason), sessionId: safeText(x.sessionId), turnId: safeText(x.turnId), toolUseId: safeText(x.toolUseId), blockCount: number(x.blockCount), stateCompacted: x.stateCompacted === true ? true : undefined })) },
    runtimeControlEvents: { scope: 'whole_runtime_retained_logs_not_session_filtered', recent: reports.filter(x => ['gc_failed', 'worker_failed'].includes(x.event) && (!options.since || time(x.ts) >= time(options.since))).slice(-options.limit).map(x => ({ ts: safeText(x.ts), event: code(x.event), reason: code(x.reason) })) },
    runtime: { scope: 'whole_runtime_current_non_atomic_sample', pausedFilePresent: rootUsable && Boolean(stat(path.join(root, 'PAUSED'))), readerProcessFlags: { note: 'These are this inspector process flags, not proof of the running TraeX environment.', paused: process.env.AI_CONTRIBUTION_PAUSED === '1', dryRun: process.env.AI_CONTRIBUTION_SDK_DRY_RUN === '1', noWorker: process.env.AI_CONTRIBUTION_NO_WORKER === '1', testEndpointSet: Boolean(process.env.AI_CONTRIBUTION_TEST_ENDPOINT) }, ledger: ledger ? { version: number(ledger.version), dirty: typeof ledger.dirty === 'boolean' ? ledger.dirty : undefined, bytes: number(ledger.bytes), files: number(ledger.files), trusted: ledger.version === 1 && ledger.dirty === false && number(ledger.bytes) !== undefined && number(ledger.files) !== undefined } : null, maintenance: maintenance ? Object.fromEntries(['lastGc','beforeBytes','afterBytes','removed','reclaimedLocks'].map(k => [k, number(maintenance[k])])) : null, worker: worker ? { present: true, pid: number(worker.owner?.pid), createdAt: number(worker.createdAt), identityVerified: false } : { present: false }, queue },
    interpretation: ['queued is not delivery confirmation', 'production_accepted requires mcs_production plus HTTP 200 and responseCode 0', 'retry attempts are grouped by batchId, not counted as extra code events', 'missing retained evidence is inconclusive, including after log rotation or quota errors', 'do not infer process liveness, cache growth trend or dashboard attribution from this snapshot'],
  };
}
if (require.main === module) {
  try { const options = args(process.argv.slice(2)); console.log(options.help ? help : JSON.stringify(inspect(options), null, 2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { args, inspect };
