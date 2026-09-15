'use strict';
// The parent remains synchronous for PreToolUse ordering. This helper drains Git
// incrementally, and kills/reaps it on every early exit (including parent timeout).
const { spawn } = require('child_process');
const { shouldReportPath } = require('./snapshot-paths.cjs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const options = JSON.parse(input), paths = new Set();
  let pending = Buffer.alloc(0), bytes = 0, candidates = 0, outcome = null;
  const child = spawn('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...options.pathspecs], {
    cwd: options.root, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
  });
  function stop(reason, fields = {}) {
    if (outcome) return;
    outcome = { reason, ...fields }; child.kill('SIGKILL');
  }
  const timer = setTimeout(() => stop('snapshot_time_budget'), options.timeoutMs);
  process.on('SIGTERM', () => stop('snapshot_time_budget'));
  process.on('SIGINT', () => stop('snapshot_time_budget'));
  child.stdout.on('data', chunk => {
    if (outcome) return;
    bytes += chunk.length;
    if (bytes > options.outputLimit) return stop('snapshot_listing_bytes_exceeds_limit');
    pending = Buffer.concat([pending, chunk]);
    let offset = 0, end;
    while ((end = pending.indexOf(0, offset)) !== -1) {
      const file = pending.subarray(offset, end).toString('utf8'); offset = end + 1;
      if (++candidates > options.candidateLimit) return stop('snapshot_candidate_count_exceeds_limit');
      if (shouldReportPath(file)) paths.add(file);
      if (paths.size > options.fileLimit) return stop('snapshot_file_count_exceeds_limit', { fileCount: paths.size, limit: options.fileLimit });
    }
    pending = pending.subarray(offset);
  });
  child.on('error', () => { outcome = { reason: 'snapshot_file_listing_failed' }; });
  child.on('close', code => {
    clearTimeout(timer);
    process.stdout.write(JSON.stringify(outcome || (code !== 0 || pending.length ? { reason: 'snapshot_file_listing_failed' } : { paths: [...paths] })), () => process.exit(0));
  });
});
